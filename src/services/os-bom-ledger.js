'use strict';

const { roundMoney } = require('../utils/money');
const { ValidationError, getAllSettings } = require('./settings-service');

const VALID_PAY_METHODS = ['ESPECIE', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO'];

function roundQty(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 1000) / 1000;
}

function ensureOpenCashSession(db) {
  const open = db
    .prepare("SELECT * FROM caixa_sessoes WHERE status = 'ABERTO' ORDER BY id DESC LIMIT 1")
    .get();
  if (open) return open;

  const res = db
    .prepare(
      `INSERT INTO caixa_sessoes (status, saldo_inicial_especie, observacoes)
       VALUES ('ABERTO', 0.00, 'Abertura automática operacional')`
    )
    .run();
  return db.prepare('SELECT * FROM caixa_sessoes WHERE id = ?').get(Number(res.lastInsertRowid));
}

function applyStockChange(db, { itemId, osId, tipoMovimento, deltaQty, observacao }) {
  const item = db
    .prepare('SELECT id, estoque_atual, custo_medio_ponderado FROM catalogo_itens WHERE id = ? AND ativo = 1')
    .get(Number(itemId));
  if (!item) return null;

  const estAnterior = roundQty(item.estoque_atual);
  const estPosterior = roundQty(estAnterior + deltaQty);
  const cmp = roundMoney(item.custo_medio_ponderado);

  db.prepare('UPDATE catalogo_itens SET estoque_atual = ? WHERE id = ?').run(estPosterior, item.id);
  const mov = db.prepare(
    `INSERT INTO estoque_movimentacoes (
      item_id, os_id, tipo_movimento, quantidade, custo_unitario,
      cmp_anterior, cmp_novo, estoque_anterior, estoque_posterior, observacao
    ) VALUES (?, ?, ?, ?, ROUND(?, 2), ROUND(?, 2), ROUND(?, 2), ?, ?, ?)`
  ).run(
    item.id,
    osId || null,
    tipoMovimento,
    roundQty(deltaQty),
    cmp,
    cmp,
    cmp,
    estAnterior,
    estPosterior,
    String(observacao || '').slice(0, 220)
  );
  return Number(mov.lastInsertRowid);
}

function deductServiceBom(db, serviceId, qtyMultiplier, osId, codigoOs) {
  const bomRows = db
    .prepare(
      `SELECT insumo_id, quantidade_consumida
       FROM ficha_tecnica_bom
       WHERE servico_id = ? AND ativo = 1`
    )
    .all(Number(serviceId));

  const created = [];
  for (const bom of bomRows) {
    const consumeQty = roundQty(Number(bom.quantidade_consumida) * Number(qtyMultiplier));
    if (consumeQty <= 0) continue;
    const movId = applyStockChange(db, {
      itemId: bom.insumo_id,
      osId,
      tipoMovimento: 'BAIXA_BOM',
      deltaQty: -consumeQty,
      observacao: `Baixa BOM ${codigoOs}`
    });
    if (movId) created.push(movId);
  }
  return created;
}

