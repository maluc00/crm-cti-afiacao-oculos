'use strict';

const { roundMoney } = require('../utils/money');
const { ValidationError, getAllSettings, resolveDomainScope } = require('./settings-service');
const { listScopedCombos, saveCombo: saveComboCore, deactivateCombo } = require('./combo-service');

const VALID_ITEM_TYPES = ['SERVICO', 'PRODUTO', 'INSUMO'];
const VALID_DOMAINS = ['OPTICA', 'CUTELARIA', 'AMBOS'];

function roundQty(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) throw new ValidationError('Quantidade invalida.');
  return Math.round((num + Number.EPSILON) * 1000) / 1000;
}

function assertDomainAllowed(operationMode, dominio) {
  if (!VALID_DOMAINS.includes(dominio)) {
    throw new ValidationError(`Dominio invalido: ${dominio}`);
  }
  if (operationMode === 'OPTICAL_ONLY' && dominio === 'CUTELARIA') {
    throw new ValidationError('Modo atual (So Oculos) bloqueia itens de Cutelaria.');
  }
  if (operationMode === 'CUTLERY_ONLY' && dominio === 'OPTICA') {
    throw new ValidationError('Modo atual (So Afiacao) bloqueia itens de Optica.');
  }
}

function buildPlaceholders(arr) {
  return arr.map(() => '?').join(', ');
}

function computeBomMap(db) {
  const bomRows = db
    .prepare(
      `SELECT b.servico_id, b.insumo_id, b.quantidade_consumida,
              i.codigo_sku AS insumo_sku, i.nome_tecnico AS insumo_nome,
              i.abreviacao_balcao AS insumo_abrev, i.unidade AS insumo_unidade,
              ROUND(i.custo_medio_ponderado, 2) AS insumo_cmp,
              i.estoque_atual AS insumo_estoque
       FROM ficha_tecnica_bom b
       JOIN catalogo_itens i ON i.id = b.insumo_id
       WHERE b.ativo = 1 AND i.ativo = 1
       ORDER BY i.nome_tecnico ASC`
    )
    .all();

  const map = new Map();
  for (const row of bomRows) {
    if (!map.has(row.servico_id)) map.set(row.servico_id, []);
    const custoLinha = roundMoney(Number(row.quantidade_consumida) * Number(row.insumo_cmp));
    map.get(row.servico_id).push({
      insumo_id: row.insumo_id,
      insumo_sku: row.insumo_sku,
      insumo_nome: row.insumo_nome,
      insumo_abrev: row.insumo_abrev,
      insumo_unidade: row.insumo_unidade,
      quantidade_consumida: Number(row.quantidade_consumida),
      insumo_cmp: roundMoney(row.insumo_cmp),
      insumo_estoque: Number(row.insumo_estoque),
      custo_linha: custoLinha
    });
  }
  return map;
}

function enrichItem(row, bomMap) {
  const bomItens = bomMap.get(row.id) || [];
  const preco = roundMoney(row.preco_venda);
  const cmp = roundMoney(row.custo_medio_ponderado);
  const bomCost = bomItens.length > 0
    ? roundMoney(bomItens.reduce((acc, b) => acc + (b.quantidade_consumida * b.insumo_cmp), 0))
    : cmp;
  const custoEfetivo = row.tipo === 'SERVICO' ? bomCost : cmp;
  const lucroLiquido = roundMoney(preco - custoEfetivo);
  const margemPct = preco > 0 ? roundMoney((lucroLiquido / preco) * 100) : 0;

  return {
    id: row.id,
    codigo_sku: row.codigo_sku,
    tipo: row.tipo,
    dominio: row.dominio,
    nome_tecnico: row.nome_tecnico,
    abreviacao_balcao: row.abreviacao_balcao,
    preco_venda: preco,
    custo_medio_ponderado: cmp,
    custo_bom: bomCost,
    custo_efetivo: custoEfetivo,
    lucro_liquido: lucroLiquido,
    margem_pct: margemPct,
    estoque_atual: Number(row.estoque_atual),
    estoque_minimo: Number(row.estoque_minimo),
    alerta_ruptura: (row.tipo === 'INSUMO' || row.tipo === 'PRODUTO') && Number(row.estoque_atual) <= Number(row.estoque_minimo),
    unidade: row.unidade,
    garantia_dias: Number(row.garantia_dias),
    sla_padrao_minutos: Number(row.sla_padrao_minutos),
    frequencia_uso: Number(row.frequencia_uso),
    bom_itens: bomItens
  };
}

