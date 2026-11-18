(function attachStateSync(global) {
  'use strict';

  const CLIENT_ID = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'cti-' + Math.random().toString(36).slice(2, 10);

  const state = {
    route: 'atendimento',
    domainFilter: 'ALL',
    settings: null,
    overview: null,
    connectedClients: 1,
    wsConnected: false,
    modalOpen: false,
    pendingRefresh: false,
    hudVisible: true,
    preselectedClientForOs: null
  };

  const listeners = new Set();
  let wsSocket = null;
  let reconnectTimer = null;

  function roundMoney(value) {
    const num = Number(value || 0);
    return Number.isFinite(num) ? Math.round((num + Number.EPSILON) * 100) / 100 : 0;
  }

  function formatBrl(value) {
    const rounded = roundMoney(value);
    const formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Math.abs(rounded));
    return (rounded < 0 ? '-R$ ' : 'R$ ') + formatted;
  }

  function computeLuminanceClient(hexColor) {
    const clean = String(hexColor || '#B45309').trim();
    const full = /^#([0-9a-fA-F]{6})$/.exec(clean);
    if (!full) {
      return computeLuminanceClient('#B45309');
    }
    const hex = full[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = Math.round((0.299 * r + 0.587 * g + 0.114 * b) * 100) / 100;
    return {
      hex: `#${hex.toUpperCase()}`,
      r,
      g,
      b,
      luminance,
      contrastText: luminance >= 155 ? '#121316' : '#FFFFFF',
      focusRing: `rgba(${r}, ${g}, ${b}, 0.16)`,
      softBg: `rgba(${r}, ${g}, ${b}, 0.10)`
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Trava Poka-Yoke: impede que eventos de sincronizacao LAN fechem ou resetem
   * formularios e modais enquanto o operador esta digitando ou editando.
   */
  function isInteractingWithModalOrForm() {
    if (state.modalOpen) return true;
    const modalBackdrop = document.getElementById('modal-backdrop');
    if (modalBackdrop && !modalBackdrop.classList.contains('hidden')) return true;

    const activeEl = document.activeElement;
    if (activeEl && /^(INPUT|TEXTAREA|SELECT)$/.test(activeEl.tagName)) {
      return true;
    }
    if (document.querySelector('[data-dirty-form="true"]')) {
      return true;
    }
    return false;
  }

  function showToast(message, variant = 'info') {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;

    const ledClass = variant === 'error'
      ? 'led-red'
      : variant === 'warn'
        ? 'led-amber'
        : variant === 'ok'
          ? 'led-green'
          : 'led-accent';

    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="led ${ledClass}"></span><span>${escapeHtml(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3400);
  }

  function applyThemeAndBrand(settings) {
    if (!settings) return;
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme_mode || 'warm-atelier');
    root.setAttribute('data-focus', settings.focus_mode === '1' ? 'true' : 'false');

    const lum = computeLuminanceClient(settings.accent_color || '#B45309');
    root.style.setProperty('--accent-color', lum.hex);
    root.style.setProperty('--accent-contrast', lum.contrastText);
    root.style.setProperty('--accent-ring', lum.focusRing);
    root.style.setProperty('--accent-soft', lum.softBg);

    const sideName = document.getElementById('sidebar-brand-name');
    const sideSlogan = document.getElementById('sidebar-brand-slogan');
    const sideIcon = document.getElementById('sidebar-brand-icon');
    const mobName = document.getElementById('mobile-brand-name');
    const mobIcon = document.getElementById('mobile-brand-icon');

    if (sideName) sideName.textContent = settings.brand_name || 'CTI Pro Oficina';
    if (sideSlogan) sideSlogan.textContent = settings.brand_slogan || '';
    if (mobName) mobName.textContent = settings.brand_name || 'CTI Pro';

    const fallbackSvg = global.CTI_ICONS ? global.CTI_ICONS.BRAND_PRESETS[0].svg : '';
    const svgHtml = settings.brand_icon_svg || fallbackSvg;
    if (sideIcon) sideIcon.innerHTML = svgHtml;
    if (mobIcon) mobIcon.innerHTML = svgHtml;
    document.title = `${settings.brand_name || 'CTI Pro CRM'} - Oficina`;

    if (settings.switches && typeof settings.switches.hud_f9_visible === 'boolean') {
      state.hudVisible = settings.switches.hud_f9_visible;
      const hud = document.getElementById('keyboard-hud');
      if (hud) hud.classList.toggle('hidden', !state.hudVisible);
    }
  }

  async function apiFetch(url, options = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json', 'x-client-id': CLIENT_ID },
      options.headers || {}
    );
    const res = await fetch(url, Object.assign({}, options, { headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Falha HTTP ${res.status}`);
    }
    return data;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function notify(eventName) {
    for (const fn of listeners) {
      fn(state, eventName);
    }
  }

  async function refreshOverview(reason = 'manual') {
    const query = state.domainFilter && state.domainFilter !== 'ALL'
      ? `?domain=${encodeURIComponent(state.domainFilter)}`
      : '';
    const overview = await apiFetch(`/api/system/overview${query}`);
    state.overview = overview;
    state.settings = overview.settings;
    applyThemeAndBrand(overview.settings);
    notify(reason);
    return overview;
  }

  async function saveSettings(partial) {
    const updated = await apiFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(partial)
    });
    state.settings = updated;
    applyThemeAndBrand(updated);
    await refreshOverview('settings:saved');
    return updated;
  }

  function connectWebSocket() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${location.host}/ws`;
    wsSocket = new WebSocket(wsUrl);

    wsSocket.addEventListener('open', () => {
      state.wsConnected = true;
      notify('ws:open');
    });

    wsSocket.addEventListener('message', async (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (_err) {
        return;
      }
      if (typeof msg.connectedClients === 'number') {
        state.connectedClients = msg.connectedClients;
      } else if (msg.payload && typeof msg.payload.connectedClients === 'number') {
        state.connectedClients = msg.payload.connectedClients;
      }

      if (
        msg.type === 'settings:updated' ||
        msg.type === 'caixa:updated' ||
        msg.type === 'catalogo:updated' ||
        msg.type === 'clientes:updated'
      ) {
        if (msg.originClientId === CLIENT_ID) {
          notify('ws:clients');
          return;
        }
        if (isInteractingWithModalOrForm()) {
          state.pendingRefresh = true;
          showToast('Atualizacao recebida pela rede LAN. Sera aplicada ao concluir a edicao.', 'info');
          notify('ws:deferred');
          return;
        }
        await refreshOverview(`ws:${msg.type}`);
        showToast('Configuracao sincronizada via rede local.', 'ok');
        return;
      }

      notify('ws:clients');
    });

    wsSocket.addEventListener('close', () => {
      state.wsConnected = false;
      notify('ws:close');
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectWebSocket, 2500);
    });
  }

  global.CTI_STORE = {
    CLIENT_ID,
    state,
    roundMoney,
    formatBrl,
    computeLuminanceClient,
    escapeHtml,
    isInteractingWithModalOrForm,
    showToast,
    applyThemeAndBrand,
    apiFetch,
    subscribe,
    notify,
    refreshOverview,
    saveSettings,
    connectWebSocket
  };
})(window);
