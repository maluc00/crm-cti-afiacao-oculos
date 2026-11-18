'use strict';

const { roundMoney, computeLuminance, sanitizeSvg } = require('../utils/money');

const VALID_OPERATION_MODES = ['OPTICAL_ONLY', 'CUTLERY_ONLY', 'HYBRID'];
const VALID_THEME_MODES = ['warm-atelier', 'titanium-dark'];

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

function parseJsonSafe(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return fallback;
  }
}

function toBinaryFlag(value, fieldName) {
  if (value === true || value === 1 || value === '1') return '1';
  if (value === false || value === 0 || value === '0') return '0';
  throw new ValidationError(`Valor inválido para ${fieldName}: esperado 0 ou 1.`);
}

function normalizeRoundedMap(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new ValidationError('Objeto financeiro JSON inválido.');
  }
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    clean[k] = roundMoney(v);
  }
  return clean;
}

function getAllSettings(db) {
  const rows = db.prepare('SELECT chave, valor, atualizado_em FROM configuracoes').all();
  const map = {};
  for (const row of rows) {
    map[row.chave] = row.valor;
  }

  const accentHex = map.accent_color || '#B45309';
  let accentMeta;
  try {
    accentMeta = computeLuminance(accentHex);
  } catch (_err) {
    accentMeta = computeLuminance('#B45309');
  }

  return {
    operation_mode: map.operation_mode || 'HYBRID',
    partners_mode_enabled: map.partners_mode_enabled === '1' ? '1' : '0',
    brand_name: map.brand_name || 'CTI Pro Oficina',
    brand_slogan: map.brand_slogan || 'Precisão Óptica & Cutelaria',
    brand_icon_svg: map.brand_icon_svg || '',
    theme_mode: map.theme_mode || 'warm-atelier',
    focus_mode: map.focus_mode === '1' ? '1' : '0',
    accent_color: accentMeta.hex,
    accent_meta: accentMeta,
    pix_key: map.pix_key || '',
    card_fees: parseJsonSafe(map.card_fees_json, { debito_pct: 1.49, credito_1x_pct: 3.19, credito_parcelado_pct: 4.89 }),
    fixed_costs: parseJsonSafe(map.fixed_costs_json, { aluguel: 1800, energia: 320, internet: 120, pro_labore: 3500 }),
    monthly_goals: parseJsonSafe(map.monthly_goals_json, { faturamento_meta: 18000, os_meta: 180, ticket_medio_meta: 100 }),
    switches: parseJsonSafe(map.switches_json, { hud_f9_visible: true, compact_tables: false, sound_feedback: false }),
    scoring_rules: parseJsonSafe(map.scoring_rules_json, {
      ltv_vip_min: 350,
      frequencia_vip_os: 4,
      dias_tolerancia_retirada: 10,
      penalidade_atraso_pontos: 1,
      penalidade_inadimplencia_pontos: 2
    }),
    lan_pin_enabled: map.lan_pin_enabled === '1' ? '1' : '0',
    schema_version: map.schema_version || '1.0.0'
  };
}

