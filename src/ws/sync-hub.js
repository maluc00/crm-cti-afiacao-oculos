'use strict';

const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

function createSyncHub(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Set();

  // Evita crash nao tratado quando o httpServer falha ao escutar (ex: EADDRINUSE)
  wss.on('error', () => {});

  function sendJson(socket, data) {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(data));
    }
  }

  function broadcast(type, payload = {}, originClientId = null) {
    const envelope = {
      type,
      payload,
      originClientId,
      connectedClients: clients.size,
      timestamp: new Date().toISOString()
    };
    const serialized = JSON.stringify(envelope);
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(serialized);
      }
    }
  }

  wss.on('connection', (socket, req) => {
    const clientId = crypto.randomUUID();
    socket.clientId = clientId;
    socket.remoteIp = req.socket.remoteAddress || 'unknown';
    clients.add(socket);

    sendJson(socket, {
      type: 'sync:hello',
      clientId,
      connectedClients: clients.size,
      timestamp: new Date().toISOString()
    });

    broadcast('sync:clients', { connectedClients: clients.size }, clientId);

    socket.on('message', (rawBuffer) => {
      try {
        const msg = JSON.parse(rawBuffer.toString('utf8'));
        if (msg && msg.type === 'ping') {
          sendJson(socket, { type: 'pong', timestamp: new Date().toISOString() });
        }
      } catch (_err) {
        // Ignora frames invalidos sem derrubar o hub LAN
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      broadcast('sync:clients', { connectedClients: clients.size }, clientId);
    });
  });

  function getConnectedCount() {
    return clients.size;
  }

  function close() {
    for (const client of clients) {
      try {
        client.terminate();
      } catch (_err) {
        // Ignora erro de socket ja encerrado
      }
    }
    clients.clear();
    return new Promise((resolve) => wss.close(() => resolve()));
  }

  return {
    broadcast,
    getConnectedCount,
    close
  };
}

module.exports = {
  createSyncHub
};
