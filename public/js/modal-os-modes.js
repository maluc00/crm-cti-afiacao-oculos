(function attachOsModes(global) {
  'use strict';

  const { apiFetch, roundMoney, formatBrl, formatEnumLabel, escapeHtml, showToast } = global.CTI_STORE;

  const LENS_TYPES = [
    { val: 'MULTIFOCAL', label: 'Multifocal' },
    { val: 'VISAO_SIMPLES', label: 'Visão Simples' },
    { val: 'SOLAR', label: 'Solar' },
    { val: 'SEM_LENTE', label: 'Sem Lente' }
  ];

  const LENS_DAMAGE_CHIPS = [
    'Microtrincas/Bisel',
    'Riscos Ópticos',
    'Antirreflexo Craquelado',
    'Trinca Furação/Rimless',
    'Película Descolando',
    'Lente Ressecada',
    'Ciente Desmonte'
  ];

  const OPTICAL_DAMAGE_CHIPS = [
    'Ponte',
    'Charneira Direita',
    'Charneira Esquerda',
    'Aro Direito',
    'Aro Esquerdo',
    'Haste Direita',
    'Haste Esquerda',
    'Plaqueta D',
    'Plaqueta E'
  ];

  const CUTLERY_DAMAGE_CHIPS = [
    'Ponta Caída/Curta',
    'Mola Quebrada',
    'Folga no Eixo',
    'Oxidação',
    'Dente Quebrado'
  ];

  function parseMultiplierQuery(raw) {
    const clean = String(raw || '').trim();
    const m = /^(\d+)\s*[xX*]\s*(.+)$/.exec(clean);
    if (m) {
      return { qty: Math.max(1, Number(m[1])), term: m[2].trim() };
    }
    return { qty: 1, term: clean };
  }

  function buildUnifiedCatalogOptions(bootstrap, dominio) {
    const allowed = [dominio, 'AMBOS'];
    const combos = (bootstrap.combos || [])
      .filter((c) => allowed.includes(c.dominio))
      .map((c) => ({
        key: `CMB-${c.id}`,
        combo_id: c.id,
        item_id: null,
        tipo: 'COMBO',
        label: `[COMBO] ${c.abreviacao}`,
        sublabel: c.nome,
        meta: formatBrl(c.preco_combo),
        preco: roundMoney(c.preco_combo),
        freq: 999,
        raw: c
      }));

    const items = (bootstrap.catalog || [])
      .filter((i) => allowed.includes(i.dominio))
      .map((i) => ({
        key: `ITM-${i.id}`,
        item_id: i.id,
        combo_id: null,
        tipo: i.tipo,
        label: i.abreviacao_balcao,
        sublabel: `${i.tipo} | ${i.nome_tecnico}`,
        meta: formatBrl(i.preco_venda),
        preco: roundMoney(i.preco_venda),
        freq: Number(i.frequencia_uso || 0),
        raw: i
      }));

    return combos.concat(items).sort((a, b) => b.freq - a.freq);
  }

  function createExpressCatalogSpotlight(container, bootstrap, draft, onAddLine) {
    const renderSpotlight = () => {
      const options = buildUnifiedCatalogOptions(bootstrap, draft.dominio);
      container.innerHTML = `
        <div class="field" style="gap:4px;">
          <label>Busca Global: Serviços, Combos &amp; Produtos (ex: "4x Mola", "Solda" ou selecione Top 10)</label>
          <div class="spotlight-select">
            <div class="spotlight-select-control">
              <input class="input spotlight-select-input" id="os-exp-search" type="search"
                     placeholder="Foque para ver Top 10 ou digite 4x Mola..." autocomplete="off">
              <span class="icon spotlight-select-caret" data-icon="bolt"></span>
            </div>
            <div class="spotlight-popover hidden" id="os-exp-popover"></div>
          </div>
        </div>
      `;
      if (global.CTI_ICONS) global.CTI_ICONS.hydrateIcons(container);

      const input = document.getElementById('os-exp-search');
      const popover = document.getElementById('os-exp-popover');
      let hi = 0;
      let inlineOpen = false;

      const filterList = () => {
        const { qty, term } = parseMultiplierQuery(input.value);
        const q = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const matches = !q
          ? options.slice(0, 10)
          : options.filter((o) =>
              `${o.label} ${o.sublabel}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q)
            ).slice(0, 12);
        return { qty, term, matches };
      };

      const renderPop = () => {
        const { qty, term, matches } = filterList();
        if (hi >= matches.length) hi = Math.max(0, matches.length - 1);

        const listHtml = matches.length === 0
          ? '<div class="eyebrow" style="padding:8px;">Nenhum serviço ou combo encontrado.</div>'
          : matches.map((m, idx) => `
              <button class="spotlight-option ${idx === hi ? 'is-highlighted' : ''}" type="button" data-exp-opt="${idx}">
                <div>
                  <span style="font-weight:700;">${qty > 1 ? `${qty}x ` : ''}${escapeHtml(m.label)}</span>
                  <div style="font-size:11px;color:var(--text-secondary);">${escapeHtml(m.sublabel)}</div>
                </div>
                <span class="spotlight-option-meta">${escapeHtml(m.meta)}</span>
              </button>
            `).join('');

        const inlineHtml = inlineOpen
          ? `<div class="spotlight-inline-create">
               <div class="eyebrow">Novo Serviço Inline (sem fechar a OS)</div>
               <div class="field-grid">
                 <input class="input" id="os-inl-nome" type="text" placeholder="Nome Técnico" value="${escapeHtml(term)}">
                 <input class="input" id="os-inl-abrev" type="text" placeholder="Abreviação Balcão" value="${escapeHtml(term)}">
               </div>
               <div style="display:flex;gap:8px;align-items:center;">
                 <input class="input mono" id="os-inl-preco" type="number" min="0" step="0.01" placeholder="Preço R$" value="40.00" style="max-width:130px;">
                 <button class="btn btn-sm" type="button" id="os-inl-cancel">Cancelar</button>
                 <button class="btn btn-sm btn-accent" type="button" id="os-inl-save">Cadastrar e Inserir</button>
               </div>
             </div>`
          : `<button class="spotlight-inline-btn" type="button" id="os-inl-open">+ Novo Item Inline${term ? `: "${escapeHtml(term)}"` : ''}</button>`;

        popover.innerHTML = listHtml + inlineHtml;

        popover.querySelectorAll('[data-exp-opt]').forEach((btn) => {
          btn.addEventListener('mousedown', (ev) => ev.preventDefault());
          btn.addEventListener('click', () => {
            const picked = matches[Number(btn.getAttribute('data-exp-opt'))];
            if (picked) {
              onAddLine(picked, qty);
              input.value = '';
              popover.classList.add('hidden');
            }
          });
        });

        const openInl = document.getElementById('os-inl-open');
        if (openInl) {
          openInl.addEventListener('mousedown', (ev) => ev.preventDefault());
          openInl.addEventListener('click', () => {
            inlineOpen = true;
            renderPop();
            document.getElementById('os-inl-nome')?.focus();
          });
        }
        document.getElementById('os-inl-cancel')?.addEventListener('click', () => {
          inlineOpen = false;
          renderPop();
          input.focus();
        });
        document.getElementById('os-inl-save')?.addEventListener('click', async () => {
          try {
            const nome = document.getElementById('os-inl-nome').value.trim();
            const abrev = document.getElementById('os-inl-abrev').value.trim() || nome;
            const preco = Number(document.getElementById('os-inl-preco').value || 0);
            const created = await apiFetch('/api/catalogo/itens', {
              method: 'POST',
              body: JSON.stringify({
                tipo: 'SERVICO',
                dominio: draft.dominio,
                nome_tecnico: nome,
                abreviacao_balcao: abrev,
                preco_venda: preco
              })
            });
            bootstrap.catalog.unshift(created);
            inlineOpen = false;
            popover.classList.add('hidden');
            onAddLine({
              key: `ITM-${created.id}`,
              item_id: created.id,
              combo_id: null,
              tipo: 'SERVICO',
              label: created.abreviacao_balcao,
              preco: roundMoney(created.preco_venda)
            }, qty);
            input.value = '';
            showToast(`Serviço "${created.abreviacao_balcao}" criado inline.`, 'ok');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      };

      input.addEventListener('focus', () => {
        popover.classList.remove('hidden');
        renderPop();
      });
      input.addEventListener('input', () => {
        hi = 0;
        popover.classList.remove('hidden');
        renderPop();
      });
      input.addEventListener('keydown', (ev) => {
        if (inlineOpen) return;
        const { qty, matches } = filterList();
        if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          popover.classList.remove('hidden');
          hi = matches.length ? (hi + 1) % matches.length : 0;
          renderPop();
        } else if (ev.key === 'ArrowUp') {
          ev.preventDefault();
          hi = matches.length ? (hi - 1 + matches.length) % matches.length : 0;
          renderPop();
        } else if (ev.key === 'Enter' && !popover.classList.contains('hidden') && matches[hi]) {
          ev.preventDefault();
          onAddLine(matches[hi], qty);
          input.value = '';
          popover.classList.add('hidden');
        } else if (ev.key === 'Escape') {
          popover.classList.add('hidden');
        }
      });
      document.addEventListener('click', (ev) => {
        if (!container.contains(ev.target)) popover.classList.add('hidden');
      });
    };

    renderSpotlight();
  }

  function computeFinancialTotals(draft) {
    const subtotal = roundMoney(draft.itens.reduce((acc, it) => acc + roundMoney(it.preco * it.quantidade), 0));
    const descVal = Math.max(0, roundMoney(draft.desconto_valor || 0));
    const descAplicado = draft.desconto_tipo === 'PERCENTUAL'
      ? roundMoney(subtotal * (Math.min(100, descVal) / 100))
      : roundMoney(Math.min(subtotal, descVal));
    const total = draft.eh_cortesia ? 0 : roundMoney(Math.max(0, subtotal - descAplicado));

    let pago = 0;
    if (!draft.eh_cortesia) {
      if (draft.pagamento_modo === 'QUITADO') pago = total;
      else if (draft.pagamento_modo === 'SINAL') pago = Math.min(total, Math.max(0, roundMoney(draft.valor_sinal || 0)));
    }
    const saldo = roundMoney(Math.max(0, total - pago));
    const troco = draft.meio_pagamento === 'ESPECIE' && Number(draft.valor_recebido || 0) > pago
      ? roundMoney(Number(draft.valor_recebido) - pago)
      : 0;
    return { subtotal, total, pago, saldo, troco };
  }

  function renderFinancialRulerHtml(draft) {
    const fin = computeFinancialTotals(draft);
    return `
      <div class="os-fin-ruler">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;">
          <div style="display:flex;gap:6px;align-items:center;">
            <select class="select" id="os-desc-tipo" style="width:74px;padding:5px 8px;">
              <option value="VALOR" ${draft.desconto_tipo === 'VALOR' ? 'selected' : ''}>R$</option>
              <option value="PERCENTUAL" ${draft.desconto_tipo === 'PERCENTUAL' ? 'selected' : ''}>%</option>
            </select>
            <input class="input mono" id="os-desc-val" type="number" min="0" step="0.01" value="${draft.desconto_valor}" style="width:94px;padding:5px 8px;" placeholder="Desc.">
            <button class="btn btn-sm ${draft.eh_cortesia ? 'btn-accent' : ''}" type="button" id="os-btn-cortesia">Cortesia</button>
          </div>
          <div class="seg-switch">
            <button class="seg-btn ${draft.pagamento_modo === 'NA_RETIRADA' ? 'is-active' : ''}" type="button" data-pay-mode="NA_RETIRADA">Na Retirada</button>
            <button class="seg-btn ${draft.pagamento_modo === 'SINAL' ? 'is-active' : ''}" type="button" data-pay-mode="SINAL">Sinal</button>
            <button class="seg-btn ${draft.pagamento_modo === 'QUITADO' ? 'is-active' : ''}" type="button" data-pay-mode="QUITADO">Quitado</button>
          </div>
        </div>

        ${draft.pagamento_modo !== 'NA_RETIRADA' && !draft.eh_cortesia ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            ${draft.pagamento_modo === 'SINAL' ? `
              <input class="input mono" id="os-sinal-val" type="number" min="0" step="0.01" value="${draft.valor_sinal}" placeholder="Sinal R$" style="max-width:120px;">
            ` : ''}
            <select class="select" id="os-meio-pag" style="max-width:170px;">
              <option value="ESPECIE" ${draft.meio_pagamento === 'ESPECIE' ? 'selected' : ''}>Dinheiro (Espécie)</option>
              <option value="PIX" ${draft.meio_pagamento === 'PIX' ? 'selected' : ''}>PIX</option>
              <option value="CARTAO_DEBITO" ${draft.meio_pagamento === 'CARTAO_DEBITO' ? 'selected' : ''}>Cartão Débito</option>
              <option value="CARTAO_CREDITO" ${draft.meio_pagamento === 'CARTAO_CREDITO' ? 'selected' : ''}>Cartão Crédito</option>
            </select>
            ${draft.meio_pagamento === 'ESPECIE' ? `
              <input class="input mono" id="os-recebido-val" type="number" min="0" step="0.01" value="${draft.valor_recebido || ''}" placeholder="Recebido p/ troco" style="max-width:150px;">
              <span class="mono" id="os-troco-readout" style="font-size:12px;">Troco: ${escapeHtml(formatBrl(fin.troco))}</span>
            ` : ''}
          </div>
        ` : ''}

        <div class="combo-summary-strip" style="background:var(--bg-card);">
          <div><div class="combo-metric-label">Subtotal</div><div class="combo-metric-value" id="fin-sub">${escapeHtml(formatBrl(fin.subtotal))}</div></div>
          <div><div class="combo-metric-label">Total OS</div><div class="combo-metric-value" id="fin-tot">${escapeHtml(formatBrl(fin.total))}</div></div>
          <div><div class="combo-metric-label">Pago Agora</div><div class="combo-metric-value" id="fin-pag">${escapeHtml(formatBrl(fin.pago))}</div></div>
          <div><div class="combo-metric-label">Saldo Devedor</div><div class="combo-metric-value" id="fin-sal" style="color:var(--accent-color);">${escapeHtml(formatBrl(fin.saldo))}</div></div>
        </div>

        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
          <input type="checkbox" id="os-fluxo-direto" ${draft.fluxo_direto_bancada ? 'checked' : ''}>
          <span>Baixa automática de insumos (BOM) e enviar direto para Bancada Técnica</span>
        </label>
        ${fin.saldo === 0 && draft.itens.length > 0 ? `
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
            <input type="checkbox" id="os-entregar-hora" ${draft.entregar_na_hora ? 'checked' : ''}>
            <span>Finalizar e Entregar na Hora (OS já quitada)</span>
          </label>
        ` : ''}
      </div>
    `;
  }

  function renderCompleteDiagnosticsHtml(bootstrap, draft) {
    const isOptical = draft.dominio === 'OPTICA';
    const damageChips = isOptical ? OPTICAL_DAMAGE_CHIPS : CUTLERY_DAMAGE_CHIPS;
    const partnersEnabled = bootstrap.partners_mode_enabled === '1';

    return `
      <div class="field" style="gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border-subtle);">
        <div class="field-grid">
          ${partnersEnabled ? `
            <div class="field">
              <label for="os-parceiro-sel">Técnico Executor (Parceiros)</label>
              <select class="select" id="os-parceiro-sel">
                ${(bootstrap.partners || []).map((p) => `
                  <option value="${p.id}" ${Number(draft.parceiro_id) === p.id ? 'selected' : ''}>${escapeHtml(p.nome)}</option>
                `).join('')}
              </select>
            </div>
          ` : ''}
          <div class="field">
            <label>Prioridade / SLA</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${['PADRAO', 'URGENTE', 'AGENDADO'].map((sla) => `
                <button class="tech-chip ${draft.prioridade_sla === sla ? 'is-active' : ''}" type="button" data-sla-opt="${sla}">${escapeHtml(formatEnumLabel(sla))}</button>
              `).join('')}
              ${draft.prioridade_sla === 'AGENDADO' ? `
                <input class="input mono" id="os-prazo-dt" type="datetime-local" value="${escapeHtml(draft.prazo_prometido_em || '')}" style="max-width:200px;">
              ` : ''}
            </div>
          </div>
        </div>

        <div class="field-grid">
          <div class="field">
            <label for="os-marca-inp">${isOptical ? 'Marca / Modelo da Armação' : 'Instrumento / Marca (ex: Mundial 722, 777)'}</label>
            <input class="input" id="os-marca-inp" type="text" value="${escapeHtml(draft.marca_modelo || '')}" placeholder="${isOptical ? 'Ex: Ray-Ban Aviator / Acetato Tartaruga' : 'Ex: Alicate Mundial 777'}">
          </div>
          <div class="field">
            <label>Material (Auto-Aprendizado)</label>
            <div id="os-material-spot"></div>
          </div>
        </div>

        <div class="field">
          <label>${isOptical ? 'Local da Avaria (Multi-seleção)' : 'Condição de Entrada (Multi-seleção)'}</label>
          <div class="chip-grid">
            ${damageChips.map((ch) => `
              <button class="tech-chip ${draft.locais_avaria.includes(ch) ? 'is-active' : ''}" type="button" data-avaria-chip="${escapeHtml(ch)}">${escapeHtml(ch)}</button>
            `).join('')}
          </div>
        </div>

        ${isOptical ? `
          <div class="card panel" style="padding:10px 12px;background:var(--bg-input);">
            <div class="eyebrow" style="margin-bottom:6px;">Diagnóstico e Resguardo: Estado das Lentes</div>
            <div class="chip-grid" style="margin-bottom:8px;">
              ${LENS_TYPES.map((lt) => `
                <button class="tech-chip ${draft.tipo_lente === lt.val ? 'is-active' : ''}" type="button" data-lens-type="${lt.val}">${escapeHtml(lt.label)}</button>
              `).join('')}
            </div>
            <div class="chip-grid">
              ${LENS_DAMAGE_CHIPS.map((st) => `
                <button class="tech-chip ${draft.estado_lentes.includes(st) ? 'is-active' : ''}" type="button" data-lens-state="${escapeHtml(st)}">${escapeHtml(st)}</button>
              `).join('')}
            </div>
          </div>
        ` : `
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
            <input type="checkbox" id="os-desmembrar-lote" ${draft.desmembrar_lote ? 'checked' : ''}>
            <span>Desmembrar quantidade em checklist unitário na bancada (ex: 0/10 peças concluídas)</span>
          </label>
        `}

        <div class="field">
          <label for="os-obs-inp">Observações Técnicas</label>
          <input class="input" id="os-obs-inp" type="text" value="${escapeHtml(draft.observacoes || '')}" placeholder="Detalhes de solda, folga, observações do cliente...">
        </div>
      </div>
    `;
  }

  global.CTI_OS_MODES = {
    createExpressCatalogSpotlight,
    computeFinancialTotals,
    renderFinancialRulerHtml,
    renderCompleteDiagnosticsHtml
  };
})(window);
