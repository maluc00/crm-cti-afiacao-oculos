(function attachSpotlightSelect(global) {
  'use strict';

  const { escapeHtml } = global.CTI_STORE;

  function normalizeText(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  /**
   * Componente universal de busca rapida 100% navegavel por teclado
   * com criacao inline sem fechar o modal atual.
   */
  function create(container, options = {}) {
    if (!container) return null;

    let items = Array.isArray(options.items) ? options.items.slice() : [];
    let highlightIdx = 0;
    let isOpen = false;
    let inlineOpen = false;
    let inlineBusy = false;

    const placeholder = options.placeholder || 'Digite 1+ letras para buscar...';
    const allowCreate = typeof options.onCreateInline === 'function';
    const createLabel = options.createLabel || 'Novo Item Inline';
    const inlineFields = Array.isArray(options.inlineFields)
      ? options.inlineFields
      : [{ name: 'nome', label: 'Nome', placeholder: 'Nome do novo item', required: true }];

    container.innerHTML = `
      <div class="spotlight-select">
        <div class="spotlight-select-control">
          <input class="input spotlight-select-input" type="search"
                 placeholder="${escapeHtml(placeholder)}" autocomplete="off">
          <span class="icon spotlight-select-caret" data-icon="chevronDown"></span>
        </div>
        <div class="spotlight-popover hidden"></div>
      </div>
    `;

    const input = container.querySelector('.spotlight-select-input');
    const popover = container.querySelector('.spotlight-popover');
    if (global.CTI_ICONS) global.CTI_ICONS.hydrateIcons(container);

    function filterItems(query) {
      const q = normalizeText(query).trim();
      const sorted = items.slice().sort((a, b) => Number(b.freq || 0) - Number(a.freq || 0));
      if (!q) return sorted.slice(0, 10);
      return sorted
        .filter((it) => {
          const hay = normalizeText(`${it.label} ${it.sublabel || ''} ${it.keywords || ''}`);
          return hay.includes(q);
        })
        .slice(0, 12);
    }

    function openPopover() {
      isOpen = true;
      popover.classList.remove('hidden');
      renderList();
    }

    function closePopover() {
      isOpen = false;
      inlineOpen = false;
      popover.classList.add('hidden');
    }

    function selectEntry(entry) {
      if (!entry) return;
      input.value = options.clearOnSelect ? '' : entry.label;
      closePopover();
      if (typeof options.onSelect === 'function') {
        options.onSelect(entry);
      }
    }

    function renderInlineForm(prefill) {
      const fieldsHtml = inlineFields.map((f, idx) => `
        <div class="field" style="gap:3px;">
          <label style="font-size:11px;">${escapeHtml(f.label)}</label>
          <input class="input" type="${escapeHtml(f.type || 'text')}"
                 step="${escapeHtml(f.step || 'any')}"
                 data-inline-field="${escapeHtml(f.name)}"
                 value="${idx === 0 ? escapeHtml(prefill) : escapeHtml(f.defaultValue || '')}"
                 placeholder="${escapeHtml(f.placeholder || '')}">
        </div>
      `).join('');

      return `
        <div class="spotlight-inline-create">
          <div class="eyebrow">${escapeHtml(createLabel)}</div>
          ${fieldsHtml}
          <div style="display:flex;justify-content:flex-end;gap:6px;">
            <button class="btn btn-sm" type="button" data-inline-cancel="1">Cancelar</button>
            <button class="btn btn-sm btn-accent" type="button" data-inline-save="1">Criar e Selecionar</button>
          </div>
        </div>
      `;
    }

    function renderList() {
      const filtered = filterItems(input.value);
      if (highlightIdx >= filtered.length) highlightIdx = Math.max(0, filtered.length - 1);

      const listHtml = filtered.length === 0
        ? '<div class="eyebrow" style="padding:8px 10px;">Nenhum item encontrado.</div>'
        : filtered.map((entry, idx) => `
            <button class="spotlight-option ${idx === highlightIdx ? 'is-highlighted' : ''}"
                    type="button" data-opt-idx="${idx}">
              <div>
                <div style="font-weight:600;">${escapeHtml(entry.label)}</div>
                ${entry.sublabel ? `<div style="font-size:11px;color:var(--text-secondary);">${escapeHtml(entry.sublabel)}</div>` : ''}
              </div>
              ${entry.meta ? `<span class="spotlight-option-meta">${escapeHtml(entry.meta)}</span>` : ''}
            </button>
          `).join('');

      const createSection = allowCreate
        ? (inlineOpen
            ? renderInlineForm(input.value.trim())
            : `<button class="spotlight-inline-btn" type="button" data-open-inline="1">
                 <span>+ ${escapeHtml(createLabel)}${input.value.trim() ? `: "${escapeHtml(input.value.trim())}"` : ''}</span>
               </button>`)
        : '';

      popover.innerHTML = listHtml + createSection;

      popover.querySelectorAll('[data-opt-idx]').forEach((btn) => {
        btn.addEventListener('mousedown', (ev) => ev.preventDefault());
        btn.addEventListener('click', () => {
          selectEntry(filtered[Number(btn.getAttribute('data-opt-idx'))]);
        });
      });

      const openInlineBtn = popover.querySelector('[data-open-inline]');
      if (openInlineBtn) {
        openInlineBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
        openInlineBtn.addEventListener('click', () => {
          inlineOpen = true;
          renderList();
          const firstField = popover.querySelector('[data-inline-field]');
          if (firstField) firstField.focus();
        });
      }

      const cancelInlineBtn = popover.querySelector('[data-inline-cancel]');
      if (cancelInlineBtn) {
        cancelInlineBtn.addEventListener('click', () => {
          inlineOpen = false;
          renderList();
          input.focus();
        });
      }

      const saveInlineBtn = popover.querySelector('[data-inline-save]');
      if (saveInlineBtn) {
        saveInlineBtn.addEventListener('click', async () => {
          if (inlineBusy) return;
          const payload = {};
          popover.querySelectorAll('[data-inline-field]').forEach((el) => {
            payload[el.getAttribute('data-inline-field')] = el.value;
          });
          inlineBusy = true;
          saveInlineBtn.disabled = true;
          try {
            const createdOption = await options.onCreateInline(payload);
            if (createdOption) {
              items.unshift(createdOption);
              inlineOpen = false;
              selectEntry(createdOption);
            }
          } catch (err) {
            if (global.CTI_STORE) global.CTI_STORE.showToast(err.message, 'error');
          } finally {
            inlineBusy = false;
            saveInlineBtn.disabled = false;
          }
        });
      }
    }

    input.addEventListener('focus', openPopover);
    input.addEventListener('input', () => {
      highlightIdx = 0;
      if (!isOpen) isOpen = true;
      popover.classList.remove('hidden');
      renderList();
    });

    input.addEventListener('keydown', (ev) => {
      if (inlineOpen) {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          inlineOpen = false;
          renderList();
        }
        return;
      }

      const filtered = filterItems(input.value);
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (!isOpen) openPopover();
        else if (filtered.length > 0) {
          highlightIdx = (highlightIdx + 1) % filtered.length;
          renderList();
        }
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (isOpen && filtered.length > 0) {
          highlightIdx = (highlightIdx - 1 + filtered.length) % filtered.length;
          renderList();
        }
      } else if (ev.key === 'Enter') {
        if (isOpen && filtered[highlightIdx]) {
          ev.preventDefault();
          selectEntry(filtered[highlightIdx]);
        }
      } else if (ev.key === 'Escape') {
        if (isOpen) {
          ev.preventDefault();
          ev.stopPropagation();
          closePopover();
        }
      } else if (ev.key === 'Tab') {
        closePopover();
      }
    });

    const onDocClick = (ev) => {
      if (!container.contains(ev.target)) {
        closePopover();
      }
    };
    document.addEventListener('click', onDocClick);

    return {
      updateItems(nextItems) {
        items = Array.isArray(nextItems) ? nextItems.slice() : [];
        if (isOpen) renderList();
      },
      focus() {
        input.focus();
      },
      destroy() {
        document.removeEventListener('click', onDocClick);
      }
    };
  }

  global.CTI_SPOTLIGHT_SELECT = {
    create
  };
})(window);