function deductOrderBomAndProducts(db, osId) {
  const os = db
    .prepare('SELECT id, codigo_os, bom_baixado FROM ordens_servico WHERE id = ? AND ativo = 1')
    .get(Number(osId));
  if (!os) return { skipped: true, movements: [] };
  if (os.bom_baixado === 1) return { skipped: true, movements: [] };

  const lines = db
    .prepare('SELECT id, item_id, combo_id, tipo, quantidade FROM os_itens WHERE os_id = ? AND ativo = 1')
    .all(os.id);

  const movements = [];
  for (const line of lines) {
    const qty = Number(line.quantidade || 1);
    if ((line.tipo === 'SERVICO' || line.tipo === 'LOTE') && line.item_id) {
      movements.push(...deductServiceBom(db, line.item_id, qty, os.id, os.codigo_os));
    } else if (line.tipo === 'PRODUTO' && line.item_id) {
      const movId = applyStockChange(db, {
        itemId: line.item_id,
        osId: os.id,
        tipoMovimento: 'VENDA_PDV',
        deltaQty: -qty,
        observacao: `Saida produto ${os.codigo_os}`
      });
      if (movId) movements.push(movId);
    } else if (line.tipo === 'COMBO' && line.combo_id) {
      const children = db
        .prepare(
          `SELECT ci.item_id, ci.quantidade, c.tipo
           FROM combos_itens ci
           JOIN catalogo_itens c ON c.id = ci.item_id
           WHERE ci.combo_id = ? AND c.ativo = 1`
        )
        .all(line.combo_id);
      for (const ch of children) {
        const chQty = roundQty(qty * Number(ch.quantidade || 1));
        if (ch.tipo === 'SERVICO') {
          movements.push(...deductServiceBom(db, ch.item_id, chQty, os.id, os.codigo_os));
        } else if (ch.tipo === 'PRODUTO') {
          const movId = applyStockChange(db, {
            itemId: ch.item_id,
            osId: os.id,
            tipoMovimento: 'VENDA_PDV',
            deltaQty: -chQty,
            observacao: `Saida combo ${os.codigo_os}`
          });
          if (movId) movements.push(movId);
        }
      }
    }
  }

  db.prepare('UPDATE ordens_servico SET bom_baixado = 1 WHERE id = ?').run(os.id);
  return { skipped: false, movements };
}

function reverseOrderBomAndProducts(db, osId, codigoOs, motivo) {
  const os = db.prepare('SELECT id, bom_baixado FROM ordens_servico WHERE id = ?').get(Number(osId));
  if (!os || os.bom_baixado === 0) return { skipped: true, reversedCount: 0 };

  const drops = db
    .prepare(
      `SELECT item_id, quantidade
       FROM estoque_movimentacoes
       WHERE os_id = ? AND tipo_movimento IN ('BAIXA_BOM', 'VENDA_PDV') AND quantidade < 0`
    )
    .all(os.id);

  let reversedCount = 0;
  for (const mov of drops) {
    const returnQty = roundQty(Math.abs(Number(mov.quantidade)));
    if (returnQty <= 0) continue;
    const estId = applyStockChange(db, {
      itemId: mov.item_id,
      osId: os.id,
      tipoMovimento: 'ESTORNO',
      deltaQty: returnQty,
      observacao: `Estorno cancelamento ${codigoOs}: ${motivo}`
    });
    if (estId) reversedCount += 1;
  }

  db.prepare('UPDATE ordens_servico SET bom_baixado = 0 WHERE id = ?').run(os.id);
  return { skipped: false, reversedCount };
}

function computeCardFeePct(meio, parcelado, cardFees) {
  if (meio === 'CARTAO_DEBITO') return Number(cardFees?.debito_pct || 0);
  if (meio === 'CARTAO_CREDITO') {
    return parcelado ? Number(cardFees?.credito_parcelado_pct || 0) : Number(cardFees?.credito_1x_pct || 0);
  }
  return 0;
}

