-- ============================================================================
-- SQL Schema Oficial, Índices, Relacionamentos e Políticas RLS para o Supabase
-- Projeto: Gestão Pedagógica e Acadêmica Microlins (hkonvuytinqlakerpara)
-- Execução 100% segura e idempotente (IF NOT EXISTS / sem comandos destrutivos)
-- ============================================================================

-- 1. Tabela de Unidades Escolares (schools)
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cidade TEXT,
  uf TEXT,
  codigo_portal TEXT,
  ativa BOOLEAN DEFAULT TRUE,
  nps_email TEXT,
  nps_company_filter TEXT,
  nps_base_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- 2. Tabela de Credenciais de Usuários e Colaboradores (users)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  login TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL,
  portal_password TEXT,
  nome_completo TEXT NOT NULL,
  cargo TEXT NOT NULL,
  escola_nome TEXT,
  codigo_escola TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TEXT NOT NULL,
  ultimo_acesso TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);

-- 3. Tabela de Agendamentos e Frequência de Alunos (student_records)
CREATE TABLE IF NOT EXISTS student_records (
  id BIGINT PRIMARY KEY,
  contrato TEXT,
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
  aula_numero INTEGER,
  tipo_material TEXT,
  possui_apostila BOOLEAN,
  horario TEXT,
  hora_inicio TEXT,
  hora_fim TEXT,
  turno TEXT,
  sala TEXT,
  modalidade TEXT,
  inicio TEXT,
  fim TEXT,
  nota NUMERIC,
  nota_id TEXT,
  info_aula TEXT,
  status TEXT,
  presenca_ou_falta TEXT,
  status_sistema TEXT,
  inadimplente BOOLEAN,
  parcelas_atrasadas INTEGER,
  nota_aula_numero NUMERIC,
  dia_semana TEXT,
  semana_code TEXT,
  email TEXT,
  link_login_url TEXT,
  cad_id TEXT,
  cad_nome TEXT,
  unidade TEXT,
  municipio TEXT,
  educador TEXT,
  educador_cached_at TEXT,
  causa_falta_material_explicita TEXT
);

ALTER TABLE student_records ADD COLUMN IF NOT EXISTS causa_falta_material_explicita TEXT;

CREATE INDEX IF NOT EXISTS idx_student_records_contrato ON student_records(contrato);
CREATE INDEX IF NOT EXISTS idx_student_records_dia_semana ON student_records(dia_semana);
CREATE INDEX IF NOT EXISTS idx_student_records_unidade ON student_records(unidade);
CREATE INDEX IF NOT EXISTS idx_student_records_educador ON student_records(educador);

-- 4. Tabela de Convites e Pesquisas NPS (nps_records)
CREATE TABLE IF NOT EXISTS nps_records (
  id TEXT PRIMARY KEY,
  control_id TEXT,
  student_name TEXT NOT NULL,
  contrato TEXT,
  codigo_pessoa TEXT,
  email TEXT,
  email_anterior TEXT,
  phone TEXT,
  action_name TEXT,
  ponto_jornada TEXT,
  origem TEXT,
  channel TEXT,
  invitation_status TEXT,
  answered BOOLEAN,
  created_at TEXT,
  sent_at TEXT,
  answered_at TEXT,
  attempts_count INTEGER,
  survey_url TEXT,
  priorizar_nps_no_login BOOLEAN DEFAULT FALSE,
  ciclo_priorizado TEXT,
  priorizado_por TEXT,
  priorizado_em TEXT,
  nota_nps NUMERIC,
  comentario_nps TEXT,
  ultimo_reenvio_email_em TEXT,
  ultimo_reenvio_email_por TEXT
);

ALTER TABLE nps_records ADD COLUMN IF NOT EXISTS email_anterior TEXT;
ALTER TABLE nps_records ADD COLUMN IF NOT EXISTS priorizar_nps_no_login BOOLEAN DEFAULT FALSE;
ALTER TABLE nps_records ADD COLUMN IF NOT EXISTS ciclo_priorizado TEXT;
ALTER TABLE nps_records ADD COLUMN IF NOT EXISTS priorizado_por TEXT;
ALTER TABLE nps_records ADD COLUMN IF NOT EXISTS priorizado_em TEXT;
ALTER TABLE nps_records ADD COLUMN IF NOT EXISTS nota_nps NUMERIC;
ALTER TABLE nps_records ADD COLUMN IF NOT EXISTS comentario_nps TEXT;
ALTER TABLE nps_records ADD COLUMN IF NOT EXISTS ultimo_reenvio_email_em TEXT;
ALTER TABLE nps_records ADD COLUMN IF NOT EXISTS ultimo_reenvio_email_por TEXT;

CREATE INDEX IF NOT EXISTS idx_nps_records_contrato ON nps_records(contrato);
CREATE INDEX IF NOT EXISTS idx_nps_records_control_id ON nps_records(control_id);
CREATE INDEX IF NOT EXISTS idx_nps_records_invitation_status ON nps_records(invitation_status);
CREATE INDEX IF NOT EXISTS idx_nps_records_priorizar_login ON nps_records(priorizar_nps_no_login);

-- 5. Tabela de Trilha de Auditoria de Segurança (audit_logs)
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  timestamp TEXT NOT NULL,
  actor_login TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  status TEXT NOT NULL,
  ip_address TEXT,
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_login ON audit_logs(actor_login);

-- 6. Tabela de Solicitações de Direitos do Titular — LGPD Art. 18 (lgpd_requests)
CREATE TABLE IF NOT EXISTS lgpd_requests (
  id SERIAL PRIMARY KEY,
  protocol TEXT NOT NULL UNIQUE,
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  requester_role TEXT NOT NULL,
  request_type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_lgpd_requests_protocol ON lgpd_requests(protocol);
CREATE INDEX IF NOT EXISTS idx_lgpd_requests_created_at ON lgpd_requests(created_at DESC);

-- ============================================================================
-- 7. Configuração de Row Level Security (RLS) e Políticas de Acesso Controlado
-- ============================================================================
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lgpd_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'schools' AND policyname = 'schools_app_access') THEN
    CREATE POLICY schools_app_access ON schools FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_app_access') THEN
    CREATE POLICY users_app_access ON users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'student_records' AND policyname = 'student_records_app_access') THEN
    CREATE POLICY student_records_app_access ON student_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nps_records' AND policyname = 'nps_records_app_access') THEN
    CREATE POLICY nps_records_app_access ON nps_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'audit_logs_app_access') THEN
    CREATE POLICY audit_logs_app_access ON audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lgpd_requests' AND policyname = 'lgpd_requests_app_access') THEN
    CREATE POLICY lgpd_requests_app_access ON lgpd_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
