(function attachClientModals(global) {
  'use strict';

  const { state, apiFetch, formatBrl, formatEnumLabel, escapeHtml, showToast } = global.CTI_STORE;
  const { openModal, closeModal } = global.CTI_MODALS;
  const { icon } = global.CTI_ICONS;

  function applyPhoneMask(raw) {
    const digits = String(raw || '').replace(/\D/g, '').slice(0, 13);
    let local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    if (local.length > 11) local = local.slice(0, 11);
    if (local.length <= 2) return local;
    if (local.length <= 6) return `(${local.slice(0, 2)}) ${local.slice(2)}`;
    if (local.length <= 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }

  function previewE164(raw) {
    const clean = String(raw || '').trim();
    if (clean.startsWith('+') && /^\+\d{10,15}$/.test(clean.replace(/[^\d+]/g, ''))) {
      return clean.replace(/[^\d+]/g, '');
    }
    let digits = clean.replace(/\D/g, '');
    if ((digits.length === 11 || digits.length === 12) && digits.startsWith('0')) digits = digits.slice(1);
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return '+' + digits;
    if (digits.length === 10 || digits.length === 11) return '+55' + digits;
    return 'Aguardando DDD+Número';
  }

  function renderStarIcons(score, interactive = false) {
    const n = Number(score || 0);
    return [1, 2, 3, 4, 5].map((v) => {
      const on = v <= n;
      const svg = icon(on ? 'starFilled' : 'star');
      if (interactive) {
        return `<button class="star-btn ${on ? 'is-on' : ''}" type="button" data-star-val="${v}" title="Nota ${v}">${svg}</button>`;
      }
      return `<span class="star-icon ${on ? 'is-on' : ''}">${svg}</span>`;
    }).join('');
  }

  function openClientFormModal({ existing = null, onSaved }) {
    const isEdit = Boolean(existing);
    const hasAddress = Boolean(existing && (existing.cep || existing.logradouro || existing.cpf_cnpj || existing.data_nascimento));
    let expanded = hasAddress;

    const html = `
      <form id="client-elastic-form" class="field" style="gap:12px;" data-dirty-form="true">
        <div class="eyebrow">Visão Compacta Balcão (5 segundos)</div>
        <div class="field-grid">
          <div class="field">
            <label for="cli-nome">Nome Completo *</label>
            <input class="input" id="cli-nome" type="text" required value="${escapeHtml(existing?.nome || '')}" placeholder="Ex: Maria da Silva">
          </div>
          <div class="field">
            <label for="cli-tel">WhatsApp / Telefone * <span class="mono" id="cli-e164-preview" style="font-size:10px;"></span></label>
            <input class="input mono" id="cli-tel" type="tel" required value="${escapeHtml(existing?.telefone_formatado || existing?.telefone_e164 || '')}" placeholder="(11) 99999-8888">
          </div>
        </div>

        <div class="field-grid">
          <div class="field">
            <label for="cli-apelido">Apelido / Referência</label>
            <input class="input" id="cli-apelido" type="text" value="${escapeHtml(existing?.apelido_referencia || '')}" placeholder="Ex: Maria Manicure / Salão Centro">
          </div>
          <div class="field">
            <label for="cli-obs">Observações Técnicas / Anatômicas</label>
            <input class="input" id="cli-obs" type="text" value="${escapeHtml(existing?.observacoes_tecnicas || '')}" placeholder="Ex: Alergia a níquel / Prefere ajuste firme">
          </div>
        </div>

        <div>
          <button class="btn btn-sm" type="button" id="cli-toggle-expand">
            <span class="icon" data-icon="${expanded ? 'chevronUp' : 'chevronDown'}"></span>
            <span>${expanded ? 'Ocultar Endereço & Dados Completos' : '+ Expandir Endereço & Dados Completos (1 Clique)'}</span>
          </button>

          <div class="address-collapse ${expanded ? '' : 'hidden'}" id="cli-expanded-box">
            <div class="field-grid" style="margin-bottom:10px;">
              <div class="field">
                <label for="cli-cpf">CPF / CNPJ</label>
                <input class="input mono" id="cli-cpf" type="text" value="${escapeHtml(existing?.cpf_cnpj || '')}" placeholder="000.000.000-00">
              </div>
              <div class="field">
                <label for="cli-nasc">Data de Nascimento</label>
                <input class="input mono" id="cli-nasc" type="date" value="${escapeHtml(existing?.data_nascimento || '')}">
              </div>
            </div>
            <div class="field-grid" style="margin-bottom:10px;">
              <div class="field">
                <label for="cli-cep">CEP (busca automática se online)</label>
                <div style="display:flex;gap:6px;">
                  <input class="input mono" id="cli-cep" type="text" value="${escapeHtml(existing?.cep || '')}" placeholder="00000-000">
                  <button class="btn btn-sm" type="button" id="cli-cep-btn">Buscar</button>
                </div>
              </div>
              <div class="field">
                <label for="cli-logradouro">Logradouro</label>
                <input class="input" id="cli-logradouro" type="text" value="${escapeHtml(existing?.logradouro || '')}">
              </div>
            </div>
            <div class="field-grid" style="margin-bottom:10px;">
              <div class="field">
                <label for="cli-numero">Número</label>
                <input class="input" id="cli-numero" type="text" value="${escapeHtml(existing?.numero || '')}">
              </div>
              <div class="field">
                <label for="cli-comp">Complemento</label>
                <input class="input" id="cli-comp" type="text" value="${escapeHtml(existing?.complemento || '')}">
              </div>
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="cli-bairro">Bairro</label>
                <input class="input" id="cli-bairro" type="text" value="${escapeHtml(existing?.bairro || '')}">
              </div>
              <div class="field-grid">
                <div class="field">
                  <label for="cli-cidade">Cidade</label>
                  <input class="input" id="cli-cidade" type="text" value="${escapeHtml(existing?.cidade || '')}">
                </div>
                <div class="field">
                  <label for="cli-uf">UF</label>
                  <input class="input mono" id="cli-uf" type="text" maxlength="2" value="${escapeHtml(existing?.uf || '')}">
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn" type="button" id="cli-cancel">Cancelar</button>
          <button class="btn btn-accent" type="submit">${isEdit ? 'Salvar Alterações' : 'Cadastrar Cliente'}</button>
        </div>
      </form>
    `;

    openModal(isEdit ? 'Editar Ficha do Cliente' : 'Cadastro Rápido de Cliente', html, true);
    document.getElementById('cli-cancel').addEventListener('click', closeModal);

    const telEl = document.getElementById('cli-tel');
    const previewEl = document.getElementById('cli-e164-preview');
    const updateTelPreview = () => {
      previewEl.textContent = previewE164(telEl.value);
    };
    telEl.addEventListener('input', () => {
      if (!telEl.value.trim().startsWith('+')) {
        telEl.value = applyPhoneMask(telEl.value);
      }
      updateTelPreview();
    });
    updateTelPreview();

    const expBox = document.getElementById('cli-expanded-box');
    const toggleBtn = document.getElementById('cli-toggle-expand');
    toggleBtn.addEventListener('click', () => {
      expanded = !expanded;
      expBox.classList.toggle('hidden', !expanded);
      toggleBtn.querySelector('span:last-child').textContent = expanded
        ? 'Ocultar Endereço & Dados Completos'
        : '+ Expandir Endereço & Dados Completos (1 Clique)';
    });

    async function lookupCep() {
      const digits = document.getElementById('cli-cep').value.replace(/\D/g, '');
      if (digits.length !== 8) {
        showToast('Informe um CEP com 8 dígitos.', 'warn');
        return;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: ctrl.signal });
        const data = await res.json();
        if (data.erro) {
          showToast('CEP não encontrado. Preencha manualmente.', 'warn');
          return;
        }
        document.getElementById('cli-logradouro').value = data.logradouro || '';
        document.getElementById('cli-bairro').value = data.bairro || '';
        document.getElementById('cli-cidade').value = data.localidade || '';
        document.getElementById('cli-uf').value = data.uf || '';
        showToast('Endereço preenchido via CEP.', 'ok');
      } catch (_err) {
        showToast('Sem acesso ao ViaCEP offline. Preencha os campos manualmente.', 'info');
      } finally {
        clearTimeout(timer);
      }
    }

    document.getElementById('cli-cep-btn').addEventListener('click', lookupCep);

    document.getElementById('client-elastic-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const payload = {
        nome: document.getElementById('cli-nome').value.trim(),
        telefone: telEl.value.trim(),
        apelido_referencia: document.getElementById('cli-apelido').value.trim(),
        observacoes_tecnicas: document.getElementById('cli-obs').value.trim(),
        cpf_cnpj: document.getElementById('cli-cpf').value.trim(),
        data_nascimento: document.getElementById('cli-nasc').value.trim(),
        cep: document.getElementById('cli-cep').value.trim(),
        logradouro: document.getElementById('cli-logradouro').value.trim(),
        numero: document.getElementById('cli-numero').value.trim(),
        complemento: document.getElementById('cli-comp').value.trim(),
        bairro: document.getElementById('cli-bairro').value.trim(),
        cidade: document.getElementById('cli-cidade').value.trim(),
        uf: document.getElementById('cli-uf').value.trim()
      };

      try {
        let saved;
        if (isEdit) {
          saved = await apiFetch(`/api/clientes/${existing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
          showToast('Cliente atualizado com sucesso.', 'ok');
        } else {
          saved = await apiFetch('/api/clientes', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Cliente cadastrado.', 'ok');
        }
        await closeModal();
        if (onSaved) onSaved(saved);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  async function openClientDossierModal({ clientId, profileFlagsCatalog = [], onUpdated }) {
    openModal('Prontuário Técnico do Cliente', '<div class="eyebrow">Carregando prontuário e livro-razão...</div>', true);
    try {
      const dossier = await apiFetch(`/api/clientes/${clientId}/prontuario`);
      const { cliente, score_breakdown, top_servicos, garantias_ativas, historico_os } = dossier;
      const flagsCatalog = Array.from(new Set([
        ...(profileFlagsCatalog || []),
        'VIP', 'Indicador', 'Exigente com Alinhamento', 'Pede Desconto', 'Atraso Frequente',
        ...(cliente.flags || [])
      ]));

      const html = `
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px;">
          <div>
            <div class="eyebrow">${escapeHtml(cliente.apelido_referencia || 'Ficha 360 CRM')}</div>
            <h3 style="margin:3px 0;font-size:18px;">${escapeHtml(cliente.nome)}</h3>
            <div class="mono" style="font-size:12px;color:var(--text-secondary);">
              ${escapeHtml(cliente.telefone_formatado)} (${escapeHtml(cliente.telefone_e164)})
            </div>
            ${cliente.observacoes_tecnicas
              ? `<div style="margin-top:6px;font-size:12px;color:var(--accent-color);font-weight:600;">Obs: ${escapeHtml(cliente.observacoes_tecnicas)}</div>`
              : ''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm" type="button" id="dos-edit-client">Editar Dados</button>
            <button class="btn btn-sm btn-accent" type="button" id="dos-new-os">+ Abrir Nova OS</button>
          </div>
        </div>

        <div class="dossier-grid">
          <div class="card kpi-card" style="padding:12px;">
            <div class="eyebrow">LTV Auditado</div>
            <div class="kpi-value mono" style="font-size:18px;">${escapeHtml(formatBrl(score_breakdown.ltv_ledger_auditado || score_breakdown.ltv_efetivo))}</div>
            <div class="kpi-hint">${score_breakdown.total_os} OSs | Ticket ${escapeHtml(formatBrl(score_breakdown.ticket_medio))}</div>
          </div>
          <div class="card kpi-card" style="padding:12px;">
            <div class="eyebrow">Avaliação (Auto: ${cliente.score_automatico}/5)</div>
            <div style="margin-top:8px;display:flex;align-items:center;gap:8px;" id="dos-stars-wrap">
              ${renderStarIcons(cliente.score_efetivo, true)}
            </div>
            <div class="kpi-hint">
              ${cliente.score_manual !== null
                ? `Manual (${cliente.score_manual}/5) <button class="btn-ghost" type="button" id="dos-reset-score" style="text-decoration:underline;cursor:pointer;font-size:11px;">Restaurar Auto</button>`
                : 'Cálculo Automático Ativo'}
            </div>
          </div>
          <div class="card kpi-card" style="padding:12px;">
            <div class="eyebrow">Garantias &amp; Risco</div>
            <div class="kpi-value mono" style="font-size:18px;">${garantias_ativas.length} ativas</div>
            <div class="kpi-hint">Atrasos: ${score_breakdown.atrasos_gaveta} | Pend.: ${score_breakdown.inadimplencias}</div>
          </div>
        </div>

        <div class="field" style="margin-bottom:14px;">
          <label>Flags de Perfil Comportamental</label>
          <div class="tag-cloud" id="dos-flags-cloud">
            ${flagsCatalog.map((flag) => `
              <button class="flag-chip ${cliente.flags.includes(flag) ? 'is-active' : ''}" type="button" data-flag-name="${escapeHtml(flag)}">
                <span>${escapeHtml(flag)}</span>
              </button>
            `).join('')}
          </div>
          <div id="dos-flag-spotlight" style="margin-top:8px;"></div>
        </div>

        <div class="grid-2" style="margin-bottom:14px;">
          <div class="card panel" style="padding:12px;">
            <div class="eyebrow" style="margin-bottom:6px;">Top 3 Serviços Realizados</div>
            ${top_servicos.length === 0
              ? '<div class="eyebrow">Sem serviços executados ainda.</div>'
              : top_servicos.map((s) => `
                  <div class="switch-row" style="margin-bottom:6px;padding:8px 10px;">
                    <span><strong>${escapeHtml(s.descricao)}</strong> (${s.total_execucoes}x)</span>
                    <span class="mono">${escapeHtml(formatBrl(s.total_valor))}</span>
                  </div>
                `).join('')}
          </div>
          <div class="card panel" style="padding:12px;">
            <div class="eyebrow" style="margin-bottom:6px;">Garantias Ativas (90 dias)</div>
            ${garantias_ativas.length === 0
              ? '<div class="eyebrow">Nenhuma garantia vigente no momento.</div>'
              : garantias_ativas.map((g) => `
                  <div class="switch-row" style="margin-bottom:6px;padding:8px 10px;">
                    <div>
                      <div style="font-weight:700;font-size:12px;">${escapeHtml(g.codigo_os)} - ${escapeHtml(g.descricao)}</div>
                      <div class="eyebrow">Expira em ${escapeHtml(g.expira_em)}</div>
                    </div>
                    <span class="badge badge-accent mono">${g.dias_restantes}d</span>
                  </div>
                `).join('')}
          </div>
        </div>

        <div>
          <div class="eyebrow" style="margin-bottom:6px;">Histórico de Ordens de Serviço (${historico_os.length})</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Código</th><th>Domínio</th><th>Status</th><th>Peça / Material</th><th class="num">Total</th></tr></thead>
              <tbody>
                ${historico_os.length === 0
                  ? '<tr><td colspan="5" style="color:var(--text-secondary);">Nenhuma OS registrada para este cliente.</td></tr>'
                  : historico_os.map((os) => `
                      <tr>
                        <td class="mono">${escapeHtml(os.codigo_os)}</td>
                        <td><span class="badge">${escapeHtml(formatEnumLabel(os.dominio))}</span></td>
                        <td><span class="badge badge-accent">${escapeHtml(formatEnumLabel(os.status))}</span></td>
                        <td>${escapeHtml(os.marca_modelo || os.material_peca || '-')}</td>
                        <td class="num">${escapeHtml(formatBrl(os.valor_total))}</td>
                      </tr>
                    `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      openModal(`Prontuário: ${cliente.nome}`, html, true);

      const applyEval = async (patch) => {
        await apiFetch(`/api/clientes/${cliente.id}/avaliacao`, {
          method: 'PATCH',
          body: JSON.stringify(patch)
        });
        if (onUpdated) onUpdated();
        openClientDossierModal({ clientId: cliente.id, profileFlagsCatalog: flagsCatalog, onUpdated });
      };

      document.querySelectorAll('#dos-stars-wrap [data-star-val]').forEach((btn) => {
        btn.addEventListener('click', () => applyEval({ score_manual: Number(btn.getAttribute('data-star-val')) }));
      });

      const resetBtn = document.getElementById('dos-reset-score');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => applyEval({ score_manual: null }));
      }

      document.querySelectorAll('#dos-flags-cloud [data-flag-name]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const name = btn.getAttribute('data-flag-name');
          const next = cliente.flags.includes(name)
            ? cliente.flags.filter((f) => f !== name)
            : cliente.flags.concat(name);
          applyEval({ flags: next });
        });
      });

      global.CTI_SPOTLIGHT_SELECT.create(document.getElementById('dos-flag-spotlight'), {
        items: flagsCatalog.map((f) => ({ id: f, label: f })),
        placeholder: 'Adicionar ou criar nova tag de comportamento inline...',
        clearOnSelect: true,
        createLabel: 'Nova Flag de Perfil',
        inlineFields: [{ name: 'tag', label: 'Nome da Flag' }],
        onSelect(opt) {
          if (!cliente.flags.includes(opt.label)) {
            applyEval({ flags: cliente.flags.concat(opt.label) });
          }
        },
        async onCreateInline(fields) {
          const val = String(fields.tag || '').trim();
          if (val.length < 2) throw new Error('Informe ao menos 2 caracteres para a flag.');
          return { id: val, label: val };
        }
      });

      document.getElementById('dos-edit-client').addEventListener('click', () => {
        openClientFormModal({
          existing: cliente,
          onSaved: () => {
            if (onUpdated) onUpdated();
          }
        });
      });

      document.getElementById('dos-new-os').addEventListener('click', async () => {
        state.preselectedClientForOs = cliente;
        await closeModal();
        showToast(`Cliente ${cliente.nome} selecionado para nova OS.`, 'ok');
        global.CTI_APP.navigate('atendimento');
      });
    } catch (err) {
      openModal('Prontuário do Cliente', `<div class="eyebrow" style="color:var(--status-danger);">${escapeHtml(err.message)}</div>`);
    }
  }

  global.CTI_MODALS_CLIENTS = {
    renderStarIcons,
    openClientFormModal,
    openClientDossierModal
  };
})(window);
