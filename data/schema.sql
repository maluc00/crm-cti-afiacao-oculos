-- ============================================================================
-- CTI PRO CRM - ESQUEMA INTEGRAL DO BANCO DE DADOS (FASES 1 A 6)
-- Fonte Unica da Verdade (Local-First SQLite)
-- Padroes: ROUND(x, 2) monetario | Soft Delete | Triggers Imutaveis no Ledger
-- ============================================================================

-- 1. Configuracoes Globais & White-Label
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  descricao TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TRIGGER IF NOT EXISTS trg_configuracoes_validate_insert
BEFORE INSERT ON configuracoes
BEGIN
  SELECT CASE
    WHEN NEW.chave = 'operation_mode' AND NEW.valor NOT IN ('OPTICAL_ONLY', 'CUTLERY_ONLY', 'HYBRID')
    THEN RAISE(ABORT, 'MODO_OPERACAO_INVALIDO')
    WHEN NEW.chave = 'partners_mode_enabled' AND NEW.valor NOT IN ('0', '1')
    THEN RAISE(ABORT, 'MODO_PARCEIROS_INVALIDO')
    WHEN NEW.chave = 'theme_mode' AND NEW.valor NOT IN ('warm-atelier', 'titanium-dark')
    THEN RAISE(ABORT, 'TEMA_INVALIDO')
    WHEN NEW.chave = 'focus_mode' AND NEW.valor NOT IN ('0', '1')
    THEN RAISE(ABORT, 'MODO_FOCO_INVALIDO')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_configuracoes_validate_update
BEFORE UPDATE ON configuracoes
BEGIN
  SELECT CASE
    WHEN NEW.chave = 'operation_mode' AND NEW.valor NOT IN ('OPTICAL_ONLY', 'CUTLERY_ONLY', 'HYBRID')
    THEN RAISE(ABORT, 'MODO_OPERACAO_INVALIDO')
    WHEN NEW.chave = 'partners_mode_enabled' AND NEW.valor NOT IN ('0', '1')
    THEN RAISE(ABORT, 'MODO_PARCEIROS_INVALIDO')
    WHEN NEW.chave = 'theme_mode' AND NEW.valor NOT IN ('warm-atelier', 'titanium-dark')
    THEN RAISE(ABORT, 'TEMA_INVALIDO')
    WHEN NEW.chave = 'focus_mode' AND NEW.valor NOT IN ('0', '1')
    THEN RAISE(ABORT, 'MODO_FOCO_INVALIDO')
  END;
END;

-- 2. Parceiros Tecnicos e Operador Padrao
CREATE TABLE IF NOT EXISTS parceiros_tecnicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  documento TEXT,
  telefone TEXT,
  eh_operador_padrao INTEGER NOT NULL DEFAULT 0 CHECK (eh_operador_padrao IN (0, 1)),
  regra_comissao_json TEXT NOT NULL DEFAULT '{}',
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_parceiros_ativo ON parceiros_tecnicos(ativo, eh_operador_padrao);

-- 3. Clientes (CRM Local-First)
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone_e164 TEXT NOT NULL UNIQUE,
  apelido_referencia TEXT,
  cpf_cnpj TEXT,
  data_nascimento TEXT,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  observacoes_tecnicas TEXT,
  score_automatico INTEGER NOT NULL DEFAULT 3 CHECK (score_automatico BETWEEN 1 AND 5),
  score_manual INTEGER CHECK (score_manual IS NULL OR (score_manual BETWEEN 1 AND 5)),
  flags_comportamento_json TEXT NOT NULL DEFAULT '[]',
  ltv_acumulado REAL NOT NULL DEFAULT 0.00,
  total_os INTEGER NOT NULL DEFAULT 0,
  ultima_visita_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_clientes_telefone_e164 ON clientes(telefone_e164);
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome, ativo);

