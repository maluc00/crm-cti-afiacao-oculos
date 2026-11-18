(function attachCatalogView(global) {
  'use strict';

  const { state, apiFetch, formatBrl, escapeHtml, showToast } = global.CTI_STORE;

  let activeTab = 'SERVICO';
  let searchQuery = '';
  let cachedCatalog = null;

  async function loadAndRender(container) {
    const domain = state.domainFilter && state.domainFilter !== 'ALL'
      ? `?domain=${encodeURIComponent(state.domainFilter)}`
      : '';
    cachedCatalog = await apiFetch(`/api/catalogo${domain}`);
    renderMarkup(container);
  }

  function renderServicesTable(items) {
    if (items.length === 0) {
      return '<tr><td colspan="6" style="color:var(--text-secondary);">Nenhum servico encontrado neste dominio.</td></tr>';
    }
    return items.map((s) => `
      <tr>
        <td class="mono">${escapeHtml(s.codigo_sku)}</td>
        <td>
          <strong>${escapeHtml(s.abreviacao_balcao)}</strong>
          <div style="font-size:11px;color:var(--text-secondary);">${escapeHtml(s.nome_tecnico)}</div>
        </td>
        <td>
          <span class="badge badge-accent">${escapeHtml(s.dominio)}</span>
          <span class="badge" style="margin-left:4px;">${s.garantia_dias}d</span>
        </td>
        <td>
          ${s.bom_itens.length > 0
            ? s.bom_itens.map((b) => `<span class="badge">${escapeHtml(b.insumo_abrev)} x${b.quantidade_consumida}</span>`).join(' ')
            : '<span class="eyebrow">Sem BOM</span>'}
        </td>
        <td class="num">
          <div>${escapeHtml(formatBrl(s.preco_venda))}</div>
          <div style="font-size:10px;color:var(--status-ok);">Liq: ${escapeHtml(formatBrl(s.lucro_liquido))} (${s.margem_pct}%)</div>
        </td>
        <td class="action-cell">
          <button class="btn btn-sm" type="button" data-edit-item="${s.id}">Editar</button>
          <button class="btn btn-sm btn-ghost" type="button" data-del-item="${s.id}">Inativar</button>
        </td>
      </tr>
    `).join('');
  }

  function renderStockTable(items, isProduct) {
    if (items.length === 0) {
      return '<tr><td colspan="6" style="color:var(--text-secondary);">Nenhum item cadastrado neste filtro.</td></tr>';
    }
    return items.map((it) => `
      <tr>
        <td class="mono">${escapeHtml(it.codigo_sku)}</td>
        <td>
          <strong>${escapeHtml(it.abreviacao_balcao)}</strong>
          <div style="font-size:11px;color:var(--text-secondary);">${escapeHtml(it.nome_tecnico)}</div>
        </td>
        <td><span class="badge badge-accent">${escapeHtml(it.dominio)}</span></td>
        <td class="num">
          <span class="mono">${it.estoque_atual} ${escapeHtml(it.unidade)}</span>
          <div style="margin-top:3px;">
            ${it.alerta_ruptura
              ? `<span class="rupture-pill">Min ${it.estoque_minimo}</span>`
              : `<span class="ok-pill">Min ${it.estoque_minimo}</span>`}
          </div>
        </td>
        <td class="num">
          <div>CMP: ${escapeHtml(formatBrl(it.custo_medio_ponderado))}</div>
          ${isProduct ? `<div style="font-size:10px;color:var(--status-ok);">Venda: ${escapeHtml(formatBrl(it.preco_venda))} (${it.margem_pct}%)</div>` : ''}
        </td>
        <td class="action-cell">
          <button class="btn btn-sm btn-accent" type="button" data-buy-item="${it.id}">+ Compra</button>
          <button class="btn btn-sm" type="button" data-adj-item="${it.id}">Ajustar</button>
          <button class="btn btn-sm btn-ghost" type="button" data-edit-item="${it.id}">Editar</button>
        </td>
      </tr>
    `).join('');
  }

  function renderCombosGrid(combos) {
    if (combos.length === 0) {
      return '<div class="eyebrow">Nenhum combo cadastrado para o dominio ativo.</div>';
    }
    return `
      <div class="grid-2">
        ${combos.map((c) => `
          <article class="card panel">
            <div class="panel-head">
              <div>
                <div class="eyebrow">${escapeHtml(c.codigo_combo)} | ${escapeHtml(c.dominio)}</div>
                <h3 class="panel-title">${escapeHtml(c.nome)}</h3>
              </div>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-sm" type="button" data-edit-combo="${c.id}">Editar</button>
                <button class="btn btn-sm btn-ghost" type="button" data-del-combo="${c.id}">Inativar</button>
              </div>
            </div>
            <div class="tag-cloud" style="margin-bottom:12px;">
              ${c.itens.map((ci) => `<span class="badge">${escapeHtml(ci.abreviacao_balcao)} x${ci.quantidade}</span>`).join('')}
            </div>
            <div class="combo-summary-strip">
              <div><div class="combo-metric-label">Original</div><div class="combo-metric-value">${escapeHtml(formatBrl(c.soma_original))}</div></div>
              <div><div class="combo-metric-label">Combo</div><div class="combo-metric-value" style="color:var(--accent-color);">${escapeHtml(formatBrl(c.preco_combo))}</div></div>
              <div><div class="combo-metric-label">Desconto</div><div class="combo-metric-value">${escapeHtml(formatBrl(c.desconto_real))}</div></div>
              <div><div class="combo-metric-label">Margem Liq.</div><div class="combo-metric-value">${c.margem_liquida_pct}%</div></div>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderMovementsTable(movements) {
    if (movements.length === 0) {
      return '<tr><td colspan="6" style="color:var(--text-secondary);">Sem movimentacoes registradas ainda.</td></tr>';
    }
    return movements.map((m) => `
      <tr>
        <td class="mono">${escapeHtml(m.criado_em)}</td>
        <td><span class="badge badge-accent">${escapeHtml(m.tipo_movimento)}</span></td>
        <td><strong>${escapeHtml(m.abreviacao_balcao)}</strong> <span class="mono" style="font-size:11px;">(${escapeHtml(m.codigo_sku)})</span></td>
        <td class="num">${m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade} ${escapeHtml(m.unidade)}</td>
        <td class="num">${escapeHtml(formatBrl(m.cmp_anterior))} -&gt; <strong>${escapeHtml(formatBrl(m.cmp_novo))}</strong></td>
        <td>${escapeHtml(m.observacao || '')}</td>
      </tr>
    `).join('');
  }

  function renderMarkup(container) {
    if (!cachedCatalog) return;
    const { kpis, items, combos, recentMovements, scope } = cachedCatalog;
    const q = searchQuery.trim().toLowerCase();

    const filteredItems = items.filter((it) => {
      if (it.tipo !== activeTab) return false;
      if (!q) return true;
      return `${it.nome_tecnico} ${it.abreviacao_balcao} ${it.codigo_sku}`.toLowerCase().includes(q);
    });

    const filteredCombos = combos.filter((c) => {
      if (!q) return true;
      return `${c.nome} ${c.abreviacao} ${c.codigo_combo}`.toLowerCase().includes(q);
    });

    let bodySection = '';
    if (activeTab === 'COMBO') {
      bodySection = renderCombosGrid(filteredCombos);
    } else if (activeTab === 'MOVIMENTOS') {
      bodySection = `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Data</th><th>Tipo</th><th>Item</th><th class="num">Qtd</th><th class="num">Evolucao CMP</th><th>Observacao</th></tr>
            </thead>
            <tbody>${renderMovementsTable(recentMovements)}</tbody>
          </table>
        </div>
      `;
    } else {
      bodySection = `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Item</th>
                <th>${activeTab === 'SERVICO' ? 'Dominio / Garantia' : 'Dominio'}</th>
                <th>${activeTab === 'SERVICO' ? 'Ficha BOM' : 'Estoque'}</th>
                <th class="num">${activeTab === 'SERVICO' ? 'Preco / Liquido' : 'CMP / Valor'}</th>
                <th style="text-align:right;">Acoes</th>
              </tr>
            </thead>
            <tbody>
              ${activeTab === 'SERVICO'
                ? renderServicesTable(filteredItems)
                : renderStockTable(filteredItems, activeTab === 'PRODUTO')}
            </tbody>
          </table>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Catalogo Unificado | Filtro: ${escapeHtml(scope.activeFilter)}</div>
          <h1 class="page-title">Servicos, Insumos BOM, Produtos &amp; Combos</h1>
          <p class="page-subtitle">Custo Medio Ponderado em tempo real, ficha tecnica de consumo e pacotes promocionais de upsell.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" type="button" id="cat-new-insumo">+ Novo Insumo</button>
          <button class="btn" type="button" id="cat-new-produto">+ Novo Produto</button>
          <button class="btn" type="button" id="cat-new-combo">+ Novo Combo</button>
          <button class="btn btn-accent" type="button" id="cat-new-servico">+ Novo Servico</button>
        </div>
      </div>

      <div class="grid-kpis">
        <article class="card kpi-card">
          <div class="kpi-top"><span class="eyebrow">Servicos</span><span class="led led-accent"></span></div>
          <div class="kpi-value mono">${kpis.totalServicos}</div>
          <div class="kpi-hint">Com Ficha Tecnica BOM integrada</div>
        </article>
        <article class="card kpi-card">
          <div class="kpi-top"><span class="eyebrow">Produtos Balcao</span><span class="led led-blue"></span></div>
          <div class="kpi-value mono">${kpis.totalProdutos}</div>
          <div class="kpi-hint">Revenda PDV com margem calculada</div>
        </article>
        <article class="card kpi-card">
          <div class="kpi-top"><span class="eyebrow">Insumos &amp; Rupturas</span><span class="led ${kpis.rupturas > 0 ? 'led-red' : 'led-green'}"></span></div>
          <div class="kpi-value mono">${kpis.totalInsumos} / ${kpis.rupturas}</div>
          <div class="kpi-hint">${kpis.rupturas} itens abaixo ou no minimo</div>
        </article>
        <article class="card kpi-card">
          <div class="kpi-top"><span class="eyebrow">Combos Ativos</span><span class="led led-green"></span></div>
          <div class="kpi-value mono">${kpis.totalCombos}</div>
          <div class="kpi-hint">Pacotes de upsell com margem auditada</div>
        </article>
      </div>

      <div class="subtabs" role="tablist">
        <button class="subtab-btn ${activeTab === 'SERVICO' ? 'is-active' : ''}" type="button" data-cat-tab="SERVICO">Servicos &amp; BOM (${kpis.totalServicos})</button>
        <button class="subtab-btn ${activeTab === 'INSUMO' ? 'is-active' : ''}" type="button" data-cat-tab="INSUMO">Insumos (${kpis.totalInsumos})</button>
        <button class="subtab-btn ${activeTab === 'PRODUTO' ? 'is-active' : ''}" type="button" data-cat-tab="PRODUTO">Produtos (${kpis.totalProdutos})</button>
        <button class="subtab-btn ${activeTab === 'COMBO' ? 'is-active' : ''}" type="button" data-cat-tab="COMBO">Combos (${kpis.totalCombos})</button>
        <button class="subtab-btn ${activeTab === 'MOVIMENTOS' ? 'is-active' : ''}" type="button" data-cat-tab="MOVIMENTOS">Historico CMP</button>
      </div>

      <section class="card panel">
        <div class="toolbar-row">
          <div class="toolbar-filters">
            <input class="input" id="cat-search-input" type="search" value="${escapeHtml(searchQuery)}" placeholder="Filtrar por nome, abreviacao ou SKU..." style="max-width:340px;">
          </div>
          <span class="badge mono">${activeTab}</span>
        </div>
        ${bodySection}
      </section>
    `;

    bindEvents(container);
  }

  function bindEvents(container) {
    const mod = global.CTI_MODALS_CATALOG;
    const reload = () => loadAndRender(container);

    container.querySelectorAll('[data-cat-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-cat-tab');
        renderMarkup(container);
      });
    });

    const searchInp = document.getElementById('cat-search-input');
    searchInp.addEventListener('input', () => {
      searchQuery = searchInp.value;
      const cursor = searchInp.selectionStart;
      renderMarkup(container);
      const nextInp = document.getElementById('cat-search-input');
      if (nextInp) {
        nextInp.focus();
        nextInp.setSelectionRange(cursor, cursor);
      }
    });

    document.getElementById('cat-new-insumo').addEventListener('click', () =>
      mod.openItemModal({ tipo: 'INSUMO', catalogData: cachedCatalog, onSaved: reload })
    );
    document.getElementById('cat-new-produto').addEventListener('click', () =>
      mod.openItemModal({ tipo: 'PRODUTO', catalogData: cachedCatalog, onSaved: reload })
    );
    document.getElementById('cat-new-servico').addEventListener('click', () =>
      mod.openItemModal({ tipo: 'SERVICO', catalogData: cachedCatalog, onSaved: reload })
    );
    document.getElementById('cat-new-combo').addEventListener('click', () =>
      mod.openComboModal({ catalogData: cachedCatalog, onSaved: reload })
    );

    const findItem = (id) => cachedCatalog.items.find((i) => i.id === Number(id));
    const findCombo = (id) => cachedCatalog.combos.find((c) => c.id === Number(id));

    container.querySelectorAll('[data-edit-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = findItem(btn.getAttribute('data-edit-item'));
        if (item) mod.openItemModal({ tipo: item.tipo, existing: item, catalogData: cachedCatalog, onSaved: reload });
      });
    });

    container.querySelectorAll('[data-buy-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = findItem(btn.getAttribute('data-buy-item'));
        if (item) mod.openPurchaseModal({ item, onSaved: reload });
      });
    });

    container.querySelectorAll('[data-adj-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = findItem(btn.getAttribute('data-adj-item'));
        if (item) mod.openAdjustmentModal({ item, onSaved: reload });
      });
    });

    container.querySelectorAll('[data-del-item]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiFetch(`/api/catalogo/itens/${btn.getAttribute('data-del-item')}`, { method: 'DELETE' });
        showToast('Item inativado (Soft Delete).', 'ok');
        reload();
      });
    });

    container.querySelectorAll('[data-edit-combo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const combo = findCombo(btn.getAttribute('data-edit-combo'));
        if (combo) mod.openComboModal({ existing: combo, catalogData: cachedCatalog, onSaved: reload });
      });
    });

    container.querySelectorAll('[data-del-combo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiFetch(`/api/catalogo/combos/${btn.getAttribute('data-del-combo')}`, { method: 'DELETE' });
        showToast('Combo inativado (Soft Delete).', 'ok');
        reload();
      });
    });
  }

  global.CTI_VIEW_CATALOG = {
    renderCatalogView: loadAndRender
  };
})(window);
