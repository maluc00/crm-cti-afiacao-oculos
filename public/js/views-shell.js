(function attachShellViews(global) {
  'use strict';

  const { state, formatBrl, escapeHtml } = global.CTI_STORE;

  const ROUTE_DESCRIPTIONS = {
    atendimento: {
      eyebrow: 'Fase 1 Ativa | Fase 2 Spotlight de OS',
      title: 'Atendimento & Balcao Express',
      subtitle: 'Catalogo ativo filtrado em tempo real pelo Camaleao de Dominio e memoria de atributos.'
    },
    bancada: {
      eyebrow: 'Fase 1 Ativa | Fase 3 Kanban SLA',
      title: 'Bancada Tecnica & Producao',
      subtitle: 'Visao operacional das filas tecnicas, atribuicao de bancada e controle de SLA.'
    },
    clientes: {
      eyebrow: 'Fase 1 Ativa | Fase 4 CRM & Historico',
      title: 'Clientes & Relacionamento',
      subtitle: 'Base unificada por telefone E.164 com historico de OS, score e garantias.'
    },
    estoque: {
      eyebrow: 'Fase 1 Ativa | Fase 3 BOM & CMP',
      title: 'Catalogo, Ficha BOM & Estoque',
      subtitle: 'Servicos, produtos de balcao e insumos filtrados conforme o modo da oficina.'
    },
    caixa: {
      eyebrow: 'Fase 1 Ativa | Fase 5 Ledger Imutavel',
      title: 'Caixa Diario & Livro-Razao',
      subtitle: 'Abertura de turno, saldo em especie e lancamentos protegidos por triggers SQLite.'
    },
    bi: {
      eyebrow: 'Fase 1 Ativa | Fase 6 BI & Legado',
      title: 'BI & Indicadores Executivos',
      subtitle: 'Metas, estrutura de custos fixos e comparativo multi-anual isolados por dominio.'
    }
  };

  function renderCatalogRows(items) {
    if (!items || items.length === 0) {
      return '<tr><td colspan="5" style="color:var(--text-secondary);">Nenhum item ativo para o dominio atual.</td></tr>';
    }
    return items.slice(0, 14).map((item) => `
      <tr>
        <td class="mono">${escapeHtml(item.codigo_sku)}</td>
        <td>
          <strong>${escapeHtml(item.abreviacao_balcao)}</strong>
          <div style="font-size:11px;color:var(--text-secondary);">${escapeHtml(item.nome_tecnico)}</div>
        </td>
        <td><span class="badge">${escapeHtml(item.tipo)}</span></td>
        <td><span class="badge badge-accent">${escapeHtml(item.dominio)}</span></td>
        <td class="num">${escapeHtml(formatBrl(item.preco_venda))}</td>
      </tr>
    `).join('');
  }

  function renderAttributeGroups(attributes) {
    const groups = { MATERIAL: [], LOCAL_AVARIA: [], ESTADO_LENTE: [] };
    for (const attr of attributes || []) {
      if (groups[attr.categoria]) groups[attr.categoria].push(attr);
    }
    return `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <div class="eyebrow" style="margin-bottom:6px;">Materiais Homologados</div>
          <div class="tag-cloud">
            ${groups.MATERIAL.map((a) => `<span class="badge">${escapeHtml(a.valor)}</span>`).join('') || '<span class="eyebrow">Vazio</span>'}
          </div>
        </div>
        <div>
          <div class="eyebrow" style="margin-bottom:6px;">Locais de Avaria</div>
          <div class="tag-cloud">
            ${groups.LOCAL_AVARIA.map((a) => `<span class="badge">${escapeHtml(a.valor)}</span>`).join('') || '<span class="eyebrow">Vazio</span>'}
          </div>
        </div>
        ${groups.ESTADO_LENTE.length > 0 ? `
          <div>
            <div class="eyebrow" style="margin-bottom:6px;">Checklist Estado das Lentes</div>
            <div class="tag-cloud">
              ${groups.ESTADO_LENTE.map((a) => `<span class="badge badge-accent">${escapeHtml(a.valor)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderPartnersCard(overview) {
    if (!overview.partnersEnabled) {
      return '';
    }
    return `
      <section class="card panel" style="margin-top:16px;">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Modo Parceiros Ativo</div>
            <h2 class="panel-title">Tecnicos Habilitados &amp; Regras de Comissao</h2>
          </div>
          <span class="badge badge-accent">${overview.partners.length} ativos</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Tecnico</th>
                <th>Perfil</th>
                <th>Regra JSON</th>
              </tr>
            </thead>
            <tbody>
              ${overview.partners.map((p) => `
                <tr>
                  <td><strong>${escapeHtml(p.nome)}</strong></td>
                  <td><span class="badge">${p.eh_operador_padrao ? 'Titular' : 'Parceiro'}</span></td>
                  <td class="mono">${escapeHtml(p.regra_comissao_json)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderLedgerCard(overview) {
    const rows = overview.recentLedger || [];
    return `
      <section class="card panel" style="margin-top:16px;">
        <div class="panel-head">
          <div>
            <div class="eyebrow">Auditoria em Tempo Real</div>
            <h2 class="panel-title">Livro-Razao Imutavel (caixa_ledger)</h2>
          </div>
          <button class="btn btn-sm btn-accent" type="button" id="view-open-cash-btn">Gerenciar Turno</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Movimento</th>
                <th>Meio</th>
                <th>Descricao</th>
                <th class="num">Liquido</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length === 0
                ? '<tr><td colspan="5" style="color:var(--text-secondary);">Sem movimentacoes registradas no caixa ainda.</td></tr>'
                : rows.map((r) => `
                  <tr>
                    <td class="mono">${escapeHtml(r.data_competencia)}</td>
                    <td><span class="badge">${escapeHtml(r.tipo_movimento)}</span></td>
                    <td><span class="badge badge-accent">${escapeHtml(r.meio_pagamento)}</span></td>
                    <td>${escapeHtml(r.descricao)}</td>
                    <td class="num">${escapeHtml(formatBrl(r.valor_liquido))}</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderOperationalView(container, route) {
    const overview = state.overview;
    if (!overview) return;
    const meta = ROUTE_DESCRIPTIONS[route] || ROUTE_DESCRIPTIONS.atendimento;
    const { kpis, scope, settings } = overview;

    const services = overview.catalogItems.filter((i) => i.tipo === 'SERVICO');
    const stockItems = overview.catalogItems.filter((i) => i.tipo !== 'SERVICO');
    const activeItems = route === 'estoque' ? stockItems : services;
    const preClient = route === 'atendimento' ? state.preselectedClientForOs : null;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">${escapeHtml(meta.eyebrow)}</div>
          <h1 class="page-title">${escapeHtml(meta.title)}</h1>
          <p class="page-subtitle">${escapeHtml(meta.subtitle)}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" type="button" id="view-go-settings">Ajustar Camaleao</button>
          <button class="btn btn-accent" type="button" id="view-open-qr">Conectar Celular</button>
        </div>
      </div>

      ${preClient ? `
        <div class="card panel" style="margin-bottom:16px;border-color:var(--accent-color);background-color:var(--accent-soft);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <div class="eyebrow">Cliente Pre-Selecionado do Prontuario (Pronto para Abertura de OS)</div>
              <div style="font-size:15px;font-weight:700;margin-top:3px;">
                ${escapeHtml(preClient.nome)}
                <span class="mono" style="font-size:12px;font-weight:400;margin-left:8px;">${escapeHtml(preClient.telefone_formatado)}</span>
              </div>
            </div>
            <button class="btn btn-sm" type="button" id="view-clear-preclient">Limpar Selecao</button>
          </div>
        </div>
      ` : ''}

      <div class="grid-kpis">
        <article class="card kpi-card">
          <div class="kpi-top">
            <span class="eyebrow">Servicos Ativos</span>
            <span class="led led-accent"></span>
          </div>
          <div class="kpi-value mono">${kpis.servicesCount}</div>
          <div class="kpi-hint">Filtro: ${escapeHtml(scope.activeFilter)} (${escapeHtml(settings.operation_mode)})</div>
        </article>
        <article class="card kpi-card">
          <div class="kpi-top">
            <span class="eyebrow">Produtos &amp; Insumos</span>
            <span class="led ${kpis.stockAlerts > 0 ? 'led-amber' : 'led-green'}"></span>
          </div>
          <div class="kpi-value mono">${kpis.productsCount + kpis.insumosCount}</div>
          <div class="kpi-hint">${kpis.stockAlerts} itens em alerta minimo</div>
        </article>
        <article class="card kpi-card">
          <div class="kpi-top">
            <span class="eyebrow">OS em Andamento</span>
            <span class="led led-blue"></span>
          </div>
          <div class="kpi-value mono">${kpis.activeOrders}</div>
          <div class="kpi-hint">Clientes cadastrados: ${kpis.clientsTotal}</div>
        </article>
        <article class="card kpi-card">
          <div class="kpi-top">
            <span class="eyebrow">Meta Mensal</span>
            <span class="led led-green"></span>
          </div>
          <div class="kpi-value mono">${escapeHtml(formatBrl(settings.monthly_goals?.faturamento_meta || 0))}</div>
          <div class="kpi-hint">Modo Parceiros: ${overview.partnersEnabled ? 'ATIVO' : 'SOLO (OFF)'}</div>
        </article>
      </div>

      <div class="grid-2">
        <section class="card panel">
          <div class="panel-head">
            <div>
              <div class="eyebrow">Catalogo Homologado</div>
              <h2 class="panel-title">${route === 'estoque' ? 'Produtos & Insumos BOM' : 'Tabela de Servicos Ativa'}</h2>
            </div>
            <span class="badge badge-accent mono">${activeItems.length} itens</span>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th>Dominio</th>
                  <th class="num">Valor</th>
                </tr>
              </thead>
              <tbody>${renderCatalogRows(activeItems)}</tbody>
            </table>
          </div>
        </section>

        <section class="card panel">
          <div class="panel-head">
            <div>
              <div class="eyebrow">Memoria Spotlight</div>
              <h2 class="panel-title">Atributos &amp; Combos Disponiveis</h2>
            </div>
            <span class="badge mono">${overview.combos.length} combos</span>
          </div>
          ${renderAttributeGroups(overview.attributes)}
          <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-subtle);">
            <div class="eyebrow" style="margin-bottom:8px;">Combos Promocionais</div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${overview.combos.map((c) => `
                <div class="switch-row">
                  <div>
                    <div style="font-size:12px;font-weight:700;">${escapeHtml(c.nome)}</div>
                    <div class="eyebrow">${escapeHtml(c.dominio)} | Economia ${escapeHtml(formatBrl(c.economia_gerada))}</div>
                  </div>
                  <div class="mono" style="font-weight:700;">${escapeHtml(formatBrl(c.preco_combo))}</div>
                </div>
              `).join('') || '<div class="eyebrow">Nenhum combo para este dominio.</div>'}
            </div>
          </div>
        </section>
      </div>

      ${renderPartnersCard(overview)}
      ${route === 'caixa' || route === 'bi' ? renderLedgerCard(overview) : ''}
    `;

    document.getElementById('view-go-settings').addEventListener('click', () => global.CTI_APP.navigate('configuracoes'));
    document.getElementById('view-open-qr').addEventListener('click', () => global.CTI_MODALS.openLanQrModal());
    const clearPreBtn = document.getElementById('view-clear-preclient');
    if (clearPreBtn) {
      clearPreBtn.addEventListener('click', () => {
        state.preselectedClientForOs = null;
        renderOperationalView(container, route);
      });
    }
    const openCashBtn = document.getElementById('view-open-cash-btn');
    if (openCashBtn) {
      openCashBtn.addEventListener('click', () => global.CTI_MODALS.openCashSemaphoreModal());
    }
  }

  global.CTI_VIEWS_SHELL = {
    renderOperationalView
  };
})(window);
