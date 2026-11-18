(function attachThermalPrinter(global) {
  'use strict';

  const { apiFetch, formatBrl, formatEnumLabel, escapeHtml, showToast } = global.CTI_STORE;
  const { openModal } = global.CTI_MODALS;

  const LENS_STATES = [
    'Microtrincas/Bisel',
    'Riscos Ópticos',
    'Antirreflexo Craquelado',
    'Trinca Furação/Rimless',
    'Película Descolando',
    'Lente Ressecada',
    'Ciente Desmonte'
  ];

  function buildSheetHtml(data, fmt) {
    const { os, brand, trackingQrSvg, pixQrSvg, pixPayload, pixAmount } = data;
    const isLabel = fmt === '50x30';
    if (isLabel) {
      return `
        <div class="ticket-sheet fmt-50x30">
          <div style="display:flex;justify-content:space-between;font-weight:700;">
            <span>${escapeHtml(os.codigo_os)}</span>
            <span>${escapeHtml(os.dominio)}</span>
          </div>
          <div style="font-weight:700;margin-top:3px;">${escapeHtml(os.cliente_nome)}</div>
          <div>${escapeHtml(os.marca_modelo || os.material_peca || '-')}</div>
          <div style="margin-top:3px;">${escapeHtml((os.itens || []).map((i) => i.descricao).join(', ').slice(0, 52))}</div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;font-weight:700;">
            <span>Total: ${escapeHtml(formatBrl(os.valor_total))}</span>
            <span>Saldo: ${escapeHtml(formatBrl(os.saldo_devedor))}</span>
          </div>
        </div>
      `;
    }

    const markedStates = os.estado_lentes || [];
    const lensChecklistHtml = os.dominio === 'OPTICA' ? `
      <div style="margin-top:6px;border-top:1px dashed #999;padding-top:5px;">
        <div style="font-weight:700;">ESTADO DAS LENTES (${escapeHtml(os.tipo_lente)})</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:2px;">
          ${LENS_STATES.map((st) => `
            <span>[${markedStates.includes(st) ? 'X' : ' '}] ${escapeHtml(st)}</span>
          `).join('')}
        </div>
      </div>
    ` : '';

    const itemsRows = (os.itens || []).map((it) => `
      <div style="display:flex;justify-content:space-between;gap:6px;">
        <span>${it.quantidade}x ${escapeHtml(it.descricao)}</span>
        <span>${escapeHtml(formatBrl(it.valor_total))}</span>
      </div>
    `).join('');

    return `
      <div class="ticket-sheet fmt-${fmt}">
        <div style="text-align:center;border-bottom:1px solid #121316;padding-bottom:6px;margin-bottom:6px;">
          <div style="font-size:13px;font-weight:700;">${escapeHtml(brand.name)}</div>
          <div>${escapeHtml(brand.slogan)}</div>
          <div style="font-weight:700;margin-top:3px;">ENVELOPE DE BANCADA - ${escapeHtml(os.codigo_os)}</div>
        </div>

        <div><strong>Cliente:</strong> ${escapeHtml(os.cliente_nome)}</div>
        <div><strong>WhatsApp:</strong> ${escapeHtml(os.telefone_formatado)}</div>
        <div><strong>Domínio:</strong> ${escapeHtml(formatEnumLabel(os.dominio))} | <strong>SLA:</strong> ${escapeHtml(formatEnumLabel(os.prioridade_sla))}</div>
        ${os.prazo_prometido_em ? `<div><strong>Previsão:</strong> ${escapeHtml(os.prazo_prometido_em)}</div>` : ''}
        ${os.marca_modelo ? `<div><strong>Peça/Modelo:</strong> ${escapeHtml(os.marca_modelo)}</div>` : ''}
        ${os.material_peca ? `<div><strong>Material:</strong> ${escapeHtml(os.material_peca)}</div>` : ''}
        ${(os.locais_avaria || []).length > 0 ? `<div><strong>Avarias:</strong> ${escapeHtml(os.locais_avaria.join(', '))}</div>` : ''}
        ${lensChecklistHtml}

        <div style="margin-top:6px;border-top:1px dashed #999;padding-top:5px;">
          <div style="font-weight:700;margin-bottom:2px;">SERVIÇOS &amp; PRODUTOS</div>
          ${itemsRows}
        </div>

        <div style="margin-top:6px;border-top:1px solid #121316;padding-top:5px;">
          <div style="display:flex;justify-content:space-between;"><span>Subtotal:</span><span>${escapeHtml(formatBrl(os.subtotal))}</span></div>
          ${os.desconto_valor > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Desconto:</span><span>-${escapeHtml(formatBrl(os.desconto_valor))}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;font-weight:700;"><span>TOTAL:</span><span>${escapeHtml(formatBrl(os.valor_total))}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>Pago:</span><span>${escapeHtml(formatBrl(os.valor_pago))}</span></div>
          <div style="display:flex;justify-content:space-between;font-weight:700;"><span>SALDO DEVEDOR:</span><span>${escapeHtml(formatBrl(os.saldo_devedor))}</span></div>
        </div>

        <div class="ticket-perforation"><span>picote - canhoto do cliente</span></div>

        <div style="text-align:center;font-weight:700;margin-bottom:4px;">COMPROVANTE ${escapeHtml(os.codigo_os)}</div>
        <div>Cliente: ${escapeHtml(os.cliente_nome)}</div>
        <div>Resumo: ${escapeHtml((os.itens || []).map((i) => i.descricao).join(', ').slice(0, 75))}</div>
        <div style="font-weight:700;">Saldo na Retirada: ${escapeHtml(formatBrl(os.saldo_devedor))}</div>

        <div class="ticket-qr-row">
          <div class="ticket-qr-box">
            ${trackingQrSvg || ''}
            <div>Rastreio OS</div>
          </div>
          ${pixQrSvg ? `
            <div class="ticket-qr-box">
              ${pixQrSvg}
              <div>PIX ${escapeHtml(formatBrl(pixAmount))}</div>
            </div>
          ` : ''}
        </div>
        ${pixPayload ? `<div style="font-size:8px;word-break:break-all;margin-top:4px;">PIX: ${escapeHtml(pixPayload)}</div>` : ''}
      </div>
    `;
  }

  function printSheetWindow(sheetHtml) {
    const win = window.open('', '_blank', 'width=820,height=720');
    if (!win) {
      showToast('Permita pop-ups para enviar para a impressora térmica.', 'warn');
      return;
    }
    win.document.write(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Impressão OS</title>
      <style>
        body { margin: 8px; font-family: monospace; color: #121316; background: #FFF; }
        .ticket-sheet { border: none; padding: 0; margin: 0 auto; }
        .fmt-80mm { width: 76mm; font-size: 11px; }
        .fmt-58mm { width: 54mm; font-size: 10px; }
        .fmt-50x30 { width: 50mm; font-size: 9px; }
        .fmt-a4 { width: 190mm; font-size: 12px; }
        .ticket-perforation { margin: 12px 0; border-top: 2px dashed #000; text-align: center; }
        .ticket-perforation span { background: #FFF; padding: 0 6px; font-size: 9px; position: relative; top: -8px; }
        .ticket-qr-row { display: flex; justify-content: space-around; margin-top: 8px; }
        .ticket-qr-box { width: 82px; text-align: center; font-size: 9px; }
        .ticket-qr-box svg { width: 74px; height: 74px; }
      </style>
      </head><body>${sheetHtml}<script>window.onload=function(){window.print();};</script></body></html>
    `);
    win.document.close();
  }

  async function openPrintPreview(osId) {
    openModal('Motor de Impressão Térmica & Etiqueta', '<div class="eyebrow">Gerando envelope e QR Codes...</div>', true);
    try {
      const data = await apiFetch(`/api/os/${osId}/impressao`);
      let fmt = '80mm';

      const render = () => {
        const sheetHtml = buildSheetHtml(data, fmt);
        const body = `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
            <div class="seg-switch">
              <button class="seg-btn ${fmt === '80mm' ? 'is-active' : ''}" type="button" data-fmt="80mm">Bobina 80mm</button>
              <button class="seg-btn ${fmt === '58mm' ? 'is-active' : ''}" type="button" data-fmt="58mm">Bobina 58mm</button>
              <button class="seg-btn ${fmt === '50x30' ? 'is-active' : ''}" type="button" data-fmt="50x30">Etiqueta 50x30</button>
              <button class="seg-btn ${fmt === 'a4' ? 'is-active' : ''}" type="button" data-fmt="a4">A4</button>
            </div>
            <button class="btn btn-accent btn-sm" type="button" id="prt-run-btn">Imprimir Agora</button>
          </div>
          <div class="ticket-preview-wrap">${sheetHtml}</div>
        `;
        openModal(`Impressão ${data.os.codigo_os}`, body, true);
        document.querySelectorAll('[data-fmt]').forEach((btn) => {
          btn.addEventListener('click', () => {
            fmt = btn.getAttribute('data-fmt');
            render();
          });
        });
        document.getElementById('prt-run-btn').addEventListener('click', () => printSheetWindow(sheetHtml));
      };
      render();
    } catch (err) {
      openModal('Impressão Térmica', `<div class="eyebrow" style="color:var(--status-danger);">${escapeHtml(err.message)}</div>`);
    }
  }

  global.CTI_THERMAL_PRINTER = {
    openPrintPreview,
    buildSheetHtml
  };
})(window);
