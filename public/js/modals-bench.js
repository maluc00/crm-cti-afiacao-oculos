(function attachBenchModals(global) {
  'use strict';

  const { apiFetch, roundMoney, formatBrl, formatEnumLabel, escapeHtml, showToast, refreshOverview } = global.CTI_STORE;
  const { openModal, closeModal } = global.CTI_MODALS;

  function openSettlementModal(os, onDone) {
    const saldo = roundMoney(os.saldo_devedor);
    const rows = [{ meio_pagamento: 'PIX', valor: saldo, parcelado: false }];

    const render = () => {
      const pago = roundMoney(rows.reduce((a, r) => a + roundMoney(r.valor || 0), 0));
      const falta = roundMoney(Math.max(0, saldo - pago));
      const troco = pago > saldo ? roundMoney(pago - saldo) : 0;

      const html = `
        <div class="field" style="gap:12px;" data-dirty-form="true">
          <div class="switch-row">
            <div>
              <div style="font-weight:700;">${escapeHtml(os.codigo_os)} - ${escapeHtml(os.cliente_nome)}</div>
              <div class="eyebrow">Quitação obrigatória para liberar entrega</div>
            </div>
            <div class="mono" style="font-size:16px;font-weight:700;color:var(--accent-color);">${escapeHtml(formatBrl(saldo))}</div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="eyebrow">Pagamento Fracionado (Split Payment)</span>
            <button class="btn btn-sm" type="button" id="settle-add-split">+ Adicionar Forma</button>
          </div>

          <div style="display:flex;flex-direction:column;gap:6px;">
            ${rows.map((r, idx) => `
              <div class="batch-grid-row" style="grid-template-columns:1fr 130px 90px 30px;">
                <select class="select" data-sp-meio="${idx}">
                  <option value="ESPECIE" ${r.meio_pagamento === 'ESPECIE' ? 'selected' : ''}>Dinheiro (Espécie)</option>
                  <option value="PIX" ${r.meio_pagamento === 'PIX' ? 'selected' : ''}>PIX</option>
                  <option value="CARTAO_DEBITO" ${r.meio_pagamento === 'CARTAO_DEBITO' ? 'selected' : ''}>Cartão Débito</option>
                  <option value="CARTAO_CREDITO" ${r.meio_pagamento === 'CARTAO_CREDITO' ? 'selected' : ''}>Cartão Crédito</option>
                </select>
                <input class="input mono" type="number" min="0" step="0.01" value="${Number(r.valor).toFixed(2)}" data-sp-val="${idx}">
                <label style="font-size:11px;display:flex;align-items:center;gap:4px;">
                  <input type="checkbox" data-sp-parc="${idx}" ${r.parcelado ? 'checked' : ''} ${r.meio_pagamento !== 'CARTAO_CREDITO' ? 'disabled' : ''}>
                  <span>Parc.</span>
                </label>
                <button class="btn btn-sm btn-ghost" type="button" data-sp-del="${idx}">X</button>
              </div>
            `).join('')}
          </div>

          <div class="combo-summary-strip">
            <div><div class="combo-metric-label">Saldo Devido</div><div class="combo-metric-value">${escapeHtml(formatBrl(saldo))}</div></div>
            <div><div class="combo-metric-label">Informado</div><div class="combo-metric-value">${escapeHtml(formatBrl(pago))}</div></div>
            <div><div class="combo-metric-label">Falta</div><div class="combo-metric-value" style="color:${falta > 0 ? 'var(--status-danger)' : 'var(--status-ok)'};">${escapeHtml(formatBrl(falta))}</div></div>
            <div><div class="combo-metric-label">Troco</div><div class="combo-metric-value">${escapeHtml(formatBrl(troco))}</div></div>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:8px;">
            <button class="btn" type="button" id="settle-cancel">Cancelar</button>
            <button class="btn btn-accent" type="button" id="settle-confirm" ${falta > 0 ? 'disabled' : ''}>Quitar &amp; Entregar OS</button>
          </div>
        </div>
      `;

      openModal(`Quitação Obrigatória - ${os.codigo_os}`, html, true);
      document.getElementById('settle-cancel').addEventListener('click', closeModal);
      document.getElementById('settle-add-split').addEventListener('click', () => {
        rows.push({ meio_pagamento: 'ESPECIE', valor: falta, parcelado: false });
        render();
      });
      document.querySelectorAll('[data-sp-meio]').forEach((s) => {
        s.addEventListener('change', () => {
          rows[Number(s.getAttribute('data-sp-meio'))].meio_pagamento = s.value;
          render();
        });
      });
      document.querySelectorAll('[data-sp-val]').forEach((inp) => {
        inp.addEventListener('input', () => {
          rows[Number(inp.getAttribute('data-sp-val'))].valor = roundMoney(inp.value || 0);
        });
        inp.addEventListener('change', render);
      });
      document.querySelectorAll('[data-sp-parc]').forEach((cb) => {
        cb.addEventListener('change', () => {
          rows[Number(cb.getAttribute('data-sp-parc'))].parcelado = cb.checked;
        });
      });
      document.querySelectorAll('[data-sp-del]').forEach((b) => {
        b.addEventListener('click', () => {
          if (rows.length > 1) {
            rows.splice(Number(b.getAttribute('data-sp-del')), 1);
            render();
          }
        });
      });
      document.getElementById('settle-confirm').addEventListener('click', async () => {
        try {
          await apiFetch(`/api/os/${os.id}/status`, {
            method: 'POST',
            body: JSON.stringify({ status: 'ENTREGUE', pagamentos: rows })
          });
          await closeModal();
          await refreshOverview('os:delivered');
          showToast(`OS ${os.codigo_os} quitada e entregue.`, 'ok');
          if (onDone) onDone();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    };

    render();
  }

  function openCancelOrderModal(os, onDone) {
    const html = `
      <form id="os-cancel-form" class="field" style="gap:12px;" data-dirty-form="true">
        <div class="warranty-alert-bar" style="margin-bottom:0;">
          <span>Cancelar <strong>${escapeHtml(os.codigo_os)}</strong> impede receita, estorna insumos BOM baixados ao estoque e lança estorno no livro-razão caso haja sinal pago.</span>
        </div>
        <div class="field">
          <label for="os-cancel-motivo">Motivo Obrigatório do Cancelamento</label>
          <input class="input" id="os-cancel-motivo" type="text" minlength="3" required placeholder="Ex: Cliente desistiu do reparo / Peça sem reposição">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn" type="button" id="osc-close">Voltar</button>
          <button class="btn btn-accent" type="submit">Confirmar Cancelamento &amp; Estorno</button>
        </div>
      </form>
    `;
    openModal(`Cancelar ${os.codigo_os}`, html);
    document.getElementById('osc-close').addEventListener('click', closeModal);
    document.getElementById('os-cancel-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await apiFetch(`/api/os/${os.id}/status`, {
          method: 'POST',
          body: JSON.stringify({
            status: 'CANCELADA',
            motivo_cancelamento: document.getElementById('os-cancel-motivo').value.trim()
          })
        });
        await closeModal();
        await refreshOverview('os:cancelled');
        showToast(`OS ${os.codigo_os} cancelada e estornada.`, 'ok');
        if (onDone) onDone();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  function openParkingReasonModal(os, onDone) {
    const html = `
      <form id="os-park-form" class="field" style="gap:12px;" data-dirty-form="true">
        <div class="field">
          <label for="os-park-note">Peça ou Insumo Aguardado (${escapeHtml(os.codigo_os)})</label>
          <input class="input" id="os-park-note" type="text" placeholder="Ex: Charneira original 3 furos / Mola titânio">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn" type="button" id="osp-close">Cancelar</button>
          <button class="btn btn-accent" type="submit">Mover para Estacionamento Técnico</button>
        </div>
      </form>
    `;
    openModal('Estacionamento Técnico (Aguardando Peça)', html);
    document.getElementById('osp-close').addEventListener('click', closeModal);
    document.getElementById('os-park-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await apiFetch(`/api/os/${os.id}/status`, {
          method: 'POST',
          body: JSON.stringify({
            status: 'AGUARDANDO_PECA',
            motivo_espera: document.getElementById('os-park-note').value.trim()
          })
        });
        await closeModal();
        showToast(`OS ${os.codigo_os} movida para Aguardando Peca.`, 'info');
        if (onDone) onDone();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  async function openOrderDetailModal(osId, onDone) {
    openModal('Detalhes da Ordem de Serviço', '<div class="eyebrow">Carregando OS...</div>', true);
    try {
      const os = await apiFetch(`/api/os/${osId}`);
      const loteItems = (os.itens || []).filter((i) => i.tipo === 'LOTE');

      const html = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
          <div>
            <div class="eyebrow">${escapeHtml(os.codigo_os)} | ${escapeHtml(formatEnumLabel(os.dominio))} | ${escapeHtml(os.modo_abertura)}</div>
            <h3 style="margin:3px 0;">${escapeHtml(os.cliente_nome)}</h3>
            <div class="mono" style="font-size:12px;color:var(--text-secondary);">${escapeHtml(os.telefone_formatado)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <span class="badge badge-accent">${escapeHtml(formatEnumLabel(os.status))}</span>
            <button class="btn btn-sm" type="button" id="det-print-btn">Imprimir Cupom</button>
            ${os.status !== 'CANCELADA' && os.status !== 'ENTREGUE' ? `<button class="btn btn-sm btn-ghost" type="button" id="det-cancel-btn">Cancelar OS</button>` : ''}
          </div>
        </div>

        <div class="combo-summary-strip" style="margin-bottom:12px;">
          <div><div class="combo-metric-label">Total</div><div class="combo-metric-value">${escapeHtml(formatBrl(os.valor_total))}</div></div>
          <div><div class="combo-metric-label">Pago</div><div class="combo-metric-value">${escapeHtml(formatBrl(os.valor_pago))}</div></div>
          <div><div class="combo-metric-label">Saldo</div><div class="combo-metric-value" style="color:var(--accent-color);">${escapeHtml(formatBrl(os.saldo_devedor))}</div></div>
          <div><div class="combo-metric-label">BOM</div><div class="combo-metric-value">${os.bom_baixado ? 'BAIXADO' : 'PENDENTE'}</div></div>
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Itens &amp; Checklist</label>
          ${loteItems.length > 0 ? `
            <div class="eyebrow mono">Progresso do Lote: ${os.lote_progress.concluidos}/${os.lote_progress.total} concluídos</div>
            <div class="lote-checklist">
              ${loteItems.map((li) => `
                <button class="lote-check-pill ${li.concluido_lote ? 'is-done' : ''}" type="button"
                        data-det-lote="${li.id}" data-lote-next="${li.concluido_lote ? '0' : '1'}">
                  <span>${escapeHtml(li.descricao)}</span>
                </button>
              `).join('')}
            </div>
          ` : `
            <div class="tag-cloud">
              ${(os.itens || []).map((i) => `<span class="badge">${i.quantidade}x ${escapeHtml(i.descricao)} (${escapeHtml(formatBrl(i.valor_total))})</span>`).join('')}
            </div>
          `}
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Perícia &amp; Timestamps Passivos</label>
          <div style="font-size:12px;color:var(--text-secondary);">
            ${os.marca_modelo ? `Peça: <strong>${escapeHtml(os.marca_modelo)}</strong> | ` : ''}
            ${os.material_peca ? `Material: <strong>${escapeHtml(os.material_peca)}</strong> | ` : ''}
            ${os.tipo_lente !== 'N/A' ? `Lente: <strong>${escapeHtml(os.tipo_lente)}</strong> | ` : ''}
            Criada: <span class="mono">${escapeHtml(os.criado_em)}</span>
            ${os.iniciado_bancada_em ? ` | Bancada: <span class="mono">${escapeHtml(os.iniciado_bancada_em)}</span>` : ''}
            ${os.pronto_em ? ` | Pronto: <span class="mono">${escapeHtml(os.pronto_em)}</span>` : ''}
            ${os.entregue_em ? ` | Entregue: <span class="mono">${escapeHtml(os.entregue_em)}</span>` : ''}
          </div>
          ${(os.estado_lentes || []).length > 0 ? `<div class="tag-cloud" style="margin-top:6px;">${os.estado_lentes.map((e) => `<span class="badge badge-accent">${escapeHtml(e)}</span>`).join('')}</div>` : ''}
        </div>

        <div class="field">
          <label>Fotos de Inspeção Antes / Depois (WebP em data/media/)</label>
          ${global.CTI_WEBP_PHOTO.renderPhotoStrip(os.fotos, os.id, os.status !== 'CANCELADA', () => {
            openOrderDetailModal(os.id, onDone);
            if (onDone) onDone();
          })}
        </div>
      `;

      openModal(`OS ${os.codigo_os}`, html, true);
      document.getElementById('det-print-btn').addEventListener('click', () => global.CTI_THERMAL_PRINTER.openPrintPreview(os.id));
      document.getElementById('det-cancel-btn')?.addEventListener('click', () => openCancelOrderModal(os, onDone));
      document.querySelectorAll('[data-det-lote]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await apiFetch(`/api/os/${os.id}/itens/${btn.getAttribute('data-det-lote')}/lote`, {
            method: 'PATCH',
            body: JSON.stringify({ concluido: btn.getAttribute('data-lote-next') === '1' })
          });
          openOrderDetailModal(os.id, onDone);
          if (onDone) onDone();
        });
      });
    } catch (err) {
      openModal('Detalhes OS', `<div class="eyebrow" style="color:var(--status-danger);">${escapeHtml(err.message)}</div>`);
    }
  }

  global.CTI_MODALS_BENCH = {
    openSettlementModal,
    openCancelOrderModal,
    openParkingReasonModal,
    openOrderDetailModal
  };
})(window);
