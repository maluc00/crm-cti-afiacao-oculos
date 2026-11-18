'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAppServer } = require('../server');
const { normalizePhoneE164, formatPhoneBr } = require('../src/utils/phone');

const ROOT_DIR = path.resolve(__dirname, '..');

async function createIsolatedServer(t) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cti-pro-phase2-'));
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

async function jsonReq(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test('1. Catalogo BOM: Calculo CMP em compras, reflexo automatico no servico e ajuste auditado', async (t) => {
  const { srv, baseUrl } = await createIsolatedServer(t);

  // Criar insumo inicial: 10 UN a CMP R$ 2,00
  const insumoRes = await jsonReq(`${baseUrl}/api/catalogo/itens`, 'POST', {
    tipo: 'INSUMO',
    dominio: 'OPTICA',
    nome_tecnico: 'Fio de Solda Titanio 0.8mm',
    abreviacao_balcao: 'Fio Titanio',
    custo_medio_ponderado: 2.00,
    estoque_atual: 10,
    estoque_minimo: 4,
    unidade: 'UN'
  });
  assert.equal(insumoRes.status, 201);
  const insumoId = insumoRes.data.id;

  // Compra 1: +10 UN pagando R$ 30,00 -> (10*2 + 30) / 20 = R$ 2,50
  const compra1 = await jsonReq(`${baseUrl}/api/catalogo/estoque/compra`, 'POST', {
    item_id: insumoId,
    quantidade: 10,
    valor_pago: 30.00,
    observacao: 'NF 101'
  });
  assert.equal(compra1.status, 201);
  assert.equal(compra1.data.item.estoque_atual, 20);
  assert.equal(compra1.data.item.custo_medio_ponderado, 2.50);
  assert.equal(compra1.data.movement.tipo_movimento, 'ENTRADA_COMPRA');

  // Compra 2: +5 UN pagando R$ 25,00 -> (20*2.5 + 25) / 25 = R$ 3,00
  const compra2 = await jsonReq(`${baseUrl}/api/catalogo/estoque/compra`, 'POST', {
    item_id: insumoId,
    quantidade: 5,
    valor_pago: 25.00
  });
  assert.equal(compra2.status, 201);
  assert.equal(compra2.data.item.estoque_atual, 25);
  assert.equal(compra2.data.item.custo_medio_ponderado, 3.00);

  // Servico com BOM consumindo 2 UN do insumo (custo BOM = 6.00, lucro = 114.00)
  const srvRes = await jsonReq(`${baseUrl}/api/catalogo/itens`, 'POST', {
    tipo: 'SERVICO',
    dominio: 'OPTICA',
    nome_tecnico: 'Micro-Solda Estrutural Titanio',
    abreviacao_balcao: 'Micro-Solda Ti',
    preco_venda: 120.00,
    garantia_dias: 90,
    bom_itens: [{ insumo_id: insumoId, quantidade_consumida: 2 }]
  });
  assert.equal(srvRes.status, 201);
  assert.equal(srvRes.data.custo_bom, 6.00);
  assert.equal(srvRes.data.lucro_liquido, 114.00);
  assert.equal(srvRes.data.margem_pct, 95.00);

  // Compra 3: +25 UN pagando R$ 125,00 -> (25*3 + 125) / 50 = R$ 4,00 -> BOM do servico sobe para R$ 8,00
  const compra3 = await jsonReq(`${baseUrl}/api/catalogo/estoque/compra`, 'POST', {
    item_id: insumoId,
    quantidade: 25,
    valor_pago: 125.00
  });
  assert.equal(compra3.data.item.custo_medio_ponderado, 4.00);

  const catAfter = await jsonReq(`${baseUrl}/api/catalogo`, 'GET');
  const updatedService = catAfter.data.items.find((i) => i.id === srvRes.data.id);
  assert.equal(updatedService.custo_bom, 8.00);
  assert.equal(updatedService.lucro_liquido, 112.00);

  // Ajuste de inventario sem motivo deve falhar com HTTP 400
  const badAdj = await jsonReq(`${baseUrl}/api/catalogo/estoque/ajuste`, 'POST', {
    item_id: insumoId,
    nova_quantidade: 48,
    motivo: ''
  });
  assert.equal(badAdj.status, 400);

  const okAdj = await jsonReq(`${baseUrl}/api/catalogo/estoque/ajuste`, 'POST', {
    item_id: insumoId,
    nova_quantidade: 48,
    motivo: 'Perda tecnica por calibragem'
  });
  assert.equal(okAdj.status, 201);
  assert.equal(okAdj.data.item.estoque_atual, 48);
  assert.equal(okAdj.data.movement.tipo_movimento, 'AJUSTE_MANUAL');

  const movCount = srv.db.prepare('SELECT COUNT(*) AS c FROM estoque_movimentacoes WHERE item_id = ?').get(insumoId).c;
  assert.equal(movCount, 4);
});

test('2. Produtos, Motor de Combos (margem BOM) e respeito estrito ao operation_mode', async (t) => {
  const { baseUrl } = await createIsolatedServer(t);

  // Criar produto revenda: custo 10.00, venda 25.00 -> margem 60%
  const prodRes = await jsonReq(`${baseUrl}/api/catalogo/itens`, 'POST', {
    tipo: 'PRODUTO',
    dominio: 'OPTICA',
    nome_tecnico: 'Flanela Microfibra Anti-Estatica',
    abreviacao_balcao: 'Flanela Microfibra',
    preco_venda: 25.00,
    custo_medio_ponderado: 10.00,
    estoque_atual: 2,
    estoque_minimo: 5,
    unidade: 'UN'
  });
  assert.equal(prodRes.status, 201);
  assert.equal(prodRes.data.margem_pct, 60);
  assert.equal(prodRes.data.alerta_ruptura, true);

  // Buscar servicos opticos existentes (Solda = 55.00 custo 3.20, Plaquetas = 20.00 custo BOM 1.80)
  const cat = await jsonReq(`${baseUrl}/api/catalogo`, 'GET');
  const solda = cat.data.items.find((i) => i.codigo_sku === 'OPT-SRV-SOLDA');
  const plaquetas = cat.data.items.find((i) => i.codigo_sku === 'OPT-SRV-PLAQUETAS');

  // Combo: Solda (55) + Plaquetas (20) + 2 Flanelas (50) => Soma Original = 125.00 | Custo Embutido = 3.20 + 1.80 + 20.00 = 25.00
  // Preco Combo = 100.00 => Desconto Real = 25.00 | Lucro Liquido = 75.00 | Margem Liquida = 75%
  const comboRes = await jsonReq(`${baseUrl}/api/catalogo/combos`, 'POST', {
    nome: 'Combo Revitalizacao Optica Completa',
    abreviacao: 'Revitalizacao Optica',
    dominio: 'OPTICA',
    preco_combo: 100.00,
    itens: [
      { item_id: solda.id, quantidade: 1 },
      { item_id: plaquetas.id, quantidade: 1 },
      { item_id: prodRes.data.id, quantidade: 2 }
    ]
  });
  assert.equal(comboRes.status, 201);
  assert.equal(comboRes.data.soma_original, 125.00);
  assert.equal(comboRes.data.desconto_real, 25.00);
  assert.equal(comboRes.data.custo_total_embutido, 25.00);
  assert.equal(comboRes.data.lucro_liquido_final, 75.00);
  assert.equal(comboRes.data.margem_liquida_pct, 75.00);

  // Modo OPTICAL_ONLY bloqueia cadastro de Cutelaria e oculta da listagem
  await jsonReq(`${baseUrl}/api/settings`, 'PUT', { operation_mode: 'OPTICAL_ONLY' });
  const blockedCutlery = await jsonReq(`${baseUrl}/api/catalogo/itens`, 'POST', {
    tipo: 'SERVICO',
    dominio: 'CUTELARIA',
    nome_tecnico: 'Afiacao Navalha',
    abreviacao_balcao: 'Navalha',
    preco_venda: 45.00
  });
  assert.equal(blockedCutlery.status, 400);

  const catOptical = await jsonReq(`${baseUrl}/api/catalogo?domain=CUTELARIA`, 'GET');
  assert.equal(catOptical.data.items.some((i) => i.dominio === 'CUTELARIA'), false);

  // Criacao inline de atributo na memoria Spotlight
  const attrRes = await jsonReq(`${baseUrl}/api/catalogo/atributos`, 'POST', {
    categoria: 'MATERIAL',
    dominio: 'OPTICA',
    valor: 'Aluminio Aeroespacial'
  });
  assert.equal(attrRes.status, 201);
  assert.equal(attrRes.data.valor, 'Aluminio Aeroespacial');
});

test('3. Clientes: Normalizacao E.164, cadastro elastico, busca A-Z e unicidade', async (t) => {
  const { srv, baseUrl } = await createIsolatedServer(t);

  assert.equal(normalizePhoneE164('(11) 98765-4321'), '+5511987654321');
  assert.equal(normalizePhoneE164('011 3344-5566'), '+551133445566');
  assert.equal(normalizePhoneE164('5521998877665'), '+5521998877665');
  assert.equal(normalizePhoneE164('+1 415 555 2671'), '+14155552671');
  assert.equal(formatPhoneBr('+5511987654321'), '(11) 98765-4321');
  assert.throws(() => normalizePhoneE164('12345'));

  // Cadastro compacto (5 segundos)
  const createRes = await jsonReq(`${baseUrl}/api/clientes`, 'POST', {
    nome: 'Beatriz Almeida',
    telefone: '(11) 99123-4567',
    apelido_referencia: 'Bia Manicure Salao',
    observacoes_tecnicas: 'Prefere ajuste firme nas hastes'
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.data.telefone_e164, '+5511991234567');
  assert.equal(createRes.data.score_automatico, 3);

  // Expansao completa de endereco e documento
  const updRes = await jsonReq(`${baseUrl}/api/clientes/${createRes.data.id}`, 'PUT', {
    cpf_cnpj: '12345678909',
    data_nascimento: '1990-05-12',
    cep: '01310100',
    logradouro: 'Av Paulista',
    numero: '1000',
    bairro: 'Bela Vista',
    cidade: 'Sao Paulo',
    uf: 'sp'
  });
  assert.equal(updRes.status, 200);
  assert.equal(updRes.data.cep, '01310-100');
  assert.equal(updRes.data.cpf_cnpj, '123.456.789-09');
  assert.equal(updRes.data.uf, 'SP');

  // Duplicidade E.164 com formatacao diferente deve retornar HTTP 409
  const dupRes = await jsonReq(`${baseUrl}/api/clientes`, 'POST', {
    nome: 'Outra Pessoa',
    telefone: '11991234567'
  });
  assert.equal(dupRes.status, 409);

  // Busca por apelido e indice A-Z
  const searchApelido = await jsonReq(`${baseUrl}/api/clientes?q=Manicure`, 'GET');
  assert.equal(searchApelido.data.clients.length, 1);

  const searchLetterB = await jsonReq(`${baseUrl}/api/clientes?letter=B`, 'GET');
  assert.equal(searchLetterB.data.clients.length, 1);

  const searchLetterZ = await jsonReq(`${baseUrl}/api/clientes?letter=Z`, 'GET');
  assert.equal(searchLetterZ.data.clients.length, 0);

  // Soft delete preserva registro no SQLite
  const delRes = await jsonReq(`${baseUrl}/api/clientes/${createRes.data.id}`, 'DELETE');
  assert.equal(delRes.status, 200);
  const rawRow = srv.db.prepare('SELECT ativo FROM clientes WHERE id = ?').get(createRes.data.id);
  assert.equal(rawRow.ativo, 0);
});

test('4. Motor Hibrido de Scoring (Auto + Manual) e Prontuario Tecnico com Garantias & Ledger', async (t) => {
  const { srv, baseUrl } = await createIsolatedServer(t);

  const cliVip = (await jsonReq(`${baseUrl}/api/clientes`, 'POST', {
    nome: 'Carlos Eduardo',
    telefone: '11988881111'
  })).data;
  const cliAtraso = (await jsonReq(`${baseUrl}/api/clientes`, 'POST', {
    nome: 'Debora Lemos',
    telefone: '11988882222'
  })).data;
  const cliInadimplente = (await jsonReq(`${baseUrl}/api/clientes`, 'POST', {
    nome: 'Eduardo Ramos',
    telefone: '11988883333'
  })).data;

  // Abrir sessao de caixa para registrar pagamentos reais no caixa_ledger
  const sessaoId = Number(
    srv.db.prepare("INSERT INTO caixa_sessoes (status, saldo_inicial_especie) VALUES ('ABERTO', 100.00)").run().lastInsertRowid
  );
  const solda = srv.db.prepare("SELECT id, abreviacao_balcao FROM catalogo_itens WHERE codigo_sku = 'OPT-SRV-SOLDA'").get();
  const ajuste = srv.db.prepare("SELECT id, abreviacao_balcao FROM catalogo_itens WHERE codigo_sku = 'OPT-SRV-AJUSTE'").get();

  // Cliente VIP: 4 OSs entregues totalizando R$ 700,00 no caixa_ledger
  for (let i = 1; i <= 4; i += 1) {
    const osId = Number(
      srv.db.prepare(
        `INSERT INTO ordens_servico (
          codigo_os, cliente_id, dominio, status, valor_total, valor_pago, saldo_devedor,
          pronto_em, entregue_em
        ) VALUES (?, ?, 'OPTICA', 'ENTREGUE', 175.00, 175.00, 0.00,
          datetime('now', 'localtime', '-2 days'), datetime('now', 'localtime', '-1 days'))`
      ).run(`OS-2026-V00${i}`, cliVip.id).lastInsertRowid
    );
    srv.db.prepare(
      `INSERT INTO os_itens (os_id, item_id, descricao, tipo, dominio, quantidade, valor_unitario, valor_total)
       VALUES (?, ?, ?, 'SERVICO', 'OPTICA', ?, 55.00, 175.00)`
    ).run(osId, i <= 3 ? solda.id : ajuste.id, i <= 3 ? 'Solda' : 'Ajuste', i <= 3 ? 2 : 1);

    srv.db.prepare(
      `INSERT INTO caixa_ledger (
        caixa_sessao_id, os_id, tipo_movimento, categoria_dre, dominio,
        meio_pagamento, valor_bruto, taxa_aplicada, valor_liquido, descricao
      ) VALUES (?, ?, 'ENTRADA_OS', 'RECEITA_SERVICO', 'OPTICA', 'PIX', 175.00, 0.00, 175.00, ?)`
    ).run(sessaoId, osId, `Recebimento OS-2026-V00${i}`);
  }

  // Cliente com atraso na gaveta (20 dias > tolerancia padrao 10 dias)
  srv.db.prepare(
    `INSERT INTO ordens_servico (
      codigo_os, cliente_id, dominio, status, valor_total, valor_pago, saldo_devedor,
      pronto_em, entregue_em
    ) VALUES ('OS-2026-ATR1', ?, 'OPTICA', 'ENTREGUE', 50.00, 50.00, 0.00,
      datetime('now', 'localtime', '-25 days'), datetime('now', 'localtime', '-2 days'))`
  ).run(cliAtraso.id);

  // Cliente inadimplente (ENTREGUE com saldo_devedor > 0)
  srv.db.prepare(
    `INSERT INTO ordens_servico (
      codigo_os, cliente_id, dominio, status, valor_total, valor_pago, saldo_devedor,
      pronto_em, entregue_em
    ) VALUES ('OS-2026-INA1', ?, 'OPTICA', 'ENTREGUE', 80.00, 20.00, 60.00,
      datetime('now', 'localtime', '-3 days'), datetime('now', 'localtime', '-2 days'))`
  ).run(cliInadimplente.id);

  const recalc = await jsonReq(`${baseUrl}/api/clientes/recalcular-scores`, 'POST');
  assert.equal(recalc.status, 200);
  assert.equal(recalc.data.recalculated, 3);

  // Validar prontuario do VIP
  const dossierVip = await jsonReq(`${baseUrl}/api/clientes/${cliVip.id}/prontuario`, 'GET');
  assert.equal(dossierVip.status, 200);
  assert.equal(dossierVip.data.cliente.score_automatico, 5);
  assert.equal(dossierVip.data.cliente.eh_vip, true);
  assert.equal(dossierVip.data.score_breakdown.ltv_ledger_auditado, 700.00);
  assert.equal(dossierVip.data.top_servicos[0].descricao, 'Solda');
  assert.equal(dossierVip.data.top_servicos[0].total_execucoes, 6);
  assert.ok(dossierVip.data.garantias_ativas.length >= 1);
  assert.ok(dossierVip.data.garantias_ativas[0].dias_restantes >= 80);

  // Validar penalizacoes automaticas
  const dossierAtraso = await jsonReq(`${baseUrl}/api/clientes/${cliAtraso.id}/prontuario`, 'GET');
  assert.equal(dossierAtraso.data.cliente.score_automatico, 2);

  const dossierInad = await jsonReq(`${baseUrl}/api/clientes/${cliInadimplente.id}/prontuario`, 'GET');
  assert.equal(dossierInad.data.cliente.score_automatico, 1);

  // Sobrescrita manual + Flags + Restauracao para automatico
  const evalManual = await jsonReq(`${baseUrl}/api/clientes/${cliVip.id}/avaliacao`, 'PATCH', {
    score_manual: 2,
    flags: ['Exigente com Alinhamento', 'VIP']
  });
  assert.equal(evalManual.status, 200);
  assert.equal(evalManual.data.score_manual, 2);
  assert.equal(evalManual.data.score_efetivo, 2);
  assert.deepEqual(evalManual.data.flags, ['Exigente com Alinhamento', 'VIP']);

  const evalReset = await jsonReq(`${baseUrl}/api/clientes/${cliVip.id}/avaliacao`, 'PATCH', {
    score_manual: null
  });
  assert.equal(evalReset.data.score_manual, null);
  assert.equal(evalReset.data.score_efetivo, 5);
});

test('5. Contrato do componente universal spotlight-select.js e regras de codigo', () => {
  const spotlightPath = path.join(ROOT_DIR, 'public', 'js', 'spotlight-select.js');
  assert.ok(fs.existsSync(spotlightPath), 'spotlight-select.js deve existir em public/js/');
  const content = fs.readFileSync(spotlightPath, 'utf8');
  assert.ok(content.includes('CTI_SPOTLIGHT_SELECT'));
  assert.ok(content.includes('ArrowDown'));
  assert.ok(content.includes('ArrowUp'));
  assert.ok(content.includes('onCreateInline'));
});
