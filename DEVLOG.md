# DEVLOG.md - REGISTRO DE DESENVOLVIMENTO DO CTI PRO CRM

---

## FASE 1/6 - FUNDAÇÃO ARQUITETURAL, SERVIDOR LAN, BANCO SQLITE BLINDADO & DESIGN SYSTEM INDUSTRIAL
- **Data:** 2026-11-17
- **Status:** Concluida e validada por suite automatizada

### Resumo das Entregas
1. **Governanca Documental & Inicializacao Windows:**
   - Criados `AGENTS.md`, `ROADMAP.md` e `iniciar-cti.bat` (verificacao de Node.js, instalacao automatica de dependencias e abertura do navegador local).
2. **Servidor Local-First & Sincronizacao LAN (`server.js`, `src/`):**
   - Servidor Express em `0.0.0.0:3000` com adaptador SQLite sincrono (`src/db/driver.js`) suportando `better-sqlite3` com fallback transparente para `node:sqlite` nativo (SQLite 3.54.0 no Node 26, sem exigir compilador C++ local).
   - Hub WebSocket em `/ws` (`src/ws/sync-hub.js`) e deteccao de IP Wi-Fi/Ethernet + QR Code SVG nativo + PIN LAN opcional (`src/services/lan-service.js`).
   - Rotas de sistema (`/api/system/health`, `/api/system/status`, `/api/system/lan-info`, `/api/system/lan-pin`, `/api/system/verify-pin`, `/api/system/overview`), configuracoes (`/api/settings`) e abertura rapida de caixa (`/api/caixa/sessao-rapida`).
3. **Banco de Dados Integral (`data/schema.sql`, `data/seed.sql`):**
   - Criadas todas as **17 tabelas** previstas para as 6 fases (`configuracoes`, `parceiros_tecnicos`, `clientes`, `catalogo_itens`, `ficha_tecnica_bom`, `combos`, `combos_itens`, `memoria_atributos`, `ordens_servico`, `os_itens`, `os_fotos`, `estoque_movimentacoes`, `caixa_sessoes`, `caixa_ledger`, `historico_consolidado_legado`, `whatsapp_templates`, `whatsapp_fila_logs`).
   - Triggers imutaveis em `caixa_ledger` (`trg_ledger_block_update`, `trg_ledger_block_delete`, `trg_ledger_estorno_check`) e bloqueio de `DELETE` fisico em tabelas operacionais (`SOFT_DELETE_OBRIGATORIO`).
   - Seed idempotente populando servicos reais de Optica (Mola, Hastes, Solda, Solda Titanio, Charneira, Ajuste, Parafuso, Adaptacao, Ponteiras, Plaquetas, Banho de Ouro), servicos iniciais de Cutelaria/Afiacao, produtos, insumos BOM, combos, atributos de memoria e templates WhatsApp sem emojis.
4. **Design System Industrial & App Shell (`public/`):**
   - Tipografia `Sora` + `JetBrains Mono` (`tabular-nums`), acabamento Double-Bezel e transicoes Apple Spring (`cubic-bezier(0.16, 1, 0.3, 1)`).
   - Tres superficies visuais: `warm-atelier`, `titanium-dark` e Modo Foco `F8` (incluindo Preto Absoluto OLED `#000000` sobre escuro).
   - Motor de luminancia WCAG AAA ($Y = 0.299R + 0.587G + 0.114B$) aplicado no backend e frontend.
   - Zero emojis em todo o sistema; iconografia 100% em SVG inline e micro-LEDs CSS de `6px`.
   - Trava `isInteractingWithModalOrForm()` em `public/js/state-sync.js` protegendo formularios e modais contra resets de rede.
   - Aba de Configuracoes & White-Label (`public/js/view-settings.js`) alternando em tempo real o Camaleao de Dominio (`OPTICAL_ONLY`, `CUTLERY_ONLY`, `HYBRID`), `partners_mode_enabled`, temas, cor de acento e marca.

