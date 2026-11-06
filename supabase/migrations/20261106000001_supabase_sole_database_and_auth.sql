-- =============================================================================
-- MIGRAÇÃO OFICIAL VERSIONADA — SUPABASE COMO ÚNICO BANCO DE DADOS + SUPABASE AUTH + RLS
-- Arquivo: supabase/migrations/20261106000001_supabase_sole_database_and_auth.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. TABELAS NORMALIZADAS COM INTEGRIDADE REFERENCIAL, UNICIDADE E RESTRIÇÕES
-- =============================================================================

-- 1.1. schools (Unidades Escolares Microlins)
CREATE TABLE IF NOT EXISTS public.schools (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL CHECK (char_length(trim(nome)) > 0),
  cidade TEXT,
  uf TEXT CHECK (uf IS NULL OR char_length(trim(uf)) <= 4),
  codigo_portal TEXT NOT NULL DEFAULT '1875',
  ativa BOOLEAN NOT NULL DEFAULT true,
  nps_email TEXT,
  nps_password_enc TEXT,
  nps_company_filter TEXT,
  nps_base_url TEXT NOT NULL DEFAULT 'https://v3.app-indecx.com',
  nps_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.2. users (Perfis Administrados pelo Administrador — Vinculados ao Supabase Auth)
-- REGRA CRÍTICA: Cadastro público desabilitado. Somente o Administrador cria, autoriza, bloqueia ou exclui usuários.
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
  login TEXT NOT NULL UNIQUE CHECK (char_length(trim(login)) > 0),
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  portal_password_enc TEXT,
  nome_completo TEXT NOT NULL CHECK (char_length(trim(nome_completo)) > 0),
  cargo TEXT NOT NULL DEFAULT 'Colaborador Pedagógico',
  role TEXT NOT NULL DEFAULT 'ESCOLA' CHECK (role IN ('ADMIN', 'ESCOLA')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  ultimo_acesso TIMESTAMPTZ,
  created_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'admin';

-- 1.3. student_records (Agendamentos, Presenças, Faltas, Notas e Material)
CREATE TABLE IF NOT EXISTS public.student_records (
  id BIGINT PRIMARY KEY,
  contrato TEXT NOT NULL,
  aula_id TEXT,
  nome_completo TEXT NOT NULL,
  nome_curto TEXT,
  telefone_aluno TEXT,
  whatsapp_aluno_url TEXT,
  nome_responsavel TEXT,
  telefone_responsavel TEXT,
  whatsapp_responsavel_url TEXT,
  formacao TEXT,
  curso TEXT,
  aula_info TEXT,
  aula_numero INTEGER NOT NULL DEFAULT 0,
  tipo_material TEXT DEFAULT 'Apostila',
  possui_apostila BOOLEAN NOT NULL DEFAULT false,
  horario TEXT,
  hora_inicio TEXT,
  hora_fim TEXT,
  turno TEXT CHECK (turno IS NULL OR turno IN ('Manhã', 'Tarde', 'Noite')),
  sala TEXT,
  modalidade TEXT DEFAULT 'Presencial' CHECK (modalidade IN ('Presencial', 'Online')),
  inicio TEXT,
  fim TEXT,
  nota NUMERIC,
  nota_id TEXT,
  nota_aula_numero INTEGER,
  info_aula TEXT,
  status TEXT DEFAULT 'NÃO INICIADO' CHECK (status IN ('INICIADO', 'NÃO INICIADO', 'FINALIZADO')),
  presenca_ou_falta TEXT CHECK (presenca_ou_falta IS NULL OR presenca_ou_falta IN ('P', 'F', '')),
  inadimplente BOOLEAN NOT NULL DEFAULT false,
  parcelas_atrasadas INTEGER NOT NULL DEFAULT 0 CHECK (parcelas_atrasadas >= 0),
  dia_semana TEXT,
  email TEXT,
  link_login_url TEXT,
  educador TEXT,
  educador_cached_at TIMESTAMPTZ,
  causa_falta_material_explicita TEXT,
  school_id TEXT NOT NULL DEFAULT 'school-1875' REFERENCES public.schools(id) ON DELETE CASCADE,
  escola_codigo TEXT NOT NULL DEFAULT '1875',
  unidade TEXT NOT NULL DEFAULT 'ESCOLA PRESIDENTE PRUDENTE',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.4. student_educators (Vínculo Oficial Contrato <-> Educador por Escola)
CREATE TABLE IF NOT EXISTS public.student_educators (
  school_id TEXT NOT NULL DEFAULT 'school-1875' REFERENCES public.schools(id) ON DELETE CASCADE,
  contrato TEXT NOT NULL,
  nome_aluno TEXT,
  educador_nome TEXT NOT NULL,
  escola_codigo TEXT NOT NULL DEFAULT '1875',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, contrato)
);

-- 1.5. nps_records (Convites e Pesquisas NPS Anuais Sincronizadas com Indecx)
CREATE TABLE IF NOT EXISTS public.nps_records (
  id TEXT PRIMARY KEY,
  control_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  contrato TEXT,
  codigo_pessoa TEXT,
  email TEXT,
  phone TEXT,
  action_name TEXT,
  ponto_jornada TEXT,
  origem TEXT CHECK (origem IS NULL OR origem IN ('Portal do Aluno', 'E-mail')),
  channel TEXT CHECK (channel IS NULL OR channel IN ('widget', 'email')),
  invitation_status TEXT CHECK (invitation_status IS NULL OR invitation_status IN ('ativo', 'respondido', 'expirado')),
  answered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  attempts_count INTEGER NOT NULL DEFAULT 1 CHECK (attempts_count >= 0),
  total_student_invitations INTEGER NOT NULL DEFAULT 1,
  email_delivery_status TEXT,
  email_delivery_events JSONB DEFAULT '[]'::jsonb,
  email_last_event_at TIMESTAMPTZ,
  email_bounce_reason TEXT,
  survey_url TEXT DEFAULT '',
  nps_destinatario TEXT CHECK (nps_destinatario IS NULL OR nps_destinatario IN ('ALUNO', 'RESPONSAVEL')),
  nivel_cruzamento TEXT,
  respondente_nome TEXT,
  respondente_vinculo_label TEXT,
  is_vinculo_familiar_ambiguo BOOLEAN NOT NULL DEFAULT false,
  alunos_vinculados_familia JSONB DEFAULT '[]'::jsonb,
  contratos_vinculados_familia JSONB DEFAULT '[]'::jsonb,
  orientacao_abordagem_presencial TEXT,
  priorizar_nps_no_login BOOLEAN NOT NULL DEFAULT false,
  ciclo_priorizado TEXT,
  priorizado_por TEXT,
  priorizado_em TIMESTAMPTZ,
  nota_nps INTEGER CHECK (nota_nps IS NULL OR (nota_nps >= 0 AND nota_nps <= 10)),
  comentario_nps TEXT,
  ultimo_reenvio_email_em TIMESTAMPTZ,
  ultimo_reenvio_email_por TEXT,
  email_anterior TEXT,
  school_id TEXT NOT NULL DEFAULT 'school-1875' REFERENCES public.schools(id) ON DELETE CASCADE,
  escola_codigo TEXT NOT NULL DEFAULT '1875',
  unidade TEXT NOT NULL DEFAULT 'ESCOLA PRESIDENTE PRUDENTE',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.6. audit_logs (Trilha de Auditoria e Segurança Institucional)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_login TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'DENIED', 'ERROR')),
  ip_address TEXT DEFAULT '127.0.0.1',
  details TEXT
);