function prepareUpdates(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('Corpo de configurações inválido.');
  }
  const updates = [];

  if (payload.operation_mode !== undefined) {
    if (!VALID_OPERATION_MODES.includes(payload.operation_mode)) {
      throw new ValidationError(`operation_mode inválido: ${payload.operation_mode}`);
    }
    updates.push(['operation_mode', payload.operation_mode]);
  }

  if (payload.partners_mode_enabled !== undefined) {
    updates.push(['partners_mode_enabled', toBinaryFlag(payload.partners_mode_enabled, 'partners_mode_enabled')]);
  }

  if (payload.theme_mode !== undefined) {
    if (!VALID_THEME_MODES.includes(payload.theme_mode)) {
      throw new ValidationError(`theme_mode inválido: ${payload.theme_mode}`);
    }
    updates.push(['theme_mode', payload.theme_mode]);
  }

  if (payload.focus_mode !== undefined) {
    updates.push(['focus_mode', toBinaryFlag(payload.focus_mode, 'focus_mode')]);
  }

  if (payload.accent_color !== undefined) {
    try {
      const meta = computeLuminance(payload.accent_color);
      updates.push(['accent_color', meta.hex]);
    } catch (err) {
      throw new ValidationError(err.message);
    }
  }

  if (payload.brand_name !== undefined) {
    const cleanName = String(payload.brand_name).trim();
    if (cleanName.length < 2 || cleanName.length > 60) {
      throw new ValidationError('brand_name deve ter entre 2 e 60 caracteres.');
    }
    updates.push(['brand_name', cleanName]);
  }

  if (payload.brand_slogan !== undefined) {
    const cleanSlogan = String(payload.brand_slogan).trim().slice(0, 90);
    updates.push(['brand_slogan', cleanSlogan]);
  }

  if (payload.brand_icon_svg !== undefined) {
    const rawSvg = String(payload.brand_icon_svg || '').trim();
    if (rawSvg === '') {
      updates.push(['brand_icon_svg', '']);
    } else {
      const safeSvg = sanitizeSvg(rawSvg);
      if (!safeSvg) {
        throw new ValidationError('brand_icon_svg deve conter um elemento <svg> válido.');
      }
      updates.push(['brand_icon_svg', safeSvg]);
    }
  }

  if (payload.pix_key !== undefined) {
    updates.push(['pix_key', String(payload.pix_key).trim().slice(0, 140)]);
  }

  if (payload.card_fees !== undefined) {
    updates.push(['card_fees_json', JSON.stringify(normalizeRoundedMap(payload.card_fees))]);
  }

  if (payload.fixed_costs !== undefined) {
    updates.push(['fixed_costs_json', JSON.stringify(normalizeRoundedMap(payload.fixed_costs))]);
  }

  if (payload.monthly_goals !== undefined) {
    updates.push(['monthly_goals_json', JSON.stringify(normalizeRoundedMap(payload.monthly_goals))]);
  }

  if (payload.scoring_rules !== undefined) {
    const rules = normalizeRoundedMap(payload.scoring_rules);
    updates.push(['scoring_rules_json', JSON.stringify({
      ltv_vip_min: Math.max(0, rules.ltv_vip_min ?? 350),
      frequencia_vip_os: Math.max(1, Math.round(rules.frequencia_vip_os ?? 4)),
      dias_tolerancia_retirada: Math.max(1, Math.round(rules.dias_tolerancia_retirada ?? 10)),
      penalidade_atraso_pontos: Math.max(0, Math.round(rules.penalidade_atraso_pontos ?? 1)),
      penalidade_inadimplencia_pontos: Math.max(0, Math.round(rules.penalidade_inadimplencia_pontos ?? 2))
    })]);
  }

  if (payload.switches !== undefined) {
    const sw = typeof payload.switches === 'string'
      ? parseJsonSafe(payload.switches, null)
      : payload.switches;
    if (!sw || typeof sw !== 'object' || Array.isArray(sw)) {
      throw new ValidationError('switches inválido.');
    }
    updates.push(['switches_json', JSON.stringify({
      hud_f9_visible: Boolean(sw.hud_f9_visible),
      compact_tables: Boolean(sw.compact_tables),
      sound_feedback: Boolean(sw.sound_feedback)
    })]);
  }

  return updates;
}

function updateSettings(db, payload) {
  const updates = prepareUpdates(payload);
  if (updates.length === 0) {
    return getAllSettings(db);
  }

  const upsert = db.prepare(`
    INSERT INTO configuracoes (chave, valor, atualizado_em)
    VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(chave) DO UPDATE SET
      valor = excluded.valor,
      atualizado_em = datetime('now', 'localtime')
  `);

  const runTx = db.transaction((pairs) => {
    for (const [key, val] of pairs) {
      upsert.run(key, val);
    }
  });

  runTx(updates);
  return getAllSettings(db);
}

function resolveDomainScope(operationMode, requestedFilter) {
  if (operationMode === 'OPTICAL_ONLY') {
    return {
      activeFilter: 'OPTICA',
      itemDomains: ['OPTICA', 'AMBOS'],
      osDomains: ['OPTICA'],
      hideOptical: false,
      hideCutlery: true
    };
  }
  if (operationMode === 'CUTLERY_ONLY') {
    return {
      activeFilter: 'CUTELARIA',
      itemDomains: ['CUTELARIA', 'AMBOS'],
      osDomains: ['CUTELARIA'],
      hideOptical: true,
      hideCutlery: false
    };
  }
  const normalized = requestedFilter === 'OPTICA' || requestedFilter === 'CUTELARIA'
    ? requestedFilter
    : 'ALL';
  if (normalized === 'OPTICA') {
    return {
      activeFilter: 'OPTICA',
      itemDomains: ['OPTICA', 'AMBOS'],
      osDomains: ['OPTICA'],
      hideOptical: false,
      hideCutlery: false
    };
  }
  if (normalized === 'CUTELARIA') {
    return {
      activeFilter: 'CUTELARIA',
      itemDomains: ['CUTELARIA', 'AMBOS'],
      osDomains: ['CUTELARIA'],
      hideOptical: false,
      hideCutlery: false
    };
  }
  return {
    activeFilter: 'ALL',
    itemDomains: ['OPTICA', 'CUTELARIA', 'AMBOS'],
    osDomains: ['OPTICA', 'CUTELARIA'],
    hideOptical: false,
    hideCutlery: false
  };
}

function buildPlaceholders(arr) {
  return arr.map(() => '?').join(', ');
}