-- 4. Catalogo Unificado (Servicos, Produtos e Insumos BOM)
CREATE TABLE IF NOT EXISTS catalogo_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_sku TEXT UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('SERVICO', 'PRODUTO', 'INSUMO')),
  dominio TEXT NOT NULL CHECK (dominio IN ('OPTICA', 'CUTELARIA', 'AMBOS')),
  nome_tecnico TEXT NOT NULL,
  abreviacao_balcao TEXT NOT NULL,
  preco_venda REAL NOT NULL DEFAULT 0.00 CHECK (preco_venda >= 0),
  custo_medio_ponderado REAL NOT NULL DEFAULT 0.00 CHECK (custo_medio_ponderado >= 0),
  estoque_atual REAL NOT NULL DEFAULT 0,
  estoque_minimo REAL NOT NULL DEFAULT 0,
  unidade TEXT NOT NULL DEFAULT 'UN',
  garantia_dias INTEGER NOT NULL DEFAULT 90 CHECK (garantia_dias >= 0),
  sla_padrao_minutos INTEGER NOT NULL DEFAULT 60 CHECK (sla_padrao_minutos >= 0),
  frequencia_uso INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_catalogo_dominio_tipo ON catalogo_itens(dominio, tipo, ativo);
CREATE INDEX IF NOT EXISTS idx_catalogo_freq ON catalogo_itens(frequencia_uso DESC);

-- 5. Ficha Tecnica BOM (Consumo automatico de insumos por servico)
CREATE TABLE IF NOT EXISTS ficha_tecnica_bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  servico_id INTEGER NOT NULL REFERENCES catalogo_itens(id),
  insumo_id INTEGER NOT NULL REFERENCES catalogo_itens(id),
  quantidade_consumida REAL NOT NULL CHECK (quantidade_consumida > 0),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  UNIQUE(servico_id, insumo_id)
);

-- 6. Combos e Itens de Combos
CREATE TABLE IF NOT EXISTS combos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_combo TEXT UNIQUE,
  nome TEXT NOT NULL,
  abreviacao TEXT NOT NULL,
  dominio TEXT NOT NULL CHECK (dominio IN ('OPTICA', 'CUTELARIA', 'AMBOS')),
  preco_combo REAL NOT NULL CHECK (preco_combo >= 0),
  economia_gerada REAL NOT NULL DEFAULT 0.00,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS combos_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  combo_id INTEGER NOT NULL REFERENCES combos(id),
  item_id INTEGER NOT NULL REFERENCES catalogo_itens(id),
  quantidade REAL NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  UNIQUE(combo_id, item_id)
);

-- 7. Memoria de Atributos (Auto-aprendizado do Spotlight por Dominio)
CREATE TABLE IF NOT EXISTS memoria_atributos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL CHECK (categoria IN ('MATERIAL', 'LOCAL_AVARIA', 'ESTADO_LENTE')),
  dominio TEXT NOT NULL CHECK (dominio IN ('OPTICA', 'CUTELARIA', 'AMBOS')),
  valor TEXT NOT NULL,
  frequencia_uso INTEGER NOT NULL DEFAULT 1,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  UNIQUE(categoria, dominio, valor)
);

CREATE INDEX IF NOT EXISTS idx_memoria_atributos_lookup
  ON memoria_atributos(categoria, dominio, ativo, frequencia_uso DESC);