function recordOrderPayments(db, opts) {
  const {
    osId,
    codigoOs,
    dominio,
    payments = [],
    ehCortesia = 0,
    paCount = 0,
    serviceUnitsCount = 0,
    dataCompetencia = null
  } = opts;

  const settings = getAllSettings(db);
  const sessao = ensureOpenCashSession(db);
  const compDate = dataCompetencia || db.prepare("SELECT date('now', 'localtime') AS d").get().d;

  const insertLedger = db.prepare(
    `INSERT INTO caixa_ledger (
      caixa_sessao_id, os_id, tipo_movimento, categoria_dre, dominio,
      meio_pagamento, valor_bruto, taxa_aplicada, valor_liquido,
      descricao, data_competencia
    ) VALUES (?, ?, 'ENTRADA_OS', ?, ?, ?, ROUND(?, 2), ROUND(?, 2), ROUND(?, 2), ?, ?)`
  );

  let addEspecie = 0;
  let addPix = 0;
  let addCartaoBruto = 0;
  let addCartaoLiquido = 0;
  let totalPaid = 0;

  if (ehCortesia === 1 && payments.length === 0) {
    insertLedger.run(
      sessao.id,
      osId,
      'CORTESIA_TECNICA',
      dominio,
      'CORTESIA',
      0,
      0,
      0,
      `Cortesia registrada em ${codigoOs}`,
      compDate
    );
  } else {
    for (const pay of payments) {
      const meio = String(pay.meio_pagamento || 'ESPECIE').toUpperCase();
      if (!VALID_PAY_METHODS.includes(meio)) {
        throw new ValidationError(`Meio de pagamento inválido: ${meio}`);
      }
      const bruto = roundMoney(pay.valor || 0);
      if (bruto <= 0) continue;
      const pct = computeCardFeePct(meio, Boolean(pay.parcelado), settings.card_fees);
      const taxa = roundMoney(bruto * (pct / 100));
      const liquido = roundMoney(bruto - taxa);

      insertLedger.run(
        sessao.id,
        osId,
        'RECEITA_SERVICO',
        dominio,
        meio,
        bruto,
        taxa,
        liquido,
        `Recebimento ${codigoOs} (${meio})`,
        compDate
      );

      totalPaid = roundMoney(totalPaid + bruto);
      if (meio === 'ESPECIE') addEspecie = roundMoney(addEspecie + bruto);
      else if (meio === 'PIX') addPix = roundMoney(addPix + bruto);
      else {
        addCartaoBruto = roundMoney(addCartaoBruto + bruto);
        addCartaoLiquido = roundMoney(addCartaoLiquido + liquido);
      }
    }
  }

  db.prepare(
    `UPDATE caixa_sessoes
     SET entradas_especie = ROUND(entradas_especie + ?, 2),
         entradas_pix = ROUND(entradas_pix + ?, 2),
         entradas_cartao_bruto = ROUND(entradas_cartao_bruto + ?, 2),
         entradas_cartao_liquido = ROUND(entradas_cartao_liquido + ?, 2),
         pessoas_atendidas_pa = pessoas_atendidas_pa + ?,
         quantidade_servicos_qnt = quantidade_servicos_qnt + ?
     WHERE id = ?`
  ).run(addEspecie, addPix, addCartaoBruto, addCartaoLiquido, paCount, serviceUnitsCount, sessao.id);

  return { sessaoId: sessao.id, totalPaid };
}

function reverseOrderLedgerOnCancel(db, osId, codigoOs, motivo) {
  const rows = db
    .prepare(
      `SELECT * FROM caixa_ledger
       WHERE os_id = ? AND tipo_movimento IN ('ENTRADA_OS', 'VENDA_PDV') AND valor_bruto > 0`
    )
    .all(Number(osId));

  const insEstorno = db.prepare(
    `INSERT INTO caixa_ledger (
      caixa_sessao_id, os_id, ledger_origem_estorno_id, tipo_movimento,
      categoria_dre, dominio, meio_pagamento, valor_bruto, taxa_aplicada,
      valor_liquido, descricao, justificativa_estorno
    ) VALUES (?, ?, ?, 'ESTORNO', 'ESTORNO_OS', ?, ?, ROUND(?, 2), ROUND(?, 2), ROUND(?, 2), ?, ?)`
  );

  let reversedTotal = 0;
  for (const row of rows) {
    insEstorno.run(
      row.caixa_sessao_id,
      osId,
      row.id,
      row.dominio,
      row.meio_pagamento,
      -roundMoney(row.valor_bruto),
      -roundMoney(row.taxa_aplicada),
      -roundMoney(row.valor_liquido),
      `Estorno cancelamento ${codigoOs}`,
      motivo
    );
    reversedTotal = roundMoney(reversedTotal + row.valor_bruto);
  }
  return reversedTotal;
}

module.exports = {
  ensureOpenCashSession,
  deductOrderBomAndProducts,
  reverseOrderBomAndProducts,
  recordOrderPayments,
  reverseOrderLedgerOnCancel
};
