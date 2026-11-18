'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { openDatabase } = require('./driver');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_DATA_DIR = path.join(ROOT_DIR, 'data');
const SCHEMA_FILE = path.join(DEFAULT_DATA_DIR, 'schema.sql');
const SEED_FILE = path.join(DEFAULT_DATA_DIR, 'seed.sql');

function ensureDirectoryTree(dataDir) {
  const dirs = [
    dataDir,
    path.join(dataDir, 'media'),
    path.join(dataDir, 'backups')
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function initDatabase(options = {}) {
  const dataDir = options.dataDir || DEFAULT_DATA_DIR;
  const dbPath = options.dbPath || path.join(dataDir, 'cti_oficina.db');
  const schemaPath = options.schemaPath || SCHEMA_FILE;
  const seedPath = options.seedPath || SEED_FILE;

  ensureDirectoryTree(dataDir);

  const db = openDatabase(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  const seedSql = fs.readFileSync(seedPath, 'utf8');
  db.exec(seedSql);

  return {
    db,
    dbPath,
    dataDir,
    driverName: db.driverName || 'sqlite'
  };
}

function listUserTables(db) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name ASC`
    )
    .all()
    .map((row) => row.name);
}

function listTriggers(db) {
  return db
    .prepare(
      `SELECT name, tbl_name FROM sqlite_master
       WHERE type = 'trigger'
       ORDER BY name ASC`
    )
    .all();
}

module.exports = {
  ROOT_DIR,
  DEFAULT_DATA_DIR,
  initDatabase,
  listUserTables,
  listTriggers
};
