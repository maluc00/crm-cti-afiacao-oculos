'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocket } = require('ws');
const { createAppServer } = require('../server');
const { listUserTables, listTriggers } = require('../src/db/database');
const { computeLuminance, formatBrl, roundMoney } = require('../src/utils/money');

const ROOT_DIR = path.resolve(__dirname, '..');

async function createIsolatedServer(t) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cti-pro-phase1-'));
  const srv = createAppServer({
    dataDir: tempDir,
    dbPath: path.join(tempDir, 'cti_oficina.db')
  });
  const port = await srv.start(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await srv.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  return { srv, port, baseUrl };
}

test('1. Integridade das tabelas do schema.sql e catalogo real do seed.sql', async (t) => {
  const { srv } = await createIsolatedServer(t);
  const tables = listUserTables(srv.db);
  const expectedTables = [
    'caixa_ledger',
    'caixa_sessoes',
    'catalogo_itens',
    'clientes',
    'combos',
    'combos_itens',
    'configuracoes',
    'estoque_movimentacoes',
    'ficha_tecnica_bom',
    'historico_consolidado_legado',
    'memoria_atributos',
    'ordens_servico',
    'os_fotos',
    'os_itens',
    'parceiros_tecnicos',
    'whatsapp_fila_logs',
    'whatsapp_templates'
  ];

  for (const tableName of expectedTables) {
    assert.ok(tables.includes(tableName), `Tabela obrigatoria ausente: ${tableName}`);
  }
  assert.equal(tables.length, expectedTables.length);

  const opticalServices = srv.db
    .prepare("SELECT abreviacao_balcao FROM catalogo_itens WHERE tipo = 'SERVICO' AND dominio = 'OPTICA'")
    .all()
    .map((r) => r.abreviacao_balcao);

  const requiredOptical = [
    'Mola', 'Hastes', 'Solda', 'Charneira', 'Ajuste',
    'Parafuso', 'Adaptacao', 'Ponteiras', 'Plaquetas', 'Banho de Ouro'
  ];
  for (const label of requiredOptical) {
    assert.ok(opticalServices.includes(label), `Servico optico ausente no seed: ${label}`);
  }

  const cutleryCount = srv.db
    .prepare("SELECT COUNT(*) AS c FROM catalogo_itens WHERE tipo = 'SERVICO' AND dominio = 'CUTELARIA'")
    .get().c;
  assert.ok(cutleryCount >= 5, 'Catalogo inicial de Cutelaria deve possuir ao menos 5 servicos');
});

