'use strict';

const { roundMoney } = require('../utils/money');
const { ValidationError, getAllSettings, resolveDomainScope } = require('./settings-service');
const { saveClient } = require('./clients-service');
const { recalculateClientScore } = require('./scoring-service');
const { deductOrderBomAndProducts, recordOrderPayments } = require('./os-bom-ledger');
const {
  previewNextOsCode,
  ensureWalkInClient,
  checkClientWarrantyAlert,
  getOrderById,
  listOrders,
  getOsBootstrap
} = require('./os-queries');
const { transitionOrderStatus, toggleOrderLoteItem } = require('./os-fsm');

const VALID_LENS_TYPES = ['MULTIFOCAL', 'VISAO_SIMPLES', 'SOLAR', 'SEM_LENTE', 'N/A'];

function resolveOrderDomain(operationMode, requested) {
  const dom = requested ? String(requested).toUpperCase() : null;
  if (operationMode === 'OPTICAL_ONLY') {
    if (dom && dom !== 'OPTICA') throw new ValidationError('Modo atual (Só Óculos) aceita apenas OS de ÓPTICA.');
    return 'OPTICA';
  }
  if (operationMode === 'CUTLERY_ONLY') {
    if (dom && dom !== 'CUTELARIA') throw new ValidationError('Modo atual (Só Afiação) aceita apenas OS de CUTELARIA.');
    return 'CUTELARIA';
  }
  if (!dom || !['OPTICA', 'CUTELARIA'].includes(dom)) return 'OPTICA';
  return dom;
}

function resolvePartnerId(db, settings, requestedPartnerId) {
  if (settings.partners_mode_enabled === '1' && requestedPartnerId) {
    const p = db
      .prepare('SELECT id FROM parceiros_tecnicos WHERE id = ? AND ativo = 1')
      .get(Number(requestedPartnerId));
    if (p) return p.id;
  }
  const def = db
    .prepare('SELECT id FROM parceiros_tecnicos WHERE ativo = 1 ORDER BY eh_operador_padrao DESC, id ASC LIMIT 1')
    .get();
  return def ? def.id : null;
}

function learnAttributes(db, dominio, { material, locais, estados }) {
  const upsert = db.prepare(
    `INSERT INTO memoria_atributos (categoria, dominio, valor, frequencia_uso, ativo)
     VALUES (?, ?, ?, 1, 1)
     ON CONFLICT(categoria, dominio, valor) DO UPDATE SET
       ativo = 1,
       frequencia_uso = memoria_atributos.frequencia_uso + 1`
  );

  if (material && String(material).trim().length >= 2) {
    upsert.run('MATERIAL', dominio, String(material).trim().slice(0, 64));
  }
  for (const loc of locais || []) {
    const clean = String(loc || '').trim();
    if (clean.length >= 2) upsert.run('LOCAL_AVARIA', dominio, clean.slice(0, 64));
  }
  for (const est of estados || []) {
    const clean = String(est || '').trim();
    if (clean.length >= 2) upsert.run('ESTADO_LENTE', 'OPTICA', clean.slice(0, 64));
  }
}

function computeComboCostSnapshot(db, comboId) {
  const children = db
    .prepare(
      `SELECT ci.quantidade, c.custo_medio_ponderado
       FROM combos_itens ci
       JOIN catalogo_itens c ON c.id = ci.item_id
       WHERE ci.combo_id = ? AND c.ativo = 1`
    )
    .all(comboId);
  return roundMoney(children.reduce((acc, r) => acc + (Number(r.quantidade) * Number(r.custo_medio_ponderado)), 0));
}

