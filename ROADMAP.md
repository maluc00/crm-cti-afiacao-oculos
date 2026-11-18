# ROADMAP.md - PLANO DE CONSTRUCAO EM 6 FASES SEQUENCIAIS

O **CTI Pro CRM** e construido em 6 fases incrementais sobre o esquema unico `data/schema.sql` ja homologado na Fase 1. Nenhuma fase altera dados preexistentes em `data/`.

---

## FASE 1: Fundacao Arquitetural, Servidor LAN, Banco SQLite Blindado & Design System Industrial [CONCLUIDA]
- **Escopo:**
  - Governanca documental (`AGENTS.md`, `ROADMAP.md`, `DEVLOG.md`) e inicializador 1-clique Windows (`iniciar-cti.bat`).
  - Servidor Node.js/Express em `0.0.0.0:3000` com adaptador SQLite sincrono, modo WAL, `foreign_keys = ON`, Hub WebSocket `/ws` e geracao de QR Code SVG + PIN LAN opcional.
  - Banco completo (`data/schema.sql` e `data/seed.sql`) com todas as tabelas das 6 fases, triggers imutaveis em `caixa_ledger` e bloqueio de `DELETE` fisico.
  - App Shell responsivo (Sidebar Desktop + Bottom Nav Mobile + Topbar + Spotlight `Ctrl+K` + HUD `F9` + Semaforo do Caixa).
  - Aba de Configuracoes & Personalizacao White-Label funcional (Camaleao `OPTICAL_ONLY`/`CUTLERY_ONLY`/`HYBRID`, `partners_mode_enabled`, 3 superficies visuais, motor WCAG AAA de luminancia e icones SVG).
- **Criterio de Aceite:** 100% da suite `tests/phase1.test.js` aprovada e `data/cti_oficina.db` inicializado.

---

## FASE 2: Catalogo Unificado (BOM, Produtos e Combos) & Central de Clientes com Scoring [CONCLUIDA]
- **Escopo:**
  - Almoxarifado de Insumos BOM com fluxo `+ Entrada de Compra (CMP)`, recalculo de Custo Medio Ponderado e `Ajuste de Inventario` com justificativa obrigatoria.
  - Produtos de revenda no balcao com margem ao vivo e alerta de ruptura, alem de Servicos com Ficha Tecnica BOM refletindo lucro liquido real.
  - Motor de Combos Inteligentes exibindo soma original, preco promocional, desconto real, custo BOM/produto embutido e margem liquida final.
  - Componente universal `public/js/spotlight-select.js` navegavel por teclado com criacao inline (`+ Novo Item Inline`).
  - Central de Clientes com normalizacao E.164, busca instantanea, indice A-Z, cadastro elastico (5s + expansao endereco ViaCEP/offline), Scoring hibrido (automatico + manual + flags) e Prontuario 360 com LTV auditado, Top 3 servicos e garantias ativas.
- **Criterio de Aceite:** 100% da suite conjunta `tests/phase1.test.js` + `tests/phase2.test.js` aprovada.

---

## FASE 3: OS Elastica (Express/Completo/Lote), Bancada Viva (FSM), WebP & Impressao Termica [CONCLUIDA]
- **Escopo entregue:**
  - Modal de Check-in de OS (`F4`) com cabecalho slim de 38px (`#OS-YYYY-XXXX`), alternancia de dominio (`HYBRID`), seletor `[ Express | Completo | Lote ]` e alerta automatico de garantia (< 90 dias).
  - Modo Express (Spotlight 1 linha com Top 10, multiplicador `Nx`, `+ Novo Item Inline`, regua financeira com `%`/`R$`, `Cortesia`, `Sinal`/`Quitado` e calculadora de troco), Modo Completo (pericia tecnica com auto-aprendizado, `ESTADO_LENTE`, desmembramento unitario de lote `0/N`) e Modo Lote Rapido em planilha atomica.
  - Bancada Viva em 3 visoes (`Kanban`, `Lista de Alta Densidade` e `Stepper Tatil`), aba dedicada de Estacionamento Tecnico (`AGUARDANDO_PECA` + `Peca Chegou`), timestamps passivos silenciosos, Split Payment bloqueante (`409 QUITACAO_OBRIGATORIA`) na entrega e cancelamento com motivo obrigatorio + estorno BOM e `caixa_ledger`.
  - Fotos ultraleves WebP comprimidas no cliente (`maxDim 800px`, qualidade `0.75`) salvas em `data/media/YYYY-MM/`, Lightbox `1x/2x/3x`, Impressao Termica (`80mm`, `58mm`, `50x30mm`, `A4`) com QR PIX EMVCo CRC16 + QR Tracking e Global Spotlight (`Ctrl+K`) integrado.
- **Criterio de Aceite:** 14/14 testes automatizados aprovados (`phase1`, `phase2`, `phase3`), zero emojis e teto de 600 linhas cumprido.

---

## FASE 4: CRM de Clientes, Garantia Inteligente & Central WhatsApp Anti-Ban
- **Escopo:**
  - Ficha 360 do cliente com calculo automatico de `score_automatico` (1 a 5), LTV acumulado, total de OS e flags comportamentais.
  - Fluxo assistido de Garantia (`eh_garantia = 1`, `os_origem_garantia_id`) validando prazos por item (`garantia_dias`, padrao 90 dias) sem distorcer faturamento.
  - Gerenciador de templates (`whatsapp_templates`) e fila de disparos (`whatsapp_fila_logs`) com variacao de texto, janela de horario e delay Anti-Ban configuravel.
  - Modo Link Manual instantaneo (`wa.me`) para envio sem integracao externa quando preferido.
- **Criterio de Aceite:** Zero mensagens duplicadas na fila e trilha completa de pos-venda/retirada.

---

## FASE 5: Caixa Diario Blindado, PDV Balcao, Comissoes & Livro-Razao DRE
- **Escopo:**
  - Fluxo completo de abertura, suprimento, sangria e fechamento cego de caixa (`contagem_cega_especie`, conferencia PIX/Cartao e apuracao de quebra/sobra).
  - Recebimento total ou parcial de OS (multiplos meios de pagamento) + venda direta PDV de produtos de balcao.
  - Calculo automatico de taxas de cartao (`valor_bruto`, `taxa_aplicada`, `valor_liquido`) e comissao de parceiros quando `partners_mode_enabled = 1`.
  - Fluxo auditado de `ESTORNO` com justificativa obrigatoria e espelho DRE por competencia.
- **Criterio de Aceite:** Conciliacao exata centavo a centavo com `ROUND(x, 2)` e imutabilidade total do `caixa_ledger`.

---

## FASE 6: BI Executivo, Importacao de Legado Excel (CTI2025) & Backups Locais
- **Escopo:**
  - Importador de planilhas historicas (`.xlsx`/`.csv`) para `historico_consolidado_legado` com preview e validacao antes da gravacao.
  - Paineis de BI comparando ano contra ano (YoY), faturamento por dominio, PA (Pessoas Atendidas), QNT (Servicos), Ticket Medio, Margem de Contribuicao e Ponto de Equilibrio sobre `fixed_costs_json`.
  - Motor de backup local com compactacao/exportacao segura em `data/backups/` e verificacao de integridade `PRAGMA integrity_check`.
- **Criterio de Aceite:** Comparativos historicos multi-anuais validados e rotina de backup/restauracao testada ponta a ponta.