-- 8. Ordens de Servico (Nucleo Operacional)
CREATE TABLE IF NOT EXISTS ordens_servico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_os TEXT NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  parceiro_id INTEGER REFERENCES parceiros_tecnicos(id),
  dominio TEXT NOT NULL CHECK (dominio IN ('OPTICA', 'CUTELARIA')),
  modo_abertura TEXT NOT NULL DEFAULT 'EXPRESS' CHECK (modo_abertura IN ('EXPRESS', 'COMPLETO', 'LOTE')),
  status TEXT NOT NULL DEFAULT 'FILA' CHECK (status IN ('FILA', 'BANCADA', 'AGUARDANDO_PECA', 'PRONTO', 'ENTREGUE', 'CANCELADA')),
  prioridade_sla TEXT NOT NULL DEFAULT 'PADRAO' CHECK (prioridade_sla IN ('PADRAO', 'URGENTE', 'AGENDADO')),
  prazo_prometido_em TEXT,
  marca_modelo TEXT,
  material_peca TEXT,
  locais_avaria_json TEXT NOT NULL DEFAULT '[]',
  tipo_lente TEXT NOT NULL DEFAULT 'N/A' CHECK (tipo_lente IN ('MULTIFOCAL', 'VISAO_SIMPLES', 'SOLAR', 'SEM_LENTE', 'N/A')),
  estado_lentes_json TEXT NOT NULL DEFAULT '[]',
  observacoes TEXT,
  eh_garantia INTEGER NOT NULL DEFAULT 0 CHECK (eh_garantia IN (0, 1)),
  os_origem_garantia_id INTEGER REFERENCES ordens_servico(id),
  eh_cortesia INTEGER NOT NULL DEFAULT 0 CHECK (eh_cortesia IN (0, 1)),
  subtotal REAL NOT NULL DEFAULT 0.00,
  desconto_valor REAL NOT NULL DEFAULT 0.00,
  desconto_tipo TEXT NOT NULL DEFAULT 'VALOR' CHECK (desconto_tipo IN ('VALOR', 'PERCENTUAL')),
  valor_total REAL NOT NULL DEFAULT 0.00,
  valor_pago REAL NOT NULL DEFAULT 0.00,
  saldo_devedor REAL NOT NULL DEFAULT 0.00,
  bom_baixado INTEGER NOT NULL DEFAULT 0 CHECK (bom_baixado IN (0, 1)),
  motivo_cancelamento TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  iniciado_bancada_em TEXT,
  pronto_em TEXT,
  entregue_em TEXT,
  cancelado_em TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_os_status_dominio ON ordens_servico(status, dominio, ativo);
CREATE INDEX IF NOT EXISTS idx_os_cliente ON ordens_servico(cliente_id, criado_em DESC);

-- 9. Linhas de Itens da OS
CREATE TABLE IF NOT EXISTS os_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL REFERENCES ordens_servico(id),
  item_id INTEGER REFERENCES catalogo_itens(id),
  combo_id INTEGER REFERENCES combos(id),
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('SERVICO', 'PRODUTO', 'COMBO', 'LOTE')),
  dominio TEXT NOT NULL CHECK (dominio IN ('OPTICA', 'CUTELARIA', 'AMBOS')),
  quantidade REAL NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario REAL NOT NULL DEFAULT 0.00,
  valor_total REAL NOT NULL DEFAULT 0.00,
  custo_unitario_snapshot REAL NOT NULL DEFAULT 0.00,
  concluido_lote INTEGER NOT NULL DEFAULT 0 CHECK (concluido_lote IN (0, 1)),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_os_itens_os ON os_itens(os_id, ativo);

-- 10. Fotos de Inspecao da OS (Antes / Depois WebP em data/media/)
CREATE TABLE IF NOT EXISTS os_fotos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL REFERENCES ordens_servico(id),
  momento TEXT NOT NULL CHECK (momento IN ('ANTES', 'DEPOIS')),
  caminho_arquivo TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);

-- 11. Movimentacoes de Estoque (Trilha Auditavel & CMP)
CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES catalogo_itens(id),
  os_id INTEGER REFERENCES ordens_servico(id),
  tipo_movimento TEXT NOT NULL CHECK (tipo_movimento IN ('ENTRADA_COMPRA', 'BAIXA_BOM', 'VENDA_PDV', 'ESTORNO', 'AJUSTE_MANUAL')),
  quantidade REAL NOT NULL,
  custo_unitario REAL NOT NULL DEFAULT 0.00,
  cmp_anterior REAL NOT NULL DEFAULT 0.00,
  cmp_novo REAL NOT NULL DEFAULT 0.00,
  estoque_anterior REAL NOT NULL DEFAULT 0,
  estoque_posterior REAL NOT NULL DEFAULT 0,
  observacao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_estoque_mov_item ON estoque_movimentacoes(item_id, criado_em DESC);