function buildCartLines(db, allowedItemDomains, itensPayload, desmembrarLote) {
  if (!Array.isArray(itensPayload) || itensPayload.length === 0) {
    throw new ValidationError('Adicione ao menos 1 serviço, combo ou produto à OS.');
  }

  const resolved = [];
  for (const raw of itensPayload) {
    const qty = Number(raw.quantidade || 1);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new ValidationError('Quantidade de item deve ser maior que zero.');
    }

    if (raw.combo_id) {
      const combo = db.prepare('SELECT * FROM combos WHERE id = ? AND ativo = 1').get(Number(raw.combo_id));
      if (!combo || !allowedItemDomains.includes(combo.dominio)) {
        throw new ValidationError('Combo inválido para o domínio ativo.');
      }
      const unitPrice = raw.valor_unitario !== undefined ? roundMoney(raw.valor_unitario) : roundMoney(combo.preco_combo);
      const costSnap = computeComboCostSnapshot(db, combo.id);
      resolved.push({
        item_id: null,
        combo_id: combo.id,
        descricao: combo.abreviacao || combo.nome,
        tipo: 'COMBO',
        dominio: combo.dominio,
        quantidade: qty,
        valor_unitario: unitPrice,
        valor_total: roundMoney(unitPrice * qty),
        custo_unitario_snapshot: costSnap
      });
      continue;
    }

    const item = db
      .prepare("SELECT * FROM catalogo_itens WHERE id = ? AND ativo = 1 AND tipo IN ('SERVICO', 'PRODUTO')")
      .get(Number(raw.item_id));
    if (!item || !allowedItemDomains.includes(item.dominio)) {
      throw new ValidationError('Serviço ou produto inválido para o domínio ativo.');
    }

    const unitPrice = raw.valor_unitario !== undefined ? roundMoney(raw.valor_unitario) : roundMoney(item.preco_venda);
    const costSnap = roundMoney(item.custo_medio_ponderado);
    db.prepare('UPDATE catalogo_itens SET frequencia_uso = frequencia_uso + 1 WHERE id = ?').run(item.id);

    if (desmembrarLote && Number.isInteger(qty) && qty > 1 && qty <= 100) {
      for (let i = 1; i <= qty; i += 1) {
        resolved.push({
          item_id: item.id,
          combo_id: null,
          descricao: `${item.abreviacao_balcao} (${i}/${qty})`,
          tipo: 'LOTE',
          dominio: item.dominio,
          quantidade: 1,
          valor_unitario: unitPrice,
          valor_total: unitPrice,
          custo_unitario_snapshot: costSnap
        });
      }
    } else {
      resolved.push({
        item_id: item.id,
        combo_id: null,
        descricao: item.abreviacao_balcao,
        tipo: item.tipo,
        dominio: item.dominio,
        quantidade: qty,
        valor_unitario: unitPrice,
        valor_total: roundMoney(unitPrice * qty),
        custo_unitario_snapshot: costSnap
      });
    }
  }
  return resolved;
}

function resolveInitialPayments(payload, valorTotal, ehCortesia, ehGarantia) {
  if (ehCortesia || ehGarantia) {
    return { payments: [], valorPago: 0, saldoDevedor: 0, troco: 0 };
  }
  const modoPag = String(payload.pagamento_modo || 'NA_RETIRADA').toUpperCase();
  if (modoPag === 'NA_RETIRADA') {
    return { payments: [], valorPago: 0, saldoDevedor: valorTotal, troco: 0 };
  }

  let payments = Array.isArray(payload.pagamentos) ? payload.pagamentos : [];
  if (payments.length === 0 && modoPag === 'QUITADO') {
    payments = [{
      meio_pagamento: payload.meio_pagamento || 'ESPECIE',
      valor: valorTotal,
      parcelado: Boolean(payload.parcelado)
    }];
  } else if (payments.length === 0 && modoPag === 'SINAL' && Number(payload.valor_sinal || 0) > 0) {
    payments = [{
      meio_pagamento: payload.meio_pagamento || 'ESPECIE',
      valor: roundMoney(payload.valor_sinal),
      parcelado: Boolean(payload.parcelado)
    }];
  }

  const rawPaid = roundMoney(payments.reduce((acc, p) => acc + roundMoney(p.valor || 0), 0));
  const valorRecebido = Number(payload.valor_recebido || 0);
  const troco = valorRecebido > valorTotal ? roundMoney(valorRecebido - valorTotal) : 0;
  const valorPago = Math.min(valorTotal, rawPaid);

  const normalizedPayments = [];
  let remainingCap = valorPago;
  for (const p of payments) {
    const v = roundMoney(p.valor || 0);
    if (v <= 0 || remainingCap <= 0) continue;
    const applied = Math.min(remainingCap, v);
    normalizedPayments.push({
      meio_pagamento: p.meio_pagamento || 'ESPECIE',
      valor: roundMoney(applied),
      parcelado: Boolean(p.parcelado)
    });
    remainingCap = roundMoney(remainingCap - applied);
  }

  return {
    payments: normalizedPayments,
    valorPago,
    saldoDevedor: roundMoney(Math.max(0, valorTotal - valorPago)),
    troco
  };
}

