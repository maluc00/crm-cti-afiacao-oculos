(function attachOsCheckinModal(global) {
  'use strict';

  const { state, apiFetch, roundMoney, formatBrl, formatEnumLabel, escapeHtml, showToast, refreshOverview } = global.CTI_STORE;
  const { openModal, closeModal } = global.CTI_MODALS;
  const modes = global.CTI_OS_MODES;

  function renderQuickBatchView(container, bootstrap, draft, onSuccess) {
    const today = new Date().toISOString().slice(0, 10);
    const rows = draft.batchRows || [
      { item_id: bootstrap.catalog[0]?.id || '', combo_id: null, label: bootstrap.catalog[0]?.abreviacao_balcao || '', quantidade: 1, valor_unitario: bootstrap.catalog[0]?.preco_venda || 0, meio_pagamento: 'ESPECIE' }
    ];
    draft.batchRows = rows;

    const renderBatch = () => {
      const catOpts = (bootstrap.catalog || []).filter((i) => i.dominio === draft.dominio || i.dominio === 'AMBOS');
      const totalDia = roundMoney(rows.reduce((a, r) => a + (Number(r.quantidade) * Number(r.valor_unitario)), 0));

      container.innerHTML = `
        <div class="field" style="gap:10px;" data-dirty-form="true">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div class="field" style="max-width:170px;">
              <label for="batch-date">Data Competência</label>
              <input class="input mono" id="batch-date" type="date" value="${escapeHtml(draft.batchDate || today)}">
            </div>
            <button class="btn btn-sm" type="button" id="batch-add-row">+ Adicionar Linha</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${rows.map((r, idx) => `
              <div class="batch-grid-row">
                <select class="select" data-b-item="${idx}">
                  ${catOpts.map((c) => `
                    <option value="${c.id}" ${Number(r.item_id) === c.id ? 'selected' : ''}>${escapeHtml(c.abreviacao_balcao)} (${escapeHtml(formatBrl(c.preco_venda))})</option>
                  `).join('')}
                </select>
                <input class="input mono" type="number" min="1" step="1" value="${r.quantidade}" data-b-qty="${idx}">
                <input class="input mono" type="number" min="0" step="0.01" value="${Number(r.valor_unitario).toFixed(2)}" data-b-val="${idx}">
                <select class="select" data-b-pay="${idx}">
                  <option value="ESPECIE" ${r.meio_pagamento === 'ESPECIE' ? 'selected' : ''}>Dinheiro (Espécie)</option>
                  <option value="PIX" ${r.meio_pagamento === 'PIX' ? 'selected' : ''}>PIX</option>
                  <option value="CARTAO_DEBITO" ${r.meio_pagamento === 'CARTAO_DEBITO' ? 'selected' : ''}>Débito</option>
                  <option value="CARTAO_CREDITO" ${r.meio_pagamento === 'CARTAO_CREDITO' ? 'selected' : ''}>Crédito</option>
                </select>
                <button class="btn btn-sm btn-ghost" type="button" data-b-del="${idx}">X</button>
              </div>
            `).join('')}
          </div>
          <div class="switch-row">
            <span class="eyebrow">Total do Lote (${rows.length} atendimentos P.A + baixa BOM)</span>
            <strong class="mono">${escapeHtml(formatBrl(totalDia))}</strong>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;">
            <button class="btn" type="button" id="batch-cancel">Cancelar</button>
            <button class="btn btn-accent" type="button" id="batch-submit">Registrar Lote no Caixa</button>
          </div>
        </div>
      `;

      document.getElementById('batch-date').addEventListener('change', (ev) => {
        draft.batchDate = ev.target.value;
      });
      document.getElementById('batch-add-row').addEventListener('click', () => {
        const first = catOpts[0];
        rows.push({
          item_id: first?.id || '',
          combo_id: null,
          quantidade: 1,
          valor_unitario: first?.preco_venda || 0,
          meio_pagamento: 'ESPECIE'
        });
        renderBatch();
      });
      container.querySelectorAll('[data-b-item]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const i = Number(sel.getAttribute('data-b-item'));
          const found = catOpts.find((c) => c.id === Number(sel.value));
          rows[i].item_id = Number(sel.value);
          if (found) rows[i].valor_unitario = found.preco_venda;
          renderBatch();
        });
      });
      container.querySelectorAll('[data-b-qty]').forEach((inp) => {
        inp.addEventListener('input', () => {
          rows[Number(inp.getAttribute('data-b-qty'))].quantidade = Math.max(1, Number(inp.value || 1));
        });
      });
      container.querySelectorAll('[data-b-val]').forEach((inp) => {
        inp.addEventListener('input', () => {
          rows[Number(inp.getAttribute('data-b-val'))].valor_unitario = roundMoney(inp.value || 0);
        });
      });
      container.querySelectorAll('[data-b-pay]').forEach((sel) => {
        sel.addEventListener('change', () => {
          rows[Number(sel.getAttribute('data-b-pay'))].meio_pagamento = sel.value;
        });
      });
      container.querySelectorAll('[data-b-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (rows.length > 1) {
            rows.splice(Number(btn.getAttribute('data-b-del')), 1);
            renderBatch();
          }
        });
      });
      document.getElementById('batch-cancel').addEventListener('click', closeModal);
      document.getElementById('batch-submit').addEventListener('click', async () => {
        try {
          const res = await apiFetch('/api/os/lote-rapido', {
            method: 'POST',
            body: JSON.stringify({
              dominio: draft.dominio,
              data_competencia: document.getElementById('batch-date').value,
              linhas: rows
            })
          });
          await closeModal();
          await refreshOverview('os:batch');
          showToast(`${res.count} atendimentos em lote gravados no caixa e BOM.`, 'ok');
          if (onSuccess) onSuccess();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    };

    renderBatch();
  }

  async function openOsCheckinModal(options = {}) {
    openModal('Check-in de Ordem de Serviço', '<div class="eyebrow">Carregando catálogo e memória...</div>', true);
    const backdrop = document.getElementById('modal-backdrop');
    const panel = document.getElementById('modal-panel');
    backdrop.classList.add('is-blur-strong');
    panel.classList.add('modal-xl');

    try {
      const bootstrap = await apiFetch('/api/os/bootstrap');
      const preClient = options.cliente || state.preselectedClientForOs || null;
      const defaultDomain = bootstrap.operation_mode === 'CUTLERY_ONLY'
        ? 'CUTELARIA'
        : (state.domainFilter === 'CUTELARIA' && bootstrap.operation_mode === 'HYBRID' ? 'CUTELARIA' : 'OPTICA');

      const draft = {
        modo_abertura: options.modo || 'EXPRESS',
        dominio: defaultDomain,
        cliente_id: preClient ? preClient.id : null,
        cliente_nome: preClient ? preClient.nome : '',
        parceiro_id: bootstrap.partners?.[0]?.id || null,
        prioridade_sla: 'PADRAO',
        prazo_prometido_em: '',
        marca_modelo: '',
        material_peca: '',
        locais_avaria: [],
        tipo_lente: 'N/A',
        estado_lentes: [],
        observacoes: '',
        desmembrar_lote: false,
        itens: [],
        desconto_tipo: 'VALOR',
        desconto_valor: 0,
        eh_cortesia: false,
        pagamento_modo: 'NA_RETIRADA',
        meio_pagamento: 'ESPECIE',
        valor_sinal: 0,
        valor_recebido: 0,
        fluxo_direto_bancada: true,
        entregar_na_hora: false,
        queuedPhotos: [],
        warrantyAlert: null
      };

      if (draft.cliente_id) {
        draft.warrantyAlert = await apiFetch(`/api/os/garantia-check/${draft.cliente_id}`);
      }

      const renderModalContent = () => {
        const isHybrid = bootstrap.operation_mode === 'HYBRID';
        const bodyEl = document.getElementById('modal-body');

        bodyEl.innerHTML = `
          <div class="os-slim-header" style="margin:-18px -20px 14px;">
            <div class="os-slim-left">
              <span class="os-code-pill">#${escapeHtml(bootstrap.nextCodigoOs)}</span>
              ${isHybrid ? `
                <div class="seg-switch">
                  <button class="seg-btn ${draft.dominio === 'OPTICA' ? 'is-active' : ''}" type="button" data-os-dom="OPTICA">Óptica</button>
                  <button class="seg-btn ${draft.dominio === 'CUTELARIA' ? 'is-active' : ''}" type="button" data-os-dom="CUTELARIA">Afiação</button>
                </div>
              ` : `<span class="badge">${escapeHtml(formatEnumLabel(draft.dominio))}</span>`}
            </div>
            <div class="os-slim-right">
              <div class="seg-switch">
                <button class="seg-btn ${draft.modo_abertura === 'EXPRESS' ? 'is-active' : ''}" type="button" data-os-mode="EXPRESS">Express</button>
                <button class="seg-btn ${draft.modo_abertura === 'COMPLETO' ? 'is-active' : ''}" type="button" data-os-mode="COMPLETO">Completo</button>
                <button class="seg-btn ${draft.modo_abertura === 'LOTE' ? 'is-active' : ''}" type="button" data-os-mode="LOTE">Lote</button>
              </div>
            </div>
          </div>

          ${draft.warrantyAlert?.hasWarranty ? `
            <div class="warranty-alert-bar">
              <span><strong>Alerta de Garantia (&lt; 90d):</strong> Cliente possui ${draft.warrantyAlert.count} serviço(s) vigente(s) (${escapeHtml(draft.warrantyAlert.items[0]?.codigo_os)} - ${escapeHtml(draft.warrantyAlert.items[0]?.descricao)}).</span>
              <span class="badge badge-accent mono">${draft.warrantyAlert.items[0]?.dias_restantes}d restantes</span>
            </div>
          ` : ''}

          <div id="os-mode-body"></div>
        `;

        bodyEl.querySelectorAll('[data-os-dom]').forEach((b) => {
          b.addEventListener('click', () => {
            draft.dominio = b.getAttribute('data-os-dom');
            renderModalContent();
          });
        });
        bodyEl.querySelectorAll('[data-os-mode]').forEach((b) => {
          b.addEventListener('click', () => {
            draft.modo_abertura = b.getAttribute('data-os-mode');
            renderModalContent();
          });
        });

        const modeBody = document.getElementById('os-mode-body');
        if (draft.modo_abertura === 'LOTE') {
          renderQuickBatchView(modeBody, bootstrap, draft, options.onCreated);
          return;
        }

        modeBody.innerHTML = `
          <div class="field" style="gap:10px;" data-dirty-form="true">
            <div class="field">
              <label>Cliente ${draft.modo_abertura === 'EXPRESS' ? '(opcional no Express - usa Balcão Avulso se vazio)' : '(busque ou crie inline)'}</label>
              <div id="os-client-spot"></div>
            </div>
            <div id="os-catalog-spot"></div>
            <div class="os-cart-list" id="os-cart-list"></div>
            <div id="os-fin-wrap"></div>
            ${draft.modo_abertura === 'COMPLETO' ? `
              <div id="os-diag-wrap">${modes.renderCompleteDiagnosticsHtml(bootstrap, draft)}</div>
              <div class="field">
                <label>Fotos de Entrada / Antes (WebP compactado fora do banco)</label>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                  <label class="btn btn-sm" style="cursor:pointer;">
                    <span>+ Anexar Foto Antes</span>
                    <input type="file" accept="image/*" capture="environment" class="hidden" id="os-checkin-photo-inp">
                  </label>
                  <span class="eyebrow mono" id="os-photo-count">${draft.queuedPhotos.length} foto(s) na fila</span>
                </div>
              </div>
            ` : ''}
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
              <button class="btn" type="button" id="os-btn-cancel">Cancelar</button>
              <button class="btn btn-accent" type="button" id="os-btn-save">Emitir OS</button>
            </div>
          </div>
        `;

        bindExpressAndCompleteControls(bootstrap, draft, renderModalContent, options.onCreated);
      };

      openModal('Check-in de Ordem de Serviço (F4)', '');
      renderModalContent();
    } catch (err) {
      openModal('Check-in OS', `<div class="eyebrow" style="color:var(--status-danger);">${escapeHtml(err.message)}</div>`);
    }
  }

  function bindExpressAndCompleteControls(bootstrap, draft, rerender, onCreated) {
    const clientItems = (bootstrap.clients || []).map((c) => ({
      id: c.id,
      label: c.nome,
      sublabel: c.telefone_formatado,
      meta: c.apelido_referencia || '',
      raw: c
    }));

    global.CTI_SPOTLIGHT_SELECT.create(document.getElementById('os-client-spot'), {
      items: clientItems,
      placeholder: draft.cliente_nome ? `Selecionado: ${draft.cliente_nome}` : 'Buscar cliente por nome/WhatsApp ou criar inline...',
      clearOnSelect: false,
      createLabel: 'Novo Cliente Inline',
      inlineFields: [
        { name: 'nome', label: 'Nome Completo' },
        { name: 'telefone', label: 'WhatsApp (DDD + Número)' },
        { name: 'apelido_referencia', label: 'Apelido / Referência' }
      ],
      async onSelect(opt) {
        draft.cliente_id = opt.id;
        draft.cliente_nome = opt.label;
        draft.warrantyAlert = await apiFetch(`/api/os/garantia-check/${opt.id}`);
        rerender();
      },
      async onCreateInline(fields) {
        const created = await apiFetch('/api/clientes', { method: 'POST', body: JSON.stringify(fields) });
        bootstrap.clients.unshift(created);
        return { id: created.id, label: created.nome, sublabel: created.telefone_formatado, raw: created };
      }
    });

    const renderCartAndFin = () => {
      const cartEl = document.getElementById('os-cart-list');
      cartEl.innerHTML = draft.itens.length === 0
        ? '<div class="eyebrow">Nenhum item no carrinho. Use o buscador acima.</div>'
        : draft.itens.map((it, idx) => `
            <div class="os-cart-row">
              <div>
                <strong>${escapeHtml(it.label)}</strong>
                <div class="eyebrow">${escapeHtml(it.tipo)} | Unit: ${escapeHtml(formatBrl(it.preco))}</div>
              </div>
              <input class="input mono" type="number" min="1" step="1" value="${it.quantidade}" data-cart-qty="${idx}">
              <div class="mono" style="text-align:right;font-weight:700;">${escapeHtml(formatBrl(it.preco * it.quantidade))}</div>
              <button class="btn btn-sm btn-ghost" type="button" data-cart-del="${idx}">X</button>
            </div>
          `).join('');

      cartEl.querySelectorAll('[data-cart-qty]').forEach((inp) => {
        inp.addEventListener('input', () => {
          draft.itens[Number(inp.getAttribute('data-cart-qty'))].quantidade = Math.max(1, Number(inp.value || 1));
          renderCartAndFin();
        });
      });
      cartEl.querySelectorAll('[data-cart-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          draft.itens.splice(Number(btn.getAttribute('data-cart-del')), 1);
          renderCartAndFin();
        });
      });

      const finWrap = document.getElementById('os-fin-wrap');
      finWrap.innerHTML = modes.renderFinancialRulerHtml(draft);

      document.getElementById('os-desc-tipo')?.addEventListener('change', (ev) => {
        draft.desconto_tipo = ev.target.value;
        renderCartAndFin();
      });
      document.getElementById('os-desc-val')?.addEventListener('input', (ev) => {
        draft.desconto_valor = Number(ev.target.value || 0);
        const f = modes.computeFinancialTotals(draft);
        document.getElementById('fin-tot').textContent = formatBrl(f.total);
        document.getElementById('fin-pag').textContent = formatBrl(f.pago);
        document.getElementById('fin-sal').textContent = formatBrl(f.saldo);
      });
      document.getElementById('os-btn-cortesia')?.addEventListener('click', () => {
        draft.eh_cortesia = !draft.eh_cortesia;
        renderCartAndFin();
      });
      finWrap.querySelectorAll('[data-pay-mode]').forEach((b) => {
        b.addEventListener('click', () => {
          draft.pagamento_modo = b.getAttribute('data-pay-mode');
          renderCartAndFin();
        });
      });
      document.getElementById('os-sinal-val')?.addEventListener('input', (ev) => {
        draft.valor_sinal = Number(ev.target.value || 0);
        const f = modes.computeFinancialTotals(draft);
        document.getElementById('fin-pag').textContent = formatBrl(f.pago);
        document.getElementById('fin-sal').textContent = formatBrl(f.saldo);
      });
      document.getElementById('os-meio-pag')?.addEventListener('change', (ev) => {
        draft.meio_pagamento = ev.target.value;
        renderCartAndFin();
      });
      document.getElementById('os-recebido-val')?.addEventListener('input', (ev) => {
        draft.valor_recebido = Number(ev.target.value || 0);
        const f = modes.computeFinancialTotals(draft);
        const trEl = document.getElementById('os-troco-readout');
        if (trEl) trEl.textContent = `Troco: ${formatBrl(f.troco)}`;
      });
      document.getElementById('os-fluxo-direto')?.addEventListener('change', (ev) => {
        draft.fluxo_direto_bancada = ev.target.checked;
      });
      document.getElementById('os-entregar-hora')?.addEventListener('change', (ev) => {
        draft.entregar_na_hora = ev.target.checked;
      });
    };

    modes.createExpressCatalogSpotlight(document.getElementById('os-catalog-spot'), bootstrap, draft, (picked, qty) => {
      const existing = draft.itens.find((it) => it.key === picked.key);
      if (existing) existing.quantidade += qty;
      else draft.itens.push({ ...picked, quantidade: qty });
      renderCartAndFin();
    });

    if (draft.modo_abertura === 'COMPLETO') {
      const matItems = (bootstrap.attributes || [])
        .filter((a) => a.categoria === 'MATERIAL' && (a.dominio === draft.dominio || a.dominio === 'AMBOS'))
        .map((a) => ({ id: a.valor, label: a.valor, freq: a.frequencia_uso }));
      global.CTI_SPOTLIGHT_SELECT.create(document.getElementById('os-material-spot'), {
        items: matItems,
        placeholder: draft.material_peca || 'Selecionar ou criar material...',
        createLabel: 'Novo Material',
        inlineFields: [{ name: 'valor', label: 'Nome do Material' }],
        onSelect(opt) { draft.material_peca = opt.label; },
        async onCreateInline(fields) {
          const saved = await apiFetch('/api/catalogo/atributos', {
            method: 'POST',
            body: JSON.stringify({ categoria: 'MATERIAL', dominio: draft.dominio, valor: fields.valor })
          });
          return { id: saved.valor, label: saved.valor, freq: saved.frequencia_uso };
        }
      });

      document.getElementById('os-parceiro-sel')?.addEventListener('change', (ev) => { draft.parceiro_id = Number(ev.target.value); });
      document.getElementById('os-marca-inp')?.addEventListener('input', (ev) => { draft.marca_modelo = ev.target.value; });
      document.getElementById('os-obs-inp')?.addEventListener('input', (ev) => { draft.observacoes = ev.target.value; });
      document.getElementById('os-desmembrar-lote')?.addEventListener('change', (ev) => { draft.desmembrar_lote = ev.target.checked; });
      document.getElementById('os-prazo-dt')?.addEventListener('change', (ev) => { draft.prazo_prometido_em = ev.target.value; });

      document.querySelectorAll('[data-sla-opt]').forEach((b) => {
        b.addEventListener('click', () => { draft.prioridade_sla = b.getAttribute('data-sla-opt'); rerender(); });
      });
      document.querySelectorAll('[data-avaria-chip]').forEach((b) => {
        b.addEventListener('click', () => {
          const v = b.getAttribute('data-avaria-chip');
          draft.locais_avaria = draft.locais_avaria.includes(v)
            ? draft.locais_avaria.filter((x) => x !== v)
            : draft.locais_avaria.concat(v);
          b.classList.toggle('is-active');
        });
      });
      document.querySelectorAll('[data-lens-type]').forEach((b) => {
        b.addEventListener('click', () => {
          draft.tipo_lente = b.getAttribute('data-lens-type');
          document.querySelectorAll('[data-lens-type]').forEach((x) => x.classList.remove('is-active'));
          b.classList.add('is-active');
        });
      });
      document.querySelectorAll('[data-lens-state]').forEach((b) => {
        b.addEventListener('click', () => {
          const v = b.getAttribute('data-lens-state');
          draft.estado_lentes = draft.estado_lentes.includes(v)
            ? draft.estado_lentes.filter((x) => x !== v)
            : draft.estado_lentes.concat(v);
          b.classList.toggle('is-active');
        });
      });
      document.getElementById('os-checkin-photo-inp')?.addEventListener('change', async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        try {
          const comp = await global.CTI_WEBP_PHOTO.compressFileToWebp(file, 800, 0.75);
          draft.queuedPhotos.push({ momento: 'ANTES', dataUrl: comp.dataUrl });
          document.getElementById('os-photo-count').textContent = `${draft.queuedPhotos.length} foto(s) na fila`;
          showToast('Foto comprimida em WebP pronta para envio.', 'ok');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    renderCartAndFin();
    document.getElementById('os-btn-cancel').addEventListener('click', closeModal);
    document.getElementById('os-btn-save').addEventListener('click', async () => {
      try {
        const created = await apiFetch('/api/os', {
          method: 'POST',
          body: JSON.stringify({
            modo_abertura: draft.modo_abertura,
            dominio: draft.dominio,
            cliente_id: draft.cliente_id,
            parceiro_id: draft.parceiro_id,
            prioridade_sla: draft.prioridade_sla,
            prazo_prometido_em: draft.prazo_prometido_em || null,
            marca_modelo: draft.marca_modelo,
            material_peca: draft.material_peca,
            locais_avaria: draft.locais_avaria,
            tipo_lente: draft.tipo_lente,
            estado_lentes: draft.estado_lentes,
            observacoes: draft.observacoes,
            desmembrar_lote: draft.desmembrar_lote,
            eh_cortesia: draft.eh_cortesia,
            desconto_tipo: draft.desconto_tipo,
            desconto_valor: draft.desconto_valor,
            pagamento_modo: draft.pagamento_modo,
            meio_pagamento: draft.meio_pagamento,
            valor_sinal: draft.valor_sinal,
            valor_recebido: draft.valor_recebido,
            fluxo_direto_bancada: draft.fluxo_direto_bancada,
            entregar_na_hora: draft.entregar_na_hora,
            itens: draft.itens.map((it) => ({
              item_id: it.item_id,
              combo_id: it.combo_id,
              quantidade: it.quantidade,
              valor_unitario: it.preco
            }))
          })
        });

        for (const ph of draft.queuedPhotos) {
          await apiFetch(`/api/os/${created.id}/fotos`, { method: 'POST', body: JSON.stringify(ph) });
        }
        state.preselectedClientForOs = null;
        await closeModal();
        await refreshOverview('os:created');
        showToast(`OS ${created.codigo_os} criada (${created.status}).`, 'ok');
        if (onCreated) onCreated(created);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  global.CTI_MODAL_OS_CHECKIN = {
    openOsCheckinModal
  };
})(window);