test('2. Triggers de imutabilidade em caixa_ledger e bloqueio de DELETE fisico', async (t) => {
  const { srv } = await createIsolatedServer(t);
  const triggers = listTriggers(srv.db).map((r) => r.name);
  assert.ok(triggers.includes('trg_ledger_block_update'));
  assert.ok(triggers.includes('trg_ledger_block_delete'));
  assert.ok(triggers.includes('trg_ledger_estorno_check'));

  const sessao = srv.db
    .prepare("INSERT INTO caixa_sessoes (status, saldo_inicial_especie) VALUES ('ABERTO', ROUND(100.00, 2))")
    .run();

  const lancamento = srv.db
    .prepare(
      `INSERT INTO caixa_ledger (
        caixa_sessao_id, tipo_movimento, categoria_dre, dominio,
        meio_pagamento, valor_bruto, taxa_aplicada, valor_liquido, descricao
      ) VALUES (?, 'ENTRADA_OS', 'RECEITA_SERVICO', 'OPTICA', 'PIX', ROUND(85.556, 2), 0.00, ROUND(85.556, 2), 'Solda de armacao')`
    )
    .run(Number(sessao.lastInsertRowid));

  const insertedRow = srv.db
    .prepare('SELECT valor_bruto, valor_liquido FROM caixa_ledger WHERE id = ?')
    .get(Number(lancamento.lastInsertRowid));
  assert.equal(insertedRow.valor_bruto, 85.56);
  assert.equal(insertedRow.valor_liquido, 85.56);

  assert.throws(
    () => srv.db.prepare("UPDATE caixa_ledger SET valor_liquido = 1.00 WHERE id = ?").run(Number(lancamento.lastInsertRowid)),
    /VIOLACAO_LEDGER_IMUTAVEL/
  );

  assert.throws(
    () => srv.db.prepare('DELETE FROM caixa_ledger WHERE id = ?').run(Number(lancamento.lastInsertRowid)),
    /VIOLACAO_LEDGER_IMUTAVEL/
  );

  assert.throws(
    () => srv.db
      .prepare(
        `INSERT INTO caixa_ledger (
          caixa_sessao_id, ledger_origem_estorno_id, tipo_movimento, categoria_dre,
          dominio, meio_pagamento, valor_bruto, taxa_aplicada, valor_liquido, descricao, justificativa_estorno
        ) VALUES (?, ?, 'ESTORNO', 'ESTORNO_OS', 'OPTICA', 'PIX', -85.56, 0, -85.56, 'Estorno teste', '')`
      )
      .run(Number(sessao.lastInsertRowid), Number(lancamento.lastInsertRowid)),
    /ESTORNO_SEM_JUSTIFICATIVA/
  );

  const estornoOk = srv.db
    .prepare(
      `INSERT INTO caixa_ledger (
        caixa_sessao_id, ledger_origem_estorno_id, tipo_movimento, categoria_dre,
        dominio, meio_pagamento, valor_bruto, taxa_aplicada, valor_liquido, descricao, justificativa_estorno
      ) VALUES (?, ?, 'ESTORNO', 'ESTORNO_OS', 'OPTICA', 'PIX', -85.56, 0, -85.56, 'Estorno teste', 'Cliente cancelou antes da bancada')`
    )
    .run(Number(sessao.lastInsertRowid), Number(lancamento.lastInsertRowid));
  assert.ok(Number(estornoOk.lastInsertRowid) > 0);

  // Soft delete Poka-Yoke em clientes e OS
  const cli = srv.db
    .prepare("INSERT INTO clientes (nome, telefone_e164) VALUES ('Cliente Teste', '+5511999990001')")
    .run();
  const osRes = srv.db
    .prepare("INSERT INTO ordens_servico (codigo_os, cliente_id, dominio) VALUES ('OS-2026-0001', ?, 'OPTICA')")
    .run(Number(cli.lastInsertRowid));

  assert.throws(
    () => srv.db.prepare('DELETE FROM clientes WHERE id = ?').run(Number(cli.lastInsertRowid)),
    /SOFT_DELETE_OBRIGATORIO/
  );
  assert.throws(
    () => srv.db.prepare('DELETE FROM ordens_servico WHERE id = ?').run(Number(osRes.lastInsertRowid)),
    /SOFT_DELETE_OBRIGATORIO/
  );
});

test('3. Camaleao de Dominio (OPTICAL_ONLY / CUTLERY_ONLY / HYBRID) e Modo Parceiros', async (t) => {
  const { baseUrl } = await createIsolatedServer(t);

  // OPTICAL_ONLY deve ocultar 100% de cutelaria mesmo se query pedir CUTELARIA
  let res = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation_mode: 'OPTICAL_ONLY', partners_mode_enabled: '0' })
  });
  assert.equal(res.status, 200);

  res = await fetch(`${baseUrl}/api/system/overview?domain=CUTELARIA`);
  let overview = await res.json();
  assert.equal(overview.scope.hideCutlery, true);
  assert.equal(overview.catalogItems.filter((i) => i.dominio === 'CUTELARIA').length, 0);
  assert.equal(overview.combos.filter((c) => c.dominio === 'CUTELARIA').length, 0);
  assert.equal(overview.attributes.filter((a) => a.dominio === 'CUTELARIA').length, 0);
  assert.equal(overview.partnersEnabled, false);
  assert.equal(overview.partners.length, 0);

  // CUTLERY_ONLY deve ocultar 100% de optica
  res = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation_mode: 'CUTLERY_ONLY', partners_mode_enabled: '1' })
  });
  assert.equal(res.status, 200);

  res = await fetch(`${baseUrl}/api/system/overview?domain=OPTICA`);
  overview = await res.json();
  assert.equal(overview.scope.hideOptical, true);
  assert.equal(overview.catalogItems.filter((i) => i.dominio === 'OPTICA').length, 0);
  assert.equal(overview.combos.filter((c) => c.dominio === 'OPTICA').length, 0);
  assert.equal(overview.attributes.filter((a) => a.dominio === 'OPTICA').length, 0);
  assert.equal(overview.partnersEnabled, true);
  assert.ok(overview.partners.length >= 1);

  // HYBRID deve exibir ambos e permitir filtro
  res = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation_mode: 'HYBRID' })
  });
  assert.equal(res.status, 200);

  overview = await (await fetch(`${baseUrl}/api/system/overview`)).json();
  assert.ok(overview.catalogItems.some((i) => i.dominio === 'OPTICA'));
  assert.ok(overview.catalogItems.some((i) => i.dominio === 'CUTELARIA'));

  // Valor invalido deve ser barrado com HTTP 400
  res = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation_mode: 'MODO_INVALIDO' })
  });
  assert.equal(res.status, 400);
});

