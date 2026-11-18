(function attachCtiApp(global) {
  'use strict';

  const {
    state,
    subscribe,
    refreshOverview,
    saveSettings,
    connectWebSocket,
    showToast
  } = global.CTI_STORE;
  const { hydrateIcons, icon } = global.CTI_ICONS;
  const modals = global.CTI_MODALS;

  const VALID_ROUTES = ['atendimento', 'bancada', 'clientes', 'estoque', 'caixa', 'bi', 'configuracoes'];

  function renderDomainSwitcher() {
    const wrap = document.getElementById('domain-switcher-wrap');
    const settings = state.settings;
    if (!wrap || !settings) return;

    if (settings.operation_mode === 'OPTICAL_ONLY') {
      wrap.innerHTML = `<span class="domain-badge-static">${icon('glasses')}<span>Exclusivo Optica</span></span>`;
      return;
    }
    if (settings.operation_mode === 'CUTLERY_ONLY') {
      wrap.innerHTML = `<span class="domain-badge-static">${icon('scissors')}<span>Exclusivo Afiacao</span></span>`;
      return;
    }

    const active = state.domainFilter || 'ALL';
    wrap.innerHTML = `
      <div class="domain-switcher" role="group" aria-label="Filtro rapido de dominio">
        <button class="domain-pill ${active === 'ALL' ? 'is-active' : ''}" type="button" data-dom="ALL">Todos</button>
        <button class="domain-pill ${active === 'OPTICA' ? 'is-active' : ''}" type="button" data-dom="OPTICA">Optica</button>
        <button class="domain-pill ${active === 'CUTELARIA' ? 'is-active' : ''}" type="button" data-dom="CUTELARIA">Afiacao</button>
      </div>
    `;
    wrap.querySelectorAll('[data-dom]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.domainFilter = btn.getAttribute('data-dom');
        await refreshOverview('domain:changed');
      });
    });
  }

  function updateChrome() {
    const overview = state.overview;
    const settings = state.settings;
    if (!settings) return;

    renderDomainSwitcher();

    // Semaforo do Caixa Diario
    const cashLed = document.getElementById('cash-led');
    const cashText = document.getElementById('cash-status-text');
    const isOpen = overview?.cashSession && overview.cashSession.status === 'ABERTO';
    cashLed.className = `led ${isOpen ? 'led-green' : 'led-amber'}`;
    cashText.textContent = isOpen ? `Caixa #${overview.cashSession.id} Aberto` : 'Caixa Fechado';

    // Botao Tema
    const themeIcon = document.getElementById('theme-toggle-icon');
    const themeLabel = document.getElementById('theme-toggle-label');
    const isDark = settings.theme_mode === 'titanium-dark';
    themeIcon.innerHTML = icon(isDark ? 'sun' : 'moon');
    themeLabel.textContent = isDark ? 'Warm Atelier' : 'Titanium';

    // Botao Foco F8
    const focusBtn = document.getElementById('btn-focus-toggle');
    focusBtn.classList.toggle('btn-accent', settings.focus_mode === '1');

    // Sincronismo LAN
    const syncLed = document.getElementById('sync-led');
    const syncLabel = document.getElementById('sync-status-label');
    const syncCount = document.getElementById('sync-clients-count');
    syncLed.className = `led ${state.wsConnected ? 'led-green' : 'led-amber'}`;
    syncLabel.textContent = state.wsConnected ? 'LAN Sincronizado' : 'Reconectando...';
    syncCount.textContent = String(state.connectedClients || 1);

    // HUD readout
    const hudReadout = document.getElementById('hud-mode-readout');
    if (hudReadout) {
      const pLabel = settings.partners_mode_enabled === '1' ? 'PARCEIROS' : 'SOLO';
      hudReadout.textContent = `${settings.operation_mode} | ${pLabel}`;
    }

    // Active nav markers
    document.querySelectorAll('[data-route]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-route') === state.route);
    });
  }

  function renderCurrentRoute() {
    const viewport = document.getElementById('app-viewport');
    if (!viewport || !state.overview) return;
    if (state.route === 'configuracoes') {
      global.CTI_VIEW_SETTINGS.renderSettingsView(viewport);
      hydrateIcons(viewport);
    } else if (state.route === 'estoque') {
      global.CTI_VIEW_CATALOG.renderCatalogView(viewport)
        .then(() => hydrateIcons(viewport))
        .catch((err) => showToast(err.message, 'error'));
    } else if (state.route === 'clientes') {
      global.CTI_VIEW_CLIENTS.renderClientsView(viewport)
        .then(() => hydrateIcons(viewport))
        .catch((err) => showToast(err.message, 'error'));
    } else {
      global.CTI_VIEWS_SHELL.renderOperationalView(viewport, state.route);
      hydrateIcons(viewport);
    }
  }

  function navigate(routeName) {
    const target = VALID_ROUTES.includes(routeName) ? routeName : 'atendimento';
    state.route = target;
    if (location.hash !== `#${target}`) {
      history.replaceState(null, '', `#${target}`);
    }
    updateChrome();
    renderCurrentRoute();
  }

  async function toggleFocusMode() {
    if (!state.settings) return;
    const next = state.settings.focus_mode === '1' ? '0' : '1';
    await saveSettings({ focus_mode: next });
    showToast(next === '1' ? 'Modo Foco F8 ativado.' : 'Modo Foco F8 desativado.', 'ok');
  }

  async function toggleThemeMode() {
    if (!state.settings) return;
    const next = state.settings.theme_mode === 'titanium-dark' ? 'warm-atelier' : 'titanium-dark';
    await saveSettings({ theme_mode: next });
  }

  async function toggleKeyboardHud() {
    if (!state.settings) return;
    const current = state.settings.switches?.hud_f9_visible !== false;
    const nextSwitches = Object.assign({}, state.settings.switches, { hud_f9_visible: !current });
    await saveSettings({ switches: nextSwitches });
  }

  function bindGlobalEvents() {
    document.querySelectorAll('[data-route]').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.getAttribute('data-route')));
    });

    document.getElementById('btn-spotlight').addEventListener('click', modals.openSpotlightModal);
    document.getElementById('btn-cash-semaphore').addEventListener('click', modals.openCashSemaphoreModal);
    document.getElementById('btn-theme-toggle').addEventListener('click', toggleThemeMode);
    document.getElementById('btn-focus-toggle').addEventListener('click', toggleFocusMode);
    document.getElementById('btn-lan-qr').addEventListener('click', modals.openLanQrModal);
    document.getElementById('sidebar-qr-btn').addEventListener('click', modals.openLanQrModal);
    document.getElementById('modal-close').addEventListener('click', modals.closeModal);

    document.getElementById('modal-backdrop').addEventListener('click', (ev) => {
      if (ev.target.id === 'modal-backdrop') {
        modals.closeModal();
      }
    });

    document.querySelectorAll('[data-hud-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-hud-action');
        if (act === 'spotlight') modals.openSpotlightModal();
        else if (act === 'qr') modals.openLanQrModal();
        else if (act === 'focus') toggleFocusMode();
        else if (act === 'hud') toggleKeyboardHud();
        else if (act.startsWith('route:')) navigate(act.split(':')[1]);
      });
    });

    document.addEventListener('keydown', (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        modals.openSpotlightModal();
      } else if (ev.key === 'F2') {
        ev.preventDefault();
        navigate('atendimento');
      } else if (ev.key === 'F4') {
        ev.preventDefault();
        navigate('caixa');
      } else if (ev.key === 'F7') {
        ev.preventDefault();
        modals.openLanQrModal();
      } else if (ev.key === 'F8') {
        ev.preventDefault();
        toggleFocusMode();
      } else if (ev.key === 'F9') {
        ev.preventDefault();
        toggleKeyboardHud();
      } else if (ev.key === 'Escape' && state.modalOpen) {
        ev.preventDefault();
        modals.closeModal();
      }
    });

    window.addEventListener('hashchange', () => {
      const next = location.hash.replace('#', '').trim();
      if (VALID_ROUTES.includes(next)) {
        navigate(next);
      }
    });
  }

  async function bootstrap() {
    hydrateIcons(document);
    bindGlobalEvents();

    subscribe((_s, reason) => {
      updateChrome();
      if (reason !== 'ws:open' && reason !== 'ws:close' && reason !== 'ws:clients' && reason !== 'ws:deferred') {
        renderCurrentRoute();
      }
    });

    await modals.enforceLanPinIfNeeded();
    const initialRoute = location.hash.replace('#', '').trim();
    if (VALID_ROUTES.includes(initialRoute)) {
      state.route = initialRoute;
    }

    await refreshOverview('boot');
    connectWebSocket();
  }

  global.CTI_APP = {
    navigate,
    toggleFocusMode,
    toggleThemeMode,
    toggleKeyboardHud
  };

  document.addEventListener('DOMContentLoaded', () => {
    bootstrap().catch((err) => {
      showToast(`Erro ao inicializar shell: ${err.message}`, 'error');
    });
  });
})(window);
