(function attachSettingsView(global) {
  'use strict';

  const {
    state,
    escapeHtml,
    computeLuminanceClient,
    saveSettings,
    showToast
  } = global.CTI_STORE;

  const ACCENT_SWATCHES = [
    { hex: '#B45309', name: 'Âmbar Oficina' },
    { hex: '#0F766E', name: 'Ciano Óptico' },
    { hex: '#1D4ED8', name: 'Cobalto Técnico' },
    { hex: '#BE123C', name: 'Rubi Cutelaria' },
    { hex: '#EAB308', name: 'Ouro Alto Brilho' },
    { hex: '#374151', name: 'Aço Grafite' }
  ];

  const OPERATION_OPTIONS = [
    {
      value: 'OPTICAL_ONLY',
      title: 'Só Óculos (Óptica)',
      desc: 'Oculta 100% de cutelaria, afiação, insumos e indicadores de lâminas.'
    },
    {
      value: 'CUTLERY_ONLY',
      title: 'Só Afiação (Cutelaria)',
      desc: 'Oculta 100% de referências ópticas, lentes, charneiras e armações.'
    },
    {
      value: 'HYBRID',
      title: 'Híbrido (Óptica + Afiação)',
      desc: 'Ativa seletor rápido [ Óptica | Afiação ] na OS, Bancada, Caixa e BI.'
    }
  ];

  function renderSettingsView(container) {
    const s = state.settings;
    if (!s) return;
    const lum = computeLuminanceClient(s.accent_color);
    const presets = global.CTI_ICONS.BRAND_PRESETS;
    const partnersOn = s.partners_mode_enabled === '1';
    const focusOn = s.focus_mode === '1';
    const customSvg = String(s.brand_icon_svg || '').trim();
    const autoSvg = global.CTI_ICONS.getDefaultBrandSvgForMode(s.operation_mode);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="eyebrow">Camaleão de Domínio &amp; Personalização White-Label</div>
          <h1 class="page-title">Configurações do Sistema</h1>
          <p class="page-subtitle">
            Altere modo da oficina, parceiros, superfícies de bancada e identidade visual em tempo real para PC e Celular.
          </p>
        </div>
        <div class="badge badge-accent mono">${escapeHtml(s.operation_mode)} | Y=${lum.luminance}</div>
      </div>

      <div class="grid-2" style="margin-bottom:16px;">
        <!-- Bloco 1: Camaleão de Domínio & Parceiros -->
        <section class="card panel">
          <div class="panel-head">
            <div>
              <div class="eyebrow">Escopo Operacional</div>
              <h2 class="panel-title">Modo da Oficina (Camaleão)</h2>
            </div>
          </div>
          <div class="choice-grid" style="margin-bottom:14px;">
            ${OPERATION_OPTIONS.map((opt) => `
              <button class="choice-card ${s.operation_mode === opt.value ? 'is-selected' : ''}"
                      type="button" data-op-mode="${opt.value}">
                <span class="choice-title">${escapeHtml(opt.title)}</span>
                <span class="choice-desc">${escapeHtml(opt.desc)}</span>
              </button>
            `).join('')}
          </div>

          <div class="switch-row">
            <div>
              <div style="font-size:13px;font-weight:700;">Modo Parceiros &amp; Comissões</div>
              <div class="choice-desc">
                ${partnersOn
                  ? 'ATIVO: seleciona técnico executor na OS e calcula comissões.'
                  : 'SOLO (OFF): oculta toda UI de parceiros e atribui OS ao operador titular.'}
              </div>
            </div>
            <button class="switch-btn" type="button" id="toggle-partners-mode"
                    role="switch" aria-checked="${partnersOn ? 'true' : 'false'}"
                    aria-label="Alternar modo parceiros"></button>
          </div>
        </section>

        <!-- Bloco 2: Superfícies & F8 -->
        <section class="card panel">
          <div class="panel-head">
            <div>
              <div class="eyebrow">Ergonomia Visual</div>
              <h2 class="panel-title">Superfícies &amp; Modo Foco (F8)</h2>
            </div>
          </div>
          <div class="choice-grid" style="margin-bottom:14px;">
            <button class="choice-card ${s.theme_mode === 'warm-atelier' ? 'is-selected' : ''}"
                    type="button" data-theme-choice="warm-atelier">
              <span class="choice-title">Warm Atelier</span>
              <span class="choice-desc">Claro pergaminho #F8F6F0 ideal para balcão iluminado.</span>
            </button>
            <button class="choice-card ${s.theme_mode === 'titanium-dark' ? 'is-selected' : ''}"
                    type="button" data-theme-choice="titanium-dark">
              <span class="choice-title">Titanium Dark</span>
              <span class="choice-desc">Escuro técnico #131418 com chanfro Double-Bezel.</span>
            </button>
            <button class="choice-card ${focusOn ? 'is-selected' : ''}"
                    type="button" id="card-focus-toggle">
              <span class="choice-title">Modo Foco (F8)</span>
              <span class="choice-desc">
                ${s.theme_mode === 'titanium-dark' ? 'Preto Absoluto OLED #000000 para solda.' : 'Grafite desaturado #F4F3EE.'}
              </span>
            </button>
          </div>

          <div class="switch-row">
            <div>
              <div style="font-size:13px;font-weight:700;">HUD de Atalhos no Rodapé (F9)</div>
              <div class="choice-desc">Exibe barra de atalhos rápidos no desktop.</div>
            </div>
            <button class="switch-btn" type="button" id="toggle-hud-f9"
                    role="switch" aria-checked="${s.switches?.hud_f9_visible !== false ? 'true' : 'false'}"
                    aria-label="Alternar HUD F9"></button>
          </div>
        </section>
      </div>

      <div class="grid-2">
        <!-- Bloco 3: Identidade White-Label + Motor Luminância -->
        <section class="card panel">
          <div class="panel-head">
            <div>
              <div class="eyebrow">Identidade da Marca</div>
              <h2 class="panel-title">White-Label &amp; Motor WCAG AAA</h2>
            </div>
            <button class="btn btn-accent btn-sm" type="button" id="preview-accent-btn">Botão de Acento</button>
          </div>

          <form id="whitelabel-form" class="field" style="gap:12px;">
            <div class="field-grid">
              <div class="field">
                <label for="wl-brand-name">Nome da Oficina</label>
                <input class="input" id="wl-brand-name" type="text" value="${escapeHtml(s.brand_name)}" maxlength="60" required>
              </div>
              <div class="field">
                <label for="wl-brand-slogan">Slogan Institucional</label>
                <input class="input" id="wl-brand-slogan" type="text" value="${escapeHtml(s.brand_slogan)}" maxlength="90">
              </div>
            </div>

            <div class="field">
              <label>Cor de Destaque &amp; Luminância Relativa</label>
              <div class="swatch-row">
                ${ACCENT_SWATCHES.map((sw) => `
                  <button class="swatch ${lum.hex === sw.hex ? 'is-active' : ''}" type="button"
                          style="background-color:${sw.hex};" title="${escapeHtml(sw.name)}"
                          data-accent-swatch="${sw.hex}"></button>
                `).join('')}
                <input type="color" id="wl-accent-picker" value="${lum.hex}" style="width:40px;height:30px;border:none;background:none;cursor:pointer;">
                <input class="input mono" id="wl-accent-hex" type="text" value="${lum.hex}" maxlength="7" style="width:110px;">
              </div>
              <div class="luminance-meter" id="wl-luminance-readout">
                <span>Fórmula Y = 0.299R + 0.587G + 0.114B</span>
                <span class="mono">Y = ${lum.luminance} | Texto = ${lum.contrastText}</span>
              </div>
            </div>

            <div class="field">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                <label>Ícone Vetorial da Marca (Zero Emojis)</label>
                <button class="btn btn-sm ${!customSvg ? 'is-selected btn-accent' : ''}" type="button" id="wl-svg-auto-btn">
                  <span style="width:14px;height:14px;display:inline-flex;">${autoSvg}</span>
                  <span>Automático (Camaleão)</span>
                </button>
              </div>
              <div class="icon-preset-grid">
                ${presets.map((p, idx) => `
                  <button class="icon-preset-btn ${customSvg === p.svg ? 'is-selected' : ''}" type="button" data-svg-preset="${idx}">
                    ${p.svg}
                    <span>${escapeHtml(p.label)}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="field">
              <label for="wl-brand-svg">SVG Vetorial Customizado</label>
              <textarea class="textarea mono" id="wl-brand-svg" style="min-height:74px;font-size:11px;" placeholder="Vazio = automático conforme modo da oficina (Óptica / Cutelaria / Híbrido)">${escapeHtml(customSvg)}</textarea>
            </div>

            <div style="display:flex;justify-content:flex-end;">
              <button class="btn btn-accent" type="submit">Salvar Identidade White-Label</button>
            </div>
          </form>
        </section>

        <!-- Bloco 4: PIX, Taxas de Cartão & Metas -->
        <section class="card panel">
          <div class="panel-head">
            <div>
              <div class="eyebrow">Parâmetros Financeiros</div>
              <h2 class="panel-title">PIX &amp; Taxas de Adquirência</h2>
            </div>
          </div>

          <form id="finance-settings-form" class="field" style="gap:12px;">
            <div class="field">
              <label for="fin-pix-key">Chave PIX da Oficina</label>
              <input class="input mono" id="fin-pix-key" type="text" value="${escapeHtml(s.pix_key)}" placeholder="CNPJ, E-mail, Telefone ou Chave Aleatória">
            </div>

            <div class="field-grid">
              <div class="field">
                <label for="fin-debito-pct">Taxa Débito (%)</label>
                <input class="input mono" id="fin-debito-pct" type="number" step="0.01" min="0" value="${Number(s.card_fees?.debito_pct || 0)}">
              </div>
              <div class="field">
                <label for="fin-credito-1x">Taxa Crédito 1x (%)</label>
                <input class="input mono" id="fin-credito-1x" type="number" step="0.01" min="0" value="${Number(s.card_fees?.credito_1x_pct || 0)}">
              </div>
            </div>

            <div class="field-grid">
              <div class="field">
                <label for="fin-credito-parc">Taxa Crédito Parcelado (%)</label>
                <input class="input mono" id="fin-credito-parc" type="number" step="0.01" min="0" value="${Number(s.card_fees?.credito_parcelado_pct || 0)}">
              </div>
              <div class="field">
                <label for="fin-meta-fat">Meta Faturamento Mensal (R$)</label>
                <input class="input mono" id="fin-meta-fat" type="number" step="0.01" min="0" value="${Number(s.monthly_goals?.faturamento_meta || 18000)}">
              </div>
            </div>

            <div class="eyebrow" style="margin-top:6px;">Parâmetros de Scoring Automático (Clientes)</div>
            <div class="field-grid">
              <div class="field">
                <label for="fin-vip-ltv">LTV Mínimo VIP (R$)</label>
                <input class="input mono" id="fin-vip-ltv" type="number" step="10" min="0" value="${Number(s.scoring_rules?.ltv_vip_min ?? 350)}">
              </div>
              <div class="field">
                <label for="fin-vip-freq">Frequência VIP (Qtd OSs)</label>
                <input class="input mono" id="fin-vip-freq" type="number" step="1" min="1" value="${Number(s.scoring_rules?.frequencia_vip_os ?? 4)}">
              </div>
            </div>
            <div class="field">
              <label for="fin-retirada-tol">Tolerância Retirada na Gaveta (dias)</label>
              <input class="input mono" id="fin-retirada-tol" type="number" step="1" min="1" value="${Number(s.scoring_rules?.dias_tolerancia_retirada ?? 10)}">
            </div>

            <div style="display:flex;justify-content:flex-end;margin-top:6px;">
              <button class="btn btn-accent" type="submit">Salvar Parâmetros Financeiros</button>
            </div>
          </form>
        </section>
      </div>
    `;

    bindSettingsHandlers(container, presets);
  }

  function bindSettingsHandlers(container, presets) {
    container.querySelectorAll('[data-op-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const mode = btn.getAttribute('data-op-mode');
        try {
          state.domainFilter = 'ALL';
          await saveSettings({ operation_mode: mode });
          showToast(`Modo da oficina alterado para ${mode}.`, 'ok');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    const partnersBtn = document.getElementById('toggle-partners-mode');
    partnersBtn.addEventListener('click', async () => {
      const next = state.settings.partners_mode_enabled === '1' ? '0' : '1';
      await saveSettings({ partners_mode_enabled: next });
      showToast(next === '1' ? 'Modo Parceiros ativado.' : 'Modo Solo ativado.', 'ok');
    });

    container.querySelectorAll('[data-theme-choice]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const theme = btn.getAttribute('data-theme-choice');
        await saveSettings({ theme_mode: theme });
        showToast(`Tema alterado para ${theme}.`, 'ok');
      });
    });

    document.getElementById('card-focus-toggle').addEventListener('click', async () => {
      const next = state.settings.focus_mode === '1' ? '0' : '1';
      await saveSettings({ focus_mode: next });
      showToast(next === '1' ? 'Modo Foco F8 ativado.' : 'Modo Foco F8 desativado.', 'ok');
    });

    document.getElementById('toggle-hud-f9').addEventListener('click', async () => {
      const curr = state.settings.switches?.hud_f9_visible !== false;
      const nextSwitches = Object.assign({}, state.settings.switches, { hud_f9_visible: !curr });
      await saveSettings({ switches: nextSwitches });
      showToast(!curr ? 'HUD F9 exibido.' : 'HUD F9 ocultado.', 'ok');
    });

    const picker = document.getElementById('wl-accent-picker');
    const hexInput = document.getElementById('wl-accent-hex');
    const lumReadout = document.getElementById('wl-luminance-readout');

    document.getElementById('preview-accent-btn').addEventListener('click', () => {
      const lum = computeLuminanceClient(hexInput.value);
      showToast(`Contraste WCAG AAA: Y = ${lum.luminance} (${lum.contrastText}).`, 'info');
    });

    function previewAccent(hex) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
      const lum = computeLuminanceClient(hex);
      document.documentElement.style.setProperty('--accent-color', lum.hex);
      document.documentElement.style.setProperty('--accent-contrast', lum.contrastText);
      document.documentElement.style.setProperty('--accent-ring', lum.focusRing);
      document.documentElement.style.setProperty('--accent-soft', lum.softBg);
      lumReadout.innerHTML = `
        <span>Fórmula Y = 0.299R + 0.587G + 0.114B</span>
        <span class="mono">Y = ${lum.luminance} | Texto = ${lum.contrastText}</span>
      `;
    }

    picker.addEventListener('input', () => {
      hexInput.value = picker.value.toUpperCase();
      previewAccent(hexInput.value);
    });

    hexInput.addEventListener('input', () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(hexInput.value)) {
        picker.value = hexInput.value;
        previewAccent(hexInput.value);
      }
    });

    container.querySelectorAll('[data-accent-swatch]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const hex = btn.getAttribute('data-accent-swatch');
        hexInput.value = hex;
        picker.value = hex;
        previewAccent(hex);
        await saveSettings({ accent_color: hex });
        showToast(`Cor de destaque aplicada (${hex}).`, 'ok');
      });
    });

    const svgTextarea = document.getElementById('wl-brand-svg');
    document.getElementById('wl-svg-auto-btn').addEventListener('click', async () => {
      svgTextarea.value = '';
      await saveSettings({ brand_icon_svg: '' });
      showToast('Ícone sincronizado automaticamente ao modo da oficina.', 'ok');
    });

    container.querySelectorAll('[data-svg-preset]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const preset = presets[Number(btn.getAttribute('data-svg-preset'))];
        if (!preset) return;
        svgTextarea.value = preset.svg;
        await saveSettings({ brand_icon_svg: preset.svg });
        showToast(`Ícone "${preset.label}" aplicado.`, 'ok');
      });
    });

    document.getElementById('whitelabel-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await saveSettings({
          brand_name: document.getElementById('wl-brand-name').value,
          brand_slogan: document.getElementById('wl-brand-slogan').value,
          accent_color: hexInput.value,
          brand_icon_svg: svgTextarea.value
        });
        showToast('Identidade White-Label salva no SQLite e replicada na LAN.', 'ok');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('finance-settings-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await saveSettings({
          pix_key: document.getElementById('fin-pix-key').value,
          card_fees: {
            debito_pct: Number(document.getElementById('fin-debito-pct').value || 0),
            credito_1x_pct: Number(document.getElementById('fin-credito-1x').value || 0),
            credito_parcelado_pct: Number(document.getElementById('fin-credito-parc').value || 0)
          },
          monthly_goals: Object.assign({}, state.settings.monthly_goals, {
            faturamento_meta: Number(document.getElementById('fin-meta-fat').value || 0)
          }),
          scoring_rules: Object.assign({}, state.settings.scoring_rules, {
            ltv_vip_min: Number(document.getElementById('fin-vip-ltv').value || 350),
            frequencia_vip_os: Number(document.getElementById('fin-vip-freq').value || 4),
            dias_tolerancia_retirada: Number(document.getElementById('fin-retirada-tol').value || 10)
          })
        });
        showToast('Parâmetros financeiros salvos.', 'ok');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  global.CTI_VIEW_SETTINGS = {
    renderSettingsView
  };
})(window);
