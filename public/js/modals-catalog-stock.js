(function attachCatalogStockModals(global) {
  'use strict';

  const { state, apiFetch, roundMoney, formatBrl, escapeHtml, showToast } = global.CTI_STORE;
  const { openModal, closeModal } = global.CTI_MODALS;

  function allowedDomainsForCombo() {
    const mode = state.settings?.operation_mode || 'HYBRID';
    if (mode === 'OPTICAL_ONLY') return ['OPTICA', 'AMBOS'];
    if (mode === 'CUTLERY_ONLY') return ['CUTELARIA', 'AMBOS'];
    return ['OPTICA', 'CUTELARIA', 'AMBOS'];
  }

  function openPurchaseModal({ item, onSaved }) {
    const html = `
      <form id="cmp-purchase-form" class="field" style="gap:12px;" data-dirty-form="true">
        <div class="switch-row">
          <div>
            <div style="font-weight:700;">${escapeHtml(item.nome_tecnico)}</div>
            <div class="eyebrow">${escapeHtml(item.codigo_sku)} | Estoque: ${item.estoque_atual} ${escapeHtml(item.unidade)}</div>
          </div>
          <div class="mono" style="font-weight:700;">CMP: ${escapeHtml(formatBrl(item.custo_medio_ponderado))}</div>
        </div>

        <div class="field-grid">
          <div class="field">
            <label for="cmp-qty">Quantidade Comprada (${escapeHtml(item.unidade)})</label>
            <input class="input mono" id="cmp-qty" type="number" min="0.01" step="0.01" value="10" required>
          </div>
          <div class="field">
            <label for="cmp-total">Valor Total Pago (R$)</label>
            <input class="input mono" id="cmp-total" type="number" min="0" step="0.01" value="${(Math.max(1, item.custo_medio_ponderado) * 10).toFixed(2)}" required>
          </div>
        </div>

        <div class="field">
          <label for="cmp-obs">Observação / Nota Fiscal</label>
          <input class="input" id="cmp-obs" type="text" placeholder="Ex: NF 4521 - Reposição fornecedor">
        </div>

        <div class="combo-summary-strip" id="cmp-preview-strip"></div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn" type="button" id="cmp-cancel">Cancelar</button>
          <button class="btn btn-accent" type="submit">Confirmar Entrada (CMP)</button>
        </div>
      </form>
    `;

    openModal('Entrada de Compra & Recálculo CMP', html);
    document.getElementById('cmp-cancel').addEventListener('click', closeModal);

    const qtyEl = document.getElementById('cmp-qty');
    const totalEl = document.getElementById('cmp-total');
    const previewEl = document.getElementById('cmp-preview-strip');

    function updatePreview() {
      const qty = Math.max(0.01, Number(qtyEl.value || 0));
      const total = roundMoney(totalEl.value || 0);
      const unitCost = roundMoney(total / qty);
      const estPost = Math.round((item.estoque_atual + qty) * 1000) / 1000;
      const cmpNovo = item.estoque_atual <= 0
        ? unitCost
        : roundMoney(((item.estoque_atual * item.custo_medio_ponderado) + total) / estPost);

      previewEl.innerHTML = `
        <div><div class="combo-metric-label">Custo Unit. Compra</div><div class="combo-metric-value">${escapeHtml(formatBrl(unitCost))}</div></div>
        <div><div class="combo-metric-label">Novo Estoque</div><div class="combo-metric-value">${estPost} ${escapeHtml(item.unidade)}</div></div>
        <div><div class="combo-metric-label">CMP Anterior</div><div class="combo-metric-value">${escapeHtml(formatBrl(item.custo_medio_ponderado))}</div></div>
        <div><div class="combo-metric-label">Novo CMP</div><div class="combo-metric-value" style="color:var(--accent-color);">${escapeHtml(formatBrl(cmpNovo))}</div></div>
      `;
    }

    qtyEl.addEventListener('input', updatePreview);
    totalEl.addEventListener('input', updatePreview);
    updatePreview();

    document.getElementById('cmp-purchase-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await apiFetch('/api/catalogo/estoque/compra', {
          method: 'POST',
          body: JSON.stringify({
            item_id: item.id,
            quantidade: Number(qtyEl.value),
            valor_pago: Number(totalEl.value),
            observacao: document.getElementById('cmp-obs').value.trim()
          })
        });
        await closeModal();
        showToast('Entrada registrada e CMP recalculado.', 'ok');
        if (onSaved) onSaved();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  function openAdjustmentModal({ item, onSaved }) {
    const html = `
      <form id="adj-stock-form" class="field" style="gap:12px;" data-dirty-form="true">
        <div class="switch-row">
          <div>
            <div style="font-weight:700;">${escapeHtml(item.nome_tecnico)}</div>
            <div class="eyebrow">Estoque Atual: ${item.estoque_atual} ${escapeHtml(item.unidade)}</div>
          </div>
          <span class="badge">${escapeHtml(item.codigo_sku)}</span>
        </div>
        <div class="field">
          <label for="adj-qty">Nova Quantidade Contada (${escapeHtml(item.unidade)})</label>
          <input class="input mono" id="adj-qty" type="number" min="0" step="0.01" value="${item.estoque_atual}" required>
        </div>
        <div class="field">
          <label for="adj-motivo">Motivo Obrigatório (Auditoria)</label>
          <input class="input" id="adj-motivo" type="text" minlength="3" required placeholder="Ex: Conferência física semanal / Peça avariada">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn" type="button" id="adj-cancel">Cancelar</button>
          <button class="btn btn-accent" type="submit">Registrar Ajuste Auditado</button>
        </div>
      </form>
    `;
    openModal('Ajuste Manual de Inventário', html);
    document.getElementById('adj-cancel').addEventListener('click', closeModal);
    document.getElementById('adj-stock-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await apiFetch('/api/catalogo/estoque/ajuste', {
          method: 'POST',
          body: JSON.stringify({
            item_id: item.id,
            nova_quantidade: Number(document.getElementById('adj-qty').value),
            motivo: document.getElementById('adj-motivo').value.trim()
          })
        });
        await closeModal();
        showToast('Ajuste de inventário auditado.', 'ok');
        if (onSaved) onSaved();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  function openComboModal({ existing = null, catalogData, onSaved }) {
    const isEdit = Boolean(existing);
    const domains = allowedDomainsForCombo();
    const currentDomain = existing ? existing.dominio : domains[0];
    const eligibleItems = (catalogData?.items || []).filter((i) => i.tipo === 'SERVICO' || i.tipo === 'PRODUTO');
    let lines = (existing?.itens || []).map((l) => ({
      item_id: l.item_id,
      label: l.abreviacao_balcao || l.nome_tecnico,
      tipo: l.tipo,
      preco: roundMoney(l.preco_unitario),
      custo: roundMoney(l.custo_unitario_efetivo),
      quantidade: Number(l.quantidade)
    }));

    const html = `
      <form id="combo-form" class="field" style="gap:12px;" data-dirty-form="true">
        <div class="field-grid">
          <div class="field">
            <label for="cmb-nome">Nome do Combo / Pacote</label>
            <input class="input" id="cmb-nome" type="text" required value="${escapeHtml(existing?.nome || '')}">
          </div>
          <div class="field">
            <label for="cmb-abrev">Abreviação de Balcão</label>
            <input class="input" id="cmb-abrev" type="text" required value="${escapeHtml(existing?.abreviacao || '')}">
          </div>
        </div>
        <div class="field-grid">
          <div class="field">
            <label for="cmb-dom">Domínio</label>
            <select class="select" id="cmb-dom">
              ${domains.map((d) => `<option value="${d}" ${currentDomain === d ? 'selected' : ''}>${escapeHtml(global.CTI_STORE.formatEnumLabel(d))}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="cmb-preco">Preço Promocional do Combo (R$)</label>
            <input class="input mono" id="cmb-preco" type="number" min="0" step="0.01" required value="${Number(existing?.preco_combo ?? 0).toFixed(2)}">
          </div>
        </div>

        <div class="field">
          <label>Composição do Combo (Serviços + Produtos)</label>
          <div id="cmb-spotlight"></div>
          <div class="line-builder-list" id="cmb-lines"></div>
        </div>

        <div class="combo-summary-strip" id="cmb-summary"></div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn" type="button" id="cmb-cancel">Cancelar</button>
          <button class="btn btn-accent" type="submit">Salvar Combo</button>
        </div>
      </form>
    `;

    openModal(isEdit ? 'Editar Combo Promocional' : 'Novo Combo de Upsell', html, true);
    document.getElementById('cmb-cancel').addEventListener('click', closeModal);

    const precoEl = document.getElementById('cmb-preco');
    const summaryEl = document.getElementById('cmb-summary');
    const linesEl = document.getElementById('cmb-lines');

    function updateSummary() {
      const somaOrig = roundMoney(lines.reduce((a, l) => a + (l.preco * l.quantidade), 0));
      const custoTot = roundMoney(lines.reduce((a, l) => a + (l.custo * l.quantidade), 0));
      const precoCombo = roundMoney(precoEl.value || 0);
      const desconto = roundMoney(somaOrig - precoCombo);
      const lucroLiq = roundMoney(precoCombo - custoTot);
      const margem = precoCombo > 0 ? roundMoney((lucroLiq / precoCombo) * 100) : 0;

      summaryEl.innerHTML = `
        <div><div class="combo-metric-label">Soma Original</div><div class="combo-metric-value">${escapeHtml(formatBrl(somaOrig))}</div></div>
        <div><div class="combo-metric-label">Desconto Real</div><div class="combo-metric-value">${escapeHtml(formatBrl(desconto))}</div></div>
        <div><div class="combo-metric-label">Custo Embutido</div><div class="combo-metric-value">${escapeHtml(formatBrl(custoTot))}</div></div>
        <div><div class="combo-metric-label">Margem Líquida</div><div class="combo-metric-value" style="color:var(--accent-color);">${escapeHtml(formatBrl(lucroLiq))} (${margem.toFixed(1)}%)</div></div>
      `;
    }

    function renderLines() {
      if (lines.length === 0) {
        linesEl.innerHTML = '<div class="eyebrow">Adicione serviços ou produtos pelo buscador acima.</div>';
      } else {
        linesEl.innerHTML = lines.map((l, idx) => `
          <div class="line-builder-row">
            <div>
              <div style="font-size:12px;font-weight:700;">${escapeHtml(l.label)}</div>
              <div class="eyebrow">${escapeHtml(global.CTI_STORE.formatEnumLabel(l.tipo))} | Unit: ${escapeHtml(formatBrl(l.preco))} | Custo: ${escapeHtml(formatBrl(l.custo))}</div>
            </div>
            <input class="input mono" type="number" min="1" step="1" value="${l.quantidade}" data-cmb-qty="${idx}">
            <div class="mono line-cost-col" style="text-align:right;font-size:12px;">${escapeHtml(formatBrl(l.preco * l.quantidade))}</div>
            <button class="btn btn-sm btn-ghost" type="button" data-cmb-del="${idx}">X</button>
          </div>
        `).join('');

        linesEl.querySelectorAll('[data-cmb-qty]').forEach((inp) => {
          inp.addEventListener('input', () => {
            lines[Number(inp.getAttribute('data-cmb-qty'))].quantidade = Math.max(1, Number(inp.value || 1));
            updateSummary();
          });
        });
        linesEl.querySelectorAll('[data-cmb-del]').forEach((btn) => {
          btn.addEventListener('click', () => {
            lines.splice(Number(btn.getAttribute('data-cmb-del')), 1);
            renderLines();
          });
        });
      }
      updateSummary();
    }

    global.CTI_SPOTLIGHT_SELECT.create(document.getElementById('cmb-spotlight'), {
      items: eligibleItems.map((it) => ({
        id: it.id,
        label: it.abreviacao_balcao,
        sublabel: `${global.CTI_STORE.formatEnumLabel(it.tipo)} | ${it.nome_tecnico}`,
        meta: formatBrl(it.preco_venda),
        freq: it.frequencia_uso,
        raw: it
      })),
      placeholder: 'Adicionar serviço ou produto ao combo...',
      clearOnSelect: true,
      onSelect(opt) {
        const found = lines.find((l) => l.item_id === opt.id);
        if (found) found.quantidade += 1;
        else {
          lines.push({
            item_id: opt.id,
            label: opt.label,
            tipo: opt.raw.tipo,
            preco: opt.raw.preco_venda,
            custo: opt.raw.custo_efetivo,
            quantidade: 1
          });
        }
        renderLines();
      }
    });

    precoEl.addEventListener('input', updateSummary);
    renderLines();

    document.getElementById('combo-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        const payload = {
          nome: document.getElementById('cmb-nome').value.trim(),
          abreviacao: document.getElementById('cmb-abrev').value.trim(),
          dominio: document.getElementById('cmb-dom').value,
          preco_combo: Number(precoEl.value || 0),
          itens: lines.map((l) => ({ item_id: l.item_id, quantidade: l.quantidade }))
        };
        if (isEdit) {
          await apiFetch(`/api/catalogo/combos/${existing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
          showToast('Combo atualizado.', 'ok');
        } else {
          await apiFetch('/api/catalogo/combos', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Combo criado com sucesso.', 'ok');
        }
        await closeModal();
        if (onSaved) onSaved();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  global.CTI_MODALS_CATALOG = Object.assign(global.CTI_MODALS_CATALOG || {}, {
    openPurchaseModal,
    openAdjustmentModal,
    openComboModal
  });
})(window);
