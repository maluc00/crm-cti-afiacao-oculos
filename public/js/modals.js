(function attachModals(global) {
  'use strict';

  const { state, apiFetch, formatBrl, escapeHtml, showToast, refreshOverview } = global.CTI_STORE;

  function openModal(title, bodyHtml, large = false) {
    const backdrop = document.getElementById('modal-backdrop');
    const panel = document.getElementById('modal-panel');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');

    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    panel.classList.toggle('modal-lg', Boolean(large));
    backdrop.classList.remove('hidden');
    state.modalOpen = true;
    global.CTI_ICONS.hydrateIcons(panel);
  }

  async function closeModal() {
    const backdrop = document.getElementById('modal-backdrop');
    const bodyEl = document.getElementById('modal-body');
    backdrop.classList.add('hidden');
    bodyEl.innerHTML = '';
    state.modalOpen = false;
    if (state.pendingRefresh) {
      state.pendingRefresh = false;
      await refreshOverview('deferred-flush');
    }
  }

  async function openLanQrModal() {
    openModal('Conexao Mobile via Wi-Fi / LAN', '<div class="eyebrow">Detectando adaptadores de rede...</div>');
    try {
      const info = await apiFetch('/api/system/lan-info');
      const pinBox = info.pinEnabled
        ? `<div class="switch-row" style="width:100%;">
             <div style="text-align:left;">
               <div class="eyebrow">PIN de Acesso Ativo</div>
               <div class="mono" style="font-size:18px;font-weight:700;">${escapeHtml(info.pinCode || '****')}</div>
             </div>
             <div style="display:flex;gap:8px;">
               <button class="btn btn-sm" type="button" id="lan-pin-regen">Novo PIN</button>
               <button class="btn btn-sm" type="button" id="lan-pin-toggle">Desativar PIN</button>
             </div>
           </div>`
        : `<div class="switch-row" style="width:100%;">
             <div style="text-align:left;">
               <div class="eyebrow">Seguranca LAN Opcional</div>
               <div style="font-size:12px;">Acesso direto na rede Wi-Fi local</div>
             </div>
             <button class="btn btn-sm" type="button" id="lan-pin-toggle">Ativar PIN</button>
           </div>`;

      const html = `
        <div class="qr-stage">
          <div class="qr-frame">${info.qrSvg}</div>
          <div>
            <div class="eyebrow">Endereco do Servidor Local (${escapeHtml(info.primaryInterface)})</div>
            <div class="mono" style="font-size:15px;font-weight:700;margin-top:4px;word-break:break-all;">
              ${escapeHtml(info.lanUrl)}
            </div>
            <div class="page-subtitle">Aponte a camera do celular na mesma rede Wi-Fi para operar em tempo real.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
            <button class="btn btn-accent" type="button" id="lan-copy-url">
              <span class="icon" data-icon="copy"></span>
              <span>Copiar Link LAN</span>
            </button>
            <button class="btn" type="button" id="lan-refresh-info">
              <span class="icon" data-icon="refresh"></span>
              <span>Atualizar IP</span>
            </button>
          </div>
          ${pinBox}
          <div class="eyebrow">Dispositivos Conectados: <span class="mono">${info.connectedClients}</span></div>
        </div>
      `;
      openModal('Conexao Mobile via Wi-Fi / LAN', html);

      document.getElementById('lan-copy-url').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(info.lanUrl);
          showToast('Link LAN copiado para a area de transferencia.', 'ok');
        } catch (_err) {
          showToast(info.lanUrl, 'info');
        }
      });

      document.getElementById('lan-refresh-info').addEventListener('click', openLanQrModal);

      document.getElementById('lan-pin-toggle').addEventListener('click', async () => {
        await apiFetch('/api/system/lan-pin', {
          method: 'POST',
          body: JSON.stringify({ enabled: !info.pinEnabled })
        });
        showToast(!info.pinEnabled ? 'PIN LAN ativado.' : 'PIN LAN desativado.', 'ok');
        openLanQrModal();
      });

      const regenBtn = document.getElementById('lan-pin-regen');
      if (regenBtn) {
        regenBtn.addEventListener('click', async () => {
          await apiFetch('/api/system/lan-pin', {
            method: 'POST',
            body: JSON.stringify({ enabled: true, regenerate: true })
          });
          showToast('Novo codigo PIN gerado.', 'ok');
          openLanQrModal();
        });
      }
    } catch (err) {
      openModal('Conexao Mobile via Wi-Fi / LAN', `<div class="eyebrow" style="color:var(--status-danger);">${escapeHtml(err.message)}</div>`);
    }
  }

  function buildSpotlightEntries(queryText) {
    const q = String(queryText || '').trim().toLowerCase();
    const overview = state.overview;
    const baseCommands = [
      { kind: 'ROTA', label: 'Atendimento & Abertura de OS', meta: 'Atalho F2', action: () => global.CTI_APP.navigate('atendimento') },
      { kind: 'ROTA', label: 'Bancada Tecnica (Fila & Producao)', meta: 'Operacao', action: () => global.CTI_APP.navigate('bancada') },
      { kind: 'ROTA', label: 'Clientes & CRM', meta: 'Cadastro', action: () => global.CTI_APP.navigate('clientes') },
      { kind: 'ROTA', label: 'Catalogo, BOM & Estoque', meta: 'Itens ativos', action: () => global.CTI_APP.navigate('estoque') },
      { kind: 'ROTA', label: 'Caixa Diario & Livro-Razao', meta: 'Atalho F4', action: () => global.CTI_APP.navigate('caixa') },
      { kind: 'ROTA', label: 'Painel BI & Indicadores', meta: 'Analise', action: () => global.CTI_APP.navigate('bi') },
      { kind: 'ROTA', label: 'Ajustes White-Label & Modo Oficina', meta: 'Configuracoes', action: () => global.CTI_APP.navigate('configuracoes') },
      { kind: 'ACAO', label: 'Conectar Celular via QR Code LAN', meta: 'Atalho F7', action: openLanQrModal },
      { kind: 'ACAO', label: 'Alternar Modo Foco Universal', meta: 'Atalho F8', action: () => global.CTI_APP.toggleFocusMode() }
    ];

    const catalogEntries = (overview?.catalogItems || []).map((item) => ({
      kind: item.tipo,
      label: `${item.abreviacao_balcao} - ${item.nome_tecnico}`,
      meta: `${item.dominio} | ${formatBrl(item.preco_venda)}`,
      action: () => global.CTI_APP.navigate('estoque')
    }));

    const merged = baseCommands.concat(catalogEntries);
    if (!q) return merged.slice(0, 12);
    return merged
      .filter((entry) =>
        entry.label.toLowerCase().includes(q) ||
        entry.kind.toLowerCase().includes(q) ||
        entry.meta.toLowerCase().includes(q)
      )
      .slice(0, 14);
  }

  function openSpotlightModal() {
    const html = `
      <div class="field">
        <input class="input" id="spotlight-search-input" type="search" placeholder="Buscar tela, comando, servico optico ou afiacao..." autocomplete="off">
      </div>
      <div class="spotlight-list" id="spotlight-results"></div>
    `;
    openModal('Spotlight de Comandos & Catalogo', html, true);

    const input = document.getElementById('spotlight-search-input');
    const resultsEl = document.getElementById('spotlight-results');

    function renderResults() {
      const entries = buildSpotlightEntries(input.value);
      if (entries.length === 0) {
        resultsEl.innerHTML = '<div class="eyebrow" style="padding:12px;">Nenhum comando ou item compativel no modo atual.</div>';
        return;
      }
      resultsEl.innerHTML = entries
        .map((entry, idx) => `
          <button class="spotlight-row" type="button" data-spot-idx="${idx}">
            <div>
              <span class="badge badge-accent">${escapeHtml(entry.kind)}</span>
              <span style="margin-left:8px;font-weight:600;">${escapeHtml(entry.label)}</span>
            </div>
            <span class="mono" style="font-size:11px;color:var(--text-secondary);">${escapeHtml(entry.meta)}</span>
          </button>
        `)
        .join('');

      resultsEl.querySelectorAll('[data-spot-idx]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const entry = entries[Number(btn.getAttribute('data-spot-idx'))];
          await closeModal();
          if (entry && entry.action) entry.action();
        });
      });
    }

    input.addEventListener('input', renderResults);
    renderResults();
    setTimeout(() => input.focus(), 20);
  }

  function openCashSemaphoreModal() {
    const session = state.overview?.cashSession;
    const isOpen = session && session.status === 'ABERTO';

    if (isOpen) {
      const html = `
        <div class="grid-2" style="margin-bottom:14px;">
          <div class="card kpi-card">
            <div class="eyebrow">Status Atual</div>
            <div class="kpi-value" style="font-size:18px;display:flex;align-items:center;gap:8px;">
              <span class="led led-green"></span>
              <span>Turno #${session.id} Aberto</span>
            </div>
            <div class="kpi-hint mono">Aberto em ${escapeHtml(session.aberto_em)}</div>
          </div>
          <div class="card kpi-card">
            <div class="eyebrow">Fundo Inicial (Especie)</div>
            <div class="kpi-value mono">${escapeHtml(formatBrl(session.saldo_inicial_especie))}</div>
            <div class="kpi-hint">Registrado no Livro-Razao Imutavel</div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button class="btn btn-accent" type="button" id="cash-modal-go-ledger">Abrir Caixa &amp; Ledger</button>
        </div>
      `;
      openModal('Semaforo do Caixa Diario', html);
      document.getElementById('cash-modal-go-ledger').addEventListener('click', async () => {
        await closeModal();
        global.CTI_APP.navigate('caixa');
      });
      return;
    }

    const html = `
      <p class="page-subtitle" style="margin-bottom:14px;">
        Nenhum turno de caixa aberto hoje. Informe o fundo de troco em especie para liberar o registro financeiro.
      </p>
      <form id="quick-cash-open-form" class="field" style="gap:12px;">
        <div class="field">
          <label for="cash-saldo-inicial">Saldo Inicial em Especie (R$)</label>
          <input class="input mono" id="cash-saldo-inicial" type="number" min="0" step="0.01" value="100.00" required>
        </div>
        <div class="field">
          <label for="cash-observacoes">Observacao de Abertura</label>
          <input class="input" id="cash-observacoes" type="text" value="Abertura de turno matinal" maxlength="160">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn" type="button" id="cash-cancel-btn">Cancelar</button>
          <button class="btn btn-accent" type="submit">Abrir Caixa Diario</button>
        </div>
      </form>
    `;
    openModal('Semaforo do Caixa Diario', html);
    document.getElementById('cash-cancel-btn').addEventListener('click', closeModal);
    document.getElementById('quick-cash-open-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const saldo = Number(document.getElementById('cash-saldo-inicial').value || 0);
      const obs = document.getElementById('cash-observacoes').value;
      try {
        await apiFetch('/api/caixa/sessao-rapida', {
          method: 'POST',
          body: JSON.stringify({ saldo_inicial_especie: saldo, observacoes: obs })
        });
        await refreshOverview('cash:opened');
        await closeModal();
        showToast('Turno de caixa aberto com sucesso.', 'ok');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  async function enforceLanPinIfNeeded() {
    const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocalHost) return;
    if (sessionStorage.getItem('cti_pin_ok') === '1') return;

    const status = await apiFetch('/api/system/status');
    if (!status.lanPinEnabled) return;

    const urlParams = new URLSearchParams(location.search);
    const pinFromUrl = urlParams.get('pin');
    if (pinFromUrl) {
      try {
        await apiFetch('/api/system/verify-pin', {
          method: 'POST',
          body: JSON.stringify({ pin: pinFromUrl })
        });
        sessionStorage.setItem('cti_pin_ok', '1');
        return;
      } catch (_err) {
        // Segue para prompt manual se PIN da URL for invalido
      }
    }

    const backdrop = document.getElementById('pin-gate-backdrop');
    const form = document.getElementById('pin-gate-form');
    const input = document.getElementById('pin-gate-input');
    const errEl = document.getElementById('pin-gate-error');
    backdrop.classList.remove('hidden');

    await new Promise((resolve) => {
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        errEl.textContent = '';
        try {
          await apiFetch('/api/system/verify-pin', {
            method: 'POST',
            body: JSON.stringify({ pin: input.value })
          });
          sessionStorage.setItem('cti_pin_ok', '1');
          backdrop.classList.add('hidden');
          resolve();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    });
  }

  global.CTI_MODALS = {
    openModal,
    closeModal,
    openLanQrModal,
    openSpotlightModal,
    openCashSemaphoreModal,
    enforceLanPinIfNeeded
  };
})(window);
