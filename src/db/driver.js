'use strict';

/**
 * Camada adaptadora para SQLite sincrono.
 * Prioriza better-sqlite3 quando o binario nativo estiver compilado;
 * faz fallback transparente para node:sqlite (DatabaseSync nativo Node 22+/26+).
 */

class NodeSqliteStatementAdapter {
  constructor(stmt) {
    this.stmt = stmt;
  }

  run(...args) {
    return this.stmt.run(...args);
  }

  get(...args) {
    const row = this.stmt.get(...args);
    return row ? Object.assign({}, row) : undefined;
  }

  all(...args) {
    return this.stmt.all(...args).map((row) => Object.assign({}, row));
  }
}

class NodeSqliteDatabaseAdapter {
  constructor(filePath) {
    const { DatabaseSync } = require('node:sqlite');
    this.raw = new DatabaseSync(filePath);
    this._txDepth = 0;
    this.driverName = 'node:sqlite';
  }

  exec(sql) {
    return this.raw.exec(sql);
  }

  pragma(statement) {
    const clean = String(statement || '').trim();
    if (!clean) return [];
    if (clean.includes('=')) {
      this.raw.exec(`PRAGMA ${clean}`);
      return [];
    }
    return this.raw
      .prepare(`PRAGMA ${clean}`)
      .all()
      .map((row) => Object.assign({}, row));
  }

  prepare(sql) {
    return new NodeSqliteStatementAdapter(this.raw.prepare(sql));
  }

  transaction(fn) {
    const db = this;
    return function wrappedTx(...args) {
      const depth = db._txDepth;
      const savepointName = `sp_cti_${depth}`;
      if (depth === 0) {
        db.raw.exec('BEGIN IMMEDIATE');
      } else {
        db.raw.exec(`SAVEPOINT ${savepointName}`);
      }
      db._txDepth += 1;
      try {
        const result = fn(...args);
        db._txDepth -= 1;
        if (depth === 0) {
          db.raw.exec('COMMIT');
        } else {
          db.raw.exec(`RELEASE SAVEPOINT ${savepointName}`);
        }
        return result;
      } catch (err) {
        db._txDepth -= 1;
        try {
          if (depth === 0) {
            db.raw.exec('ROLLBACK');
          } else {
            db.raw.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            db.raw.exec(`RELEASE SAVEPOINT ${savepointName}`);
          }
        } catch (_rollbackErr) {
          // Ignora falha secundaria se a conexao ja abortou a transacao
        }
        throw err;
      }
    };
  }

  close() {
    return this.raw.close();
  }
}

function loadBetterSqlite3() {
  try {
    const BetterSqlite3 = require('better-sqlite3');
    // Verifica em memoria se o binario nativo realmente carrega no ABI atual
    const probe = new BetterSqlite3(':memory:');
    probe.close();
    return BetterSqlite3;
  } catch (_err) {
    return null;
  }
}

function openDatabase(filePath) {
  const BetterSqlite3 = loadBetterSqlite3();
  if (BetterSqlite3) {
    const db = new BetterSqlite3(filePath);
    db.driverName = 'better-sqlite3';
    return db;
  }
  return new NodeSqliteDatabaseAdapter(filePath);
}

module.exports = {
  openDatabase
};