-- 1.7. sync_logs (Histórico de Sincronizações MoveEdu + Indecx)
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id BIGSERIAL PRIMARY KEY,
  school_id TEXT NOT NULL DEFAULT 'school-1875' REFERENCES public.schools(id) ON DELETE CASCADE,
  escola_codigo TEXT NOT NULL DEFAULT '1875',
  sync_type TEXT NOT NULL,
  weekday_code TEXT,
  status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'PARTIAL', 'ERROR')),
  records_received INTEGER NOT NULL DEFAULT 0,
  records_inserted INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  divergences_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.8. lgpd_requests (Solicitações de Direitos dos Titulares — Art. 18 LGPD)
CREATE TABLE IF NOT EXISTS public.lgpd_requests (
  id TEXT PRIMARY KEY,
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  requester_role TEXT NOT NULL,
  request_type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEBIDA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- =============================================================================
-- 2. ÍNDICES OTIMIZADOS PARA CONSULTAS FREQUENTES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_login ON public.users(login);
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_school_id ON public.users(school_id);
CREATE INDEX IF NOT EXISTS idx_student_records_school_dia ON public.student_records(school_id, dia_semana);
CREATE INDEX IF NOT EXISTS idx_student_records_contrato ON public.student_records(contrato);
CREATE INDEX IF NOT EXISTS idx_student_educators_school ON public.student_educators(school_id);
CREATE INDEX IF NOT EXISTS idx_nps_records_school_created ON public.nps_records(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nps_records_contrato ON public.nps_records(contrato);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_school_created ON public.sync_logs(school_id, created_at DESC);

-- =============================================================================
-- 3. FUNÇÕES AUXILIARES DE AUTORIZAÇÃO E POLÍTICAS DE SEGURANÇA (RLS)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'ADMIN'
      AND u.ativo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.school_id
  FROM public.users u
  LEFT JOIN public.schools s ON s.id = u.school_id
  WHERE u.auth_user_id = auth.uid()
    AND u.ativo = true
    AND (u.role = 'ADMIN' OR s.ativa = true)
  LIMIT 1;
$$;

-- Ativar RLS em todas as tabelas
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_educators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_requests ENABLE ROW LEVEL SECURITY;

-- Limpar políticas antigas e aplicar políticas baseadas em auth.uid() e isolamento multi-escola
DROP POLICY IF EXISTS "allow_anon_select_schools" ON public.schools;
DROP POLICY IF EXISTS "allow_anon_select_student_records" ON public.student_records;
DROP POLICY IF EXISTS "allow_anon_select_student_educators" ON public.student_educators;
DROP POLICY IF EXISTS "allow_anon_select_nps_records" ON public.nps_records;
DROP POLICY IF EXISTS "rls_schools_select" ON public.schools;
DROP POLICY IF EXISTS "rls_schools_admin_write" ON public.schools;
DROP POLICY IF EXISTS "rls_users_select" ON public.users;
DROP POLICY IF EXISTS "rls_users_admin_write" ON public.users;
DROP POLICY IF EXISTS "rls_student_records_select" ON public.student_records;
DROP POLICY IF EXISTS "rls_student_records_write" ON public.student_records;
DROP POLICY IF EXISTS "rls_student_educators_select" ON public.student_educators;
DROP POLICY IF EXISTS "rls_student_educators_write" ON public.student_educators;
DROP POLICY IF EXISTS "rls_nps_records_select" ON public.nps_records;
DROP POLICY IF EXISTS "rls_nps_records_write" ON public.nps_records;
DROP POLICY IF EXISTS "rls_audit_logs_admin_select" ON public.audit_logs;
DROP POLICY IF EXISTS "rls_audit_logs_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "rls_sync_logs_select" ON public.sync_logs;

-- Políticas para schools
CREATE POLICY "rls_schools_select"
  ON public.schools
  FOR SELECT
  TO anon, authenticated
  USING (ativa = true OR public.is_active_admin());

CREATE POLICY "rls_schools_admin_write"
  ON public.schools
  FOR ALL
  TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- Políticas para users (somente próprio usuário ativo ou Admin ativo visualiza; somente Admin escreve)
CREATE POLICY "rls_users_select"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid() OR public.is_active_admin());

CREATE POLICY "rls_users_admin_write"
  ON public.users
  FOR ALL
  TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- Políticas para student_records
CREATE POLICY "rls_student_records_select"
  ON public.student_records
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "rls_student_records_write"
  ON public.student_records
  FOR ALL
  TO authenticated
  USING (public.is_active_admin() OR school_id = public.get_my_school_id())
  WITH CHECK (public.is_active_admin() OR school_id = public.get_my_school_id());

-- Políticas para student_educators
CREATE POLICY "rls_student_educators_select"
  ON public.student_educators
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "rls_student_educators_write"
  ON public.student_educators
  FOR ALL
  TO authenticated
  USING (public.is_active_admin() OR school_id = public.get_my_school_id())
  WITH CHECK (public.is_active_admin() OR school_id = public.get_my_school_id());

-- Políticas para nps_records
CREATE POLICY "rls_nps_records_select"
  ON public.nps_records
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "rls_nps_records_write"
  ON public.nps_records
  FOR ALL
  TO authenticated
  USING (public.is_active_admin() OR school_id = public.get_my_school_id())
  WITH CHECK (public.is_active_admin() OR school_id = public.get_my_school_id());

-- Políticas para audit_logs e sync_logs
CREATE POLICY "rls_audit_logs_admin_select"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_active_admin());

