'use strict';

const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { initDatabase } = require('./src/db/database');
const { createSyncHub } = require('./src/ws/sync-hub');
const { createSystemRouter } = require('./src/routes/system-routes');
const { createCatalogRouter } = require('./src/routes/catalog-routes');
const { createClientsRouter } = require('./src/routes/clients-routes');
const { detectLanInterfaces } = require('./src/services/lan-service');

function createAppServer(options = {}) {
  const { db, dbPath, dataDir, driverName } = initDatabase({
    dataDir: options.dataDir,
    dbPath: options.dbPath
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  const httpServer = http.createServer(app);
  const syncHub = createSyncHub(httpServer);
  const startedAt = new Date().toISOString();

  const getPort = () => {
    const addr = httpServer.address();
    return addr && typeof addr === 'object' ? addr.port : Number(options.port || process.env.PORT || 3000);
  };

  app.use('/api', createSystemRouter({
    db,
    dbPath,
    driverName,
    syncHub,
    getPort,
    startedAt
  }));
  app.use('/api', createCatalogRouter({ db, syncHub }));
  app.use('/api', createClientsRouter({ db, syncHub }));

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Rota da API nao encontrada.' });
  });

  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir, {
    extensions: ['html'],
    etag: true,
    lastModified: true
  }));

  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use((err, _req, res, _next) => {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: err.message || 'Erro interno no servidor local.'
    });
  });

  async function start(port = Number(options.port || process.env.PORT || 3000), host = '0.0.0.0') {
    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, host, () => {
        httpServer.removeListener('error', reject);
        resolve();
      });
    });
    return getPort();
  }

  async function stop() {
    await syncHub.close();
    await new Promise((resolve) => httpServer.close(() => resolve()));
    try {
      db.close();
    } catch (_err) {
      // Ignora erro se banco ja fechado
    }
  }

  return {
    app,
    httpServer,
    db,
    dbPath,
    dataDir,
    driverName,
    syncHub,
    start,
    stop
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const server = createAppServer({ port });

  server
    .start(port, '0.0.0.0')
    .then((boundPort) => {
      const lan = detectLanInterfaces();
      console.log('====================================================================');
      console.log('  CTI PRO CRM - SERVIDOR LOCAL-FIRST ATIVO');
      console.log(`  Driver SQLite : ${server.driverName}`);
      console.log(`  Banco Central : ${server.dbPath}`);
      console.log(`  Acesso Local  : http://localhost:${boundPort}`);
      console.log(`  Acesso LAN    : http://${lan.primaryIp}:${boundPort} (${lan.primaryInterface})`);
      console.log('====================================================================');
    })
    .catch((err) => {
      console.error('[FATAL] Nao foi possivel iniciar o servidor:', err.message);
      process.exit(1);
    });

  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  createAppServer
};