function listCatalogData(db, requestedDomain = 'ALL') {
  const settings = getAllSettings(db);
  const scope = resolveDomainScope(settings.operation_mode, requestedDomain);
  const ph = buildPlaceholders(scope.itemDomains);
  const bomMap = computeBomMap(db);

  const allActiveRows = db
    .prepare(
      `SELECT id, codigo_sku, tipo, dominio, nome_tecnico, abreviacao_balcao,
              ROUND(preco_venda, 2) AS preco_venda,
              ROUND(custo_medio_ponderado, 2) AS custo_medio_ponderado,
              estoque_atual, estoque_minimo, unidade, garantia_dias,
              sla_padrao_minutos, frequencia_uso
       FROM catalogo_itens
       WHERE ativo = 1
       ORDER BY frequencia_uso DESC, nome_tecnico ASC`
    )
    .all();

  const allEnrichedById = new Map();
  const scopedItems = [];
  for (const row of allActiveRows) {
    const item = enrichItem(row, bomMap);
    allEnrichedById.set(item.id, item);
    if (scope.itemDomains.includes(item.dominio)) {
      scopedItems.push(item);
    }
  }

  const combos = listScopedCombos(db, scope.itemDomains, allEnrichedById);

  const recentMovements = db
    .prepare(
      `SELECT m.id, m.item_id, m.tipo_movimento, m.quantidade,
              ROUND(m.custo_unitario, 2) AS custo_unitario,
              ROUND(m.cmp_anterior, 2) AS cmp_anterior,
              ROUND(m.cmp_novo, 2) AS cmp_novo,
              m.estoque_anterior, m.estoque_posterior, m.observacao, m.criado_em,
              c.codigo_sku, c.abreviacao_balcao, c.dominio, c.unidade
       FROM estoque_movimentacoes m
       JOIN catalogo_itens c ON c.id = m.item_id
       WHERE c.dominio IN (${ph})
       ORDER BY m.id DESC LIMIT 30`
    )
    .all(...scope.itemDomains);

  const attributes = db
    .prepare(
      `SELECT id, categoria, dominio, valor, frequencia_uso
       FROM memoria_atributos
       WHERE ativo = 1 AND dominio IN (${ph})
       ORDER BY frequencia_uso DESC, valor ASC`
    )
    .all(...scope.itemDomains);

  return {
    scope,
    items: scopedItems,
    combos,
    recentMovements,
    attributes,
    kpis: {
      totalServicos: scopedItems.filter((i) => i.tipo === 'SERVICO').length,
      totalProdutos: scopedItems.filter((i) => i.tipo === 'PRODUTO').length,
      totalInsumos: scopedItems.filter((i) => i.tipo === 'INSUMO').length,
      totalCombos: combos.length,
      rupturas: scopedItems.filter((i) => i.alerta_ruptura).length
    }
  };
}

function generateNextSku(db, tipo, dominio) {
  const prefix = `${dominio.slice(0, 3)}-${tipo.slice(0, 3)}`;
  const row = db
    .prepare('SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM catalogo_itens')
    .get();
  let seq = Number(row?.nextId || 1);
  let candidate = `${prefix}-${String(seq).padStart(4, '0')}`;
  while (db.prepare('SELECT id FROM catalogo_itens WHERE codigo_sku = ?').get(candidate)) {
    seq += 1;
    candidate = `${prefix}-${String(seq).padStart(4, '0')}`;
  }
  return candidate;
}

function syncServiceBomCosts(db, insumoId = null) {
  const targetServices = insumoId
    ? db.prepare('SELECT DISTINCT servico_id AS id FROM ficha_tecnica_bom WHERE insumo_id = ? AND ativo = 1').all(insumoId)
    : db.prepare("SELECT id FROM catalogo_itens WHERE tipo = 'SERVICO' AND ativo = 1").all();

  const calcStmt = db.prepare(
    `SELECT COALESCE(ROUND(SUM(b.quantidade_consumida * i.custo_medio_ponderado), 2), 0) AS custo_bom,
            COUNT(*) AS total_linhas
     FROM ficha_tecnica_bom b
     JOIN catalogo_itens i ON i.id = b.insumo_id
     WHERE b.servico_id = ? AND b.ativo = 1 AND i.ativo = 1`
  );
  const updStmt = db.prepare('UPDATE catalogo_itens SET custo_medio_ponderado = ROUND(?, 2) WHERE id = ?');

  for (const srv of targetServices) {
    const info = calcStmt.get(srv.id);
    if (info && Number(info.total_linhas) > 0) {
      updStmt.run(roundMoney(info.custo_bom), srv.id);
    }
  }
}