### Resultados dos Testes e Verificacoes
- **Suite Automatizada (`npm test` -> `node --test tests/phase1.test.js`):** 5/5 testes aprovados, 0 falhas.
  1. Integridade das 17 tabelas do `schema.sql` e catalogo real do `seed.sql`.
  2. Triggers imutaveis do `caixa_ledger` (`VIOLACAO_LEDGER_IMUTAVEL`, `ESTORNO_SEM_JUSTIFICATIVA`) e `SOFT_DELETE_OBRIGATORIO`.
  3. Camaleao de Dominio (`OPTICAL_ONLY`, `CUTLERY_ONLY`, `HYBRID`) e `partners_mode_enabled`.
  4. Rotas de sistema, QR Code LAN SVG, PIN opcional, abertura rapida de caixa com `ROUND(x, 2)`, broadcast WebSocket e motor de luminancia.
  5. Auditoria de governanca: todos os arquivos dentro do limite estrito `<= 600` linhas e zero emojis/pictogramas.
- **Smoke Test Servidor & Integridade SQLite:**
  - `server.js` testado com `PORT=3100` (porta 3000 estava ocupada por outro processo local no ambiente durante o teste): `/api/system/health` (`tablesCount: 17`), `/api/system/lan-info` (`http://192.168.1.154:3100`, `qrSvg` valido) e `/api/system/overview` (`HYBRID`, 16 servicos ativos).
  - `data/cti_oficina.db` verificado com `PRAGMA integrity_check` -> `ok`.

### Contagem de Linhas dos Arquivos da Fase 1

| Arquivo | Linhas | Limite |
|---|---:|---:|
| `.gitignore` | 11 | N/A |
| `AGENTS.md` | 77 | N/A |
| `DEVLOG.md` | 70 | N/A |
| `ROADMAP.md` | 65 | N/A |
| `data/schema.sql` | 395 | <= 600 |
| `data/seed.sql` | 147 | <= 600 |
| `iniciar-cti.bat` | 48 | N/A |
| `package.json` | 23 | N/A |
| `public/css/design-tokens.css` | 306 | <= 600 |
| `public/css/shell.css` | 493 | <= 600 |
| `public/css/views.css` | 421 | <= 600 |
| `public/index.html` | 235 | <= 600 |
| `public/js/app.js` | 231 | <= 600 |
| `public/js/icons.js` | 77 | <= 600 |
| `public/js/modals.js` | 323 | <= 600 |
| `public/js/state-sync.js` | 260 | <= 600 |
| `public/js/view-settings.js` | 377 | <= 600 |
| `public/js/views-shell.js` | 291 | <= 600 |
| `server.js` | 127 | <= 600 |
| `src/db/database.js` | 81 | <= 600 |
| `src/db/driver.js` | 124 | <= 600 |
| `src/routes/system-routes.js` | 182 | <= 600 |
| `src/services/lan-service.js` | 157 | <= 600 |
| `src/services/settings-service.js` | 377 | <= 600 |
| `src/utils/money.js` | 86 | <= 600 |
| `src/ws/sync-hub.js` | 93 | <= 600 |
| `tests/phase1.test.js` | 342 | <= 600 |

---

## FASE 2/6 - CATALOGO UNIFICADO (BOM, PRODUTOS E COMBOS) & CENTRAL DE CLIENTES COM SCORING
- **Data:** 2026-11-17
- **Status:** Concluida e validada por suite automatizada conjunta (Fase 1 + Fase 2)

### Resumo das Entregas
1. **Catalogo Unificado, Almoxarifado BOM & Combos (`catalog-service.js`, `combo-service.js`, `catalog-routes.js`):**
   - Gestao completa de `SERVICO` (com Ficha Tecnica BOM e calculo de lucro liquido real), `PRODUTO` (revenda com margem ao vivo e alerta minimo) e `INSUMO` (almoxarifado BOM), respeitando estritamente o Camaleao de Dominio (`OPTICAL_ONLY`, `CUTLERY_ONLY`, `HYBRID`).
   - Fluxo `+ Entrada de Compra (CMP)` recalculando Custo Medio Ponderado, gravando trilha auditavel em `estoque_movimentacoes` e atualizando automaticamente o custo BOM dos servicos vinculados.
   - Fluxo `Ajuste de Inventario` com motivo obrigatorio auditado.
   - Motor de Combos calculando ao vivo: Soma Original, Preco do Combo, Desconto Real, Custo Embutido (BOM + produtos) e Margem Liquida Final.