function createOrder(db, payload) {
  const settings = getAllSettings(db);
  const dominio = resolveOrderDomain(settings.operation_mode, payload.dominio);
  const scope = resolveDomainScope(settings.operation_mode, dominio);
  const modoAbertura = ['EXPRESS', 'COMPLETO', 'LOTE'].includes(payload.modo_abertura)
    ? payload.modo_abertura
    : 'EXPRESS';

  let clienteId = payload.cliente_id ? Number(payload.cliente_id) : null;
  if (clienteId) {
    const cli = db.prepare('SELECT id FROM clientes WHERE id = ? AND ativo = 1').get(clienteId);
    if (!cli) throw new ValidationError('Cliente selecionado não encontrado.');
  } else if (payload.novo_cliente && payload.novo_cliente.nome && payload.novo_cliente.telefone) {
    clienteId = saveClient(db, payload.novo_cliente).id;
  } else {
    clienteId = ensureWalkInClient(db);
  }

  const parceiroId = resolvePartnerId(db, settings, payload.parceiro_id);
  const cartLines = buildCartLines(db, scope.itemDomains, payload.itens, Boolean(payload.desmembrar_lote));

  const subtotal = roundMoney(cartLines.reduce((acc, l) => acc + l.valor_total, 0));
  const descontoTipo = payload.desconto_tipo === 'PERCENTUAL' ? 'PERCENTUAL' : 'VALOR';
  const descontoValor = Math.max(0, roundMoney(payload.desconto_valor || 0));
  const descontoAplicado = descontoTipo === 'PERCENTUAL'
    ? roundMoney(subtotal * (Math.min(100, descontoValor) / 100))
    : roundMoney(Math.min(subtotal, descontoValor));

  const ehCortesia = payload.eh_cortesia ? 1 : 0;
  const ehGarantia = payload.eh_garantia ? 1 : 0;
  const valorTotal = (ehCortesia || ehGarantia) ? 0 : roundMoney(Math.max(0, subtotal - descontoAplicado));
  const payPlan = resolveInitialPayments(payload, valorTotal, ehCortesia === 1, ehGarantia === 1);

  const entregarNaHora = Boolean(payload.entregar_na_hora);
  if (entregarNaHora && payPlan.saldoDevedor > 0.009) {
    throw new ValidationError('Para finalizar e entregar na hora, a OS precisa estar quitada.');
  }

  const fluxoDireto = Boolean(payload.fluxo_direto_bancada);
  const initialStatus = entregarNaHora ? 'ENTREGUE' : (fluxoDireto ? 'BANCADA' : 'FILA');
  const prioridadeSla = ['PADRAO', 'URGENTE', 'AGENDADO'].includes(payload.prioridade_sla)
    ? payload.prioridade_sla
    : 'PADRAO';
  const tipoLente = VALID_LENS_TYPES.includes(payload.tipo_lente) ? payload.tipo_lente : 'N/A';
  const locaisAvaria = Array.isArray(payload.locais_avaria) ? payload.locais_avaria : [];
  const estadoLentes = Array.isArray(payload.estado_lentes) ? payload.estado_lentes : [];

  const osId = db.transaction(() => {
    const codigoOs = previewNextOsCode(db);
    const nowSql = db.prepare("SELECT datetime('now', 'localtime') AS ts").get().ts;
    const initTs = initialStatus === 'BANCADA' || initialStatus === 'ENTREGUE' ? nowSql : null;
    const endTs = initialStatus === 'ENTREGUE' ? nowSql : null;

    const info = db
      .prepare(
        `INSERT INTO ordens_servico (
          codigo_os, cliente_id, parceiro_id, dominio, modo_abertura, status,
          prioridade_sla, prazo_prometido_em, marca_modelo, material_peca,
          locais_avaria_json, tipo_lente, estado_lentes_json, observacoes,
          eh_garantia, os_origem_garantia_id, eh_cortesia, subtotal,
          desconto_valor, desconto_tipo, valor_total, valor_pago, saldo_devedor,
          iniciado_bancada_em, pronto_em, entregue_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?, 2), ROUND(?, 2), ?, ROUND(?, 2), ROUND(?, 2), ROUND(?, 2), ?, ?, ?)`
      )
      .run(
        codigoOs, clienteId, parceiroId, dominio, modoAbertura, initialStatus,
        prioridadeSla, payload.prazo_prometido_em || null,
        String(payload.marca_modelo || '').trim().slice(0, 100),
        String(payload.material_peca || '').trim().slice(0, 64),
        JSON.stringify(locaisAvaria), tipoLente, JSON.stringify(estadoLentes),
        String(payload.observacoes || '').trim().slice(0, 500),
        ehGarantia, payload.os_origem_garantia_id ? Number(payload.os_origem_garantia_id) : null,
        ehCortesia, subtotal, descontoValor, descontoTipo,
        valorTotal, payPlan.valorPago, payPlan.saldoDevedor,
        initTs, endTs, endTs
      );

    const newOsId = Number(info.lastInsertRowid);
    const insLine = db.prepare(
      `INSERT INTO os_itens (
        os_id, item_id, combo_id, descricao, tipo, dominio,
        quantidade, valor_unitario, valor_total, custo_unitario_snapshot, concluido_lote
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?, 2), ROUND(?, 2), ROUND(?, 2), ?)`
    );
    for (const line of cartLines) {
      insLine.run(
        newOsId, line.item_id, line.combo_id, line.descricao, line.tipo, line.dominio,
        line.quantidade, line.valor_unitario, line.valor_total, line.custo_unitario_snapshot,
        initialStatus === 'ENTREGUE' ? 1 : 0
      );
    }

    if (fluxoDireto || entregarNaHora || payload.baixar_bom_agora) {
      deductOrderBomAndProducts(db, newOsId);
    }

    const totalUnits = cartLines.reduce((acc, l) => acc + l.quantidade, 0);
    if (payPlan.payments.length > 0 || ehCortesia === 1) {
      recordOrderPayments(db, {
        osId: newOsId,
        codigoOs,
        dominio,
        payments: payPlan.payments,
        ehCortesia,
        paCount: 1,
        serviceUnitsCount: Math.round(totalUnits),
        dataCompetencia: payload.data_competencia || null
      });
    }

    learnAttributes(db, dominio, {
      material: payload.material_peca,
      locais: locaisAvaria,
      estados: estadoLentes
    });
    recalculateClientScore(db, clienteId);
    return newOsId;
  })();

  const created = getOrderById(db, osId);
  created.troco = payPlan.troco;
  return created;
}