test('4. Rotas de sistema, QR Code LAN, PIN, Caixa Rapido, WebSocket e Motor de Luminancia', async (t) => {
  const { port, baseUrl } = await createIsolatedServer(t);

  const health = await (await fetch(`${baseUrl}/api/system/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.tablesCount, 17);

  const status = await (await fetch(`${baseUrl}/api/system/status`)).json();
  assert.equal(status.ok, true);
  assert.ok(status.triggersCount >= 10);

  const lanInfo = await (await fetch(`${baseUrl}/api/system/lan-info`)).json();
  assert.ok(lanInfo.qrSvg.includes('<svg'));
  assert.ok(lanInfo.lanUrl.startsWith(`http://${lanInfo.primaryIp}:${port}`));

  // PIN opcional LAN
  const pinRes = await (await fetch(`${baseUrl}/api/system/lan-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, customPin: '9876' })
  })).json();
  assert.equal(pinRes.pinEnabled, true);
  assert.equal(pinRes.pinCode, '9876');

  const badPin = await fetch(`${baseUrl}/api/system/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '0000' })
  });
  assert.equal(badPin.status, 401);

  const goodPin = await fetch(`${baseUrl}/api/system/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '9876' })
  });
  assert.equal(goodPin.status, 200);

  // Abertura rapida de caixa e arredondamento deterministico
  const openCashRes = await fetch(`${baseUrl}/api/caixa/sessao-rapida`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saldo_inicial_especie: 150.005, observacoes: 'Teste Fase 1' })
  });
  assert.equal(openCashRes.status, 201);
  const cashJson = await openCashRes.json();
  assert.equal(cashJson.saldo_inicial_especie, 150.01);

  // WebSocket LAN sync broadcast
  const wsEvents = [];
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const timer = setTimeout(() => reject(new Error('Timeout aguardando broadcast WebSocket')), 4000);

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString('utf8'));
      wsEvents.push(msg);
      if (msg.type === 'sync:hello') {
        fetch(`${baseUrl}/api/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-client-id': 'test-pc' },
          body: JSON.stringify({ brand_name: 'Oficina Teste LAN', accent_color: '#EAB308' })
        }).catch(reject);
      } else if (msg.type === 'settings:updated') {
        clearTimeout(timer);
        ws.close();
        resolve();
      }
    });
    ws.on('error', reject);
  });

  const updatedEvt = wsEvents.find((e) => e.type === 'settings:updated');
  assert.equal(updatedEvt.payload.brand_name, 'Oficina Teste LAN');
  assert.equal(updatedEvt.payload.accent_meta.contrastText, '#121316');

  // Motor de luminancia WCAG AAA e formatBrl
  assert.equal(computeLuminance('#FFFFFF').contrastText, '#121316');
  assert.equal(computeLuminance('#EAB308').contrastText, '#121316');
  assert.equal(computeLuminance('#000000').contrastText, '#FFFFFF');
  assert.equal(computeLuminance('#1D4ED8').contrastText, '#FFFFFF');
  assert.equal(computeLuminance('#1D4ED8').focusRing, 'rgba(29, 78, 216, 0.16)');
  assert.equal(roundMoney(19.995), 20);
  assert.equal(formatBrl(1234.567), 'R$ 1.234,57');
});

test('5. Governanca arquitetural: limite <= 600 linhas e zero emojis', () => {
  const EMOJI_RE = /\p{Extended_Pictographic}|[\u2600-\u27BF\u00A9\u00AE\u2122]/u;
  const LINE_CHECK_EXT = new Set(['.js', '.ts', '.css', '.sql', '.html']);
  const EMOJI_CHECK_EXT = new Set(['.js', '.ts', '.css', '.sql', '.html', '.md', '.bat', '.json']);
  const SKIP_DIRS = new Set(['node_modules', '.git']);

  const discovered = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!EMOJI_CHECK_EXT.has(ext)) continue;
      if (entry.name === 'package-lock.json') continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split(/\r?\n/).length;
      discovered.push({ rel: path.relative(ROOT_DIR, fullPath), ext, lines, content });
    }
  }

  walk(ROOT_DIR);
  assert.ok(discovered.length >= 20);

  for (const file of discovered) {
    if (LINE_CHECK_EXT.has(file.ext)) {
      assert.ok(
        file.lines <= 600,
        `Arquivo ${file.rel} excedeu o teto de 600 linhas (${file.lines} linhas)`
      );
    }
    assert.equal(
      EMOJI_RE.test(file.content),
      false,
      `Caractere pictografico/emoji proibido detectado em ${file.rel}`
    );
  }
});
