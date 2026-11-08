-- ==============================================================================
-- SCRIPT DE ATIVAÇÃO DE ROW LEVEL SECURITY (RLS) E POLÍTICAS DE ACESSO
-- Projeto: Microlins Presidente Prudente (dwarcjrpwubtveilwkyi.supabase.co)
-- ==============================================================================
-- Este script:
-- 1. Ativa o Row Level Security (RLS) em todas as tabelas públicas do sistema.
-- 2. Concede permissão de LEITURA (SELECT) para a chave pública (anon) apenas
--    nas tabelas operacionais necessárias ao frontend (student_records, nps_records, schools).
-- 3. BLOQUEIA expressamente qualquer operação de ESCRITA (INSERT, UPDATE, DELETE)
--    feita com a chave anônima (impedindo vandalismo ou adulteração via DevTools).
-- 4. BLOQUEIA TOTALMENTE o acesso da chave anônima às tabelas confidenciais:
--    - users (logins, credenciais e senhas)
--    - audit_logs (registros de auditoria)
--    - lgpd_requests (solicitações de privacidade)
-- 5. Preserva o funcionamento 100% irrestrito do Backend Node (server.ts),
--    pois conexões com a Service Role Key possuem privilégio nativo BYPASSRLS.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABELA: student_records (Alunos e Desempenho)
-- ------------------------------------------------------------------------------
ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura pública de alunos" ON public.student_records;
CREATE POLICY "Permitir leitura pública de alunos"
  ON public.student_records
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Escrita restrita exclusivamente ao Backend (service_role faz bypass automático)
DROP POLICY IF EXISTS "Restringir escrita de alunos ao backend" ON public.student_records;
CREATE POLICY "Restringir escrita de alunos ao backend"
  ON public.student_records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 2. TABELA: nps_records (Pesquisas e Convites NPS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.nps_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura pública de convites NPS" ON public.nps_records;
CREATE POLICY "Permitir leitura pública de convites NPS"
  ON public.nps_records
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Restringir escrita de convites NPS ao backend" ON public.nps_records;
CREATE POLICY "Restringir escrita de convites NPS ao backend"
  ON public.nps_records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. TABELA: schools (Unidades e Escolas)
-- ------------------------------------------------------------------------------
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura pública de escolas" ON public.schools;
CREATE POLICY "Permitir leitura pública de escolas"
  ON public.schools
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Restringir escrita de escolas ao backend" ON public.schools;
CREATE POLICY "Restringir escrita de escolas ao backend"
  ON public.schools
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. TABELA: users (Contas, Logins e Senhas - CONFIDENCIAL)
-- ------------------------------------------------------------------------------
-- Ativar RLS sem política de SELECT para anon impede qualquer vazamento de dados
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bloquear acesso anon à tabela users" ON public.users;
DROP POLICY IF EXISTS "Acesso restrito ao backend para users" ON public.users;
CREATE POLICY "Acesso restrito ao backend para users"
  ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 5. TABELA: audit_logs (Logs de Auditoria do Sistema)
-- ------------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso restrito ao backend para audit_logs" ON public.audit_logs;
CREATE POLICY "Acesso restrito ao backend para audit_logs"
  ON public.audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 6. TABELA: lgpd_requests (Registros LGPD)
-- ------------------------------------------------------------------------------
ALTER TABLE public.lgpd_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso restrito ao backend para lgpd_requests" ON public.lgpd_requests;
CREATE POLICY "Acesso restrito ao backend para lgpd_requests"
  ON public.lgpd_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- CONFIRMAÇÃO DE STATUS DAS TABELAS E RLS
-- ------------------------------------------------------------------------------
SELECT 
  tablename, 
  rowsecurity AS rls_ativado 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