function saveCatalogItem(db, payload, itemId = null) {
  const settings = getAllSettings(db);
  const existing = itemId
    ? db.prepare('SELECT * FROM catalogo_itens WHERE id = ? AND ativo = 1').get(Number(itemId))
    : null;
  if (itemId && !existing) {
    const err = new Error('Item do catalogo nao encontrado.');
    err.statusCode = 404;
    throw err;
  }

  const tipo = payload.tipo || existing?.tipo;
  if (!VALID_ITEM_TYPES.includes(tipo)) {
    throw new ValidationError(`Tipo de item invalido: ${tipo}`);
  }
  const dominio = payload.dominio || existing?.dominio;
  assertDomainAllowed(settings.operation_mode, dominio);

  const nomeTecnico = String(payload.nome_tecnico ?? existing?.nome_tecnico ?? '').trim();
  if (nomeTecnico.length < 2) {
    throw new ValidationError('Nome tecnico deve ter ao menos 2 caracteres.');
  }
  const abreviacao = String(payload.abreviacao_balcao ?? existing?.abreviacao_balcao ?? nomeTecnico).trim().slice(0, 48);
  const skuRaw = payload.codigo_sku !== undefined ? String(payload.codigo_sku).trim().toUpperCase() : existing?.codigo_sku;
  const codigoSku = skuRaw || generateNextSku(db, tipo, dominio);

  const precoVenda = tipo === 'INSUMO' ? 0 : roundMoney(payload.preco_venda ?? existing?.preco_venda ?? 0);
  const cmpInicial = roundMoney(payload.custo_medio_ponderado ?? existing?.custo_medio_ponderado ?? 0);
  if (precoVenda < 0 || cmpInicial < 0) {
    throw new ValidationError('Valores monetarios nao podem ser negativos.');
  }

  const estoqueAtual = tipo === 'SERVICO' ? 0 : roundQty(payload.estoque_atual ?? existing?.estoque_atual ?? 0);
  const estoqueMinimo = tipo === 'SERVICO' ? 0 : roundQty(payload.estoque_minimo ?? existing?.estoque_minimo ?? 0);
  const unidade = String(payload.unidade ?? existing?.unidade ?? 'UN').trim().toUpperCase().slice(0, 10) || 'UN';
  const garantiaDias = Math.max(0, Math.round(Number(payload.garantia_dias ?? existing?.garantia_dias ?? 90)));
  const slaMinutos = Math.max(0, Math.round(Number(payload.sla_padrao_minutos ?? existing?.sla_padrao_minutos ?? 60)));

  const bomItens = Array.isArray(payload.bom_itens) ? payload.bom_itens : null;

  const savedId = db.transaction(() => {
    let targetId = existing ? existing.id : null;
    if (existing) {
      db.prepare(
        `UPDATE catalogo_itens
         SET codigo_sku = ?, tipo = ?, dominio = ?, nome_tecnico = ?, abreviacao_balcao = ?,
             preco_venda = ROUND(?, 2), custo_medio_ponderado = ROUND(?, 2),
             estoque_atual = ?, estoque_minimo = ?, unidade = ?,
             garantia_dias = ?, sla_padrao_minutos = ?
         WHERE id = ?`
      ).run(
        codigoSku, tipo, dominio, nomeTecnico, abreviacao,
        precoVenda, cmpInicial, estoqueAtual, estoqueMinimo, unidade,
        garantiaDias, slaMinutos, existing.id
      );
    } else {
      const res = db.prepare(
        `INSERT INTO catalogo_itens (
          codigo_sku, tipo, dominio, nome_tecnico, abreviacao_balcao,
          preco_venda, custo_medio_ponderado, estoque_atual, estoque_minimo,
          unidade, garantia_dias, sla_padrao_minutos
        ) VALUES (?, ?, ?, ?, ?, ROUND(?, 2), ROUND(?, 2), ?, ?, ?, ?, ?)`
      ).run(
        codigoSku, tipo, dominio, nomeTecnico, abreviacao,
        precoVenda, cmpInicial, estoqueAtual, estoqueMinimo,
        unidade, garantiaDias, slaMinutos
      );
      targetId = Number(res.lastInsertRowid);
    }

    if (tipo === 'SERVICO' && bomItens !== null) {
      db.prepare('UPDATE ficha_tecnica_bom SET ativo = 0 WHERE servico_id = ?').run(targetId);
      const insBom = db.prepare(
        `INSERT INTO ficha_tecnica_bom (servico_id, insumo_id, quantidade_consumida, ativo)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(servico_id, insumo_id) DO UPDATE SET
           quantidade_consumida = excluded.quantidade_consumida,
           ativo = 1`
      );
      for (const b of bomItens) {
        const insumo = db
          .prepare("SELECT id FROM catalogo_itens WHERE id = ? AND tipo = 'INSUMO' AND ativo = 1")
          .get(Number(b.insumo_id));
        if (!insumo) {
          throw new ValidationError(`Insumo BOM invalido: ${b.insumo_id}`);
        }
        const qty = roundQty(b.quantidade_consumida);
        if (qty <= 0) throw new ValidationError('Quantidade BOM deve ser maior que zero.');
        insBom.run(targetId, insumo.id, qty);
      }
      if (bomItens.length > 0) {
        syncServiceBomCosts(db, null);
      }
    }
    return targetId;
  })();

  const row = db.prepare('SELECT * FROM catalogo_itens WHERE id = ?').get(savedId);
  return enrichItem(row, computeBomMap(db));
}

