-- ============================================================================
-- CTI PRO CRM - DADOS INICIAIS IDEMPOTENTES (SEED OFICIAL FASE 1)
-- Zero emojis | Valores monetarios normalizados com ROUND(x, 2)
-- ============================================================================

-- 1. Configuracoes Globais Padrao & White-Label
INSERT OR IGNORE INTO configuracoes (chave, valor, descricao) VALUES
  ('operation_mode', 'HYBRID', 'Modo da oficina: OPTICAL_ONLY, CUTLERY_ONLY ou HYBRID'),
  ('partners_mode_enabled', '0', 'Modo parceiros e comissoes: 0 (Solo) ou 1 (Ativo)'),
  ('brand_name', 'CTI Pro Oficina', 'Nome exibido na barra lateral e documentos'),
  ('brand_slogan', 'Precisao Optica & Cutelaria Tecnica', 'Subtitulo institucional White-Label'),
  ('brand_icon_svg', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="12" r="4"/><circle cx="16.5" cy="12" r="4"/><path d="M11.5 12h1"/><path d="M3.5 12H2"/><path d="M22 12h-1.5"/><path d="M7.5 8V6.5"/><path d="M16.5 8V6.5"/></svg>', 'Icone SVG vetorial da marca'),
  ('theme_mode', 'warm-atelier', 'Superficie visual: warm-atelier ou titanium-dark'),
  ('focus_mode', '0', 'Modo foco universal F8: 0 (Desligado) ou 1 (Ativo)'),
  ('accent_color', '#B45309', 'Cor de destaque hexadecimal White-Label'),
  ('pix_key', '', 'Chave PIX padrao da oficina para recebimentos'),
  ('card_fees_json', '{"debito_pct":1.49,"credito_1x_pct":3.19,"credito_parcelado_pct":4.89}', 'Taxas de cartao por modalidade'),
  ('fixed_costs_json', '{"aluguel":1800.00,"energia":320.00,"internet":120.00,"pro_labore":3500.00}', 'Custos fixos mensais de referencia'),
  ('monthly_goals_json', '{"faturamento_meta":18000.00,"os_meta":180,"ticket_medio_meta":100.00}', 'Metas mensais do painel BI'),
  ('switches_json', '{"hud_f9_visible":true,"compact_tables":false,"sound_feedback":false}', 'Preferencias operacionais da interface e HUD F9'),
  ('scoring_rules_json', '{"ltv_vip_min":350.00,"frequencia_vip_os":4,"dias_tolerancia_retirada":10,"penalidade_atraso_pontos":1,"penalidade_inadimplencia_pontos":2}', 'Regras do motor automatico de scoring de clientes'),
  ('lan_pin_enabled', '0', 'Exigir PIN opcional para acesso via LAN mobile'),
  ('lan_pin_code', '2486', 'Codigo PIN LAN de 4 a 6 digitos'),
  ('schema_version', '1.0.0', 'Versao atual do esquema SQLite');

-- 2. Parceiros Tecnicos (Operador Padrao Solo + Especialista Opcional)
INSERT INTO parceiros_tecnicos (nome, documento, telefone, eh_operador_padrao, regra_comissao_json, ativo)
SELECT 'Bancada Principal (Titular)', '', '', 1, '{"OPTICA":0,"CUTELARIA":0}', 1
WHERE NOT EXISTS (SELECT 1 FROM parceiros_tecnicos WHERE eh_operador_padrao = 1);

INSERT INTO parceiros_tecnicos (nome, documento, telefone, eh_operador_padrao, regra_comissao_json, ativo)
SELECT 'Tecnico Parceiro Associado', '', '', 0, '{"OPTICA":30,"CUTELARIA":35}', 1
WHERE NOT EXISTS (SELECT 1 FROM parceiros_tecnicos WHERE nome = 'Tecnico Parceiro Associado');

-- 3. Catalogo Real: Servicos Opticos
INSERT OR IGNORE INTO catalogo_itens
  (codigo_sku, tipo, dominio, nome_tecnico, abreviacao_balcao, preco_venda, custo_medio_ponderado, estoque_atual, estoque_minimo, unidade, garantia_dias, sla_padrao_minutos, frequencia_uso)
VALUES
  ('OPT-SRV-MOLA', 'SERVICO', 'OPTICA', 'Substituicao e Alinhamento de Mola Flex', 'Mola', ROUND(45.00, 2), ROUND(4.50, 2), 0, 0, 'UN', 90, 40, 95),
  ('OPT-SRV-HASTE', 'SERVICO', 'OPTICA', 'Troca ou Recuperacao de Hastes', 'Hastes', ROUND(65.00, 2), ROUND(12.00, 2), 0, 0, 'UN', 90, 60, 88),
  ('OPT-SRV-SOLDA', 'SERVICO', 'OPTICA', 'Solda Metalica de Precisao (Prata/Estanho)', 'Solda', ROUND(55.00, 2), ROUND(3.20, 2), 0, 0, 'UN', 90, 50, 110),
  ('OPT-SRV-SOLDA-TI', 'SERVICO', 'OPTICA', 'Solda Laser / Micro-Solda em Titanio', 'Solda Titanio', ROUND(120.00, 2), ROUND(14.00, 2), 0, 0, 'UN', 90, 90, 52),
  ('OPT-SRV-CHARNEIRA', 'SERVICO', 'OPTICA', 'Reconstrucao e Fixacao de Charneira', 'Charneira', ROUND(60.00, 2), ROUND(5.50, 2), 0, 0, 'UN', 90, 60, 84),
  ('OPT-SRV-AJUSTE', 'SERVICO', 'OPTICA', 'Ajuste Geometrico e Desempeno de Armacao', 'Ajuste', ROUND(25.00, 2), ROUND(0.50, 2), 0, 0, 'UN', 30, 15, 130),
  ('OPT-SRV-PARAFUSO', 'SERVICO', 'OPTICA', 'Extracao e Reposicao de Micro-Parafuso', 'Parafuso', ROUND(15.00, 2), ROUND(0.45, 2), 0, 0, 'UN', 30, 10, 145),
  ('OPT-SRV-ADAPTACAO', 'SERVICO', 'OPTICA', 'Adaptacao Tecnica de Lentes em Armacao', 'Adaptacao', ROUND(75.00, 2), ROUND(2.00, 2), 0, 0, 'UN', 90, 60, 64),
  ('OPT-SRV-PONTEIRAS', 'SERVICO', 'OPTICA', 'Substituicao de Par de Ponteiras', 'Ponteiras', ROUND(30.00, 2), ROUND(3.80, 2), 0, 0, 'PAR', 90, 20, 76),
  ('OPT-SRV-PLAQUETAS', 'SERVICO', 'OPTICA', 'Troca de Par de Plaquetas Anatomicas', 'Plaquetas', ROUND(20.00, 2), ROUND(1.80, 2), 0, 0, 'PAR', 90, 15, 140),
  ('OPT-SRV-BANHO-OURO', 'SERVICO', 'OPTICA', 'Banho Eletrolitico de Ouro e Polimento', 'Banho de Ouro', ROUND(180.00, 2), ROUND(38.00, 2), 0, 0, 'UN', 180, 1440, 28);

-- 4. Catalogo Real: Servicos de Cutelaria e Afiacao
INSERT OR IGNORE INTO catalogo_itens
  (codigo_sku, tipo, dominio, nome_tecnico, abreviacao_balcao, preco_venda, custo_medio_ponderado, estoque_atual, estoque_minimo, unidade, garantia_dias, sla_padrao_minutos, frequencia_uso)
VALUES
  ('CUT-SRV-ALICATE', 'SERVICO', 'CUTELARIA', 'Afiacao de Precisao Alicate de Cuticula', 'Afiacao Alicate', ROUND(18.00, 2), ROUND(0.80, 2), 0, 0, 'UN', 30, 20, 150),
  ('CUT-SRV-TESOURA', 'SERVICO', 'CUTELARIA', 'Afiacao de Tesoura Profissional Fio Laser/Navalha', 'Afiacao Tesoura', ROUND(38.00, 2), ROUND(1.20, 2), 0, 0, 'UN', 30, 35, 72),
  ('CUT-SRV-FACA', 'SERVICO', 'CUTELARIA', 'Afiacao em Pedra Dagua Faca Chef / Cutelaria', 'Afiacao Faca', ROUND(28.00, 2), ROUND(1.00, 2), 0, 0, 'UN', 30, 30, 65),
  ('CUT-SRV-LAMINA', 'SERVICO', 'CUTELARIA', 'Retifica de Lamina de Maquina de Cortar Cabelo', 'Lamina Maquina', ROUND(42.00, 2), ROUND(1.50, 2), 0, 0, 'UN', 30, 40, 48),
  ('CUT-SRV-MOLA-EIXO', 'SERVICO', 'CUTELARIA', 'Troca de Mola e Ajuste de Eixo de Alicate', 'Mola/Eixo Alicate', ROUND(14.00, 2), ROUND(1.40, 2), 0, 0, 'UN', 60, 15, 82);

-- 5. Produtos de Revenda Balcao (PDV)
INSERT OR IGNORE INTO catalogo_itens
  (codigo_sku, tipo, dominio, nome_tecnico, abreviacao_balcao, preco_venda, custo_medio_ponderado, estoque_atual, estoque_minimo, unidade, garantia_dias, sla_padrao_minutos, frequencia_uso)
VALUES
  ('OPT-PRD-SPRAY', 'PRODUTO', 'OPTICA', 'Spray Limpa-Lentes Antiestatico 30ml', 'Spray Limpa-Lentes', ROUND(22.00, 2), ROUND(6.50, 2), 24, 6, 'UN', 30, 5, 58),
  ('OPT-PRD-ESTOJO', 'PRODUTO', 'OPTICA', 'Estojo Rigido Forrado com Flanela', 'Estojo Rigido', ROUND(35.00, 2), ROUND(11.00, 2), 18, 5, 'UN', 90, 5, 44),
  ('OPT-PRD-CORDAO', 'PRODUTO', 'OPTICA', 'Cordao Retentor Esportivo em Silicone', 'Cordao Silicone', ROUND(18.00, 2), ROUND(4.20, 2), 20, 5, 'UN', 30, 5, 31),
  ('CUT-PRD-OLEO', 'PRODUTO', 'CUTELARIA', 'Oleo Mineral Protetivo para Aco Inox e Carbono', 'Oleo Protetivo', ROUND(24.00, 2), ROUND(7.10, 2), 15, 4, 'UN', 30, 5, 29);

-- 6. Insumos de Almoxarifado (BOM)
INSERT OR IGNORE INTO catalogo_itens
  (codigo_sku, tipo, dominio, nome_tecnico, abreviacao_balcao, preco_venda, custo_medio_ponderado, estoque_atual, estoque_minimo, unidade, garantia_dias, sla_padrao_minutos, frequencia_uso)
VALUES
  ('INS-OPT-PLAQUETA', 'INSUMO', 'OPTICA', 'Par de Plaquetas Silicone Encaixe/Parafuso', 'Insumo Plaqueta', ROUND(0.00, 2), ROUND(1.80, 2), 120, 25, 'PAR', 0, 0, 100),
  ('INS-OPT-PARAFUSO', 'INSUMO', 'OPTICA', 'Micro-Parafuso Inox 1.4mm', 'Insumo Parafuso', ROUND(0.00, 2), ROUND(0.45, 2), 300, 50, 'UN', 0, 0, 115),
  ('INS-OPT-MOLA', 'INSUMO', 'OPTICA', 'Mola Flex Universal para Charneira', 'Insumo Mola', ROUND(0.00, 2), ROUND(4.50, 2), 45, 10, 'UN', 0, 0, 70),
  ('INS-OPT-PONTEIRA', 'INSUMO', 'OPTICA', 'Par de Ponteiras em Acetato Termomoldavel', 'Insumo Ponteira', ROUND(0.00, 2), ROUND(3.80, 2), 40, 10, 'PAR', 0, 0, 62),
  ('INS-OPT-FLUXO', 'INSUMO', 'OPTICA', 'Vareta Solda Prata e Fluxo Tecnico', 'Insumo Solda', ROUND(0.00, 2), ROUND(3.20, 2), 60, 12, 'UN', 0, 0, 80),
  ('INS-CUT-MOLA', 'INSUMO', 'CUTELARIA', 'Mola Espiral Inox para Alicate de Cuticula', 'Insumo Mola Alicate', ROUND(0.00, 2), ROUND(1.40, 2), 80, 20, 'UN', 0, 0, 60),
  ('INS-GER-LIXA', 'INSUMO', 'AMBOS', 'Disco de Polimento e Pasta Abrasiva Fina', 'Insumo Polimento', ROUND(0.00, 2), ROUND(0.90, 2), 90, 15, 'UN', 0, 0, 55);

-- 7. Ficha Tecnica BOM (Baixa automatica de insumos por servico)
INSERT OR IGNORE INTO ficha_tecnica_bom (servico_id, insumo_id, quantidade_consumida)
SELECT s.id, i.id, 1
FROM catalogo_itens s, catalogo_itens i
WHERE (s.codigo_sku = 'OPT-SRV-PLAQUETAS' AND i.codigo_sku = 'INS-OPT-PLAQUETA')
   OR (s.codigo_sku = 'OPT-SRV-PARAFUSO' AND i.codigo_sku = 'INS-OPT-PARAFUSO')
   OR (s.codigo_sku = 'OPT-SRV-MOLA' AND i.codigo_sku = 'INS-OPT-MOLA')
   OR (s.codigo_sku = 'OPT-SRV-PONTEIRAS' AND i.codigo_sku = 'INS-OPT-PONTEIRA')
   OR (s.codigo_sku = 'OPT-SRV-SOLDA' AND i.codigo_sku = 'INS-OPT-FLUXO')
   OR (s.codigo_sku = 'CUT-SRV-MOLA-EIXO' AND i.codigo_sku = 'INS-CUT-MOLA');

-- 8. Combos Promocionais
INSERT OR IGNORE INTO combos (codigo_combo, nome, abreviacao, dominio, preco_combo, economia_gerada)
VALUES
  ('CMB-OPT-REV', 'Revisao Optica Completa (Ajuste + Plaquetas + Spray)', 'Revisao Optica', 'OPTICA', ROUND(55.00, 2), ROUND(12.00, 2)),
  ('CMB-CUT-LOTE5', 'Pacote Salao 5 Afiacoes de Alicate + Oleo Protetivo', 'Pacote 5 Alicates', 'CUTELARIA', ROUND(98.00, 2), ROUND(16.00, 2));

INSERT OR IGNORE INTO combos_itens (combo_id, item_id, quantidade)
SELECT c.id, i.id, 1
FROM combos c, catalogo_itens i
WHERE c.codigo_combo = 'CMB-OPT-REV'
  AND i.codigo_sku IN ('OPT-SRV-AJUSTE', 'OPT-SRV-PLAQUETAS', 'OPT-PRD-SPRAY');

INSERT OR IGNORE INTO combos_itens (combo_id, item_id, quantidade)
SELECT c.id, i.id, CASE WHEN i.codigo_sku = 'CUT-SRV-ALICATE' THEN 5 ELSE 1 END
FROM combos c, catalogo_itens i
WHERE c.codigo_combo = 'CMB-CUT-LOTE5'
  AND i.codigo_sku IN ('CUT-SRV-ALICATE', 'CUT-PRD-OLEO');

-- 9. Memoria de Atributos (Spotlight Auto-Aprendizado)
INSERT OR IGNORE INTO memoria_atributos (categoria, dominio, valor, frequencia_uso) VALUES
  ('MATERIAL', 'OPTICA', 'Titanio', 95),
  ('MATERIAL', 'OPTICA', 'Acetato', 120),
  ('MATERIAL', 'OPTICA', 'Zilo', 65),
  ('MATERIAL', 'OPTICA', 'Monel', 55),
  ('MATERIAL', 'OPTICA', 'Ouro', 25),
  ('MATERIAL', 'OPTICA', 'TR-90', 88),
  ('MATERIAL', 'CUTELARIA', 'Aco Inox', 140),
  ('MATERIAL', 'CUTELARIA', 'Aco Carbono', 75),
  ('LOCAL_AVARIA', 'OPTICA', 'Ponte', 80),
  ('LOCAL_AVARIA', 'OPTICA', 'Charneira D/E', 105),
  ('LOCAL_AVARIA', 'OPTICA', 'Haste D/E', 95),
  ('LOCAL_AVARIA', 'OPTICA', 'Aro D/E', 78),
  ('LOCAL_AVARIA', 'OPTICA', 'Plaqueta D/E', 110),
  ('LOCAL_AVARIA', 'CUTELARIA', 'Ponta', 130),
  ('LOCAL_AVARIA', 'CUTELARIA', 'Mola', 85),
  ('LOCAL_AVARIA', 'CUTELARIA', 'Lamina', 118),
  ('LOCAL_AVARIA', 'CUTELARIA', 'Parafuso/Eixo', 74),
  ('ESTADO_LENTE', 'OPTICA', 'Microtrincas/Bisel', 60),
  ('ESTADO_LENTE', 'OPTICA', 'Riscos Opticos', 95),
  ('ESTADO_LENTE', 'OPTICA', 'Antirreflexo Craquelado', 70),
  ('ESTADO_LENTE', 'OPTICA', 'Trinca Furacao/Rimless', 48),
  ('ESTADO_LENTE', 'OPTICA', 'Pelicula Descolando', 42),
  ('ESTADO_LENTE', 'OPTICA', 'Lente Ressecada', 39),
  ('ESTADO_LENTE', 'OPTICA', 'Ciente Desmonte', 110);

-- 10. Templates WhatsApp (Sem Emojis, Linguagem Tecnica e Direta)
INSERT OR IGNORE INTO whatsapp_templates (codigo, titulo, dominio, gatilho, variacoes_texto_json) VALUES
  ('OS_ABERTA', 'Confirmacao de Entrada de OS', 'AMBOS', 'AO_CRIAR_OS',
   '["Ola {cliente}, sua ordem de servico {codigo_os} foi registrada na {marca}. Previsao de entrega: {prazo}.","Confirmamos o recebimento na {marca}. Protocolo {codigo_os} em fila tecnica. Previsao: {prazo}."]'),
  ('OS_PRONTA', 'Aviso de Servico Concluido', 'AMBOS', 'AO_MARCAR_PRONTO',
   '["Ola {cliente}, o servico da OS {codigo_os} esta concluido e pronto para retirada na {marca}. Saldo: {saldo}.","Sua peca referente a OS {codigo_os} foi finalizada na bancada tecnica e ja pode ser retirada. Valor pendente: {saldo}."]'),
  ('LEMBRETE_RETIRADA', 'Lembrete de Retirada Pendente', 'AMBOS', 'OS_PRONTA_48H',
   '["Ola {cliente}, lembramos que a OS {codigo_os} encontra-se aguardando retirada na {marca}."]'),
  ('GARANTIA_POS_VENDA', 'Acompanhamento de Garantia 7 Dias', 'AMBOS', 'POS_ENTREGA_7D',
   '["Ola {cliente}, gostariamos de confirmar se o ajuste realizado na OS {codigo_os} ficou perfeito. Seguimos a disposicao na {marca}."]');