-- 12. Sessoes de Caixa Diario (Abertura, Conferencia Cega e Fechamento)
CREATE TABLE IF NOT EXISTS caixa_sessoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'FECHADO')),
  saldo_inicial_especie REAL NOT NULL DEFAULT 0.00,
  entradas_especie REAL NOT NULL DEFAULT 0.00,
  saidas_especie REAL NOT NULL DEFAULT 0.00,
  entradas_pix REAL NOT NULL DEFAULT 0.00,
  entradas_cartao_bruto REAL NOT NULL DEFAULT 0.00,
  entradas_cartao_liquido REAL NOT NULL DEFAULT 0.00,
  contagem_cega_especie REAL,
  conferencia_pix_ok INTEGER NOT NULL DEFAULT 0 CHECK (conferencia_pix_ok IN (0, 1)),
  conferencia_cartao_ok INTEGER NOT NULL DEFAULT 0 CHECK (conferencia_cartao_ok IN (0, 1)),
  quebra_sobra_valor REAL NOT NULL DEFAULT 0.00,
  pessoas_atendidas_pa INTEGER NOT NULL DEFAULT 0,
  quantidade_servicos_qnt INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT,
  aberto_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  fechado_em TEXT
);

-- 13. Livro-Razao Financeiro Imutavel (caixa_ledger)
CREATE TABLE IF NOT EXISTS caixa_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caixa_sessao_id INTEGER REFERENCES caixa_sessoes(id),
  os_id INTEGER REFERENCES ordens_servico(id),
  ledger_origem_estorno_id INTEGER REFERENCES caixa_ledger(id),
  tipo_movimento TEXT NOT NULL CHECK (tipo_movimento IN (
    'ENTRADA_OS', 'VENDA_PDV', 'SANGRIA', 'SUPRIMENTO',
    'DESPESA_FIXA', 'COMISSAO_PARCEIRO', 'ESTORNO'
  )),
  categoria_dre TEXT NOT NULL,
  dominio TEXT NOT NULL DEFAULT 'GERAL' CHECK (dominio IN ('OPTICA', 'CUTELARIA', 'GERAL')),
  meio_pagamento TEXT NOT NULL CHECK (meio_pagamento IN (
    'ESPECIE', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'CORTESIA'
  )),
  valor_bruto REAL NOT NULL,
  taxa_aplicada REAL NOT NULL DEFAULT 0.00,
  valor_liquido REAL NOT NULL,
  descricao TEXT NOT NULL,
  justificativa_estorno TEXT,
  data_competencia TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_ledger_competencia ON caixa_ledger(data_competencia, dominio, tipo_movimento);
CREATE INDEX IF NOT EXISTS idx_ledger_sessao ON caixa_ledger(caixa_sessao_id);

CREATE TRIGGER IF NOT EXISTS trg_ledger_block_update
BEFORE UPDATE ON caixa_ledger
BEGIN
  SELECT RAISE(ABORT, 'VIOLACAO_LEDGER_IMUTAVEL: UPDATE proibido em caixa_ledger. Utilize lancamento de ESTORNO.');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_block_delete
BEFORE DELETE ON caixa_ledger
BEGIN
  SELECT RAISE(ABORT, 'VIOLACAO_LEDGER_IMUTAVEL: DELETE proibido em caixa_ledger. Utilize lancamento de ESTORNO.');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_estorno_check
BEFORE INSERT ON caixa_ledger
WHEN NEW.tipo_movimento = 'ESTORNO'
  AND (NEW.justificativa_estorno IS NULL OR length(trim(NEW.justificativa_estorno)) < 3)
BEGIN
  SELECT RAISE(ABORT, 'ESTORNO_SEM_JUSTIFICATIVA: Informe justificativa valida para estorno.');
END;

