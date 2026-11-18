'use strict';

const express = require('express');
const { ValidationError } = require('../services/settings-service');
const { detectLanInterfaces } = require('../services/lan-service');
const {
  checkClientWarrantyAlert,
  createOrder,
  createQuickBatchOrders,
  transitionOrderStatus,
  toggleOrderLoteItem,
  listOrders,
  getOrderById,
  getOsBootstrap
} = require('../services/os-service');
const {
  saveOrderPhoto,
  deleteOrderPhoto,
  buildOrderPrintData,
  searchGlobalSpotlight
} = require('../services/os-media-print');

function handleOsError(err, res, next) {
  if (err instanceof ValidationError || err.name === 'ValidationError' || err.statusCode === 400) {
    return res.status(400).json({ error: err.message });
  }
  if (err.statusCode === 404) {
    return res.status(404).json({ error: err.message });
  }
  if (err.statusCode === 409) {
    return res.status(409).json({
      error: err.message,
      code: err.code || 'CONFLITO',
      saldo_devedor: err.saldo_devedor
    });
  }
  return next(err);
}

function createOsRouter({ db, dataDir, syncHub, getPort }) {
  const router = express.Router();

  const emitOsSync = (req, action, osId) => {
    syncHub.broadcast(
      'os:updated',
      { action, osId, timestamp: new Date().toISOString() },
      req.headers['x-client-id'] || null
    );
  };

  router.get('/os/bootstrap', (_req, res, next) => {
    try {
      res.json(getOsBootstrap(db));
    } catch (err) {
      handleOsError(err, res, next);
    }
  });

  router.get('/os/garantia-check/:clienteId', (req, res, next) => {
    try {
      res.json(checkClientWarrantyAlert(db, req.params.clienteId));
    } catch (err) {
      handleOsError(err, res, next);
    }
  });

  router.get('/os', (req, res, next) => {
    try {
      res.json(listOrders(db, {
        domain: req.query.domain,
        status: req.query.status,
        q: req.query.q
      }));
    } catch (err) {
      handleOsError(err, res, next);
    }
  });

  router.get('/os/:id', (req, res, next) => {
    try {
      res.json(getOrderById(db, req.params.id));
    } catch (err) {
      handleOsError(err, res, next);
    }
  });

  router.post('/os', (req, res, next) => {
    try {
      const created = createOrder(db, req.body || {});
      emitOsSync(req, 'os:created', created.id);
      res.status(201).json(created);
    } catch (err) {
      handleOsError(err, res, next);
    }
  });

  router.post('/os/lote-rapido', (req, res, next) => {
    try {
      const result = createQuickBatchOrders(db, req.body || {});
      emitOsSync(req, 'os:batch-created', null);
      res.status(201).json(result);
    } catch (err) {
      handleOsError(err, res, next);
    }
  });

  router.post('/os/:id/status', (req, res, next) => {
    try {
      const updated = transitionOrderStatus(db, req.params.id, req.body || {});
      emitOsSync(req, 'os:status-changed', updated.id);
      res.json(updated);
    } catch (err) {
      handleOsError(err, res, next);
    }
  });

  router.patch('/os/:id/itens/:itemRowId/lote', (req, res, next) => {
    try {
      const updated = toggleOrderLoteItem(
        db,
        req.params.id,
        req.params.itemRowId,
        Boolean(req.body?.concluido)
      );
      emitOsSync(req, 'os:lote-toggled', updated.id);
      res.json(updated);
    } catch (err) {
      handleOsError(err, res, next);
    }
  });

  router.post('/os/:id/fotos', (req, res, next) => {
    try {
      const photo = saveOrderPhoto(db, dataDir, {
        osId: req.params.id,
        momento: req.body?.momento,
        dataUrl: req.body?.dataUrl
      });
      emitOsSync(req, 'os:photo-added', Number(req.params.id));
      res.status(201).json(photo);
    } catch (err) {
      handleOsError(err, res, next);
    }
  });

  router.delete('/os/:id/fotos/:fotoId', (req, res, next) => {
    try {
      const result = deleteOrderPhoto(db, req.params.id, req.params.fotoId);
      emitOsSync(req, 'os:photo-deleted', Number(req.params.id));
      res.json(result);
    } catch (err) {
      handleOsError(err, res, next);
    }
  });

  router.get('/os/:id/impressao', async (req, res, next) => {
    try {
      const os = getOrderById(db, req.params.id);
      const net = detectLanInterfaces();
      const port = getPort();
      const lanBaseUrl = `http://${net.primaryIp}:${port}`;
      const printData = await buildOrderPrintData(db, os, lanBaseUrl);
      res.json(printData);
    } catch (err) {
      handleOsError(err, res, next);
    }
  });

  router.get('/spotlight', (req, res, next) => {
    try {
      res.json(searchGlobalSpotlight(db, req.query.q || ''));
    } catch (err) {
      handleOsError(err, res, next);
    }
  });

  return router;
}

module.exports = {
  createOsRouter
};
