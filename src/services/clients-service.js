'use strict';

const { roundMoney } = require('../utils/money');
const {
  normalizePhoneE164,
  formatPhoneBr,
  normalizeCep,
  normalizeCpfCnpj
} = require('../utils/phone');
const { ValidationError, getAllSettings, resolveDomainScope } = require('./settings-service');
const { recalculateClientScore, recalculateAllClientScores } = require('./scoring-service');

const PROFILE_FLAGS = [
  'VIP',
  'Indicador',
  'Exigente com Alinhamento',
  'Pede Desconto',
  'Atraso Frequente'
];

function parseFlags(raw) {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((f) => String(f || '').trim()).filter(Boolean)));
  }
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.map((f) => String(f || '').trim()).filter(Boolean)))
      : [];
  } catch (_err) {
    return [];
  }
}

function buildPlaceholders(arr) {
  return arr.map(() => '?').join(', ');
}

function formatClientRow(row, rules) {
  const flags = parseFlags(row.flags_comportamento_json);
  const scoreAuto = Number(row.score_automatico || 3);
  const scoreManual = row.score_manual !== null && row.score_manual !== undefined
    ? Number(row.score_manual)
    : null;
  const scoreEfetivo = scoreManual ?? scoreAuto;
  const ltv = roundMoney(row.ltv_acumulado || 0);
  const ehVip = flags.includes('VIP') || ltv >= Number(rules.ltv_vip_min || 350) || scoreEfetivo === 5;

  return {
    id: row.id,
    nome: row.nome,
    telefone_e164: row.telefone_e164,
    telefone_formatado: formatPhoneBr(row.telefone_e164),
    apelido_referencia: row.apelido_referencia || '',
    cpf_cnpj: row.cpf_cnpj || '',
    data_nascimento: row.data_nascimento || '',
    cep: row.cep || '',
    logradouro: row.logradouro || '',
    numero: row.numero || '',
    complemento: row.complemento || '',
    bairro: row.bairro || '',
    cidade: row.cidade || '',
    uf: row.uf || '',
    observacoes_tecnicas: row.observacoes_tecnicas || '',
    score_automatico: scoreAuto,
    score_manual: scoreManual,
    score_efetivo: scoreEfetivo,
    flags,
    eh_vip: ehVip,
    ltv_acumulado: ltv,
    total_os: Number(row.total_os || 0),
    ultima_visita_em: row.ultima_visita_em || null,
    criado_em: row.criado_em
  };
}

function listClients(db, filters = {}) {
  const rules = getAllSettings(db).scoring_rules;
  const rows = db
    .prepare('SELECT * FROM clientes WHERE ativo = 1 ORDER BY nome COLLATE NOCASE ASC')
    .all();

  const allFormatted = rows.map((r) => formatClientRow(r, rules));
  const query = String(filters.q || '').trim().toLowerCase();
  const queryDigits = query.replace(/\D/g, '');
  const letter = String(filters.letter || '').trim().toUpperCase();
  const scoreFilter = String(filters.score || 'ALL').trim().toUpperCase();

  const filtered = allFormatted.filter((cli) => {
    if (query) {
      const haystack = `${cli.nome} ${cli.apelido_referencia} ${cli.cpf_cnpj} ${cli.observacoes_tecnicas}`.toLowerCase();
      const phoneDigits = cli.telefone_e164.replace(/\D/g, '');
      const matchesText = haystack.includes(query);
      const matchesPhone = queryDigits.length > 0 && phoneDigits.includes(queryDigits);
      if (!matchesText && !matchesPhone) return false;
    }

    if (letter && letter !== 'ALL') {
      const firstChar = cli.nome.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
      if (firstChar !== letter) return false;
    }

    if (scoreFilter === 'VIP' && !cli.eh_vip) return false;
    if (scoreFilter === '4PLUS' && cli.score_efetivo < 4) return false;
    if (scoreFilter === '3' && cli.score_efetivo !== 3) return false;
    if (scoreFilter === 'LOW' && cli.score_efetivo > 2) return false;

    return true;
  });

  return {
    clients: filtered,
    profileFlagsCatalog: PROFILE_FLAGS,
    kpis: {
      totalCarteira: allFormatted.length,
      totalVip: allFormatted.filter((c) => c.eh_vip).length,
      scoreMedio: allFormatted.length > 0
        ? roundMoney(allFormatted.reduce((acc, c) => acc + c.score_efetivo, 0) / allFormatted.length)
        : 0,
      ltvTotalCarteira: roundMoney(allFormatted.reduce((acc, c) => acc + c.ltv_acumulado, 0))
    }
  };
}

