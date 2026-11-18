'use strict';

const { roundMoney } = require('../utils/money');
const { ValidationError, getAllSettings } = require('./settings-service');

function buildPlaceholders(arr) {
  return arr.map(() => '?').join(', ');
}

function enrichCombo(comboRow, comboItemsRows, enrichedItemsById) {
  let somaOriginal = 0;
  let custoEmbutido = 0;
  const itens = comboItemsRows.map((ci) => {
    const item = enrichedItemsById.get(ci.item_id);
    const qty = Number(ci.quantidade);
    const unitPrice = item ? item.preco_venda : 0;
    const unitCost = item ? item.custo_efetivo : 0;
    const subOrig = roundMoney(unitPrice * qty);
    const subCost = roundMoney(unitCost * qty);
    somaOriginal = roundMoney(somaOriginal + subOrig);
    custoEmbutido = roundMoney(custoEmbutido + subCost);
    return {
      item_id: ci.item_id,
      codigo_sku: item?.codigo_sku || '',
      nome_tecnico: item?.nome_tecnico || '',
      abreviacao_balcao: item?.abreviacao_balcao || '',
      tipo: item?.tipo || 'SERVICO',
      dominio: item?.dominio || comboRow.dominio,
      quantidade: qty,
      preco_unitario: unitPrice,
      custo_unitario_efetivo: unitCost,
      subtotal_original: subOrig,
      subtotal_custo: subCost
    };
  });

  const precoCombo = roundMoney(comboRow.preco_combo);
  const descontoReal = roundMoney(somaOriginal - precoCombo);
  const lucroLiquidoFinal = roundMoney(precoCombo - custoEmbutido);
  const margemLiquidaPct = precoCombo > 0 ? roundMoney((lucroLiquidoFinal / precoCombo) * 100) : 0;

  return {
    id: comboRow.id,
    codigo_combo: comboRow.codigo_combo,
    nome: comboRow.nome,
    abreviacao: comboRow.abreviacao,
    dominio: comboRow.dominio,
    soma_original: somaOriginal,
    preco_combo: precoCombo,
    economia_gerada: roundMoney(comboRow.economia_gerada),
    desconto_real: descontoReal,
    custo_total_embutido: custoEmbutido,
    lucro_liquido_final: lucroLiquidoFinal,
    margem_liquida_pct: margemLiquidaPct,
    itens
  };
}

function listScopedCombos(db, itemDomains, allEnrichedById) {
  const ph = buildPlaceholders(itemDomains);
  const comboRows = db
    .prepare(
      `SELECT id, codigo_combo, nome, abreviacao, dominio,
              ROUND(preco_combo, 2) AS preco_combo,
              ROUND(economia_gerada, 2) AS economia_gerada
       FROM combos
       WHERE ativo = 1 AND dominio IN (${ph})
       ORDER BY nome ASC`
    )
    .all(...itemDomains);

  const comboIds = comboRows.map((c) => c.id);
  const comboItemsByCombo = new Map();
  if (comboIds.length > 0) {
    const ciRows = db
      .prepare(
        `SELECT combo_id, item_id, quantidade
         FROM combos_itens
         WHERE combo_id IN (${buildPlaceholders(comboIds)})`
      )
      .all(...comboIds);
    for (const ci of ciRows) {
      if (!comboItemsByCombo.has(ci.combo_id)) comboItemsByCombo.set(ci.combo_id, []);
      comboItemsByCombo.get(ci.combo_id).push(ci);
    }
  }

  return comboRows.map((c) =>
    enrichCombo(c, comboItemsByCombo.get(c.id) || [], allEnrichedById)
  );
}

