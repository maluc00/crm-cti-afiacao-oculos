(function attachShellViews(global) {
  'use strict';

  const { state, formatBrl, formatEnumLabel, escapeHtml } = global.CTI_STORE;

  function renderCatalogRows(items) {
    if (!items || items.length === 0) {
      return '<tr><td colspan="5" style="color:var(--text-secondary);">Nenhum item ativo para o domínio atual.</td></tr>';
    }
    return items.map((item) => `
      <tr>
        <td class="mono">${escapeHtml(item.codigo_sku)}</td>
        <td>
          <strong>${escapeHtml(item.abreviacao_balcao)}</strong>
          <div style="font-size:11px;color:var(--text-secondary);">${escapeHtml(item.nome_tecnico)}</div>
        </td>
        <td><span class="badge">${escapeHtml(formatEnumLabel(item.tipo))}</span></td>
        <td><span class="badge badge-accent">${escapeHtml(formatEnumLabel(item.dominio))}</span></td>
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
            <h2 class="panel-title">Técnicos Habilitados &amp; Regras de Comissão</h2>
          </div>
          <span class="badge badge-accent">${overview.partners.length} ativos</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Técnico</th>
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

  function renderOperationalView(container) {
    const overview = state.overview;
    if (!overview) return;
    container.innerHTML = '';

    const { kpis, scope, settings } = overview;
    const services = overview.catalogItems.filter((i) => i.tipo === 'SERVICO');
    const preClient = state.preselectedClientForOs;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Check-in Ágil de Balcão | Filtro: ${escapeHtml(formatEnumLabel(scope.activeFilter))}</div>
          <h1 class="page-title">Atendimento &amp; Balcão Express</h1>
          <p class="page-subtitle">Catálogo ativo filtrado em tempo real pelo Camaleão de Domínio e memória de atributos.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-accent" type="button" id="view-open-os-express">+ Nova OS (F4)</button>
          <button class="btn" type="button" id="view-open-os-completo">Perícia Completa</button>
          <button class="btn" type="button" id="view-open-os-lote">Lote Rápido</button>
        </div>
      </div>

      ${preClient ? `
        <div class="card panel" style="margin-bottom:16px;border-color:var(--accent-color);background-color:var(--accent-soft);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <div class="eyebrow">Cliente Pré-Selecionado do Prontuário (Pronto para Abertura de OS)</div>
              <div style="font-size:15px;font-weight:700;margin-top:3px;">
                ${escapeHtml(preClient.nome)}
                <span class="mono" style="font-size:12px;font-weight:400;margin-left:8px;">${escapeHtml(preClient.telefone_formatado)}</span>
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-sm btn-accent" type="button" id="view-start-os-preclient">+ Abrir OS Agora</button>
              <button class="btn btn-sm" type="button" id="view-clear-preclient">Limpar Seleção</button>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="grid-kpis">
        <article class="card kpi-card">
          <div class="kpi-top">
            <span class="eyebrow">Serviços Ativos</span>
            <span class="led led-accent"></span>
          </div>
          <div class="kpi-value mono">${kpis.servicesCount}</div>
          <div class="kpi-hint">Filtro: ${escapeHtml(formatEnumLabel(scope.activeFilter))} (${escapeHtml(settings.operation_mode)})</div>
        </article>
        <article class="card kpi-card">
          <div class="kpi-top">
            <span class="eyebrow">Produtos &amp; Insumos</span>
            <span class="led ${kpis.stockAlerts > 0 ? 'led-amber' : 'led-green'}"></span>
          </div>
          <div class="kpi-value mono">${kpis.productsCount + kpis.insumosCount}</div>
          <div class="kpi-hint">${kpis.stockAlerts} itens em alerta mínimo</div>
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
              <div class="eyebrow">Catálogo Homologado</div>
              <h2 class="panel-title">Tabela de Serviços Ativa</h2>
            </div>
            <span class="badge badge-accent mono">${services.length} itens</span>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th>Domínio</th>
                  <th class="num">Valor</th>
                </tr>
              </thead>
              <tbody>${renderCatalogRows(services)}</tbody>
            </table>
          </div>
        </section>

        <section class="card panel">
          <div class="panel-head">
            <div>
              <div class="eyebrow">Memória Spotlight</div>
              <h2 class="panel-title">Atributos &amp; Combos Disponíveis</h2>
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
                    <div class="eyebrow">${escapeHtml(formatEnumLabel(c.dominio))} | Economia ${escapeHtml(formatBrl(c.economia_gerada))}</div>
                  </div>
                  <div class="mono" style="font-weight:700;">${escapeHtml(formatBrl(c.preco_combo))}</div>
                </div>
              `).join('') || '<div class="eyebrow">Nenhum combo para este domínio.</div>'}
            </div>
          </div>
        </section>
      </div>

      ${renderPartnersCard(overview)}
    `;

    document.getElementById('view-open-os-express')?.addEventListener('click', () =>
      global.CTI_MODAL_OS_CHECKIN.openOsCheckinModal({ modo: 'EXPRESS', onCreated: () => renderOperationalView(container) })
    );
    document.getElementById('view-open-os-completo')?.addEventListener('click', () =>
      global.CTI_MODAL_OS_CHECKIN.openOsCheckinModal({ modo: 'COMPLETO', onCreated: () => renderOperationalView(container) })
    );
    document.getElementById('view-open-os-lote')?.addEventListener('click', () =>
      global.CTI_MODAL_OS_CHECKIN.openOsCheckinModal({ modo: 'LOTE', onCreated: () => renderOperationalView(container) })
    );
    document.getElementById('view-start-os-preclient')?.addEventListener('click', () =>
      global.CTI_MODAL_OS_CHECKIN.openOsCheckinModal({ modo: 'COMPLETO', cliente: preClient, onCreated: () => renderOperationalView(container) })
    );
    const clearPreBtn = document.getElementById('view-clear-preclient');
    if (clearPreBtn) {
      clearPreBtn.addEventListener('click', () => {
        state.preselectedClientForOs = null;
        renderOperationalView(container);
      });
    }
  }

  function renderUpcomingPhaseView(container, route) {
    container.innerHTML = '';
    const isCaixa = route === 'caixa';
    const meta = isCaixa
      ? {
          eyebrow: 'Financeiro & Livro-Razão | Atalho F2',
          title: 'Caixa & Ledger',
          subtitle: 'Abertura, fechamento cego em espécie, conciliação de taxas e livro-razão imutável.',
          badge: 'Implementação prevista para a Fase 4',
          heading: 'Módulo estruturado no banco de dados — Implementação prevista para a Fase 4',
          description: 'As tabelas caixa_sessoes e caixa_ledger (protegidas pelas triggers imutáveis trg_ledger_block_update e trg_ledger_block_delete) já registram entradas de OS, sinais e abertura rápida de turno. O painel dedicado de PDV, sangria, suprimento, conciliação de cartões e fechamento cego será entregue na Fase 4.'
        }
      : {
          eyebrow: 'Inteligência Gerencial & Histórico',
          title: 'BI & Indicadores',
          subtitle: 'Comparativo multi-anual (YoY), margem de contribuição, ponto de equilíbrio e importação Excel.',
          badge: 'Implementação prevista para a Fase 5',
          heading: 'Módulo estruturado no banco de dados — Implementação prevista para a Fase 5',
          description: 'A estrutura de historico_consolidado_legado, metas mensais (monthly_goals_json) e custos fixos (fixed_costs_json) já está homologada no banco central SQLite. Os painéis executivos YoY, PA, QNT, ponto de equilíbrio e importação de planilhas históricas serão entregues na próxima etapa de BI.'
        };

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">${escapeHtml(meta.eyebrow)}</div>
          <h1 class="page-title">${escapeHtml(meta.title)}</h1>
          <p class="page-subtitle">${escapeHtml(meta.subtitle)}</p>
        </div>
        <span class="badge badge-accent">${escapeHtml(meta.badge)}</span>
      </div>

      <section class="card panel" style="max-width:780px;">
        <div class="eyebrow" style="margin-bottom:6px;">Arquitetura Pronta no SQLite | Próxima Fase</div>
        <h2 class="panel-title" style="font-size:17px;margin-bottom:10px;">${escapeHtml(meta.heading)}</h2>
        <p class="page-subtitle" style="line-height:1.65;margin-bottom:18px;">${escapeHtml(meta.description)}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${isCaixa ? '<button class="btn btn-accent" type="button" id="upcoming-open-cash">Gerenciar Turno Rápido</button>' : ''}
          <button class="btn" type="button" id="upcoming-go-home">Voltar para Atendimento &amp; OS</button>
        </div>
      </section>
    `;

    document.getElementById('upcoming-open-cash')?.addEventListener('click', () =>
      global.CTI_MODALS.openCashSemaphoreModal()
    );
    document.getElementById('upcoming-go-home')?.addEventListener('click', () =>
      global.CTI_APP.navigate('atendimento')
    );
  }

  global.CTI_VIEWS_SHELL = {
    renderOperationalView,
    renderUpcomingPhaseView
  };
})(window);