2. **Componente Universal Spotlight Select (`public/js/spotlight-select.js`):**
   - Filtro instantaneo por teclado (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`, `Tab`) e criacao inline (`+ Novo Item Inline`) sem fechar o modal atual.
3. **Central de Clientes, Prontuario Tecnico & Scoring Hibrido (`clients-service.js`, `scoring-service.js`, `clients-routes.js`, `src/utils/phone.js`):**
   - Busca em tempo real por nome, telefone, apelido/referencia, indice rapido A-Z e filtro por score/VIP.
   - Normalizacao canonica E.164 (`+55...`) com mascara dinamica, cadastro compacto em 5s e expansao 1-clique de endereco completo (ViaCEP online + fallback manual offline).
   - Motor de Scoring Automatico (1 a 5 estrelas SVG) baseado em LTV auditado no `caixa_ledger`, frequencia de OS, Top 20% LTV e penalizacoes parametrizaveis (`scoring_rules_json`) por atraso de retirada na gaveta e inadimplencia, com sobrescrita manual, flags de perfil e Prontuario 360 (LTV, Top 3 servicos, garantias de 90 dias e atalho `+ Abrir Nova OS`).
4. **Frontend Modular (`public/css/phase2.css`, `view-catalog.js`, `modals-catalog.js`, `modals-catalog-stock.js`, `view-clients.js`, `modals-clients.js`):**
   - Zero emojis (estrelas 100% em icones SVG inline) e todos os modulos mantidos abaixo do teto de 600 linhas.

### Resultados dos Testes da Fase 2
- **Suite Conjunta (`npm test` -> `tests/phase1.test.js` + `tests/phase2.test.js`):** **10/10 testes aprovados**, 0 falhas:
  - Fase 1 (5/5): Integridade das 17 tabelas, triggers imutaveis do ledger, Camaleao de Dominio, rotas LAN/WS/Luminancia e auditoria `<= 600` linhas / zero emojis.
  - Fase 2 (5/5): Calculo exato de CMP + reflexo BOM + ajuste auditado; Produtos/Combos e bloqueio `operation_mode`; Normalizacao E.164, cadastro elastico e indice A-Z; Motor hibrido de Scoring (VIP, atraso na gaveta, inadimplencia, manual + restauracao) e Prontuario 360; Contrato `spotlight-select.js`.

### Contagem Atualizada de Linhas dos Arquivos Novos e Alterados (Fase 2)

| Arquivo | Linhas | Limite |
|---|---:|---:|
| `data/seed.sql` | 148 | <= 600 |
| `public/css/phase2.css` | 340 | <= 600 |
| `public/index.html` | 242 | <= 600 |
| `public/js/app.js` | 240 | <= 600 |
| `public/js/icons.js` | 89 | <= 600 |
| `public/js/modals-catalog-stock.js` | 316 | <= 600 |
| `public/js/modals-catalog.js` | 289 | <= 600 |
| `public/js/modals-clients.js` | 418 | <= 600 |
| `public/js/spotlight-select.js` | 259 | <= 600 |
| `public/js/state-sync.js` | 266 | <= 600 |
| `public/js/view-catalog.js` | 334 | <= 600 |
| `public/js/view-clients.js` | 218 | <= 600 |
| `public/js/view-settings.js` | 398 | <= 600 |
| `public/js/views-shell.js` | 314 | <= 600 |
| `server.js` | 131 | <= 600 |
| `src/routes/catalog-routes.js` | 145 | <= 600 |
| `src/routes/clients-routes.js` | 114 | <= 600 |
| `src/services/catalog-service.js` | 477 | <= 600 |
| `src/services/clients-service.js` | 364 | <= 600 |
| `src/services/combo-service.js` | 185 | <= 600 |
| `src/services/scoring-service.js` | 158 | <= 600 |
| `src/services/settings-service.js` | 395 | <= 600 |
| `src/utils/phone.js` | 106 | <= 600 |
| `tests/phase2.test.js` | 370 | <= 600 |

---

## FASE 3 - OS Elastica (Express/Completo/Lote), Bancada Viva, WebP & Impressao Termica
- **Data:** 2026-11-17
- **Entregas Concluidas:**
  - **PIX EMVCo & QR Codes (`src/utils/pix-brcode.js`):** Geracao deterministica de payload PIX Copia-e-Cola com CRC16-CCITT (`0x1021`) e SVG vetorial via `qrcode` para impressao termica e link de acompanhamento.
  - **Servicos & Rotas de OS (`src/services/os-service.js`, `os-queries.js`, `os-fsm.js`, `os-bom-ledger.js`, `os-media-print.js`, `src/routes/os-routes.js`):**
    - Check-in nos modos `EXPRESS`, `COMPLETO` e `LOTE_RAPIDO` atomico com baixa de estoque BOM/produtos e registro de entrada/quitacao/cortesia no `caixa_ledger`.
    - Check automatico de garantia (< 90 dias), memoria com auto-aprendizado (`MATERIAL`, `LOCAL_AVARIA`, `INSTRUMENTO`, `CONDICAO`) e checklist unitario de lote (`concluido_lote` / `0..N`).
    - FSM da Bancada Viva (`FILA` -> `BANCADA` <-> `AGUARDANDO_PECA` -> `PRONTO` -> `ENTREGUE` | `CANCELADA`) com timestamps silenciosos, bloqueio `409 QUITACAO_OBRIGATORIA` + Split Payment na entrega e estorno integral de BOM + `ESTORNO` em `caixa_ledger` ao cancelar.
    - Armazenamento de fotos WebP em `data/media/YYYY-MM/` com serving estatico `/media` e metadados em `os_fotos`.
  - **UI de Balcao, Bancada & Impressao (`public/js/modal-os-checkin.js`, `modal-os-modes.js`, `modals-bench.js`, `view-bench.js`, `webp-photo.js`, `thermal-printer.js`, `public/css/phase3.css`):**
    - Modal `F4` com cabecalho slim de 38px, seletor de dominio (`HYBRID`), Spotlight de servicos/combos/produtos com multiplicador `Nx` e `+ Novo Item Inline`, regua financeira com troco rapido e compressor Canvas WebP (`maxDim 800px`, qualidade `0.75`) + Lightbox `1x/2x/3x`.
    - Bancada com alternador `[ Kanban | Lista | Stepper ]`, aba dedicada de Estacionamento Tecnico com `Peca Chegou` em 1 clique, preview termico `80mm`/`58mm`/`50x30mm`/`A4` (com envelope tecnico + picote + canhoto + `ESTADO_LENTE` + QR PIX + QR OS) e Global Spotlight (`Ctrl+K`) consultando `/api/spotlight`.
- **Verificacao Automatizada (`npm test`):**
  - 14 testes totais (5 Fase 1 + 5 Fase 2 + 4 Fase 3) executados via `node --test`, 14 aprovados e 0 falhas.

### Contagem de Linhas dos Novos/Principais Arquivos (Fase 3)

| Arquivo | Linhas | Teto |
| --- | ---: | ---: |
| `public/js/modal-os-checkin.js` | 507 | <= 600 |
| `public/js/modal-os-modes.js` | 418 | <= 600 |
| `public/css/phase3.css` | 385 | <= 600 |
| `src/services/os-service.js` | 376 | <= 600 |
| `tests/phase3.test.js` | 328 | <= 600 |
| `public/js/view-bench.js` | 316 | <= 600 |
| `src/services/os-bom-ledger.js` | 313 | <= 600 |
| `public/js/modals-bench.js` | 280 | <= 600 |
| `src/services/os-queries.js` | 250 | <= 600 |
| `src/routes/os-routes.js` | 183 | <= 600 |
| `public/js/thermal-printer.js` | 178 | <= 600 |
| `src/services/os-media-print.js` | 168 | <= 600 |
| `src/services/os-fsm.js` | 164 | <= 600 |
| `public/js/webp-photo.js` | 154 | <= 600 |
| `src/utils/pix-brcode.js` | 94 | <= 600 |

---

## HOTFIX PRE-FASE 4 - POLIMENTO UTF-8, ROTEAMENTO DE VIEWS, ATALHO F2 & LAYOUT
- **Data:** 2026-11-17
- **Entregas Concluidas:**
  1. **Roteamento Estrito & Isolamento de Views (`public/js/app.js`, `public/js/views-shell.js`, `view-bench.js`, `view-catalog.js`, `view-clients.js`):**
     - Implementada limpeza imediata do viewport e controle anti-race condition (`routeRenderSeq` / `canCommit`) na troca de abas da Sidebar e atalhos.
     - Removido vazamento da tabela de `Atendimento & OS` para `Caixa & Ledger` e `BI & Indicadores`, que agora renderizam paineis isolados de estado aguardando a Fase 4 (`caixa`) e Fase 5 (`bi`) via `renderUpcomingPhaseView`.
     - Removida truncagem `.slice(0, 14)` na tabela de servicos de `Atendimento & Balcao Express` e filtrado o cliente avulso `+5500000000000` da listagem do CRM.
  2. **Restauracao Completa UTF-8 (Portugues do Brasil):**
     - Corrigida acentuacao e cedilha em `public/`, `src/`, `data/seed.sql`, `tests/phase1.test.js` e atualizado diretamente o banco `data/cti_oficina.db` (`configuracoes`, `parceiros_tecnicos`, `catalogo_itens`, `combos`, `memoria_atributos` e `whatsapp_templates`, preservando preferencias ativas e validado com `PRAGMA integrity_check = ok`).
     - Adicionado helper `formatEnumLabel()` em `public/js/state-sync.js` para formatacao acentuada na UI sem alterar codigos internos/enums do banco.
  3. **Limpeza de Botoes Redundantes & Atalho F2:**
     - Removido `#sidebar-qr-btn` da Sidebar e `#view-open-qr` / `#view-go-settings` dos cabecalhos internos, mantendo apenas o botao `Celular LAN` na Topbar e o indicador `LAN Sincronizado` no rodape da Sidebar.
     - Padronizado o atalho **`F2`** para abrir `Caixa & Ledger` na Sidebar, no HUD de rodape (`F9`), no listener global e no Spotlight (`Ctrl+K`), com `F6` removido.
  4. **Layout, Respiro de Scroll & Icone Sincronizado ao Camaleao:**
     - `public/css/design-tokens.css` e `public/css/shell.css`: alargada a Sidebar (`264px`), liberada quebra de linha em `.brand-slogan` para exibir `"Precisao Optica & Cutelaria"` sem reticencias, e aplicado `padding-bottom: calc(48px + var(--hud-height))` em desktop (`96px` no mobile).
     - `public/js/icons.js`, `public/js/state-sync.js`, `src/services/settings-service.js` e `public/js/view-settings.js`: adicionado `getDefaultBrandSvgForMode(operationMode)` e botao `Automatico (Camaleao)`, permitindo `brand_icon_svg` vazio sincronizar automaticamente o logotipo ao modo (`OPTICAL_ONLY`, `CUTLERY_ONLY`, `HYBRID`).
- **Verificacao Automatizada Pos-Hotfix (`npm test`):**
  - 14/14 testes aprovados (`phase1.test.js` + `phase2.test.js` + `phase3.test.js`), 0 falhas, 0 emojis e todos os arquivos dentro do teto `<= 600` linhas (maior arquivo: `public/js/modal-os-checkin.js` com 507 linhas).
