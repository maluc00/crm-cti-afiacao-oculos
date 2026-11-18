'use strict';

const { roundMoney } = require('../utils/money');
const { ValidationError } = require('./settings-service');
const { recalculateClientScore } = require('./scoring-service');
const { getOrderById } = require('./os-queries');
const {
  deductOrderBomAndProducts,
  reverseOrderBomAndProducts,
  recordOrderPayments,
  reverseOrderLedgerOnCancel
} = require('./os-bom-ledger');

const VALID_STATUSES = ['FILA', 'BANCADA', 'AGUARDANDO_PECA', 'PRONTO', 'ENTREGUE', 'CANCELADA'];

function transitionOrderStatus(db, osId, payload) {
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ? AND ativo = 1').get(Number(osId));
  if (!os) {
    const err = new Error('Ordem de serviço não encontrada.');
    err.statusCode = 404;
    throw err;
  }

  const target = String(payload.status || '').toUpperCase();
  if (!VALID_STATUSES.includes(target)) {
    throw new ValidationError(`Status inválido: ${target}`);
  }
  if (os.status === 'CANCELADA') {
    throw new ValidationError('OS cancelada não pode mudar de status.');
  }

  db.transaction(() => {
    const nowSql = db.prepare("SELECT datetime('now', 'localtime') AS ts").get().ts;

    if (target === 'CANCELADA') {
      const motivo = String(payload.motivo_cancelamento || '').trim();
      if (motivo.length < 3) {
        throw new ValidationError('Informe motivo obrigatório (mínimo 3 caracteres) para cancelar a OS.');
      }
      reverseOrderBomAndProducts(db, os.id, os.codigo_os, motivo);
      reverseOrderLedgerOnCancel(db, os.id, os.codigo_os, motivo);
      db.prepare(
        `UPDATE ordens_servico
         SET status = 'CANCELADA', motivo_cancelamento = ?, saldo_devedor = 0.00, cancelado_em = ?
         WHERE id = ?`
      ).run(motivo.slice(0, 240), nowSql, os.id);
      recalculateClientScore(db, os.cliente_id);
      return;
    }

    if (target === 'BANCADA') {
      deductOrderBomAndProducts(db, os.id);
      db.prepare(
        `UPDATE ordens_servico
         SET status = 'BANCADA',
             iniciado_bancada_em = COALESCE(iniciado_bancada_em, ?)
         WHERE id = ?`
      ).run(nowSql, os.id);
      return;
    }

    if (target === 'AGUARDANDO_PECA') {
      const note = String(payload.motivo_espera || '').trim();
      const nextObs = note
        ? [os.observacoes, `Aguardando peca: ${note}`].filter(Boolean).join(' | ').slice(0, 500)
        : os.observacoes;
      db.prepare("UPDATE ordens_servico SET status = 'AGUARDANDO_PECA', observacoes = ? WHERE id = ?")
        .run(nextObs, os.id);
      return;
    }

    if (target === 'PRONTO') {
      deductOrderBomAndProducts(db, os.id);
      db.prepare(
        `UPDATE ordens_servico
         SET status = 'PRONTO',
             iniciado_bancada_em = COALESCE(iniciado_bancada_em, ?),
             pronto_em = COALESCE(pronto_em, ?)
         WHERE id = ?`
      ).run(nowSql, nowSql, os.id);
      recalculateClientScore(db, os.cliente_id);
      return;
    }

    if (target === 'ENTREGUE') {
      let saldoAtual = roundMoney(os.saldo_devedor);
      let valorPagoNovo = roundMoney(os.valor_pago);
      const pagamentos = Array.isArray(payload.pagamentos) ? payload.pagamentos : [];

      if (saldoAtual > 0.009) {
        const pagoAgoraRaw = roundMoney(pagamentos.reduce((acc, p) => acc + roundMoney(p.valor || 0), 0));
        if (pagoAgoraRaw + 0.009 < saldoAtual) {
          const err = new Error(`Quitação obrigatória antes da entrega. Saldo pendente: R$ ${saldoAtual.toFixed(2)}`);
          err.statusCode = 409;
          err.code = 'QUITACAO_OBRIGATORIA';
          err.saldo_devedor = saldoAtual;
          throw err;
        }
        let remaining = saldoAtual;
        const appliedPayments = [];
        for (const p of pagamentos) {
          const v = roundMoney(p.valor || 0);
          if (v <= 0 || remaining <= 0) continue;
          const used = Math.min(remaining, v);
          appliedPayments.push({
            meio_pagamento: p.meio_pagamento || 'ESPECIE',
            valor: roundMoney(used),
            parcelado: Boolean(p.parcelado)
          });
          remaining = roundMoney(remaining - used);
        }
        const totalUnits = Number(
          db.prepare('SELECT COALESCE(SUM(quantidade), 0) AS q FROM os_itens WHERE os_id = ? AND ativo = 1').get(os.id).q || 0
        );
        recordOrderPayments(db, {
          osId: os.id,
          codigoOs: os.codigo_os,
          dominio: os.dominio,
          payments: appliedPayments,
          ehCortesia: 0,
          paCount: os.valor_pago === 0 ? 1 : 0,
          serviceUnitsCount: os.valor_pago === 0 ? Math.round(totalUnits) : 0
        });
        valorPagoNovo = roundMoney(os.valor_total);
        saldoAtual = 0;
      }

      deductOrderBomAndProducts(db, os.id);
      db.prepare(
        `UPDATE ordens_servico
         SET status = 'ENTREGUE',
             valor_pago = ROUND(?, 2),
             saldo_devedor = ROUND(?, 2),
             iniciado_bancada_em = COALESCE(iniciado_bancada_em, ?),
             pronto_em = COALESCE(pronto_em, ?),
             entregue_em = COALESCE(entregue_em, ?)
         WHERE id = ?`
      ).run(valorPagoNovo, saldoAtual, nowSql, nowSql, nowSql, os.id);
      recalculateClientScore(db, os.cliente_id);
    }
  })();

  return getOrderById(db, os.id);
}

function toggleOrderLoteItem(db, osId, itemRowId, concluido) {
  const row = db
    .prepare('SELECT id FROM os_itens WHERE id = ? AND os_id = ? AND ativo = 1')
    .get(Number(itemRowId), Number(osId));
  if (!row) {
    const err = new Error('Item da OS não encontrado.');
    err.statusCode = 404;
    throw err;
  }
  const flag = concluido ? 1 : 0;
  db.prepare('UPDATE os_itens SET concluido_lote = ? WHERE id = ?').run(flag, row.id);
  return getOrderById(db, osId);
}

module.exports = {
  transitionOrderStatus,
  toggleOrderLoteItem
};
