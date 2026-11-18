'use strict';

const os = require('node:os');
const crypto = require('node:crypto');
const QRCode = require('qrcode');

const VIRTUAL_HINT = /(vethernet|virtual|vmware|vbox|hyper-v|docker|wsl|tailscale|zerotier|hamachi|loopback|npcap)/i;
const PHYSICAL_HINT = /(wi-fi|wifi|wlan|wireless|ethernet|lan|local area)/i;

function scoreInterface(name, address) {
  let score = 0;
  if (PHYSICAL_HINT.test(name)) score += 40;
  if (!VIRTUAL_HINT.test(name)) score += 30;
  if (address.startsWith('192.168.')) score += 20;
  else if (address.startsWith('10.')) score += 15;
  else if (address.startsWith('172.')) score += 10;
  if (/wi-fi|wifi|wlan/i.test(name)) score += 5;
  return score;
}

function detectLanInterfaces() {
  const raw = os.networkInterfaces();
  const candidates = [];

  for (const [ifaceName, addrs] of Object.entries(raw)) {
    if (!Array.isArray(addrs)) continue;
    for (const info of addrs) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('169.254.')) continue;
      candidates.push({
        interface: ifaceName,
        address: info.address,
        netmask: info.netmask,
        score: scoreInterface(ifaceName, info.address),
        isVirtual: VIRTUAL_HINT.test(ifaceName)
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const primary = candidates[0] || {
    interface: 'loopback',
    address: '127.0.0.1',
    netmask: '255.0.0.0',
    score: 0,
    isVirtual: false
  };

  return {
    primaryIp: primary.address,
    primaryInterface: primary.interface,
    hasLan: primary.address !== '127.0.0.1',
    interfaces: candidates
  };
}

function getLanPinConfig(db) {
  const rows = db
    .prepare("SELECT chave, valor FROM configuracoes WHERE chave IN ('lan_pin_enabled', 'lan_pin_code')")
    .all();
  const map = {};
  for (const r of rows) map[r.chave] = r.valor;
  return {
    enabled: map.lan_pin_enabled === '1',
    pinCode: map.lan_pin_code || '2486'
  };
}

function configureLanPin(db, { enabled, regenerate, customPin }) {
  const current = getLanPinConfig(db);
  const nextEnabled = enabled !== undefined ? Boolean(enabled) : current.enabled;
  let nextPin = current.pinCode;

  if (customPin !== undefined && String(customPin).trim() !== '') {
    const clean = String(customPin).trim();
    if (!/^\d{4,6}$/.test(clean)) {
      const err = new Error('O PIN LAN deve conter entre 4 e 6 digitos numericos.');
      err.statusCode = 400;
      throw err;
    }
    nextPin = clean;
  } else if (regenerate) {
    nextPin = String(crypto.randomInt(1000, 9999));
  }

  const upsert = db.prepare(`
    INSERT INTO configuracoes (chave, valor, atualizado_em)
    VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(chave) DO UPDATE SET
      valor = excluded.valor,
      atualizado_em = datetime('now', 'localtime')
  `);

  db.transaction(() => {
    upsert.run('lan_pin_enabled', nextEnabled ? '1' : '0');
    upsert.run('lan_pin_code', nextPin);
  })();

  return {
    enabled: nextEnabled,
    pinCode: nextPin
  };
}

function verifyLanPin(db, attempt) {
  const { enabled, pinCode } = getLanPinConfig(db);
  if (!enabled) {
    return { valid: true, required: false };
  }
  const cleanAttempt = String(attempt || '').trim();
  return {
    valid: cleanAttempt === pinCode,
    required: true
  };
}

async function buildLanInfo(db, port, connectedClients, options = {}) {
  const network = detectLanInterfaces();
  const pinCfg = getLanPinConfig(db);
  const baseUrl = `http://${network.primaryIp}:${port}`;
  const lanUrl = pinCfg.enabled ? `${baseUrl}/?pin=${pinCfg.pinCode}` : baseUrl;

  const qrSvg = await QRCode.toString(lanUrl, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#121316',
      light: '#FFFFFF'
    }
  });

  return {
    host: os.hostname(),
    port,
    primaryIp: network.primaryIp,
    primaryInterface: network.primaryInterface,
    hasLan: network.hasLan,
    localUrl: `http://localhost:${port}`,
    lanUrl,
    baseUrl,
    interfaces: network.interfaces,
    connectedClients: Number(connectedClients || 0),
    pinEnabled: pinCfg.enabled,
    pinCode: options.includePinSecret ? pinCfg.pinCode : undefined,
    qrSvg
  };
}

module.exports = {
  detectLanInterfaces,
  getLanPinConfig,
  configureLanPin,
  verifyLanPin,
  buildLanInfo
};