function registerPurchaseCmp(db, payload) {
  const item = db
    .prepare("SELECT * FROM catalogo_itens WHERE id = ? AND ativo = 1 AND tipo IN ('INSUMO', 'PRODUTO')")
    .get(Number(payload.item_id));
  if (!item) {
    throw new ValidationError('Item de estoque (Insumo ou Produto) nao encontrado.');
  }

  const qty = roundQty(payload.quantidade);
  if (qty <= 0) {
    throw new ValidationError('Quantidade da compra deve ser maior que zero.');
  }

  let totalPago;
  let custoUnitario;
  if (payload.valor_pago !== undefined && payload.valor_pago !== null && payload.valor_pago !== '') {
    totalPago = roundMoney(payload.valor_pago);
    if (totalPago < 0) throw new ValidationError('Valor pago nao pode ser negativo.');
    custoUnitario = roundMoney(totalPago / qty);
  } else if (payload.custo_unitario !== undefined && payload.custo_unitario !== null && payload.custo_unitario !== '') {
    custoUnitario = roundMoney(payload.custo_unitario);
    if (custoUnitario < 0) throw new ValidationError('Custo unitario nao pode ser negativo.');
    totalPago = roundMoney(qty * custoUnitario);
  } else {
    throw new ValidationError('Informe valor_pago ou custo_unitario da compra.');
  }

  const estoqueAnterior = roundQty(item.estoque_atual);
  const cmpAnterior = roundMoney(item.custo_medio_ponderado);
  const estoquePosterior = roundQty(estoqueAnterior + qty);
  const cmpNovo = estoqueAnterior <= 0
    ? custoUnitario
    : roundMoney(((estoqueAnterior * cmpAnterior) + totalPago) / estoquePosterior);

  const observacao = String(payload.observacao || `Entrada compra (${qty} ${item.unidade} por R$ ${totalPago.toFixed(2)})`).trim().slice(0, 220);

  const movement = db.transaction(() => {
    db.prepare(
      'UPDATE catalogo_itens SET estoque_atual = ?, custo_medio_ponderado = ROUND(?, 2) WHERE id = ?'
    ).run(estoquePosterior, cmpNovo, item.id);

    const movRes = db.prepare(
      `INSERT INTO estoque_movimentacoes (
        item_id, tipo_movimento, quantidade, custo_unitario,
        cmp_anterior, cmp_novo, estoque_anterior, estoque_posterior, observacao
      ) VALUES (?, 'ENTRADA_COMPRA', ?, ROUND(?, 2), ROUND(?, 2), ROUND(?, 2), ?, ?, ?)`
    ).run(item.id, qty, custoUnitario, cmpAnterior, cmpNovo, estoqueAnterior, estoquePosterior, observacao);

    if (item.tipo === 'INSUMO') {
      syncServiceBomCosts(db, item.id);
    }

    return db.prepare('SELECT * FROM estoque_movimentacoes WHERE id = ?').get(Number(movRes.lastInsertRowid));
  })();

  const updatedRow = db.prepare('SELECT * FROM catalogo_itens WHERE id = ?').get(item.id);
  return {
    item: enrichItem(updatedRow, computeBomMap(db)),
    movement
  };
}

