'use strict';

const { roundMoney } = require('../utils/money');
const { getAllSettings } = require('./settings-service');

function computeClientMetrics(db, clienteId, rules) {
  const tolerancia = Math.max(1, Math.round(Number(rules.dias_tolerancia_retirada || 10)));

  const ledgerRow = db
    .prepare(
      `SELECT COALESCE(ROUND(SUM(l.valor_liquido), 2), 0) AS total
       FROM caixa_ledger l
       JOIN ordens_servico o ON o.id = l.os_id
       WHERE o.cliente_id = ? AND o.ativo = 1`
    )
    .get(clienteId);

  const osAgg = db
    .prepare(
      `SELECT COALESCE(ROUND(SUM(valor_pago), 2), 0) AS ltv_os,
              COUNT(*) AS total_os,
              MAX(criado_em) AS ultima_visita
       FROM ordens_servico
       WHERE cliente_id = ? AND ativo = 1 AND status != 'CANCELADA'`
    )
    .get(clienteId);

  const atrasoRow = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM ordens_servico
       WHERE cliente_id = ? AND ativo = 1 AND status != 'CANCELADA'
         AND pronto_em IS NOT NULL
         AND (
           (entregue_em IS NOT NULL AND (julianday(entregue_em) - julianday(pronto_em)) > ?)
           OR (status = 'PRONTO' AND (julianday('now', 'localtime') - julianday(pronto_em)) > ?)
         )`
    )
    .get(clienteId, tolerancia, tolerancia);

  const inadimplenciaRow = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM ordens_servico
       WHERE cliente_id = ? AND ativo = 1 AND status != 'CANCELADA'
         AND eh_cortesia = 0 AND saldo_devedor > 0.009
         AND (
           status = 'ENTREGUE'
           OR (prazo_prometido_em IS NOT NULL AND julianday('now', 'localtime') > julianday(prazo_prometido_em))
         )`
    )
    .get(clienteId);

  const ltvLedger = roundMoney(ledgerRow?.total || 0);
  const ltvOs = roundMoney(osAgg?.ltv_os || 0);
  const ltvReal = ltvLedger > 0 ? ltvLedger : ltvOs;
  const totalOs = Number(osAgg?.total_os || 0);
  const atrasosGaveta = Number(atrasoRow?.c || 0);
  const inadimplencias = Number(inadimplenciaRow?.c || 0);

  return {
    ltvLedger,
    ltvOs,
    ltvReal,
    totalOs,
    atrasosGaveta,
    inadimplencias,
    ultimaVisita: osAgg?.ultima_visita || null
  };
}

function isTop20PercentLtv(db, clienteId, ltvReal) {
  if (ltvReal <= 0) return false;
  const rows = db
    .prepare('SELECT id, ltv_acumulado FROM clientes WHERE ativo = 1 AND (ltv_acumulado > 0 OR id = ?)')
    .all(clienteId)
    .map((r) => ({
      id: r.id,
      ltv: r.id === clienteId ? ltvReal : roundMoney(r.ltv_acumulado)
    }))
    .filter((r) => r.ltv > 0)
    .sort((a, b) => b.ltv - a.ltv);

  if (rows.length < 5) return false;
  const topCutoff = Math.max(1, Math.ceil(rows.length * 0.2));
  const idx = rows.findIndex((r) => r.id === clienteId);
  return idx >= 0 && idx < topCutoff;
}

function recalculateClientScore(db, clienteId, rulesOverride = null) {
  const client = db.prepare('SELECT id FROM clientes WHERE id = ? AND ativo = 1').get(Number(clienteId));
  if (!client) return null;

  const rules = rulesOverride || getAllSettings(db).scoring_rules;
  const metrics = computeClientMetrics(db, client.id, rules);
  const inTop20 = isTop20PercentLtv(db, client.id, metrics.ltvReal);

  let score = 3;
  const hasVipMetric =
    metrics.ltvReal >= Number(rules.ltv_vip_min || 350) ||
    metrics.totalOs >= Number(rules.frequencia_vip_os || 4) ||
    inTop20;

  if (hasVipMetric) score += 1;

  const isElite =
    metrics.ltvReal >= roundMoney(Number(rules.ltv_vip_min || 350) * 1.8) ||
    (metrics.ltvReal >= Number(rules.ltv_vip_min || 350) &&
      metrics.totalOs >= Number(rules.frequencia_vip_os || 4));

  if (isElite && metrics.atrasosGaveta === 0 && metrics.inadimplencias === 0) {
    score += 1;
  }

  const penAtraso = Number(rules.penalidade_atraso_pontos ?? 1);
  if (metrics.atrasosGaveta === 1) score -= penAtraso;
  else if (metrics.atrasosGaveta >= 2) score -= (penAtraso + 1);

  if (metrics.inadimplencias > 0) {
    score -= Number(rules.penalidade_inadimplencia_pontos ?? 2);
  }

  const scoreAuto = Math.max(1, Math.min(5, Math.round(score)));

  db.prepare(
    `UPDATE clientes
     SET score_automatico = ?,
         ltv_acumulado = ROUND(?, 2),
         total_os = ?,
         ultima_visita_em = ?
     WHERE id = ?`
  ).run(scoreAuto, metrics.ltvReal, metrics.totalOs, metrics.ultimaVisita, client.id);

  return {
    score_automatico: scoreAuto,
    inTop20,
    ...metrics
  };
}

function recalculateAllClientScores(db) {
  const rules = getAllSettings(db).scoring_rules;
  const ids = db.prepare('SELECT id FROM clientes WHERE ativo = 1').all().map((r) => r.id);
  db.transaction(() => {
    for (const id of ids) {
      recalculateClientScore(db, id, rules);
    }
  })();
  return { recalculated: ids.length };
}

module.exports = {
  computeClientMetrics,
  isTop20PercentLtv,
  recalculateClientScore,
  recalculateAllClientScores
};
