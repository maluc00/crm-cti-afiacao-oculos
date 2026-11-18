'use strict';

const { roundMoney } = require('../utils/money');
const { formatPhoneBr } = require('../utils/phone');
const { getAllSettings, resolveDomainScope } = require('./settings-service');

function parseJsonArr(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function previewNextOsCode(db) {
  const year = new Date().getFullYear();
  const prefix = `OS-${year}-`;
  const row = db
    .prepare(
      `SELECT codigo_os FROM ordens_servico
       WHERE codigo_os LIKE ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(`${prefix}%`);

  let nextNum = 1;
  if (row && row.codigo_os) {
    const tail = Number(String(row.codigo_os).split('-').pop());
    if (Number.isFinite(tail) && tail >= 1) nextNum = tail + 1;
  }

  let candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  while (db.prepare('SELECT id FROM ordens_servico WHERE codigo_os = ?').get(candidate)) {
    nextNum += 1;
    candidate = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
  return candidate;
}

function ensureWalkInClient(db) {
  const existing = db.prepare("SELECT id, ativo FROM clientes WHERE telefone_e164 = '+5500000000000'").get();
  if (existing) {
    if (existing.ativo === 0) {
      db.prepare('UPDATE clientes SET ativo = 1 WHERE id = ?').run(existing.id);
    }
    return existing.id;
  }
  const res = db
    .prepare(
      `INSERT INTO clientes (nome, telefone_e164, apelido_referencia, observacoes_tecnicas)
       VALUES ('Consumidor Balcão', '+5500000000000', 'Balcão Avulso', 'Cliente avulso de atendimento expresso')`
    )
    .run();
  return Number(res.lastInsertRowid);
}

function checkClientWarrantyAlert(db, clienteId) {
  const id = Number(clienteId);
  if (!id) return { hasWarranty: false, count: 0, items: [] };

  const itemRows = db
    .prepare(
      `SELECT o.id AS os_id, o.codigo_os, o.dominio, oi.descricao,
              COALESCE(ci.garantia_dias, 90) AS garantia_dias,
              date(COALESCE(o.entregue_em, o.pronto_em, o.criado_em), '+' || COALESCE(ci.garantia_dias, 90) || ' days') AS expira_em,
              CAST(ROUND(julianday(date(COALESCE(o.entregue_em, o.pronto_em, o.criado_em), '+' || COALESCE(ci.garantia_dias, 90) || ' days')) - julianday(date('now', 'localtime'))) AS INTEGER) AS dias_restantes
       FROM os_itens oi
       JOIN ordens_servico o ON o.id = oi.os_id
       LEFT JOIN catalogo_itens ci ON ci.id = oi.item_id
       WHERE o.cliente_id = ? AND o.ativo = 1 AND o.status IN ('PRONTO', 'ENTREGUE')
         AND o.eh_garantia = 0 AND oi.ativo = 1 AND COALESCE(ci.garantia_dias, 90) > 0
       ORDER BY o.id DESC`
    )
    .all(id)
    .filter((r) => Number(r.dias_restantes) >= 0);

  return {
    hasWarranty: itemRows.length > 0,
    count: itemRows.length,
    items: itemRows.slice(0, 5)
  };
}

function formatOrderRecord(row, items, photos) {
  const loteTotal = items.filter((i) => i.tipo === 'LOTE').length;
  const loteDone = items.filter((i) => i.tipo === 'LOTE' && i.concluido_lote === 1).length;
  return {
    ...row,
    telefone_formatado: formatPhoneBr(row.telefone_e164),
    locais_avaria: parseJsonArr(row.locais_avaria_json),
    estado_lentes: parseJsonArr(row.estado_lentes_json),
    subtotal: roundMoney(row.subtotal),
    desconto_valor: roundMoney(row.desconto_valor),
    valor_total: roundMoney(row.valor_total),
    valor_pago: roundMoney(row.valor_pago),
    saldo_devedor: roundMoney(row.saldo_devedor),
    lote_progress: { total: loteTotal, concluidos: loteDone },
    itens: items,
    fotos: photos.map((f) => ({ ...f, url: `/media/${f.caminho_arquivo}` }))
  };
}

function getOrderById(db, osId) {
  const row = db
    .prepare(
      `SELECT o.*, c.nome AS cliente_nome, c.telefone_e164, c.apelido_referencia,
              p.nome AS parceiro_nome
       FROM ordens_servico o
       JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN parceiros_tecnicos p ON p.id = o.parceiro_id
       WHERE o.id = ? AND o.ativo = 1`
    )
    .get(Number(osId));
  if (!row) {
    const err = new Error('Ordem de serviço não encontrada.');
    err.statusCode = 404;
    throw err;
  }
  const items = db
    .prepare('SELECT * FROM os_itens WHERE os_id = ? AND ativo = 1 ORDER BY id ASC')
    .all(row.id);
  const photos = db
    .prepare('SELECT id, os_id, momento, caminho_arquivo, tamanho_bytes, criado_em FROM os_fotos WHERE os_id = ? AND ativo = 1 ORDER BY id ASC')
    .all(row.id);
  return formatOrderRecord(row, items, photos);
}

function listOrders(db, filters = {}) {
  const settings = getAllSettings(db);
  const domFilter = filters.domain ? String(filters.domain).toUpperCase() : 'ALL';
  const scope = resolveDomainScope(settings.operation_mode, domFilter);
  const osPh = scope.osDomains.map(() => '?').join(', ');

  const statusFilter = filters.status ? String(filters.status).toUpperCase() : 'ALL';
  const search = String(filters.q || '').trim().toLowerCase();

  const rows = db
    .prepare(
      `SELECT o.*, c.nome AS cliente_nome, c.telefone_e164, c.apelido_referencia,
              p.nome AS parceiro_nome
       FROM ordens_servico o
       JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN parceiros_tecnicos p ON p.id = o.parceiro_id
       WHERE o.ativo = 1 AND o.dominio IN (${osPh})
       ORDER BY CASE WHEN o.prioridade_sla = 'URGENTE' THEN 0 ELSE 1 END ASC, o.id DESC
       LIMIT 200`
    )
    .all(...scope.osDomains);

  const ids = rows.map((r) => r.id);
  const itemsMap = new Map();
  const photosMap = new Map();
  if (ids.length > 0) {
    const idPh = ids.map(() => '?').join(', ');
    for (const it of db.prepare(`SELECT * FROM os_itens WHERE os_id IN (${idPh}) AND ativo = 1 ORDER BY id ASC`).all(...ids)) {
      if (!itemsMap.has(it.os_id)) itemsMap.set(it.os_id, []);
      itemsMap.get(it.os_id).push(it);
    }
    for (const ph of db.prepare(`SELECT id, os_id, momento, caminho_arquivo, tamanho_bytes, criado_em FROM os_fotos WHERE os_id IN (${idPh}) AND ativo = 1 ORDER BY id ASC`).all(...ids)) {
      if (!photosMap.has(ph.os_id)) photosMap.set(ph.os_id, []);
      photosMap.get(ph.os_id).push(ph);
    }
  }

  const all = rows.map((r) => formatOrderRecord(r, itemsMap.get(r.id) || [], photosMap.get(r.id) || []));
  const filtered = all.filter((o) => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    if (search) {
      const hay = `${o.codigo_os} ${o.cliente_nome} ${o.telefone_e164} ${o.marca_modelo || ''} ${o.itens.map((i) => i.descricao).join(' ')}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const counts = { FILA: 0, BANCADA: 0, AGUARDANDO_PECA: 0, PRONTO: 0, ENTREGUE: 0, CANCELADA: 0 };
  for (const o of all) counts[o.status] = (counts[o.status] || 0) + 1;

  return { scope, counts, orders: filtered };
}

function getOsBootstrap(db) {
  const settings = getAllSettings(db);
  const scope = resolveDomainScope(settings.operation_mode, 'ALL');
  const itemPh = scope.itemDomains.map(() => '?').join(', ');

  const servicesAndProducts = db
    .prepare(
      `SELECT id, codigo_sku, tipo, dominio, nome_tecnico, abreviacao_balcao,
              ROUND(preco_venda, 2) AS preco_venda, frequencia_uso
       FROM catalogo_itens
       WHERE ativo = 1 AND tipo IN ('SERVICO', 'PRODUTO') AND dominio IN (${itemPh})
       ORDER BY frequencia_uso DESC, nome_tecnico ASC`
    )
    .all(...scope.itemDomains);

  const combos = db
    .prepare(
      `SELECT id, codigo_combo, nome, abreviacao, dominio, ROUND(preco_combo, 2) AS preco_combo
       FROM combos
       WHERE ativo = 1 AND dominio IN (${itemPh})
       ORDER BY nome ASC`
    )
    .all(...scope.itemDomains);

  const attributes = db
    .prepare(
      `SELECT categoria, dominio, valor, frequencia_uso
       FROM memoria_atributos
       WHERE ativo = 1 AND dominio IN (${itemPh})
       ORDER BY frequencia_uso DESC, valor ASC`
    )
    .all(...scope.itemDomains);

  const clients = db
    .prepare(
      `SELECT id, nome, telefone_e164, apelido_referencia, score_automatico, score_manual
       FROM clientes
       WHERE ativo = 1 AND telefone_e164 != '+5500000000000'
       ORDER BY total_os DESC, nome ASC LIMIT 120`
    )
    .all()
    .map((c) => ({ ...c, telefone_formatado: formatPhoneBr(c.telefone_e164) }));

  const partners = settings.partners_mode_enabled === '1'
    ? db.prepare('SELECT id, nome, eh_operador_padrao FROM parceiros_tecnicos WHERE ativo = 1 ORDER BY eh_operador_padrao DESC, nome ASC').all()
    : [];

  return {
    nextCodigoOs: previewNextOsCode(db),
    operation_mode: settings.operation_mode,
    partners_mode_enabled: settings.partners_mode_enabled,
    catalog: servicesAndProducts,
    combos,
    attributes,
    clients,
    partners
  };
}

module.exports = {
  previewNextOsCode,
  ensureWalkInClient,
  checkClientWarrantyAlert,
  formatOrderRecord,
  getOrderById,
  listOrders,
  getOsBootstrap
};