CREATE POLICY "rls_audit_logs_insert"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "rls_sync_logs_select"
  ON public.sync_logs
  FOR SELECT
  TO authenticated
  USING (public.is_active_admin() OR school_id = public.get_my_school_id());

-- Revogar acesso às colunas de segredo do papel público anon
REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.sync_logs FROM anon;
REVOKE ALL ON public.lgpd_requests FROM anon;
REVOKE SELECT (nps_password_enc) ON public.schools FROM anon;

-- =============================================================================
-- 4. FUNÇÕES RPC ATÔMICAS DE SUBSTITUIÇÃO POR ESCOLA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.replace_school_student_records(
  p_school_id TEXT,
  p_records JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' OR jsonb_array_length(p_records) = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM public.student_records WHERE school_id = p_school_id;

  INSERT INTO public.student_records (
    id, contrato, aula_id, nome_completo, nome_curto, telefone_aluno,
    whatsapp_aluno_url, nome_responsavel, telefone_responsavel, whatsapp_responsavel_url,
    formacao, curso, aula_info, aula_numero, tipo_material, possui_apostila,
    horario, hora_inicio, hora_fim, turno, sala, modalidade, inicio, fim,
    nota, nota_id, nota_aula_numero, info_aula, status, presenca_ou_falta,
    inadimplente, parcelas_atrasadas, dia_semana, email, link_login_url,
    educador, educador_cached_at, causa_falta_material_explicita,
    school_id, escola_codigo, unidade, updated_at
  )
  SELECT
    (r->>'id')::BIGINT,
    COALESCE(r->>'contrato', ''),
    r->>'aula_id',
    COALESCE(r->>'nome_completo', ''),
    r->>'nome_curto',
    r->>'telefone_aluno',
    r->>'whatsapp_aluno_url',
    r->>'nome_responsavel',
    r->>'telefone_responsavel',
    r->>'whatsapp_responsavel_url',
    r->>'formacao',
    r->>'curso',
    r->>'aula_info',
    COALESCE((r->>'aula_numero')::INTEGER, 0),
    r->>'tipo_material',
    COALESCE((r->>'possui_apostila')::BOOLEAN, false),
    r->>'horario',
    r->>'hora_inicio',
    r->>'hora_fim',
    r->>'turno',
    r->>'sala',
    COALESCE(r->>'modalidade', 'Presencial'),
    r->>'inicio',
    r->>'fim',
    (r->>'nota')::NUMERIC,
    r->>'nota_id',
    (r->>'nota_aula_numero')::INTEGER,
    r->>'info_aula',
    COALESCE(r->>'status', 'NÃO INICIADO'),
    r->>'presenca_ou_falta',
    COALESCE((r->>'inadimplente')::BOOLEAN, false),
    COALESCE((r->>'parcelas_atrasadas')::INTEGER, 0),
    r->>'dia_semana',
    r->>'email',
    r->>'link_login_url',
    r->>'educador',
    (r->>'educador_cached_at')::TIMESTAMPTZ,
    r->>'causa_falta_material_explicita',
    p_school_id,
    COALESCE(r->>'escola_codigo', '1875'),
    COALESCE(r->>'unidade', 'ESCOLA PRESIDENTE PRUDENTE'),
    now()
  FROM jsonb_array_elements(p_records) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_school_nps_records(
  p_school_id TEXT,
  p_records JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' OR jsonb_array_length(p_records) = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM public.nps_records WHERE school_id = p_school_id;

  INSERT INTO public.nps_records (
    id, control_id, student_name, contrato, codigo_pessoa, email, phone,
    action_name, ponto_jornada, origem, channel, invitation_status, answered,
    created_at, sent_at, answered_at, attempts_count, total_student_invitations,
    email_delivery_status, email_delivery_events, email_last_event_at,
    email_bounce_reason, survey_url, nps_destinatario, nivel_cruzamento,
    respondente_nome, respondente_vinculo_label, is_vinculo_familiar_ambiguo,
    alunos_vinculados_familia, contratos_vinculados_familia,
    orientacao_abordagem_presencial, priorizar_nps_no_login, ciclo_priorizado,
    priorizado_por, priorizado_em, nota_nps, comentario_nps,
    ultimo_reenvio_email_em, ultimo_reenvio_email_por, email_anterior,
    school_id, escola_codigo, unidade, updated_at
  )
  SELECT
    r->>'id',
    COALESCE(r->>'control_id', r->>'id'),
    COALESCE(r->>'student_name', ''),
    r->>'contrato',
    r->>'codigo_pessoa',
    r->>'email',
    r->>'phone',
    r->>'action_name',
    r->>'ponto_jornada',
    r->>'origem',
    r->>'channel',
    r->>'invitation_status',
    COALESCE((r->>'answered')::BOOLEAN, false),
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'sent_at')::TIMESTAMPTZ,
    (r->>'answered_at')::TIMESTAMPTZ,
    COALESCE((r->>'attempts_count')::INTEGER, 1),
    COALESCE((r->>'total_student_invitations')::INTEGER, 1),
    r->>'email_delivery_status',
    COALESCE(r->'email_delivery_events', '[]'::jsonb),
    (r->>'email_last_event_at')::TIMESTAMPTZ,
    r->>'email_bounce_reason',
    COALESCE(r->>'survey_url', ''),
    r->>'nps_destinatario',
    r->>'nivel_cruzamento',
    r->>'respondente_nome',
    r->>'respondente_vinculo_label',
    COALESCE((r->>'is_vinculo_familiar_ambiguo')::BOOLEAN, false),
    COALESCE(r->'alunos_vinculados_familia', '[]'::jsonb),
    COALESCE(r->'contratos_vinculados_familia', '[]'::jsonb),
    r->>'orientacao_abordagem_presencial',
    COALESCE((r->>'priorizar_nps_no_login')::BOOLEAN, false),
    r->>'ciclo_priorizado',
    r->>'priorizado_por',
    (r->>'priorizado_em')::TIMESTAMPTZ,
    (r->>'nota_nps')::INTEGER,
    r->>'comentario_nps',
    (r->>'ultimo_reenvio_email_em')::TIMESTAMPTZ,
    r->>'ultimo_reenvio_email_por',
    r->>'email_anterior',
    p_school_id,
    COALESCE(r->>'escola_codigo', '1875'),
    COALESCE(r->>'unidade', 'ESCOLA PRESIDENTE PRUDENTE'),
    now()
  FROM jsonb_array_elements(p_records) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