function saveCombo(db, payload, comboId, helpers) {
  const { assertDomainAllowed, roundQty, computeBomMap, enrichItem, listCatalogData } = helpers;
  const settings = getAllSettings(db);
  const existing = comboId
    ? db.prepare('SELECT * FROM combos WHERE id = ? AND ativo = 1').get(Number(comboId))
    : null;
  if (comboId && !existing) {
    const err = new Error('Combo não encontrado.');
    err.statusCode = 404;
    throw err;
  }

  const nome = String(payload.nome ?? existing?.nome ?? '').trim();
  if (nome.length < 2) throw new ValidationError('Nome do combo deve ter ao menos 2 caracteres.');
  const abreviacao = String(payload.abreviacao ?? existing?.abreviacao ?? nome).trim().slice(0, 48);
  const dominio = payload.dominio || existing?.dominio;
  assertDomainAllowed(settings.operation_mode, dominio);

  const precoCombo = roundMoney(payload.preco_combo ?? existing?.preco_combo ?? 0);
  if (precoCombo < 0) throw new ValidationError('Preço do combo não pode ser negativo.');

  const itensInput = Array.isArray(payload.itens) ? payload.itens : null;
  if (!itensInput || itensInput.length === 0) {
    throw new ValidationError('Selecione ao menos 1 serviço ou produto para compor o combo.');
  }

  const bomMap = computeBomMap(db);
  const resolvedItems = itensInput.map((line) => {
    const row = db
      .prepare("SELECT * FROM catalogo_itens WHERE id = ? AND ativo = 1 AND tipo IN ('SERVICO', 'PRODUTO')")
      .get(Number(line.item_id));
    if (!row) {
      throw new ValidationError(`Item de combo inválido: ${line.item_id}`);
    }
    const qty = roundQty(line.quantidade ?? 1);
    if (qty <= 0) throw new ValidationError('Quantidade do item no combo deve ser maior que zero.');
    return { item: enrichItem(row, bomMap), quantidade: qty };
  });

  const somaOriginal = roundMoney(
    resolvedItems.reduce((acc, entry) => acc + (entry.item.preco_venda * entry.quantidade), 0)
  );
  const economiaGerada = roundMoney(Math.max(0, somaOriginal - precoCombo));
  const codigoCombo = String(
    payload.codigo_combo || existing?.codigo_combo || `CMB-${dominio.slice(0, 3)}-${Date.now().toString().slice(-4)}`
  ).toUpperCase();

  const savedComboId = db.transaction(() => {
    let targetId = existing ? existing.id : null;
    if (existing) {
      db.prepare(
        `UPDATE combos
         SET codigo_combo = ?, nome = ?, abreviacao = ?, dominio = ?,
             preco_combo = ROUND(?, 2), economia_gerada = ROUND(?, 2)
         WHERE id = ?`
      ).run(codigoCombo, nome, abreviacao, dominio, precoCombo, economiaGerada, existing.id);
      db.prepare('DELETE FROM combos_itens WHERE combo_id = ?').run(existing.id);
    } else {
      const res = db.prepare(
        `INSERT INTO combos (codigo_combo, nome, abreviacao, dominio, preco_combo, economia_gerada)
         VALUES (?, ?, ?, ?, ROUND(?, 2), ROUND(?, 2))`
      ).run(codigoCombo, nome, abreviacao, dominio, precoCombo, economiaGerada);
      targetId = Number(res.lastInsertRowid);
    }

    const insItem = db.prepare('INSERT INTO combos_itens (combo_id, item_id, quantidade) VALUES (?, ?, ?)');
    for (const entry of resolvedItems) {
      insItem.run(targetId, entry.item.id, entry.quantidade);
    }
    return targetId;
  })();

  const data = listCatalogData(db, 'ALL');
  return data.combos.find((c) => c.id === savedComboId);
}

function deactivateCombo(db, id) {
  const existing = db.prepare('SELECT id FROM combos WHERE id = ? AND ativo = 1').get(Number(id));
  if (!existing) {
    const err = new Error('Combo não encontrado.');
    err.statusCode = 404;
    throw err;
  }
  db.prepare('UPDATE combos SET ativo = 0 WHERE id = ?').run(existing.id);
  return { ok: true, id: existing.id };
}

module.exports = {
  listScopedCombos,
  saveCombo,
  deactivateCombo
};