function registerStockAdjustment(db, payload) {
  const item = db
    .prepare("SELECT * FROM catalogo_itens WHERE id = ? AND ativo = 1 AND tipo IN ('INSUMO', 'PRODUTO')")
    .get(Number(payload.item_id));
  if (!item) {
    throw new ValidationError('Item de estoque nao encontrado.');
  }

  const motivo = String(payload.motivo || '').trim();
  if (motivo.length < 3) {
    throw new ValidationError('Informe um motivo valido (minimo 3 caracteres) para o ajuste de inventario.');
  }

  const estoqueAnterior = roundQty(item.estoque_atual);
  let estoquePosterior;
  if (payload.nova_quantidade !== undefined && payload.nova_quantidade !== null && payload.nova_quantidade !== '') {
    estoquePosterior = roundQty(payload.nova_quantidade);
  } else if (payload.delta_quantidade !== undefined && payload.delta_quantidade !== null && payload.delta_quantidade !== '') {
    estoquePosterior = roundQty(estoqueAnterior + Number(payload.delta_quantidade));
  } else {
    throw new ValidationError('Informe nova_quantidade ou delta_quantidade.');
  }

  if (estoquePosterior < 0) {
    throw new ValidationError('Estoque posterior nao pode ficar negativo.');
  }
  if (estoquePosterior === estoqueAnterior) {
    throw new ValidationError('A nova quantidade deve ser diferente do estoque atual.');
  }

  const delta = roundQty(estoquePosterior - estoqueAnterior);
  const cmpAtual = roundMoney(item.custo_medio_ponderado);

  const movement = db.transaction(() => {
    db.prepare('UPDATE catalogo_itens SET estoque_atual = ? WHERE id = ?').run(estoquePosterior, item.id);
    const res = db.prepare(
      `INSERT INTO estoque_movimentacoes (
        item_id, tipo_movimento, quantidade, custo_unitario,
        cmp_anterior, cmp_novo, estoque_anterior, estoque_posterior, observacao
      ) VALUES (?, 'AJUSTE_MANUAL', ?, ROUND(?, 2), ROUND(?, 2), ROUND(?, 2), ?, ?, ?)`
    ).run(item.id, delta, cmpAtual, cmpAtual, cmpAtual, estoqueAnterior, estoquePosterior, motivo.slice(0, 220));
    return db.prepare('SELECT * FROM estoque_movimentacoes WHERE id = ?').get(Number(res.lastInsertRowid));
  })();

  const updatedRow = db.prepare('SELECT * FROM catalogo_itens WHERE id = ?').get(item.id);
  return {
    item: enrichItem(updatedRow, computeBomMap(db)),
    movement
  };
}

function saveCombo(db, payload, comboId = null) {
  return saveComboCore(db, payload, comboId, {
    assertDomainAllowed,
    roundQty,
    computeBomMap,
    enrichItem,
    listCatalogData
  });
}

function deactivateItem(db, id) {
  const existing = db.prepare('SELECT id FROM catalogo_itens WHERE id = ? AND ativo = 1').get(Number(id));
  if (!existing) {
    const err = new Error('Item nao encontrado.');
    err.statusCode = 404;
    throw err;
  }
  db.prepare('UPDATE catalogo_itens SET ativo = 0 WHERE id = ?').run(existing.id);
  return { ok: true, id: existing.id };
}

function createAttributeInline(db, payload) {
  const settings = getAllSettings(db);
  const categoria = String(payload.categoria || 'MATERIAL').toUpperCase();
  if (!['MATERIAL', 'LOCAL_AVARIA', 'ESTADO_LENTE'].includes(categoria)) {
    throw new ValidationError('Categoria de atributo invalida.');
  }
  const dominio = payload.dominio || (settings.operation_mode === 'CUTLERY_ONLY' ? 'CUTELARIA' : 'OPTICA');
  assertDomainAllowed(settings.operation_mode, dominio);
  const valor = String(payload.valor || '').trim().slice(0, 64);
  if (valor.length < 2) throw new ValidationError('Valor do atributo deve ter ao menos 2 caracteres.');

  db.prepare(
    `INSERT INTO memoria_atributos (categoria, dominio, valor, frequencia_uso, ativo)
     VALUES (?, ?, ?, 1, 1)
     ON CONFLICT(categoria, dominio, valor) DO UPDATE SET
       ativo = 1,
       frequencia_uso = memoria_atributos.frequencia_uso + 1`
  ).run(categoria, dominio, valor);

  return db
    .prepare('SELECT * FROM memoria_atributos WHERE categoria = ? AND dominio = ? AND valor = ?')
    .get(categoria, dominio, valor);
}

module.exports = {
  listCatalogData,
  saveCatalogItem,
  registerPurchaseCmp,
  registerStockAdjustment,
  saveCombo,
  deactivateItem,
  deactivateCombo,
  createAttributeInline
};
