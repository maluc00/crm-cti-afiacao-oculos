(function attachBenchView(global) {
  'use strict';

  const { state, apiFetch, formatBrl, formatEnumLabel, escapeHtml, showToast, refreshOverview } = global.CTI_STORE;

  let activeSubTab = 'BANCADA';
  let activeViewMode = 'KANBAN';
  let searchFilter = '';
  let cachedOrders = null;

  async function loadAndRender(container, canCommit) {
    const dom = state.domainFilter && state.domainFilter !== 'ALL'
      ? `domain=${encodeURIComponent(state.domainFilter)}&`
      : '';
    const q = searchFilter.trim() ? `q=${encodeURIComponent(searchFilter.trim())}` : '';
    cachedOrders = await apiFetch(`/api/os?${dom}${q}`);
    if (canCommit && !canCommit()) return;
    renderMarkup(container);
  }

  async function handleStatusTransition(os, targetStatus, container) {
    try {
      await apiFetch(`/api/os/${os.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: targetStatus })
      });
      await refreshOverview('os:status');
      showToast(`${os.codigo_os} -> ${targetStatus}`, 'ok');
      await loadAndRender(container);
    } catch (err) {
      if (
        err.message.includes('Quitação obrigatória') ||
        err.message.includes('Quitacao obrigatoria') ||
        os.saldo_devedor > 0
      ) {
        global.CTI_MODALS_BENCH.openSettlementModal(os, () => loadAndRender(container));
        return;
      }
      showToast(err.message, 'error');
    }
  }

  function renderOrderCard(os) {
    const nextBtn = os.status === 'FILA'
      ? `<button class="btn btn-sm btn-accent" type="button" data-move-os="${os.id}" data-target="BANCADA">Iniciar Bancada</button>`
      : os.status === 'BANCADA'
        ? `<button class="btn btn-sm btn-accent" type="button" data-move-os="${os.id}" data-target="PRONTO">Marcar Pronto</button>`
        : os.status === 'PRONTO'
          ? `<button class="btn btn-sm btn-accent" type="button" data-move-os="${os.id}" data-target="ENTREGUE">Entregar</button>`
          : os.status === 'AGUARDANDO_PECA'
            ? `<button class="btn btn-sm btn-accent" type="button" data-move-os="${os.id}" data-target="BANCADA">Peça Chegou</button>`
            : '';

    const loteHint = os.lote_progress?.total > 0
      ? `<span class="badge mono">${os.lote_progress.concluidos}/${os.lote_progress.total} peças</span>`
      : '';

    return `
      <article class="os-card ${os.prioridade_sla === 'URGENTE' ? 'is-urgent' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <button class="btn-ghost mono" type="button" data-open-os="${os.id}" style="font-weight:700;font-size:12px;padding:0;cursor:pointer;">
            ${escapeHtml(os.codigo_os)}
          </button>
          <span class="badge badge-accent">${escapeHtml(formatEnumLabel(os.dominio))}</span>
        </div>
        <div>
          <strong style="font-size:13px;">${escapeHtml(os.cliente_nome)}</strong>
          <div style="font-size:11px;color:var(--text-secondary);">
            ${escapeHtml((os.itens || []).map((i) => `${i.quantidade}x ${i.descricao}`).join(', ').slice(0, 64))}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="mono" style="font-size:12px;font-weight:700;">${escapeHtml(formatBrl(os.valor_total))}</span>
          ${os.saldo_devedor > 0
            ? `<span class="rupture-pill mono">Falta ${escapeHtml(formatBrl(os.saldo_devedor))}</span>`
            : `<span class="ok-pill">${os.eh_cortesia ? 'Cortesia' : 'Quitada'}</span>`}
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          ${loteHint}
          ${os.fotos?.length ? `<span class="badge mono">${os.fotos.length} foto(s)</span>` : ''}
          ${os.prioridade_sla === 'URGENTE' ? '<span class="rupture-pill">Urgente</span>' : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;padding-top:4px;border-top:1px solid var(--border-subtle);">
          ${nextBtn}
          ${os.status === 'FILA' || os.status === 'BANCADA' ? `<button class="btn btn-sm" type="button" data-park-os="${os.id}">Aguardar Peça</button>` : ''}
          <button class="btn btn-sm btn-ghost" type="button" data-print-os="${os.id}">Cupom</button>
          <button class="btn btn-sm btn-ghost" type="button" data-open-os="${os.id}">Abrir</button>
        </div>
      </article>
    `;
  }

  function renderKanban(orders) {
    const cols = [
      { key: 'FILA', title: '1. Fila de Entrada' },
      { key: 'BANCADA', title: '2. Na Bancada' },
      { key: 'PRONTO', title: '3. Pronto p/ Retirada' },
      { key: 'ENTREGUE', title: '4. Entregues Recentes' }
    ];
    return `
      <div class="kanban-board">
        ${cols.map((col) => {
          const list = orders.filter((o) => o.status === col.key);
          return `
            <div class="kanban-col">
              <div class="kanban-col-head">
                <span class="eyebrow">${escapeHtml(col.title)}</span>
                <span class="badge mono">${list.length}</span>
              </div>
              ${list.length === 0 ? '<div class="eyebrow">Vazio</div>' : list.map(renderOrderCard).join('')}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderHighDensityList(orders) {
    if (orders.length === 0) return '<div class="eyebrow">Nenhuma OS encontrada neste filtro.</div>';
    return `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>OS</th><th>Cliente</th><th>Serviços / Peça</th><th>Status</th><th class="num">Total / Saldo</th><th style="text-align:right;">Ações</th></tr>
          </thead>
          <tbody>
            ${orders.map((os) => `
              <tr>
                <td class="mono"><button class="btn-ghost" type="button" data-open-os="${os.id}" style="padding:0;font-weight:700;cursor:pointer;">${escapeHtml(os.codigo_os)}</button></td>
                <td><strong>${escapeHtml(os.cliente_nome)}</strong><div style="font-size:10px;color:var(--text-secondary);">${escapeHtml(os.telefone_formatado)}</div></td>
                <td>${escapeHtml((os.itens || []).map((i) => i.descricao).join(', ').slice(0, 56))}</td>
                <td><span class="badge badge-accent">${escapeHtml(formatEnumLabel(os.status))}</span></td>
                <td class="num">${escapeHtml(formatBrl(os.valor_total))}<div style="font-size:10px;color:${os.saldo_devedor > 0 ? 'var(--status-danger)' : 'var(--status-ok)'};">${os.saldo_devedor > 0 ? `Saldo ${formatBrl(os.saldo_devedor)}` : 'Quitada'}</div></td>
                <td class="action-cell">
                  ${os.status === 'FILA' ? `<button class="btn btn-sm btn-accent" type="button" data-move-os="${os.id}" data-target="BANCADA">Bancada</button>` : ''}
                  ${os.status === 'BANCADA' ? `<button class="btn btn-sm btn-accent" type="button" data-move-os="${os.id}" data-target="PRONTO">Pronto</button>` : ''}
                  ${os.status === 'PRONTO' ? `<button class="btn btn-sm btn-accent" type="button" data-move-os="${os.id}" data-target="ENTREGUE">Entregar</button>` : ''}
                  ${os.status === 'AGUARDANDO_PECA' ? `<button class="btn btn-sm btn-accent" type="button" data-move-os="${os.id}" data-target="BANCADA">Peça Chegou</button>` : ''}
                  <button class="btn btn-sm" type="button" data-print-os="${os.id}">Cupom</button>
                  <button class="btn btn-sm btn-ghost" type="button" data-open-os="${os.id}">Abrir</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderStepperCards(orders) {
    if (orders.length === 0) return '<div class="eyebrow">Nenhuma OS encontrada neste filtro.</div>';
    const steps = ['FILA', 'BANCADA', 'PRONTO', 'ENTREGUE'];
    const labels = ['1. Fila', '2. Bancada', '3. Pronto', '4. Entregue'];

    return `
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${orders.map((os) => {
          const curIdx = steps.indexOf(os.status);
          return `
            <article class="card panel" style="padding:14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                <div>
                  <span class="os-code-pill">${escapeHtml(os.codigo_os)}</span>
                  <strong style="margin-left:8px;">${escapeHtml(os.cliente_nome)}</strong>
                  <span class="badge" style="margin-left:6px;">${escapeHtml(formatEnumLabel(os.dominio))}</span>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                  <span class="mono" style="font-weight:700;">${escapeHtml(formatBrl(os.valor_total))}</span>
                  <button class="btn btn-sm" type="button" data-print-os="${os.id}">Cupom</button>
                  <button class="btn btn-sm" type="button" data-open-os="${os.id}">Fotos / Detalhes</button>
                </div>
              </div>
              <div class="stepper-track">
                ${steps.map((st, idx) => `
                  <button class="stepper-node ${idx === curIdx ? 'is-current' : (idx < curIdx ? 'is-done' : '')}"
                          type="button" data-move-os="${os.id}" data-target="${st}">
                    <span>${labels[idx]}</span>
                  </button>
                `).join('')}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderMarkup(container) {
    if (!cachedOrders) return;
    const { counts, orders, scope } = cachedOrders;
    container.innerHTML = '';

    const visibleOrders = orders.filter((o) => {
      if (activeSubTab === 'ESTACIONAMENTO') return o.status === 'AGUARDANDO_PECA';
      if (activeSubTab === 'HISTORICO') return o.status === 'ENTREGUE' || o.status === 'CANCELADA';
      return o.status !== 'AGUARDANDO_PECA' && o.status !== 'CANCELADA';
    });

    let contentHtml = '';
    if (activeSubTab === 'ESTACIONAMENTO') {
      contentHtml = `
        <div class="grid-3">
          ${visibleOrders.length === 0
            ? '<div class="eyebrow">Nenhuma peça estacionada aguardando componente.</div>'
            : visibleOrders.map(renderOrderCard).join('')}
        </div>
      `;
    } else if (activeViewMode === 'LISTA') {
      contentHtml = renderHighDensityList(visibleOrders);
    } else if (activeViewMode === 'STEPPER') {
      contentHtml = renderStepperCards(visibleOrders);
    } else {
      contentHtml = renderKanban(visibleOrders);
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Bancada Viva (FSM) | Filtro: ${escapeHtml(formatEnumLabel(scope.activeFilter))}</div>
          <h1 class="page-title">Produção, Estacionamento &amp; Entregas</h1>
          <p class="page-subtitle">Timestamps passivos, checklist unitário de lote, bloqueio de quitação na entrega e impressão térmica.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" type="button" id="bench-new-lote">Lote Rápido</button>
          <button class="btn btn-accent" type="button" id="bench-new-os">+ Nova OS (F4)</button>
        </div>
      </div>

      <div class="grid-kpis">
        <article class="card kpi-card"><div class="kpi-top"><span class="eyebrow">Fila Entrada</span><span class="led led-blue"></span></div><div class="kpi-value mono">${counts.FILA}</div><div class="kpi-hint">Aguardando bancada</div></article>
        <article class="card kpi-card"><div class="kpi-top"><span class="eyebrow">Na Bancada</span><span class="led led-accent"></span></div><div class="kpi-value mono">${counts.BANCADA}</div><div class="kpi-hint">Em execução técnica</div></article>
        <article class="card kpi-card"><div class="kpi-top"><span class="eyebrow">Aguardando Peça</span><span class="led led-amber"></span></div><div class="kpi-value mono">${counts.AGUARDANDO_PECA}</div><div class="kpi-hint">Estacionamento técnico</div></article>
        <article class="card kpi-card"><div class="kpi-top"><span class="eyebrow">Prontos p/ Retirada</span><span class="led led-green"></span></div><div class="kpi-value mono">${counts.PRONTO}</div><div class="kpi-hint">Entregues: ${counts.ENTREGUE}</div></article>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
        <div class="subtabs" style="margin-bottom:0;">
          <button class="subtab-btn ${activeSubTab === 'BANCADA' ? 'is-active' : ''}" type="button" data-b-sub="BANCADA">Bancada Ativa</button>
          <button class="subtab-btn ${activeSubTab === 'ESTACIONAMENTO' ? 'is-active' : ''}" type="button" data-b-sub="ESTACIONAMENTO">Estacionamento (${counts.AGUARDANDO_PECA})</button>
          <button class="subtab-btn ${activeSubTab === 'HISTORICO' ? 'is-active' : ''}" type="button" data-b-sub="HISTORICO">Entregues / Canceladas</button>
        </div>

        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input class="input" id="bench-search-inp" type="search" value="${escapeHtml(searchFilter)}" placeholder="Filtrar OS ou cliente..." style="width:210px;">
          <div class="seg-switch">
            <button class="seg-btn ${activeViewMode === 'KANBAN' ? 'is-active' : ''}" type="button" data-b-view="KANBAN">Kanban</button>
            <button class="seg-btn ${activeViewMode === 'LISTA' ? 'is-active' : ''}" type="button" data-b-view="LISTA">Lista</button>
            <button class="seg-btn ${activeViewMode === 'STEPPER' ? 'is-active' : ''}" type="button" data-b-view="STEPPER">Stepper</button>
          </div>
        </div>
      </div>

      ${contentHtml}
    `;

    bindBenchEvents(container);
    if (global.CTI_ICONS) global.CTI_ICONS.hydrateIcons(container);
  }

  function bindBenchEvents(container) {
    const reload = () => loadAndRender(container);
    const findOs = (id) => cachedOrders.orders.find((o) => o.id === Number(id));

    document.getElementById('bench-new-os').addEventListener('click', () => {
      global.CTI_MODAL_OS_CHECKIN.openOsCheckinModal({ modo: 'EXPRESS', onCreated: reload });
    });
    document.getElementById('bench-new-lote').addEventListener('click', () => {
      global.CTI_MODAL_OS_CHECKIN.openOsCheckinModal({ modo: 'LOTE', onCreated: reload });
    });

    container.querySelectorAll('[data-b-sub]').forEach((b) => {
      b.addEventListener('click', () => {
        activeSubTab = b.getAttribute('data-b-sub');
        renderMarkup(container);
      });
    });
    container.querySelectorAll('[data-b-view]').forEach((b) => {
      b.addEventListener('click', () => {
        activeViewMode = b.getAttribute('data-b-view');
        renderMarkup(container);
      });
    });

    const inp = document.getElementById('bench-search-inp');
    let timer = null;
    inp.addEventListener('input', () => {
      searchFilter = inp.value;
      clearTimeout(timer);
      timer = setTimeout(reload, 160);
    });

    container.querySelectorAll('[data-move-os]').forEach((b) => {
      b.addEventListener('click', () => {
        const os = findOs(b.getAttribute('data-move-os'));
        if (os) handleStatusTransition(os, b.getAttribute('data-target'), container);
      });
    });

    container.querySelectorAll('[data-park-os]').forEach((b) => {
      b.addEventListener('click', () => {
        const os = findOs(b.getAttribute('data-park-os'));
        if (os) global.CTI_MODALS_BENCH.openParkingReasonModal(os, reload);
      });
    });

    container.querySelectorAll('[data-print-os]').forEach((b) => {
      b.addEventListener('click', () => {
        global.CTI_THERMAL_PRINTER.openPrintPreview(Number(b.getAttribute('data-print-os')));
      });
    });

    container.querySelectorAll('[data-open-os]').forEach((b) => {
      b.addEventListener('click', () => {
        global.CTI_MODALS_BENCH.openOrderDetailModal(Number(b.getAttribute('data-open-os')), reload);
      });
    });
  }

  global.CTI_VIEW_BENCH = {
    renderBenchView: loadAndRender
  };
})(window);
