'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ValidationError, getAllSettings, resolveDomainScope } = require('./settings-service');
const { buildPixPayload, generateQrSvg } = require('../utils/pix-brcode');

function saveOrderPhoto(db, dataDir, { osId, momento, dataUrl }) {
  const os = db.prepare('SELECT id, codigo_os FROM ordens_servico WHERE id = ? AND ativo = 1').get(Number(osId));
  if (!os) {
    const err = new Error('Ordem de serviço não encontrada.');
    err.statusCode = 404;
    throw err;
  }

  const cleanMomento = String(momento || '').toUpperCase();
  if (!['ANTES', 'DEPOIS'].includes(cleanMomento)) {
    throw new ValidationError('Momento da foto deve ser ANTES ou DEPOIS.');
  }

  const rawStr = String(dataUrl || '').trim();
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/i.exec(rawStr);
  if (!match) {
    throw new ValidationError('Formato de foto inválido. Envie imagem comprimida em WebP.');
  }

  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length < 8 || buffer.length > 900 * 1024) {
    throw new ValidationError('Tamanho de foto WebP fora dos limites permitidos.');
  }

  const now = new Date();
  const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mediaRoot = path.join(dataDir, 'media');
  const monthDir = path.join(mediaRoot, yyyyMm);
  if (!fs.existsSync(monthDir)) {
    fs.mkdirSync(monthDir, { recursive: true });
  }

  const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 12);
  const fileName = `${Date.now()}-${os.id}-${cleanMomento.toLowerCase()}-${hash}.webp`;
  const absPath = path.join(monthDir, fileName);
  const relPath = `${yyyyMm}/${fileName}`;

  fs.writeFileSync(absPath, buffer);

  const info = db
    .prepare(
      `INSERT INTO os_fotos (os_id, momento, caminho_arquivo, tamanho_bytes)
       VALUES (?, ?, ?, ?)`
    )
    .run(os.id, cleanMomento, relPath, buffer.length);

  return {
    id: Number(info.lastInsertRowid),
    os_id: os.id,
    momento: cleanMomento,
    caminho_arquivo: relPath,
    url: `/media/${relPath}`,
    tamanho_bytes: buffer.length
  };
}

function deleteOrderPhoto(db, osId, fotoId) {
  const row = db
    .prepare('SELECT id FROM os_fotos WHERE id = ? AND os_id = ? AND ativo = 1')
    .get(Number(fotoId), Number(osId));
  if (!row) {
    const err = new Error('Foto não encontrada.');
    err.statusCode = 404;
    throw err;
  }
  db.prepare('UPDATE os_fotos SET ativo = 0 WHERE id = ?').run(row.id);
  return { ok: true, id: row.id };
}

async function buildOrderPrintData(db, os, lanBaseUrl) {
  const settings = getAllSettings(db);
  const trackingUrl = `${lanBaseUrl || 'http://localhost:3000'}/#bancada?os=${encodeURIComponent(os.codigo_os)}`;
  const trackingQrSvg = await generateQrSvg(trackingUrl);

  const pixAmount = os.saldo_devedor > 0 ? os.saldo_devedor : os.valor_total;
  const pixPayload = buildPixPayload({
    pixKey: settings.pix_key,
    merchantName: settings.brand_name,
    amount: pixAmount,
    txid: os.codigo_os
  });
  const pixQrSvg = pixPayload ? await generateQrSvg(pixPayload) : '';

  return {
    os,
    brand: {
      name: settings.brand_name,
      slogan: settings.brand_slogan,
      pix_key: settings.pix_key
    },
    trackingUrl,
    trackingQrSvg,
    pixPayload,
    pixQrSvg,
    pixAmount
  };
}

function searchGlobalSpotlight(db, rawQuery) {
  const settings = getAllSettings(db);
  const scope = resolveDomainScope(settings.operation_mode, 'ALL');
  const q = String(rawQuery || '').trim();
  const like = `%${q}%`;
  const itemPh = scope.itemDomains.map(() => '?').join(', ');
  const osPh = scope.osDomains.map(() => '?').join(', ');

  const orders = db
    .prepare(
      `SELECT o.id, o.codigo_os, o.dominio, o.status, o.marca_modelo,
              ROUND(o.valor_total, 2) AS valor_total,
              ROUND(o.saldo_devedor, 2) AS saldo_devedor,
              c.nome AS cliente_nome, c.telefone_e164
       FROM ordens_servico o
       JOIN clientes c ON c.id = o.cliente_id
       WHERE o.ativo = 1 AND o.dominio IN (${osPh})
         AND (? = '' OR o.codigo_os LIKE ? OR c.nome LIKE ? OR c.telefone_e164 LIKE ? OR COALESCE(o.marca_modelo, '') LIKE ?)
       ORDER BY o.id DESC LIMIT 6`
    )
    .all(...scope.osDomains, q, like, like, like, like);

  const clients = db
    .prepare(
      `SELECT id, nome, telefone_e164, apelido_referencia, score_automatico, score_manual
       FROM clientes
       WHERE ativo = 1 AND telefone_e164 != '+5500000000000'
         AND (? = '' OR nome LIKE ? OR telefone_e164 LIKE ? OR COALESCE(apelido_referencia, '') LIKE ?)
       ORDER BY total_os DESC, nome ASC LIMIT 6`
    )
    .all(q, like, like, like);

  const catalog = db
    .prepare(
      `SELECT id, codigo_sku, tipo, dominio, nome_tecnico, abreviacao_balcao, ROUND(preco_venda, 2) AS preco_venda
       FROM catalogo_itens
       WHERE ativo = 1 AND tipo IN ('SERVICO', 'PRODUTO') AND dominio IN (${itemPh})
         AND (? = '' OR nome_tecnico LIKE ? OR abreviacao_balcao LIKE ? OR codigo_sku LIKE ?)
       ORDER BY frequencia_uso DESC LIMIT 8`
    )
    .all(...scope.itemDomains, q, like, like, like);

  const combos = db
    .prepare(
      `SELECT id, codigo_combo, nome, abreviacao, dominio, ROUND(preco_combo, 2) AS preco_combo
       FROM combos
       WHERE ativo = 1 AND dominio IN (${itemPh})
         AND (? = '' OR nome LIKE ? OR abreviacao LIKE ? OR codigo_combo LIKE ?)
       ORDER BY nome ASC LIMIT 4`
    )
    .all(...scope.itemDomains, q, like, like, like);

  return { orders, clients, catalog, combos };
}

module.exports = {
  saveOrderPhoto,
  deleteOrderPhoto,
  buildOrderPrintData,
  searchGlobalSpotlight
};
