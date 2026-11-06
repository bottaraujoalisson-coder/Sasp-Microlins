-- =============================================================================
-- SCHEMA OFICIAL E DEFINITIVO DO SUPABASE — ÚNICO BANCO DE DADOS DO SISTEMA
-- Projeto: Gestão Pedagógica e Acadêmica Microlins (Supabase Sole Database + Supabase Auth)
-- =============================================================================

-- Este arquivo consolida a estrutura relacional normalizada, chaves estrangeiras,
-- restrições de integridade, índices, funções RPC atômicas e políticas de RLS.
-- Consulte também: /supabase/migrations/20261106000001_supabase_sole_database_and_auth.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. schools (Unidades Escolares)
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

-- 2. users (Usuários Administrados pelo Administrador — Vinculados ao Supabase Auth)
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

-- 3. student_records (Registros Acadêmicos de Alunos, Presenças, Faltas e Notas)
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
  turno TEXT,
  sala TEXT,
  modalidade TEXT DEFAULT 'Presencial',
  inicio TEXT,
  fim TEXT,
  nota NUMERIC,
  nota_id TEXT,
  nota_aula_numero INTEGER,
  info_aula TEXT,
  status TEXT DEFAULT 'NÃO INICIADO',
  presenca_ou_falta TEXT,
  inadimplente BOOLEAN NOT NULL DEFAULT false,
  parcelas_atrasadas INTEGER NOT NULL DEFAULT 0,
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

-- 4. student_educators (Vínculos Oficiais Contrato <-> Educador)
CREATE TABLE IF NOT EXISTS public.student_educators (
  school_id TEXT NOT NULL DEFAULT 'school-1875' REFERENCES public.schools(id) ON DELETE CASCADE,
  contrato TEXT NOT NULL,
  nome_aluno TEXT,
  educador_nome TEXT NOT NULL,
  escola_codigo TEXT NOT NULL DEFAULT '1875',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, contrato)
);

-- 5. nps_records (Convites e Pesquisas NPS Anuais)
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
  origem TEXT,
  channel TEXT,
  invitation_status TEXT,
  answered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  attempts_count INTEGER NOT NULL DEFAULT 1,
  total_student_invitations INTEGER NOT NULL DEFAULT 1,
  email_delivery_status TEXT,
  email_delivery_events JSONB DEFAULT '[]'::jsonb,
  email_last_event_at TIMESTAMPTZ,
  email_bounce_reason TEXT,
  survey_url TEXT DEFAULT '',
  nps_destinatario TEXT,
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
  nota_nps INTEGER,
  comentario_nps TEXT,
  ultimo_reenvio_email_em TIMESTAMPTZ,
  ultimo_reenvio_email_por TEXT,
  email_anterior TEXT,
  school_id TEXT NOT NULL DEFAULT 'school-1875' REFERENCES public.schools(id) ON DELETE CASCADE,
  escola_codigo TEXT NOT NULL DEFAULT '1875',
  unidade TEXT NOT NULL DEFAULT 'ESCOLA PRESIDENTE PRUDENTE',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. audit_logs (Trilha de Auditoria Institucional)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_login TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  ip_address TEXT DEFAULT '127.0.0.1',
  details TEXT
);

-- 7. sync_logs (Logs de Sincronização)
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id BIGSERIAL PRIMARY KEY,
  school_id TEXT NOT NULL DEFAULT 'school-1875' REFERENCES public.schools(id) ON DELETE CASCADE,
  escola_codigo TEXT NOT NULL DEFAULT '1875',
  sync_type TEXT NOT NULL,
  weekday_code TEXT,
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  records_received INTEGER NOT NULL DEFAULT 0,
  records_inserted INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  divergences_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. lgpd_requests (Solicitações de Direitos dos Titulares)
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

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_educators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_requests ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