function getSystemOverview(db, requestedDomainFilter) {
  const settings = getAllSettings(db);
  const scope = resolveDomainScope(settings.operation_mode, requestedDomainFilter);
  const itemPh = buildPlaceholders(scope.itemDomains);
  const osPh = buildPlaceholders(scope.osDomains);

  const catalogItems = db
    .prepare(
      `SELECT id, codigo_sku, tipo, dominio, nome_tecnico, abreviacao_balcao,
              ROUND(preco_venda, 2) AS preco_venda,
              ROUND(custo_medio_ponderado, 2) AS custo_medio_ponderado,
              estoque_atual, estoque_minimo, unidade, garantia_dias,
              sla_padrao_minutos, frequencia_uso
       FROM catalogo_itens
       WHERE ativo = 1 AND dominio IN (${itemPh})
       ORDER BY frequencia_uso DESC, nome_tecnico ASC`
    )
    .all(...scope.itemDomains);

  const combos = db
    .prepare(
      `SELECT id, codigo_combo, nome, abreviacao, dominio,
              ROUND(preco_combo, 2) AS preco_combo,
              ROUND(economia_gerada, 2) AS economia_gerada
       FROM combos
       WHERE ativo = 1 AND dominio IN (${itemPh})
       ORDER BY nome ASC`
    )
    .all(...scope.itemDomains);

  const attributes = db
    .prepare(
      `SELECT id, categoria, dominio, valor, frequencia_uso
       FROM memoria_atributos
       WHERE ativo = 1 AND dominio IN (${itemPh})
       ORDER BY categoria ASC, frequencia_uso DESC`
    )
    .all(...scope.itemDomains);

  const partnersEnabled = settings.partners_mode_enabled === '1';
  const partners = partnersEnabled
    ? db
        .prepare(
          `SELECT id, nome, eh_operador_padrao, regra_comissao_json
           FROM parceiros_tecnicos
           WHERE ativo = 1
           ORDER BY eh_operador_padrao DESC, nome ASC`
        )
        .all()
    : [];

  const cashSession = db
    .prepare(
      `SELECT id, status, ROUND(saldo_inicial_especie, 2) AS saldo_inicial_especie,
              ROUND(entradas_especie, 2) AS entradas_especie,
              ROUND(saidas_especie, 2) AS saidas_especie,
              ROUND(entradas_pix, 2) AS entradas_pix,
              ROUND(entradas_cartao_bruto, 2) AS entradas_cartao_bruto,
              ROUND(entradas_cartao_liquido, 2) AS entradas_cartao_liquido,
              pessoas_atendidas_pa, quantidade_servicos_qnt, aberto_em, fechado_em
       FROM caixa_sessoes
       ORDER BY id DESC LIMIT 1`
    )
    .get() || null;

  const osStatusRows = db
    .prepare(
      `SELECT status, COUNT(*) AS total
       FROM ordens_servico
       WHERE ativo = 1 AND dominio IN (${osPh})
       GROUP BY status`
    )
    .all(...scope.osDomains);

  const osCounts = { FILA: 0, BANCADA: 0, AGUARDANDO_PECA: 0, PRONTO: 0, ENTREGUE: 0, CANCELADA: 0 };
  for (const row of osStatusRows) {
    osCounts[row.status] = Number(row.total || 0);
  }

  const stockAlertsRow = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM catalogo_itens
       WHERE ativo = 1 AND tipo IN ('PRODUTO', 'INSUMO')
         AND dominio IN (${itemPh}) AND estoque_atual <= estoque_minimo`
    )
    .get(...scope.itemDomains);

  const clientsRow = db
    .prepare('SELECT COUNT(*) AS total FROM clientes WHERE ativo = 1')
    .get();

  const recentLedger = db
    .prepare(
      `SELECT id, tipo_movimento, categoria_dre, dominio, meio_pagamento,
              ROUND(valor_bruto, 2) AS valor_bruto,
              ROUND(valor_liquido, 2) AS valor_liquido,
              descricao, data_competencia, criado_em
       FROM caixa_ledger
       WHERE dominio = 'GERAL' OR dominio IN (${osPh})
       ORDER BY id DESC LIMIT 10`
    )
    .all(...scope.osDomains);

  return {
    settings,
    scope,
    partnersEnabled,
    partners,
    cashSession,
    kpis: {
      osCounts,
      activeOrders: osCounts.FILA + osCounts.BANCADA + osCounts.AGUARDANDO_PECA + osCounts.PRONTO,
      stockAlerts: Number((stockAlertsRow && stockAlertsRow.total) || 0),
      clientsTotal: Number((clientsRow && clientsRow.total) || 0),
      servicesCount: catalogItems.filter((item) => item.tipo === 'SERVICO').length,
      productsCount: catalogItems.filter((item) => item.tipo === 'PRODUTO').length,
      insumosCount: catalogItems.filter((item) => item.tipo === 'INSUMO').length
    },
    catalogItems,
    combos,
    attributes,
    recentLedger
  };
}

module.exports = {
  ValidationError,
  getAllSettings,
  updateSettings,
  getSystemOverview,
  resolveDomainScope
};
