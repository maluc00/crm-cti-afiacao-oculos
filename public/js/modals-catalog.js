(function attachCatalogModals(global) {
  'use strict';

  const { state, apiFetch, roundMoney, formatBrl, escapeHtml, showToast } = global.CTI_STORE;
  const { openModal, closeModal } = global.CTI_MODALS;

  function allowedDomainsForMode(tipo) {
    const mode = state.settings?.operation_mode || 'HYBRID';
    if (mode === 'OPTICAL_ONLY') return tipo === 'SERVICO' ? ['OPTICA'] : ['OPTICA', 'AMBOS'];
    if (mode === 'CUTLERY_ONLY') return tipo === 'SERVICO' ? ['CUTELARIA'] : ['CUTELARIA', 'AMBOS'];
    return ['OPTICA', 'CUTELARIA', 'AMBOS'];
  }

  function openItemModal({ tipo, existing = null, catalogData, onSaved }) {
    const isEdit = Boolean(existing);
    const activeTipo = existing ? existing.tipo : tipo;
    const domains = allowedDomainsForMode(activeTipo);
    const currentDomain = existing ? existing.dominio : domains[0];

    const insumosCatalog = (catalogData?.items || []).filter((i) => i.tipo === 'INSUMO');
    let bomLines = (existing?.bom_itens || []).map((b) => ({
      insumo_id: b.insumo_id,
      nome: b.insumo_abrev || b.insumo_nome,
      unidade: b.insumo_unidade || 'UN',
      cmp: roundMoney(b.insumo_cmp),
      quantidade_consumida: Number(b.quantidade_consumida)
    }));

    const titleMap = {
      SERVICO: isEdit ? 'Editar Servico & Ficha BOM' : 'Novo Servico & Ficha BOM',
      PRODUTO: isEdit ? 'Editar Produto de Balcao' : 'Novo Produto de Balcao',
      INSUMO: isEdit ? 'Editar Insumo de Almoxarifado' : 'Novo Insumo (BOM)'
    };

    const html = `
      <form id="cat-item-form" class="field" style="gap:12px;" data-dirty-form="true">
        <div class="field-grid">
          <div class="field">
            <label for="ci-nome">Nome Tecnico Completo</label>
            <input class="input" id="ci-nome" type="text" required value="${escapeHtml(existing?.nome_tecnico || '')}">
          </div>
          <div class="field">
            <label for="ci-abrev">Abreviacao de Balcao</label>
            <input class="input" id="ci-abrev" type="text" required value="${escapeHtml(existing?.abreviacao_balcao || '')}">
          </div>
        </div>

        <div class="field-grid">
          <div class="field">
            <label for="ci-sku">Codigo SKU (opcional)</label>
            <input class="input mono" id="ci-sku" type="text" value="${escapeHtml(existing?.codigo_sku || '')}" placeholder="Auto se vazio">
          </div>
          <div class="field">
            <label for="ci-dominio">Dominio</label>
            <select class="select" id="ci-dominio">
              ${domains.map((d) => `<option value="${d}" ${currentDomain === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
        </div>

        ${activeTipo !== 'INSUMO' ? `
          <div class="field-grid">
            <div class="field">
              <label for="ci-preco">Preco de Venda (R$)</label>
              <input class="input mono" id="ci-preco" type="number" min="0" step="0.01" required value="${Number(existing?.preco_venda ?? 0).toFixed(2)}">
            </div>
            <div class="field">
              <label for="ci-garantia">Garantia (dias)</label>
              <input class="input mono" id="ci-garantia" type="number" min="0" step="1" value="${Number(existing?.garantia_dias ?? 90)}">
            </div>
          </div>
        ` : ''}

        ${activeTipo !== 'SERVICO' ? `
          <div class="field-grid">
            <div class="field">
              <label for="ci-cmp">Custo Medio Ponderado (R$)</label>
              <input class="input mono" id="ci-cmp" type="number" min="0" step="0.01" value="${Number(existing?.custo_medio_ponderado ?? 0).toFixed(2)}">
            </div>
            <div class="field">
              <label for="ci-unidade">Unidade</label>
              <input class="input mono" id="ci-unidade" type="text" maxlength="10" value="${escapeHtml(existing?.unidade || 'UN')}">
            </div>
          </div>
          <div class="field-grid">
            <div class="field">
              <label for="ci-est-atual">Estoque Atual</label>
              <input class="input mono" id="ci-est-atual" type="number" min="0" step="0.01" value="${Number(existing?.estoque_atual ?? 0)}">
            </div>
            <div class="field">
              <label for="ci-est-min">Estoque Minimo (Alerta)</label>
              <input class="input mono" id="ci-est-min" type="number" min="0" step="0.01" value="${Number(existing?.estoque_minimo ?? 5)}">
            </div>
          </div>
        ` : `
          <div class="field">
            <label>Ficha Tecnica BOM (Insumos Consumidos na Execucao)</label>
            <div id="ci-bom-spotlight"></div>
            <div class="line-builder-list" id="ci-bom-lines"></div>
          </div>
        `}

        <div class="combo-summary-strip" id="ci-margin-strip"></div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
          <button class="btn" type="button" id="ci-cancel">Cancelar</button>
          <button class="btn btn-accent" type="submit">Salvar ${activeTipo}</button>
        </div>
      </form>
    `;

    openModal(titleMap[activeTipo], html, true);
    document.getElementById('ci-cancel').addEventListener('click', closeModal);

    const precoEl = document.getElementById('ci-preco');
    const cmpEl = document.getElementById('ci-cmp');
    const marginStrip = document.getElementById('ci-margin-strip');

    function updateSummaryStrip() {
      if (activeTipo === 'INSUMO') {
        const cmpVal = roundMoney(cmpEl?.value || 0);
        const estVal = Number(document.getElementById('ci-est-atual')?.value || 0);
        marginStrip.innerHTML = `
          <div><div class="combo-metric-label">CMP Atual</div><div class="combo-metric-value">${escapeHtml(formatBrl(cmpVal))}</div></div>
          <div><div class="combo-metric-label">Valor em Estoque</div><div class="combo-metric-value">${escapeHtml(formatBrl(cmpVal * estVal))}</div></div>
          <div><div class="combo-metric-label">Tipo</div><div class="combo-metric-value">INSUMO BOM</div></div>
          <div><div class="combo-metric-label">Unidade</div><div class="combo-metric-value">${escapeHtml(document.getElementById('ci-unidade')?.value || 'UN')}</div></div>
        `;
        return;
      }

      const preco = roundMoney(precoEl?.value || 0);
      const custo = activeTipo === 'SERVICO'
        ? roundMoney(bomLines.reduce((acc, b) => acc + (b.quantidade_consumida * b.cmp), 0))
        : roundMoney(cmpEl?.value || 0);
      const lucro = roundMoney(preco - custo);
      const margem = preco > 0 ? roundMoney((lucro / preco) * 100) : 0;

      marginStrip.innerHTML = `
        <div><div class="combo-metric-label">Preco Venda</div><div class="combo-metric-value">${escapeHtml(formatBrl(preco))}</div></div>
        <div><div class="combo-metric-label">${activeTipo === 'SERVICO' ? 'Custo BOM' : 'Custo CMP'}</div><div class="combo-metric-value">${escapeHtml(formatBrl(custo))}</div></div>
        <div><div class="combo-metric-label">Lucro Liquido</div><div class="combo-metric-value">${escapeHtml(formatBrl(lucro))}</div></div>
        <div><div class="combo-metric-label">Margem Real</div><div class="combo-metric-value">${margem.toFixed(2)}%</div></div>
      `;
    }

    if (activeTipo === 'SERVICO') {
      const bomListEl = document.getElementById('ci-bom-lines');
      const renderBomLines = () => {
        if (bomLines.length === 0) {
          bomListEl.innerHTML = '<div class="eyebrow">Nenhum insumo vinculado. Busque acima para compor a ficha tecnica.</div>';
        } else {
          bomListEl.innerHTML = bomLines.map((b, idx) => `
            <div class="line-builder-row">
              <div>
                <div style="font-size:12px;font-weight:700;">${escapeHtml(b.nome)}</div>
                <div class="eyebrow">CMP: ${escapeHtml(formatBrl(b.cmp))} / ${escapeHtml(b.unidade)}</div>
              </div>
              <input class="input mono" type="number" min="0.01" step="0.01" value="${b.quantidade_consumida}" data-bom-qty="${idx}">
              <div class="mono line-cost-col" style="text-align:right;font-size:12px;">${escapeHtml(formatBrl(b.quantidade_consumida * b.cmp))}</div>
              <button class="btn btn-sm btn-ghost" type="button" data-bom-del="${idx}" aria-label="Remover insumo">X</button>
            </div>
          `).join('');

          bomListEl.querySelectorAll('[data-bom-qty]').forEach((inp) => {
            inp.addEventListener('input', () => {
              const i = Number(inp.getAttribute('data-bom-qty'));
              bomLines[i].quantidade_consumida = Math.max(0.01, Number(inp.value || 0.01));
              updateSummaryStrip();
            });
          });
          bomListEl.querySelectorAll('[data-bom-del]').forEach((btn) => {
            btn.addEventListener('click', () => {
              bomLines.splice(Number(btn.getAttribute('data-bom-del')), 1);
              renderBomLines();
              updateSummaryStrip();
            });
          });
        }
        updateSummaryStrip();
      };

      const toSpotlightOption = (ins) => ({
        id: ins.id,
        label: ins.abreviacao_balcao,
        sublabel: ins.nome_tecnico,
        meta: `${formatBrl(ins.custo_medio_ponderado)}/${ins.unidade}`,
        freq: ins.frequencia_uso,
        raw: ins
      });

      global.CTI_SPOTLIGHT_SELECT.create(document.getElementById('ci-bom-spotlight'), {
        items: insumosCatalog.map(toSpotlightOption),
        placeholder: 'Buscar insumo BOM ou criar novo inline...',
        clearOnSelect: true,
        createLabel: 'Novo Insumo Inline',
        inlineFields: [
          { name: 'nome_tecnico', label: 'Nome do Insumo' },
          { name: 'custo_medio_ponderado', label: 'Custo Unitario (R$)', type: 'number', step: '0.01', defaultValue: '2.50' },
          { name: 'unidade', label: 'Unidade (UN/PAR/G)', defaultValue: 'UN' }
        ],
        onSelect(opt) {
          const exists = bomLines.find((b) => b.insumo_id === opt.id);
          if (exists) {
            exists.quantidade_consumida = Number((exists.quantidade_consumida + 1).toFixed(2));
          } else {
            bomLines.push({
              insumo_id: opt.id,
              nome: opt.label,
              unidade: opt.raw.unidade,
              cmp: opt.raw.custo_medio_ponderado,
              quantidade_consumida: 1
            });
          }
          renderBomLines();
        },
        async onCreateInline(fields) {
          const dom = document.getElementById('ci-dominio').value;
          const created = await apiFetch('/api/catalogo/itens', {
            method: 'POST',
            body: JSON.stringify({
              tipo: 'INSUMO',
              dominio: dom,
              nome_tecnico: fields.nome_tecnico,
              abreviacao_balcao: fields.nome_tecnico,
              custo_medio_ponderado: Number(fields.custo_medio_ponderado || 0),
              unidade: fields.unidade || 'UN',
              estoque_atual: 0,
              estoque_minimo: 5
            })
          });
          showToast(`Insumo "${created.abreviacao_balcao}" criado inline.`, 'ok');
          return toSpotlightOption(created);
        }
      });

      renderBomLines();
    }

    if (precoEl) precoEl.addEventListener('input', updateSummaryStrip);
    if (cmpEl) cmpEl.addEventListener('input', updateSummaryStrip);
    updateSummaryStrip();

    document.getElementById('cat-item-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const body = {
        tipo: activeTipo,
        dominio: document.getElementById('ci-dominio').value,
        codigo_sku: document.getElementById('ci-sku').value.trim(),
        nome_tecnico: document.getElementById('ci-nome').value.trim(),
        abreviacao_balcao: document.getElementById('ci-abrev').value.trim()
      };
      if (activeTipo !== 'INSUMO') {
        body.preco_venda = Number(precoEl.value || 0);
        body.garantia_dias = Number(document.getElementById('ci-garantia').value || 90);
      }
      if (activeTipo !== 'SERVICO') {
        body.custo_medio_ponderado = Number(cmpEl.value || 0);
        body.unidade = document.getElementById('ci-unidade').value.trim() || 'UN';
        body.estoque_atual = Number(document.getElementById('ci-est-atual').value || 0);
        body.estoque_minimo = Number(document.getElementById('ci-est-min').value || 0);
      } else {
        body.bom_itens = bomLines.map((b) => ({
          insumo_id: b.insumo_id,
          quantidade_consumida: b.quantidade_consumida
        }));
      }

      try {
        if (isEdit) {
          await apiFetch(`/api/catalogo/itens/${existing.id}`, { method: 'PUT', body: JSON.stringify(body) });
          showToast('Item atualizado com sucesso.', 'ok');
        } else {
          await apiFetch('/api/catalogo/itens', { method: 'POST', body: JSON.stringify(body) });
          showToast('Item cadastrado no catalogo.', 'ok');
        }
        await closeModal();
        if (onSaved) onSaved();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  global.CTI_MODALS_CATALOG = Object.assign(global.CTI_MODALS_CATALOG || {}, {
    openItemModal
  });
})(window);
