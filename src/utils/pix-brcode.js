'use strict';

const QRCode = require('qrcode');

function tlv(id, value) {
  const str = String(value ?? '');
  const len = String(str.length).padStart(2, '0');
  return `${id}${len}${str}`;
}

function cleanAscii(text, maxLen, fallback) {
  const cleaned = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .\-]/g, '')
    .trim()
    .slice(0, maxLen);
  return cleaned || fallback;
}

/**
 * Calcula CRC16-CCITT (polinomio 0x1021, valor inicial 0xFFFF) padrao Banco Central PIX.
 */
function computeCrc16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Monta string EMVCo PIX Copia-e-Cola com CRC16 valido.
 */
function buildPixPayload({
  pixKey,
  merchantName = 'CTI PRO OFICINA',
  merchantCity = 'SAO PAULO',
  amount = 0,
  txid = '***'
}) {
  const cleanKey = String(pixKey || '').trim();
  if (!cleanKey) return '';

  const gui = tlv('00', 'br.gov.bcb.pix');
  const keyField = tlv('01', cleanKey.slice(0, 77));
  const merchantAccount = tlv('26', `${gui}${keyField}`);

  const numAmount = Number(amount || 0);
  const amountField = numAmount > 0 ? tlv('54', numAmount.toFixed(2)) : '';

  const cleanTxid = String(txid || '***')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 25) || '***';

  const body =
    tlv('00', '01') +
    merchantAccount +
    tlv('52', '0000') +
    tlv('53', '986') +
    amountField +
    tlv('58', 'BR') +
    tlv('59', cleanAscii(merchantName, 25, 'CTI PRO OFICINA').toUpperCase()) +
    tlv('60', cleanAscii(merchantCity, 15, 'SAO PAULO').toUpperCase()) +
    tlv('62', tlv('05', cleanTxid)) +
    '6304';

  return body + computeCrc16(body);
}

async function generateQrSvg(text) {
  const str = String(text || '').trim();
  if (!str) return '';
  return QRCode.toString(str, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#121316', light: '#FFFFFF' }
  });
}

module.exports = {
  computeCrc16,
  buildPixPayload,
  generateQrSvg
};