function saveClient(db, payload, id = null) {
  const existing = id
    ? db.prepare('SELECT * FROM clientes WHERE id = ? AND ativo = 1').get(Number(id))
    : null;
  if (id && !existing) {
    const err = new Error('Cliente nao encontrado.');
    err.statusCode = 404;
    throw err;
  }

  const nome = String(payload.nome ?? existing?.nome ?? '').trim();
  if (nome.length < 2) {
    throw new ValidationError('Nome do cliente deve ter ao menos 2 caracteres.');
  }

  const telefoneE164 = payload.telefone_e164 !== undefined || payload.telefone !== undefined
    ? normalizePhoneE164(payload.telefone_e164 ?? payload.telefone)
    : existing?.telefone_e164;
  if (!telefoneE164) {
    throw new ValidationError('Telefone/WhatsApp e obrigatorio.');
  }

  const duplicate = db
    .prepare('SELECT id, ativo FROM clientes WHERE telefone_e164 = ? AND id != ?')
    .get(telefoneE164, existing ? existing.id : -1);
  if (duplicate && duplicate.ativo === 1) {
    const err = new Error('Ja existe um cliente cadastrado com este WhatsApp/Telefone.');
    err.statusCode = 409;
    throw err;
  }

  const apelido = String(payload.apelido_referencia ?? existing?.apelido_referencia ?? '').trim().slice(0, 80);
  const cpfCnpj = payload.cpf_cnpj !== undefined ? normalizeCpfCnpj(payload.cpf_cnpj) : (existing?.cpf_cnpj || '');
  const dataNasc = String(payload.data_nascimento ?? existing?.data_nascimento ?? '').trim().slice(0, 10);
  const cep = payload.cep !== undefined ? normalizeCep(payload.cep) : (existing?.cep || '');
  const logradouro = String(payload.logradouro ?? existing?.logradouro ?? '').trim().slice(0, 140);
  const numero = String(payload.numero ?? existing?.numero ?? '').trim().slice(0, 20);
  const complemento = String(payload.complemento ?? existing?.complemento ?? '').trim().slice(0, 80);
  const bairro = String(payload.bairro ?? existing?.bairro ?? '').trim().slice(0, 80);
  const cidade = String(payload.cidade ?? existing?.cidade ?? '').trim().slice(0, 80);
  const uf = String(payload.uf ?? existing?.uf ?? '').trim().toUpperCase().slice(0, 2);
  const obs = String(payload.observacoes_tecnicas ?? existing?.observacoes_tecnicas ?? '').trim().slice(0, 400);

  let scoreManual = existing ? existing.score_manual : null;
  if (payload.score_manual !== undefined) {
    if (payload.score_manual === null || payload.score_manual === '') {
      scoreManual = null;
    } else {
      const n = Number(payload.score_manual);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        throw new ValidationError('score_manual deve ser um inteiro entre 1 e 5 ou null.');
      }
      scoreManual = n;
    }
  }

  const flags = payload.flags !== undefined
    ? parseFlags(payload.flags)
    : parseFlags(existing?.flags_comportamento_json);

  const targetId = db.transaction(() => {
    let savedId;
    if (existing || (duplicate && duplicate.ativo === 0)) {
      savedId = existing ? existing.id : duplicate.id;
      db.prepare(
        `UPDATE clientes
         SET nome = ?, telefone_e164 = ?, apelido_referencia = ?, cpf_cnpj = ?,
             data_nascimento = ?, cep = ?, logradouro = ?, numero = ?,
             complemento = ?, bairro = ?, cidade = ?, uf = ?,
             observacoes_tecnicas = ?, score_manual = ?, flags_comportamento_json = ?, ativo = 1
         WHERE id = ?`
      ).run(
        nome, telefoneE164, apelido, cpfCnpj,
        dataNasc, cep, logradouro, numero,
        complemento, bairro, cidade, uf,
        obs, scoreManual, JSON.stringify(flags), savedId
      );
    } else {
      const res = db.prepare(
        `INSERT INTO clientes (
          nome, telefone_e164, apelido_referencia, cpf_cnpj, data_nascimento,
          cep, logradouro, numero, complemento, bairro, cidade, uf,
          observacoes_tecnicas, score_manual, flags_comportamento_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        nome, telefoneE164, apelido, cpfCnpj, dataNasc,
        cep, logradouro, numero, complemento, bairro, cidade, uf,
        obs, scoreManual, JSON.stringify(flags)
      );
      savedId = Number(res.lastInsertRowid);
    }
    recalculateClientScore(db, savedId);
    return savedId;
  })();

  const rules = getAllSettings(db).scoring_rules;
  const fresh = db.prepare('SELECT * FROM clientes WHERE id = ?').get(targetId);
  return formatClientRow(fresh, rules);
}

function updateClientEvaluation(db, id, payload) {
  const existing = db.prepare('SELECT * FROM clientes WHERE id = ? AND ativo = 1').get(Number(id));
  if (!existing) {
    const err = new Error('Cliente nao encontrado.');
    err.statusCode = 404;
    throw err;
  }

  let scoreManual = existing.score_manual;
  if (payload.score_manual !== undefined) {
    if (payload.score_manual === null || payload.score_manual === '') {
      scoreManual = null;
    } else {
      const n = Number(payload.score_manual);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        throw new ValidationError('score_manual deve estar entre 1 e 5.');
      }
      scoreManual = n;
    }
  }

  const flags = payload.flags !== undefined
    ? parseFlags(payload.flags)
    : parseFlags(existing.flags_comportamento_json);

  db.prepare(
    'UPDATE clientes SET score_manual = ?, flags_comportamento_json = ? WHERE id = ?'
  ).run(scoreManual, JSON.stringify(flags), existing.id);

  recalculateClientScore(db, existing.id);
  const rules = getAllSettings(db).scoring_rules;
  return formatClientRow(db.prepare('SELECT * FROM clientes WHERE id = ?').get(existing.id), rules);
}

function deactivateClient(db, id) {
  const existing = db.prepare('SELECT id FROM clientes WHERE id = ? AND ativo = 1').get(Number(id));
  if (!existing) {
    const err = new Error('Cliente nao encontrado.');
    err.statusCode = 404;
    throw err;
  }
  db.prepare('UPDATE clientes SET ativo = 0 WHERE id = ?').run(existing.id);
  return { ok: true, id: existing.id };
}

function getClientDossier(db, id) {
  const existing = db.prepare('SELECT id FROM clientes WHERE id = ? AND ativo = 1').get(Number(id));
  if (!existing) {
    const err = new Error('Cliente nao encontrado.');
    err.statusCode = 404;
    throw err;
  }

  const settings = getAllSettings(db);
  const scoreInfo = recalculateClientScore(db, existing.id, settings.scoring_rules);
  const clientRow = db.prepare('SELECT * FROM clientes WHERE id = ?').get(existing.id);
  const cliente = formatClientRow(clientRow, settings.scoring_rules);

  const scope = resolveDomainScope(settings.operation_mode, 'ALL');
  const osPh = buildPlaceholders(scope.osDomains);

  const historicoOs = db
    .prepare(
      `SELECT id, codigo_os, dominio, modo_abertura, status, prioridade_sla,
              marca_modelo, material_peca, eh_garantia, eh_cortesia,
              ROUND(valor_total, 2) AS valor_total,
              ROUND(valor_pago, 2) AS valor_pago,
              ROUND(saldo_devedor, 2) AS saldo_devedor,
              criado_em, pronto_em, entregue_em
       FROM ordens_servico
       WHERE cliente_id = ? AND ativo = 1 AND dominio IN (${osPh})
       ORDER BY id DESC`
    )
    .all(existing.id, ...scope.osDomains);

  const topServicos = db
    .prepare(
      `SELECT oi.descricao, oi.dominio, oi.tipo,
              SUM(oi.quantidade) AS total_execucoes,
              ROUND(SUM(oi.valor_total), 2) AS total_valor
       FROM os_itens oi
       JOIN ordens_servico o ON o.id = oi.os_id
       WHERE o.cliente_id = ? AND o.ativo = 1 AND o.status != 'CANCELADA'
         AND oi.ativo = 1 AND o.dominio IN (${osPh})
       GROUP BY oi.descricao, oi.dominio, oi.tipo
       ORDER BY total_execucoes DESC, total_valor DESC
       LIMIT 3`
    )
    .all(existing.id, ...scope.osDomains);

  const warrantyRows = db
    .prepare(
      `SELECT o.id AS os_id, o.codigo_os, o.dominio, oi.descricao,
              COALESCE(ci.garantia_dias, 90) AS garantia_dias,
              COALESCE(o.entregue_em, o.pronto_em, o.criado_em) AS data_base,
              date(COALESCE(o.entregue_em, o.pronto_em, o.criado_em), '+' || COALESCE(ci.garantia_dias, 90) || ' days') AS expira_em,
              CAST(ROUND(julianday(date(COALESCE(o.entregue_em, o.pronto_em, o.criado_em), '+' || COALESCE(ci.garantia_dias, 90) || ' days')) - julianday(date('now', 'localtime'))) AS INTEGER) AS dias_restantes
       FROM os_itens oi
       JOIN ordens_servico o ON o.id = oi.os_id
       LEFT JOIN catalogo_itens ci ON ci.id = oi.item_id
       WHERE o.cliente_id = ? AND o.ativo = 1 AND o.status IN ('PRONTO', 'ENTREGUE')
         AND o.eh_garantia = 0 AND oi.ativo = 1 AND o.dominio IN (${osPh})
         AND COALESCE(ci.garantia_dias, 90) > 0
       ORDER BY expira_em DESC`
    )
    .all(existing.id, ...scope.osDomains);

  const garantiasAtivas = warrantyRows.filter((w) => Number(w.dias_restantes) >= 0);

  const totalOs = Number(scoreInfo?.totalOs || 0);
  const ticketMedio = totalOs > 0 ? roundMoney((scoreInfo?.ltvReal || 0) / totalOs) : 0;

  return {
    cliente,
    score_breakdown: {
      ltv_ledger_auditado: scoreInfo.ltvLedger,
      ltv_efetivo: scoreInfo.ltvReal,
      total_os: totalOs,
      ticket_medio: ticketMedio,
      atrasos_gaveta: scoreInfo.atrasosGaveta,
      inadimplencias: scoreInfo.inadimplencias,
      eh_top_vip: scoreInfo.inTop20 || cliente.eh_vip
    },
    top_servicos: topServicos,
    garantias_ativas: garantiasAtivas,
    historico_os: historicoOs
  };
}

module.exports = {
  PROFILE_FLAGS,
  recalculateClientScore,
  recalculateAllClientScores,
  listClients,
  saveClient,
  updateClientEvaluation,
  deactivateClient,
  getClientDossier
};