function createQuickBatchOrders(db, payload) {
  const linhas = Array.isArray(payload.linhas) ? payload.linhas : [];
  if (linhas.length === 0) {
    throw new ValidationError('Adicione ao menos 1 linha na planilha de Lote Rápido.');
  }
  const dataComp = payload.data_competencia || null;

  const created = db.transaction(() => {
    const out = [];
    for (const row of linhas) {
      const os = createOrder(db, {
        modo_abertura: 'LOTE',
        dominio: row.dominio || payload.dominio,
        cliente_id: row.cliente_id || payload.cliente_id || null,
        pagamento_modo: 'QUITADO',
        meio_pagamento: row.meio_pagamento || 'ESPECIE',
        entregar_na_hora: true,
        data_competencia: dataComp,
        observacoes: row.observacoes || 'Lançamento em Lote Rápido de Balcão',
        itens: [{
          item_id: row.item_id || null,
          combo_id: row.combo_id || null,
          quantidade: Number(row.quantidade || 1),
          valor_unitario: row.valor_unitario
        }]
      });
      out.push(os);
    }
    return out;
  })();

  return { count: created.length, orders: created };
}

module.exports = {
  previewNextOsCode,
  checkClientWarrantyAlert,
  createOrder,
  createQuickBatchOrders,
  transitionOrderStatus,
  toggleOrderLoteItem,
  listOrders,
  getOrderById,
  getOsBootstrap
};
