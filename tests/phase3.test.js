'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAppServer } = require('../server');

const ROOT_DIR = path.resolve(__dirname, '..');

const TINY_WEBP_DATA_URL =
  'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

async function createIsolatedServer(t) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cti-pro-phase3-'));
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

  return { srv, tempDir, port, baseUrl };
}

async function jsonReq(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test('1. OS Modo Express, baixa BOM automatica, sinal/saldo e modo Cortesia', async (t) => {
  const { srv, baseUrl } = await createIsolatedServer(t);

  const boot = await jsonReq(`${baseUrl}/api/os/bootstrap`, 'GET');
  assert.equal(boot.status, 200);
  const plaquetas = boot.data.catalog.find((i) => i.codigo_sku === 'OPT-SRV-PLAQUETAS');
  const spray = boot.data.catalog.find((i) => i.codigo_sku === 'OPT-PRD-SPRAY');
  assert.ok(plaquetas && spray);

  const stockBefore = srv.db.prepare("SELECT estoque_atual FROM catalogo_itens WHERE codigo_sku = 'INS-OPT-PLAQUETA'").get().estoque_atual;
  const sprayBefore = srv.db.prepare("SELECT estoque_atual FROM catalogo_itens WHERE codigo_sku = 'OPT-PRD-SPRAY'").get().estoque_atual;

  // Subtotal = 20 + 22 = 42.00; desconto 10% => total 37.80; sinal 15.00 => saldo 22.80
  const osRes = await jsonReq(`${baseUrl}/api/os`, 'POST', {
    modo_abertura: 'EXPRESS',
    dominio: 'OPTICA',
    desconto_tipo: 'PERCENTUAL',
    desconto_valor: 10,
    pagamento_modo: 'SINAL',
    meio_pagamento: 'PIX',
    valor_sinal: 15.00,
    fluxo_direto_bancada: true,
    itens: [
      { item_id: plaquetas.id, quantidade: 1 },
      { item_id: spray.id, quantidade: 1 }
    ]
  });
  assert.equal(osRes.status, 201);
  assert.match(osRes.data.codigo_os, /^OS-\d{4}-0001$/);
  assert.equal(osRes.data.status, 'BANCADA');
  assert.ok(osRes.data.iniciado_bancada_em);
  assert.equal(osRes.data.bom_baixado, 1);
  assert.equal(osRes.data.valor_total, 37.80);
  assert.equal(osRes.data.valor_pago, 15.00);
  assert.equal(osRes.data.saldo_devedor, 22.80);

  const stockAfter = srv.db.prepare("SELECT estoque_atual FROM catalogo_itens WHERE codigo_sku = 'INS-OPT-PLAQUETA'").get().estoque_atual;
  const sprayAfter = srv.db.prepare("SELECT estoque_atual FROM catalogo_itens WHERE codigo_sku = 'OPT-PRD-SPRAY'").get().estoque_atual;
  assert.equal(stockAfter, stockBefore - 1);
  assert.equal(sprayAfter, sprayBefore - 1);

  // OS Cortesia zera valor mantendo baixa BOM e registro P.A
  const cortRes = await jsonReq(`${baseUrl}/api/os`, 'POST', {
    modo_abertura: 'EXPRESS',
    dominio: 'OPTICA',
    eh_cortesia: true,
    entregar_na_hora: true,
    itens: [{ item_id: plaquetas.id, quantidade: 1 }]
  });
  assert.equal(cortRes.status, 201);
  assert.equal(cortRes.data.eh_cortesia, 1);
  assert.equal(cortRes.data.valor_total, 0);
  assert.equal(cortRes.data.saldo_devedor, 0);
  assert.equal(cortRes.data.status, 'ENTREGUE');
  assert.equal(cortRes.data.bom_baixado, 1);

  const sess = srv.db.prepare('SELECT pessoas_atendidas_pa FROM caixa_sessoes ORDER BY id DESC LIMIT 1').get();
  assert.ok(sess.pessoas_atendidas_pa >= 2);
});

test('2. OS Modo Completo (Pericia + Auto-aprendizado + Garantia <90d + Lote Unitario 0/10)', async (t) => {
  const { srv, baseUrl } = await createIsolatedServer(t);

  const cli = (await jsonReq(`${baseUrl}/api/clientes`, 'POST', {
    nome: 'Fernanda Optical',
    telefone: '11977771111'
  })).data;

  const boot = (await jsonReq(`${baseUrl}/api/os/bootstrap`, 'GET')).data;
  const solda = boot.catalog.find((i) => i.codigo_sku === 'OPT-SRV-SOLDA');
  const alicate = boot.catalog.find((i) => i.codigo_sku === 'CUT-SRV-ALICATE');

  // OS Completa Optica quitada e entregue -> gera garantia de 90 dias + aprende material novo
  const osOpt = await jsonReq(`${baseUrl}/api/os`, 'POST', {
    modo_abertura: 'COMPLETO',
    dominio: 'OPTICA',
    cliente_id: cli.id,
    prioridade_sla: 'URGENTE',
    marca_modelo: 'Ray-Ban Clubmaster',
    material_peca: 'Titanio Betamax',
    locais_avaria: ['Charneira Direita', 'Ponte'],
    tipo_lente: 'MULTIFOCAL',
    estado_lentes: ['Microtrincas/Bisel', 'Ciente Desmonte'],
    pagamento_modo: 'QUITADO',
    meio_pagamento: 'PIX',
    entregar_na_hora: true,
    itens: [{ item_id: solda.id, quantidade: 1 }]
  });
  assert.equal(osOpt.status, 201);
  assert.equal(osOpt.data.tipo_lente, 'MULTIFOCAL');
  assert.deepEqual(osOpt.data.estado_lentes, ['Microtrincas/Bisel', 'Ciente Desmonte']);

  const learned = srv.db
    .prepare("SELECT valor FROM memoria_atributos WHERE categoria = 'MATERIAL' AND dominio = 'OPTICA' AND valor = 'Titanio Betamax'")
    .get();
  assert.ok(learned, 'Novo material deve ser salvo automaticamente na memoria de atributos');

  const warCheck = await jsonReq(`${baseUrl}/api/os/garantia-check/${cli.id}`, 'GET');
  assert.equal(warCheck.status, 200);
  assert.equal(warCheck.data.hasWarranty, true);
  assert.ok(warCheck.data.items[0].dias_restantes >= 80);

  // OS Cutelaria com 10 alicates desmembrados (0/10 -> 3/10 concluidos)
  const osCut = await jsonReq(`${baseUrl}/api/os`, 'POST', {
    modo_abertura: 'COMPLETO',
    dominio: 'CUTELARIA',
    cliente_id: cli.id,
    marca_modelo: 'Mundial 777',
    material_peca: 'Aco Inox',
    locais_avaria: ['Ponta Caida/Curta', 'Mola Quebrada'],
    desmembrar_lote: true,
    fluxo_direto_bancada: true,
    itens: [{ item_id: alicate.id, quantidade: 10 }]
  });
  assert.equal(osCut.status, 201);
  assert.equal(osCut.data.itens.length, 10);
  assert.equal(osCut.data.lote_progress.total, 10);
  assert.equal(osCut.data.lote_progress.concluidos, 0);

  for (let i = 0; i < 3; i += 1) {
    const tog = await jsonReq(
      `${baseUrl}/api/os/${osCut.data.id}/itens/${osCut.data.itens[i].id}/lote`,
      'PATCH',
      { concluido: true }
    );
    assert.equal(tog.status, 200);
    assert.equal(tog.data.lote_progress.concluidos, i + 1);
  }
});

test('3. Lote Rapido de Balcao (Planilha Express atomica) e Fotos WebP fora do SQLite', async (t) => {
  const { srv, tempDir, baseUrl } = await createIsolatedServer(t);
  const boot = (await jsonReq(`${baseUrl}/api/os/bootstrap`, 'GET')).data;
  const ajuste = boot.catalog.find((i) => i.codigo_sku === 'OPT-SRV-AJUSTE');
  const parafuso = boot.catalog.find((i) => i.codigo_sku === 'OPT-SRV-PARAFUSO');

  const insBefore = srv.db.prepare("SELECT estoque_atual FROM catalogo_itens WHERE codigo_sku = 'INS-OPT-PARAFUSO'").get().estoque_atual;

  const batchRes = await jsonReq(`${baseUrl}/api/os/lote-rapido`, 'POST', {
    dominio: 'OPTICA',
    data_competencia: '2026-11-17',
    linhas: [
      { item_id: ajuste.id, quantidade: 1, valor_unitario: 25.00, meio_pagamento: 'ESPECIE' },
      { item_id: parafuso.id, quantidade: 2, valor_unitario: 15.00, meio_pagamento: 'PIX' }
    ]
  });
  assert.equal(batchRes.status, 201);
  assert.equal(batchRes.data.count, 2);

  const insAfter = srv.db.prepare("SELECT estoque_atual FROM catalogo_itens WHERE codigo_sku = 'INS-OPT-PARAFUSO'").get().estoque_atual;
  assert.equal(insAfter, insBefore - 2);

  // Upload de fotos ANTES e DEPOIS em WebP gravadas no disco data/media/YYYY-MM/
  const targetOsId = batchRes.data.orders[0].id;
  const upAntes = await jsonReq(`${baseUrl}/api/os/${targetOsId}/fotos`, 'POST', {
    momento: 'ANTES',
    dataUrl: TINY_WEBP_DATA_URL
  });
  const upDepois = await jsonReq(`${baseUrl}/api/os/${targetOsId}/fotos`, 'POST', {
    momento: 'DEPOIS',
    dataUrl: TINY_WEBP_DATA_URL
  });
  assert.equal(upAntes.status, 201);
  assert.equal(upDepois.status, 201);
  assert.ok(upAntes.data.caminho_arquivo.endsWith('.webp'));

  const diskFile = path.join(tempDir, 'media', upAntes.data.caminho_arquivo);
  assert.ok(fs.existsSync(diskFile), 'Arquivo WebP deve existir em data/media/');

  const httpMedia = await fetch(`${baseUrl}${upAntes.data.url}`);
  assert.equal(httpMedia.status, 200);
  assert.ok(String(httpMedia.headers.get('content-type')).includes('webp'));

  // Confirma presenca do compressor Canvas WebP client-side
  const webpClientCode = fs.readFileSync(path.join(ROOT_DIR, 'public', 'js', 'webp-photo.js'), 'utf8');
  assert.ok(webpClientCode.includes("toDataURL('image/webp'"));
  assert.ok(webpClientCode.includes('800'));
  assert.ok(webpClientCode.includes('0.75'));
});

test('4. Bancada FSM, Bloqueio de Entrega (Split Payment), Cancelamento com Estorno, Impressao & Spotlight', async (t) => {
  const { srv, baseUrl } = await createIsolatedServer(t);

  // Configurar Chave PIX para testar geracao BRCode na impressao termica
  await jsonReq(`${baseUrl}/api/settings`, 'PUT', { pix_key: '11999998888' });

  const boot = (await jsonReq(`${baseUrl}/api/os/bootstrap`, 'GET')).data;
  const plaquetas = boot.catalog.find((i) => i.codigo_sku === 'OPT-SRV-PLAQUETAS');
  const mola = boot.catalog.find((i) => i.codigo_sku === 'OPT-SRV-MOLA');

  // OS 1: Criada na FILA com pagamento NA_RETIRADA
  const os1 = (await jsonReq(`${baseUrl}/api/os`, 'POST', {
    modo_abertura: 'EXPRESS',
    dominio: 'OPTICA',
    fluxo_direto_bancada: false,
    pagamento_modo: 'NA_RETIRADA',
    itens: [{ item_id: mola.id, quantidade: 1 }]
  })).data;
  assert.equal(os1.status, 'FILA');
  assert.equal(os1.saldo_devedor, 45.00);

  // Estacionamento Tecnico -> Retorno -> Pronto
  const parked = await jsonReq(`${baseUrl}/api/os/${os1.id}/status`, 'POST', {
    status: 'AGUARDANDO_PECA',
    motivo_espera: 'Mola flex original'
  });
  assert.equal(parked.data.status, 'AGUARDANDO_PECA');

  const resumed = await jsonReq(`${baseUrl}/api/os/${os1.id}/status`, 'POST', { status: 'BANCADA' });
  assert.equal(resumed.data.status, 'BANCADA');
  assert.ok(resumed.data.iniciado_bancada_em);
  assert.equal(resumed.data.bom_baixado, 1);

  const ready = await jsonReq(`${baseUrl}/api/os/${os1.id}/status`, 'POST', { status: 'PRONTO' });
  assert.equal(ready.data.status, 'PRONTO');
  assert.ok(ready.data.pronto_em);

  // Bloqueio obrigatorio se tentar entregar com saldo devedor > 0
  const blocked = await jsonReq(`${baseUrl}/api/os/${os1.id}/status`, 'POST', { status: 'ENTREGUE' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'QUITACAO_OBRIGATORIA');
  assert.equal(blocked.data.saldo_devedor, 45.00);

  // Entrega autorizada via Split Payment (R$ 20 Especie + R$ 25 PIX)
  const delivered = await jsonReq(`${baseUrl}/api/os/${os1.id}/status`, 'POST', {
    status: 'ENTREGUE',
    pagamentos: [
      { meio_pagamento: 'ESPECIE', valor: 20.00 },
      { meio_pagamento: 'PIX', valor: 25.00 }
    ]
  });
  assert.equal(delivered.status, 200);
  assert.equal(delivered.data.status, 'ENTREGUE');
  assert.equal(delivered.data.saldo_devedor, 0);
  assert.ok(delivered.data.entregue_em);

  // Impressao Termica com PIX BRCode CRC16 e Rastreio QR SVG
  const printRes = await jsonReq(`${baseUrl}/api/os/${os1.id}/impressao`, 'GET');
  assert.equal(printRes.status, 200);
  assert.ok(printRes.data.trackingQrSvg.includes('<svg'));
  assert.ok(printRes.data.pixQrSvg.includes('<svg'));
  assert.ok(printRes.data.pixPayload.startsWith('000201'));

  // Spotlight Global
  const spotRes = await jsonReq(`${baseUrl}/api/spotlight?q=${encodeURIComponent(os1.codigo_os)}`, 'GET');
  assert.equal(spotRes.status, 200);
  assert.equal(spotRes.data.orders.length, 1);

  // OS 2: Cancelamento blindado estorna BOM baixado e sinal no caixa_ledger
  const plaqBefore = srv.db.prepare("SELECT estoque_atual FROM catalogo_itens WHERE codigo_sku = 'INS-OPT-PLAQUETA'").get().estoque_atual;
  const os2 = (await jsonReq(`${baseUrl}/api/os`, 'POST', {
    modo_abertura: 'EXPRESS',
    dominio: 'OPTICA',
    fluxo_direto_bancada: true,
    pagamento_modo: 'SINAL',
    meio_pagamento: 'PIX',
    valor_sinal: 10.00,
    itens: [{ item_id: plaquetas.id, quantidade: 2 }]
  })).data;

  const plaqDropped = srv.db.prepare("SELECT estoque_atual FROM catalogo_itens WHERE codigo_sku = 'INS-OPT-PLAQUETA'").get().estoque_atual;
  assert.equal(plaqDropped, plaqBefore - 2);

  const badCancel = await jsonReq(`${baseUrl}/api/os/${os2.id}/status`, 'POST', {
    status: 'CANCELADA',
    motivo_cancelamento: ''
  });
  assert.equal(badCancel.status, 400);

  const okCancel = await jsonReq(`${baseUrl}/api/os/${os2.id}/status`, 'POST', {
    status: 'CANCELADA',
    motivo_cancelamento: 'Cliente desistiu antes da solda'
  });
  assert.equal(okCancel.status, 200);
  assert.equal(okCancel.data.status, 'CANCELADA');
  assert.equal(okCancel.data.bom_baixado, 0);

  const plaqRestored = srv.db.prepare("SELECT estoque_atual FROM catalogo_itens WHERE codigo_sku = 'INS-OPT-PLAQUETA'").get().estoque_atual;
  assert.equal(plaqRestored, plaqBefore);

  const estornoLedger = srv.db
    .prepare("SELECT tipo_movimento, valor_liquido FROM caixa_ledger WHERE os_id = ? AND tipo_movimento = 'ESTORNO'")
    .get(os2.id);
  assert.ok(estornoLedger);
  assert.equal(estornoLedger.valor_liquido, -10.00);
});
