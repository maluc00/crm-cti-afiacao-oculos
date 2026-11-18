(function attachClientsView(global) {
  'use strict';

  const { apiFetch, formatBrl, escapeHtml, showToast } = global.CTI_STORE;

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  let queryText = '';
  let activeLetter = 'ALL';
  let activeScore = 'ALL';
  let cachedData = null;

  async function loadAndRender(container) {
    const params = new URLSearchParams();
    if (queryText.trim()) params.set('q', queryText.trim());
    if (activeLetter !== 'ALL') params.set('letter', activeLetter);
    if (activeScore !== 'ALL') params.set('score', activeScore);
    const qs = params.toString() ? `?${params.toString()}` : '';
    cachedData = await apiFetch(`/api/clientes${qs}`);
    renderMarkup(container);
  }

  function renderClientRows(clients) {
    if (!clients || clients.length === 0) {
      return '<tr><td colspan="6" style="color:var(--text-secondary);">Nenhum cliente encontrado com os filtros atuais.</td></tr>';
    }
    const { renderStarIcons } = global.CTI_MODALS_CLIENTS;
    return clients.map((cli) => `
      <tr>
        <td>
          <strong>${escapeHtml(cli.nome)}</strong>
          ${cli.eh_vip ? '<span class="badge badge-accent" style="margin-left:6px;">VIP</span>' : ''}
          ${cli.apelido_referencia ? `<div style="font-size:11px;color:var(--text-secondary);">${escapeHtml(cli.apelido_referencia)}</div>` : ''}
        </td>
        <td class="mono">
          <div>${escapeHtml(cli.telefone_formatado)}</div>
          <div style="font-size:10px;color:var(--text-secondary);">${escapeHtml(cli.telefone_e164)}</div>
        </td>
        <td>
          <div class="star-rating">${renderStarIcons(cli.score_efetivo, false)}</div>
          <div class="eyebrow" style="margin-top:3px;">
            ${cli.score_manual !== null ? `Manual (${cli.score_manual}/5)` : `Auto (${cli.score_automatico}/5)`}
          </div>
        </td>
        <td>
          <div class="tag-cloud">
            ${cli.flags.map((f) => `<span class="badge">${escapeHtml(f)}</span>`).join('') || '<span class="eyebrow">Sem tags</span>'}
          </div>
        </td>
        <td class="num">
          <div>${escapeHtml(formatBrl(cli.ltv_acumulado))}</div>
          <div style="font-size:10px;color:var(--text-secondary);">${cli.total_os} OSs</div>
        </td>
        <td class="action-cell">
          <button class="btn btn-sm btn-accent" type="button" data-cli-dossier="${cli.id}">Prontuario</button>
          <button class="btn btn-sm" type="button" data-cli-edit="${cli.id}">Editar</button>
          <button class="btn btn-sm btn-ghost" type="button" data-cli-del="${cli.id}">Inativar</button>
        </td>
      </tr>
    `).join('');
  }

  function renderMarkup(container) {
    if (!cachedData) return;
    const { clients, kpis } = cachedData;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Central CRM &amp; Avaliacao Hibrida (Scoring 1-5)</div>
          <h1 class="page-title">Clientes &amp; Prontuario Tecnico</h1>
          <p class="page-subtitle">Cadastro rapido em 5s, normalizacao E.164, historico de pecas, garantias e score automatico + manual.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" type="button" id="cli-recalc-all">Recalcular Scores</button>
          <button class="btn btn-accent" type="button" id="cli-btn-new">+ Novo Cliente</button>
        </div>
      </div>

      <div class="grid-kpis">
        <article class="card kpi-card">
          <div class="kpi-top"><span class="eyebrow">Carteira Ativa</span><span class="led led-accent"></span></div>
          <div class="kpi-value mono">${kpis.totalCarteira}</div>
          <div class="kpi-hint">Base unificada por WhatsApp E.164</div>
        </article>
        <article class="card kpi-card">
          <div class="kpi-top"><span class="eyebrow">Clientes VIP</span><span class="led led-green"></span></div>
          <div class="kpi-value mono">${kpis.totalVip}</div>
          <div class="kpi-hint">Top LTV / Score 5 / Tag VIP</div>
        </article>
        <article class="card kpi-card">
          <div class="kpi-top"><span class="eyebrow">Score Medio</span><span class="led led-blue"></span></div>
          <div class="kpi-value mono">${Number(kpis.scoreMedio || 0).toFixed(2)}</div>
          <div class="kpi-hint">Escala hibrida de 1 a 5 estrelas</div>
        </article>
        <article class="card kpi-card">
          <div class="kpi-top"><span class="eyebrow">LTV Acumulado</span><span class="led led-green"></span></div>
          <div class="kpi-value mono">${escapeHtml(formatBrl(kpis.ltvTotalCarteira))}</div>
          <div class="kpi-hint">Auditado pelo livro-razao e OSs</div>
        </article>
      </div>

      <section class="card panel">
        <div class="toolbar-row">
          <div class="toolbar-filters">
            <input class="input" id="cli-search-inp" type="search" value="${escapeHtml(queryText)}" placeholder="Buscar por nome, WhatsApp ou apelido..." style="max-width:320px;">
            <select class="select" id="cli-score-filter" style="max-width:200px;">
              <option value="ALL" ${activeScore === 'ALL' ? 'selected' : ''}>Todos os Scores</option>
              <option value="VIP" ${activeScore === 'VIP' ? 'selected' : ''}>Somente VIP</option>
              <option value="4PLUS" ${activeScore === '4PLUS' ? 'selected' : ''}>Score 4 a 5</option>
              <option value="3" ${activeScore === '3' ? 'selected' : ''}>Score Neutro (3)</option>
              <option value="LOW" ${activeScore === 'LOW' ? 'selected' : ''}>Alerta (1 a 2)</option>
            </select>
          </div>
          <span class="badge mono">${clients.length} exibidos</span>
        </div>

        <div class="az-bar" aria-label="Indice alfabetico">
          <button class="az-btn ${activeLetter === 'ALL' ? 'is-active' : ''}" type="button" data-az="ALL">Todos</button>
          ${ALPHABET.map((l) => `
            <button class="az-btn ${activeLetter === l ? 'is-active' : ''}" type="button" data-az="${l}">${l}</button>
          `).join('')}
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Cliente / Referencia</th>
                <th>WhatsApp (E.164)</th>
                <th>Scoring</th>
                <th>Flags de Perfil</th>
                <th class="num">LTV / OSs</th>
                <th style="text-align:right;">Acoes</th>
              </tr>
            </thead>
            <tbody>${renderClientRows(clients)}</tbody>
          </table>
        </div>
      </section>
    `;

    bindEvents(container);
  }

  function bindEvents(container) {
    const mod = global.CTI_MODALS_CLIENTS;
    const reload = () => loadAndRender(container);

    let searchTimer = null;
    const searchInp = document.getElementById('cli-search-inp');
    searchInp.addEventListener('input', () => {
      queryText = searchInp.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        await reload();
        const next = document.getElementById('cli-search-inp');
        if (next) {
          next.focus();
          next.setSelectionRange(queryText.length, queryText.length);
        }
      }, 150);
    });

    document.getElementById('cli-score-filter').addEventListener('change', (ev) => {
      activeScore = ev.target.value;
      reload();
    });

    container.querySelectorAll('[data-az]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeLetter = btn.getAttribute('data-az');
        reload();
      });
    });

    document.getElementById('cli-btn-new').addEventListener('click', () => {
      mod.openClientFormModal({ onSaved: reload });
    });

    document.getElementById('cli-recalc-all').addEventListener('click', async () => {
      const res = await apiFetch('/api/clientes/recalcular-scores', { method: 'POST' });
      showToast(`${res.recalculated} scores recalculados.`, 'ok');
      reload();
    });

    container.querySelectorAll('[data-cli-dossier]').forEach((btn) => {
      btn.addEventListener('click', () => {
        mod.openClientDossierModal({
          clientId: Number(btn.getAttribute('data-cli-dossier')),
          profileFlagsCatalog: cachedData.profileFlagsCatalog,
          onUpdated: reload
        });
      });
    });

    container.querySelectorAll('[data-cli-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-cli-edit'));
        const cli = cachedData.clients.find((c) => c.id === id);
        if (cli) mod.openClientFormModal({ existing: cli, onSaved: reload });
      });
    });

    container.querySelectorAll('[data-cli-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-cli-del'));
        await apiFetch(`/api/clientes/${id}`, { method: 'DELETE' });
        showToast('Cliente inativado (Soft Delete).', 'ok');
        reload();
      });
    });
  }

  global.CTI_VIEW_CLIENTS = {
    renderClientsView: loadAndRender
  };
})(window);
