# AGENTS.md - GOVERNANCA DE ENGENHARIA DO CTI PRO CRM

Este documento define as regras inviolaveis de arquitetura, qualidade de codigo e operacao que todos os agentes e desenvolvedores devem cumprir em todas as fases do **CTI Pro CRM (Oficina de Precisao Optica & Cutelaria)**.

---

## 1. REGRAS DE ENGENHARIA INVIOLAVEIS

### Regra 1: Granularidade Elastica de Codigo (Regra 450/600)
- O alvo ideal para arquivos `.js`, `.ts` e `.css` situa-se entre **250 e 450 linhas**, privilegiando responsabilidade unica e coesao.
- **Flexibilidade Coesa:** Um arquivo pode alcancar o **teto maximo estrito de 600 linhas** apenas quando a coesao semantica exigir (evitando fragmentacao artificial de estado).
- Ao atingir ~450 linhas, avalie decompor em submodulos (`view-*.js`, `modal-*.js`, `service-*.js`). **Jamais ultrapasse 600 linhas** em codigo, estilos, HTML ou SQL.

### Regra 2: Proibicao Absoluta de Emojis (Sindrome dos Emojis Zero)
- E estritamente proibido utilizar emojis ou pictogramas Unicode em menus, botoes, cabecalhos, badges, alertas, graficos, toasts, SQL, seeds ou documentacao.
- Toda a iconografia utiliza exclusivamente **icones vetoriais SVG inline de traco fino** (`stroke-width: 1.5px` a `1.75px`, `stroke="currentColor"`, `fill="none"`) e **micro-LEDs geometricos CSS** (`6px` de diametro com glow sutil para status semaforico).

### Regra 3: Arquitetura Cliente-Servidor Local Unica (Zero Conflito de Cache)
- O banco SQLite (`data/cti_oficina.db`) hospedado pelo servidor Node.js local (`0.0.0.0:3000`) e a **Unica Fonte da Verdade**.
- E proibido duplicar o banco em IndexedDB ou LocalStorage operacional no navegador.
- PC e Celular na rede Wi-Fi/LAN consomem a API REST local + WebSocket `/ws` para sincronizacao em tempo real.
- O cliente implementa obrigatoriamente a trava `isInteractingWithModalOrForm()` em `public/js/state-sync.js`: eventos remotos de rede nunca podem fechar modais ou resetar formularios em edicao; atualizacoes sao adiadas ate a conclusao da acao do operador.

### Regra 4: Isolamento Total de Dados e Codigo
- Todo dado mutavel do usuario reside exclusivamente na pasta `data/`:
  - `data/cti_oficina.db` (e arquivos `-wal` / `-shm`)
  - `data/media/` (fotos WebP Antes/Depois de OS)
  - `data/backups/` (copias de seguranca locais)
- Atualizacoes de codigo em `src/`, `public/` ou `server.js` jamais apagam ou sobrescrevem a pasta `data/`.

### Regra 5: Poka-Yoke ("Zero Beco Sem Saida") & Determinismo Monetario
- Nenhum botao, link ou atalho pode existir na UI sem listener funcional e rota/acao correspondente.
- Calculos e persistencia monetaria utilizam `ROUND(x, 2)` no SQLite e `roundMoney()` / `formatBrl()` deterministicos no Node e no browser.
- E proibido `DELETE` fisico em registros operacionais e financeiros (`clientes`, `catalogo_itens`, `ordens_servico`, `caixa_sessoes`, `estoque_movimentacoes`). Utilize *Soft Delete* (`ativo = 0`).
- A tabela `caixa_ledger` possui triggers SQLite bloqueando `UPDATE` e `DELETE` (`trg_ledger_block_update` e `trg_ledger_block_delete`). Toda correcao exige um novo lancamento do tipo `ESTORNO` com justificativa obrigatoria.

---

## 2. CAMALEAO DE DOMINIO & MODO PARCEIROS