-- 14. Historico Consolidado Legado (Importacao Multi-Anual BI)
CREATE TABLE IF NOT EXISTS historico_consolidado_legado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_periodo TEXT UNIQUE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  dominio TEXT NOT NULL DEFAULT 'OPTICA' CHECK (dominio IN ('OPTICA', 'CUTELARIA', 'GERAL')),
  fonte_arquivo TEXT NOT NULL,
  receita_bruta REAL NOT NULL DEFAULT 0.00,
  receita_liquida REAL NOT NULL DEFAULT 0.00,
  despesas_totais REAL NOT NULL DEFAULT 0.00,
  lucro_operacional REAL NOT NULL DEFAULT 0.00,
  pessoas_atendidas_pa INTEGER NOT NULL DEFAULT 0,
  quantidade_servicos_qnt INTEGER NOT NULL DEFAULT 0,
  ticket_medio REAL NOT NULL DEFAULT 0.00,
  breakdown_servicos_json TEXT NOT NULL DEFAULT '{}',
  importado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_legado_ano_mes ON historico_consolidado_legado(ano, mes, dominio, ativo);

-- 15. Templates e Fila Anti-Ban WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  dominio TEXT NOT NULL DEFAULT 'AMBOS' CHECK (dominio IN ('OPTICA', 'CUTELARIA', 'AMBOS')),
  gatilho TEXT NOT NULL,
  variacoes_texto_json TEXT NOT NULL DEFAULT '[]',
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS whatsapp_fila_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES clientes(id),
  os_id INTEGER REFERENCES ordens_servico(id),
  template_id INTEGER REFERENCES whatsapp_templates(id),
  telefone_destino TEXT NOT NULL,
  mensagem_renderizada TEXT NOT NULL,
  status_envio TEXT NOT NULL DEFAULT 'FILA' CHECK (status_envio IN ('FILA', 'ENVIADO', 'FALHA', 'CANCELADO', 'LINK_MANUAL')),
  delay_antiban_ms INTEGER NOT NULL DEFAULT 0,
  agendado_para TEXT,
  enviado_em TEXT,
  erro_detalhe TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_wpp_fila_status ON whatsapp_fila_logs(status_envio, agendado_para);

-- ============================================================================
-- TRIGGERS POKA-YOKE: PROIBICAO DE DELETE FISICO EM REGISTROS OPERACIONAIS
-- ============================================================================
CREATE TRIGGER IF NOT EXISTS trg_clientes_no_physical_delete
BEFORE DELETE ON clientes
BEGIN
  SELECT RAISE(ABORT, 'SOFT_DELETE_OBRIGATORIO: Utilize UPDATE ativo = 0 em clientes.');
END;

CREATE TRIGGER IF NOT EXISTS trg_catalogo_no_physical_delete
BEFORE DELETE ON catalogo_itens
BEGIN
  SELECT RAISE(ABORT, 'SOFT_DELETE_OBRIGATORIO: Utilize UPDATE ativo = 0 em catalogo_itens.');
END;

CREATE TRIGGER IF NOT EXISTS trg_os_no_physical_delete
BEFORE DELETE ON ordens_servico
BEGIN
  SELECT RAISE(ABORT, 'SOFT_DELETE_OBRIGATORIO: Utilize UPDATE ativo = 0 ou status = CANCELADA em ordens_servico.');
END;

CREATE TRIGGER IF NOT EXISTS trg_caixa_sessoes_no_physical_delete
BEFORE DELETE ON caixa_sessoes
BEGIN
  SELECT RAISE(ABORT, 'SOFT_DELETE_OBRIGATORIO: Sessoes de caixa nao podem ser excluidas.');
END;

CREATE TRIGGER IF NOT EXISTS trg_estoque_mov_no_physical_delete
BEFORE DELETE ON estoque_movimentacoes
BEGIN
  SELECT RAISE(ABORT, 'SOFT_DELETE_OBRIGATORIO: Movimentacoes de estoque sao imutaveis.');
END;
