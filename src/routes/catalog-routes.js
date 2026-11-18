'use strict';

const express = require('express');
const { ValidationError } = require('../services/settings-service');
const {
  listCatalogData,
  saveCatalogItem,
  registerPurchaseCmp,
  registerStockAdjustment,
  saveCombo,
  deactivateItem,
  deactivateCombo,
  createAttributeInline
} = require('../services/catalog-service');

function handleRouteError(err, res, next) {
  if (err instanceof ValidationError || err.name === 'ValidationError' || err.statusCode === 400) {
    return res.status(400).json({ error: err.message });
  }
  if (err.statusCode === 404) {
    return res.status(404).json({ error: err.message });
  }
  if (String(err.message || '').includes('UNIQUE constraint failed')) {
    return res.status(409).json({ error: 'Codigo SKU ou identificador ja cadastrado.' });
  }
  return next(err);
}

function createCatalogRouter({ db, syncHub }) {
  const router = express.Router();

  const emitCatalogSync = (req, action, entityId) => {
    syncHub.broadcast(
      'catalogo:updated',
      { action, entityId, timestamp: new Date().toISOString() },
      req.headers['x-client-id'] || null
    );
  };

  router.get('/catalogo', (req, res, next) => {
    try {
      const domain = req.query.domain ? String(req.query.domain).toUpperCase() : 'ALL';
      res.json(listCatalogData(db, domain));
    } catch (err) {
      handleRouteError(err, res, next);
    }
  });

  router.post('/catalogo/itens', (req, res, next) => {
    try {
      const item = saveCatalogItem(db, req.body || {});
      emitCatalogSync(req, 'item:created', item.id);
      res.status(201).json(item);
    } catch (err) {
      handleRouteError(err, res, next);
    }
  });

  router.put('/catalogo/itens/:id', (req, res, next) => {
    try {
      const item = saveCatalogItem(db, req.body || {}, req.params.id);
      emitCatalogSync(req, 'item:updated', item.id);
      res.json(item);
    } catch (err) {
      handleRouteError(err, res, next);
    }
  });

  router.delete('/catalogo/itens/:id', (req, res, next) => {
    try {
      const result = deactivateItem(db, req.params.id);
      emitCatalogSync(req, 'item:deleted', result.id);
      res.json(result);
    } catch (err) {
      handleRouteError(err, res, next);
    }
  });

  router.post('/catalogo/estoque/compra', (req, res, next) => {
    try {
      const result = registerPurchaseCmp(db, req.body || {});
      emitCatalogSync(req, 'estoque:compra', result.item.id);
      res.status(201).json(result);
    } catch (err) {
      handleRouteError(err, res, next);
    }
  });

  router.post('/catalogo/estoque/ajuste', (req, res, next) => {
    try {
      const result = registerStockAdjustment(db, req.body || {});
      emitCatalogSync(req, 'estoque:ajuste', result.item.id);
      res.status(201).json(result);
    } catch (err) {
      handleRouteError(err, res, next);
    }
  });

  router.post('/catalogo/combos', (req, res, next) => {
    try {
      const combo = saveCombo(db, req.body || {});
      emitCatalogSync(req, 'combo:created', combo.id);
      res.status(201).json(combo);
    } catch (err) {
      handleRouteError(err, res, next);
    }
  });

  router.put('/catalogo/combos/:id', (req, res, next) => {
    try {
      const combo = saveCombo(db, req.body || {}, req.params.id);
      emitCatalogSync(req, 'combo:updated', combo.id);
      res.json(combo);
    } catch (err) {
      handleRouteError(err, res, next);
    }
  });

  router.delete('/catalogo/combos/:id', (req, res, next) => {
    try {
      const result = deactivateCombo(db, req.params.id);
      emitCatalogSync(req, 'combo:deleted', result.id);
      res.json(result);
    } catch (err) {
      handleRouteError(err, res, next);
    }
  });

  router.post('/catalogo/atributos', (req, res, next) => {
    try {
      const attr = createAttributeInline(db, req.body || {});
      emitCatalogSync(req, 'atributo:created', attr.id);
      res.status(201).json(attr);
    } catch (err) {
      handleRouteError(err, res, next);
    }
  });

  return router;
}

module.exports = {
  createCatalogRouter
};