- **`operation_mode` (na tabela `configuracoes`):**
  - `OPTICAL_ONLY`: Exibe apenas servicos, produtos, insumos, atributos e indicadores de `OPTICA` (e compartilhados `AMBOS`). Oculta 100% de cutelaria/afiacao.
  - `CUTLERY_ONLY`: Exibe apenas `CUTELARIA` (e `AMBOS`). Oculta 100% de referencias opticas.
  - `HYBRID`: Habilita seletor rapido `[ Todos | Optica | Afiacao ]` na Topbar, OS, Bancada, Caixa e BI.
- **`partners_mode_enabled` (`0` ou `1`):**
  - `0` (Padrao Solo): Oculta UI de parceiros e comissoes, atribuindo OS silenciosamente ao operador titular.
  - `1`: Habilita selecao de tecnico executor e apuracao de comissoes.

---

## 3. DESIGN SYSTEM INDUSTRIAL & MOTOR DE CONTRASTE

- **Tipografia:** `Sora` (400, 600, 700) para UI e labels *eyebrow* (`10px`, uppercase, `letter-spacing: 0.08em`); `JetBrains Mono` com `font-variant-numeric: tabular-nums` para codigos, valores e tabelas.
- **Superficies:**
  - `warm-atelier` (Claro): Canvas `#F8F6F0`, Card `#FFFFFF`, Borda `#E5E0D8`, Texto `#2D2824` / `#6E675F`.
  - `titanium-dark` (Escuro): Canvas `#131418`, Card `#1A1B21`, Borda `#2E3039`, Texto `#F4F4F6` / `#9A9DA8`.
  - **Modo Foco (`F8`, `data-focus="true"`):** Pergaminho grafite `#F4F3EE` sobre claro e **Preto Absoluto OLED `#000000`** (cards `#0A0A0C`, texto `#FDFBF7`) sobre escuro.
- **Motor de Luminancia Relativa:**
  $$Y = 0.299R + 0.587G + 0.114B$$
  Se $Y \ge 155$, o texto sobre botoes/badges de acento assume `#121316`; se $Y < 155$, assume `#FFFFFF`. O anel de foco usa alpha `0.16`.

---

## 4. MAPA MODULAR DO PROJETO (FASES 1 A 3)

- `server.js`: Servidor HTTP + Express + static `/media` + integracao WebSocket LAN (`0.0.0.0:3000`).
- `src/db/driver.js`: Adaptador SQLite sincrono (`better-sqlite3` prioritario com fallback nativo `node:sqlite`).
- `src/db/database.js`: Inicializacao segura do banco, pragmas WAL/FK e execucao idempotente de `data/schema.sql` e `data/seed.sql`.
- `src/utils/`: `money.js` (`roundMoney`, `formatBrl`, `computeLuminance`, `sanitizeSvg`), `phone.js` (normalizacao E.164, mascara BR, CEP e CPF/CNPJ) e `pix-brcode.js` (payload EMVCo PIX Copia-e-Cola com CRC16 e SVG QR).
- `src/services/`: `settings-service.js`, `lan-service.js`, `catalog-service.js`, `combo-service.js`, `clients-service.js`, `scoring-service.js`, `os-service.js` (check-in Express/Completo/Lote), `os-queries.js`, `os-fsm.js`, `os-bom-ledger.js` e `os-media-print.js`.
- `src/ws/sync-hub.js`: Hub WebSocket em `/ws` para broadcast em tempo real na LAN (`os:updated`, `settings:updated`, `catalog:updated`, `clients:updated`).
- `src/routes/`: `system-routes.js`, `catalog-routes.js`, `clients-routes.js` e `os-routes.js`.
- `public/css/`: `design-tokens.css`, `shell.css`, `views.css`, `phase2.css`, `phase3.css`.
- `public/js/`: `icons.js`, `state-sync.js`, `spotlight-select.js`, `modals.js`, `modals-catalog.js`, `modals-catalog-stock.js`, `modals-clients.js`, `modal-os-modes.js`, `modal-os-checkin.js`, `modals-bench.js`, `webp-photo.js`, `thermal-printer.js`, `view-settings.js`, `view-catalog.js`, `view-clients.js`, `view-bench.js`, `views-shell.js`, `app.js`.
- `tests/`: `phase1.test.js`, `phase2.test.js` e `phase3.test.js`.
