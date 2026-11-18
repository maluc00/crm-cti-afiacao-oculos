'use strict';

const express = require('express');
const { ValidationError } = require('../services/settings-service');
const {
  listClients,
  saveClient,
  updateClientEvaluation,
  deactivateClient,
  getClientDossier,
  recalculateAllClientScores
} = require('../services/clients-service');

function handleClientError(err, res, next) {
  if (err instanceof ValidationError || err.name === 'ValidationError' || err.statusCode === 400) {
    return res.status(400).json({ error: err.message });
  }
  if (err.statusCode === 404) {
    return res.status(404).json({ error: err.message });
  }
  if (err.statusCode === 409) {
    return res.status(409).json({ error: err.message });
  }
  return next(err);
}

function createClientsRouter({ db, syncHub }) {
  const router = express.Router();

  const emitClientsSync = (req, action, clientId) => {
    syncHub.broadcast(
      'clientes:updated',
      { action, clientId, timestamp: new Date().toISOString() },
      req.headers['x-client-id'] || null
    );
  };

  router.get('/clientes', (req, res, next) => {
    try {
      res.json(listClients(db, {
        q: req.query.q,
        letter: req.query.letter,
        score: req.query.score
      }));
    } catch (err) {
      handleClientError(err, res, next);
    }
  });

  router.get('/clientes/:id/prontuario', (req, res, next) => {
    try {
      res.json(getClientDossier(db, req.params.id));
    } catch (err) {
      handleClientError(err, res, next);
    }
  });

  router.post('/clientes', (req, res, next) => {
    try {
      const client = saveClient(db, req.body || {});
      emitClientsSync(req, 'client:created', client.id);
      res.status(201).json(client);
    } catch (err) {
      handleClientError(err, res, next);
    }
  });

  router.put('/clientes/:id', (req, res, next) => {
    try {
      const client = saveClient(db, req.body || {}, req.params.id);
      emitClientsSync(req, 'client:updated', client.id);
      res.json(client);
    } catch (err) {
      handleClientError(err, res, next);
    }
  });

  router.patch('/clientes/:id/avaliacao', (req, res, next) => {
    try {
      const client = updateClientEvaluation(db, req.params.id, req.body || {});
      emitClientsSync(req, 'client:evaluated', client.id);
      res.json(client);
    } catch (err) {
      handleClientError(err, res, next);
    }
  });

  router.delete('/clientes/:id', (req, res, next) => {
    try {
      const result = deactivateClient(db, req.params.id);
      emitClientsSync(req, 'client:deleted', result.id);
      res.json(result);
    } catch (err) {
      handleClientError(err, res, next);
    }
  });

  router.post('/clientes/recalcular-scores', (req, res, next) => {
    try {
      const result = recalculateAllClientScores(db);
      emitClientsSync(req, 'clients:recalculated', null);
      res.json(result);
    } catch (err) {
      handleClientError(err, res, next);
    }
  });

  return router;
}

module.exports = {
  createClientsRouter
};
