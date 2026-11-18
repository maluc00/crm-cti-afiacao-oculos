'use strict';

const express = require('express');
const { roundMoney } = require('../utils/money');
const { listUserTables, listTriggers } = require('../db/database');
const {
  ValidationError,
  getAllSettings,
  updateSettings,
  getSystemOverview
} = require('../services/settings-service');
const {
  buildLanInfo,
  configureLanPin,
  verifyLanPin,
  getLanPinConfig
} = require('../services/lan-service');

function isLoopbackRequest(req) {
  const addr = String(req.socket?.remoteAddress || req.ip || '');
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function createSystemRouter({ db, dbPath, driverName, syncHub, getPort, startedAt }) {
  const router = express.Router();

  router.get('/system/health', (_req, res) => {
    const tables = listUserTables(db);
    res.json({
      ok: true,
      service: 'CTI Pro CRM',
      phase: 1,
      driver: driverName,
      dbPath,
      tablesCount: tables.length,
      uptimeSeconds: Math.round(process.uptime()),
      startedAt
    });
  });

  router.get('/system/status', (_req, res) => {
    const tables = listUserTables(db);
    const triggers = listTriggers(db);
    const settings = getAllSettings(db);
    const pinCfg = getLanPinConfig(db);
    res.json({
      ok: true,
      phase: 1,
      driver: driverName,
      operation_mode: settings.operation_mode,
      partners_mode_enabled: settings.partners_mode_enabled,
      theme_mode: settings.theme_mode,
      focus_mode: settings.focus_mode,
      schema_version: settings.schema_version,
      tables,
      triggersCount: triggers.length,
      connectedClients: syncHub.getConnectedCount(),
      lanPinEnabled: pinCfg.enabled
    });
  });

  router.get('/system/lan-info', async (req, res, next) => {
    try {
      const port = getPort();
      const info = await buildLanInfo(db, port, syncHub.getConnectedCount(), {
        includePinSecret: isLoopbackRequest(req)
      });
      res.json(info);
    } catch (err) {
      next(err);
    }
  });

  router.post('/system/lan-pin', async (req, res, next) => {
    try {
      const updatedPin = configureLanPin(db, req.body || {});
      const info = await buildLanInfo(db, getPort(), syncHub.getConnectedCount(), {
        includePinSecret: isLoopbackRequest(req)
      });
      syncHub.broadcast('lan:pin-updated', { enabled: updatedPin.enabled }, req.headers['x-client-id'] || null);
      res.json({
        ok: true,
        pinEnabled: updatedPin.enabled,
        pinCode: isLoopbackRequest(req) ? updatedPin.pinCode : undefined,
        lanInfo: info
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/system/verify-pin', (req, res) => {
    const result = verifyLanPin(db, req.body?.pin);
    if (!result.valid) {
      return res.status(401).json({ ok: false, error: 'PIN LAN incorreto.' });
    }
    return res.json({ ok: true, required: result.required });
  });

  router.get('/system/overview', (req, res) => {
    const domainFilter = req.query.domain ? String(req.query.domain).toUpperCase() : 'ALL';
    const overview = getSystemOverview(db, domainFilter);
    res.json(overview);
  });

  router.get('/settings', (_req, res) => {
    res.json(getAllSettings(db));
  });

  router.put('/settings', (req, res, next) => {
    try {
      const updated = updateSettings(db, req.body || {});
      const originClientId = req.headers['x-client-id'] || null;
      syncHub.broadcast('settings:updated', updated, originClientId);
      res.json(updated);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      if (String(err.message || '').includes('MODO_')) {
        return res.status(400).json({ error: err.message });
      }
      return next(err);
    }
  });

  router.post('/caixa/sessao-rapida', (req, res, next) => {
    try {
      const openSession = db
        .prepare("SELECT id FROM caixa_sessoes WHERE status = 'ABERTO' ORDER BY id DESC LIMIT 1")
        .get();
      if (openSession) {
        return res.status(409).json({ error: 'Ja existe uma sessao de caixa aberta.' });
      }

      const saldoInicial = roundMoney(req.body?.saldo_inicial_especie ?? 0);
      if (saldoInicial < 0) {
        return res.status(400).json({ error: 'Saldo inicial nao pode ser negativo.' });
      }
      const observacoes = String(req.body?.observacoes || 'Abertura de turno diario').trim().slice(0, 200);

      const created = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO caixa_sessoes (status, saldo_inicial_especie, observacoes)
             VALUES ('ABERTO', ROUND(?, 2), ?)`
          )
          .run(saldoInicial, observacoes);
        const sessaoId = Number(info.lastInsertRowid);

        if (saldoInicial > 0) {
          db.prepare(
            `INSERT INTO caixa_ledger (
              caixa_sessao_id, tipo_movimento, categoria_dre, dominio,
              meio_pagamento, valor_bruto, taxa_aplicada, valor_liquido, descricao
            ) VALUES (?, 'SUPRIMENTO', 'SUPRIMENTO_CAIXA', 'GERAL', 'ESPECIE', ROUND(?, 2), 0.00, ROUND(?, 2), ?)`
          ).run(sessaoId, saldoInicial, saldoInicial, 'Fundo de troco inicial do caixa');
        }

        return db
          .prepare(
            `SELECT id, status, ROUND(saldo_inicial_especie, 2) AS saldo_inicial_especie,
                    aberto_em, observacoes
             FROM caixa_sessoes WHERE id = ?`
          )
          .get(sessaoId);
      })();

      syncHub.broadcast('caixa:updated', created, req.headers['x-client-id'] || null);
      return res.status(201).json(created);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = {
  createSystemRouter
};
