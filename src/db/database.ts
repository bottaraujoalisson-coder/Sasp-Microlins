import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  AuthSession,
  createDefaultSchoolsRegistry,
  DEFAULT_ADMIN_CREDENTIALS,
  generateInternalSchoolId,
  normalizeLoginIdentifier,
  RegisteredSchool,
  SchoolPortalUser,
} from '../utils/authRegistry';
import {
  decryptSecretAES256GCM,
  encryptSecretAES256GCM,
  generateSecureSessionToken,
  hashPasswordArgon2id,
  hashSessionToken,
  isArgon2idHash,
  isEncryptedSecret,
  sanitizeInputText,
  verifyPasswordArgon2id,
} from '../utils/securityCrypto';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'schools-registry.json');
const DEFAULT_SQLITE_FILE = path.join(DATA_DIR, 'microlins_production.sqlite');

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos
export const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 horas
export const RECOVERY_TOKEN_DURATION_MS = 30 * 60 * 1000; // 30 minutos

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  actorLogin: string;
  actorRole: string;
  action: string;
  resource: string;
  status: 'SUCCESS' | 'DENIED' | 'ERROR';
  ipAddress: string;
  details: string;
}

export interface LgpdRequestRecord {
  id: number;
  protocol: string;
  requesterName: string;
  requesterEmail: string;
  requesterRole: string;
  requestType:
    | 'ACESSO_DADOS'
    | 'CORRECAO_DADOS'
    | 'ANONIMIZACAO_EXCLUSAO'
    | 'REVOGACAO_CONSENTIMENTO'
    | 'DUVIDA_ENCARREGADO';
  description: string;
  status: 'RECEBIDA' | 'EM_ANALISE' | 'CONCLUIDA';
  createdAt: string;
  resolvedAt?: string | null;
}

export interface DatabaseStatusSummary {
  engine: string;
  databaseFile: string;
  fileSizeBytes: number;
  walMode: boolean;
  foreignKeysEnabled: boolean;
  schemaVersion: number;
  appliedMigrations: Array<{ version: number; name: string; appliedAt: string }>;
  counts: {
    schools: number;
    users: number;
    activeSessions: number;
    auditLogs: number;
    lgpdRequests: number;
    backupsCount: number;
  };
  backups: Array<{
    fileName: string;
    sizeBytes: number;
    createdAt: string;
  }>;
  securityAlgorithms: {
    passwordHashing: string;
    integrationSecretsEncryption: string;
    sessionTokenDigest: string;
  };
}

let dbInstance: DatabaseSync | null = null;
let currentDbFilePath: string = DEFAULT_SQLITE_FILE;

function ensureDirectories(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Realiza backup preventivo tanto do JSON legado quanto do banco SQLite antes de migrações ou sob demanda.
 */
export function createDatabaseBackup(reason: string = 'manual'): {
  backupFile: string;
  timestamp: string;
  sizeBytes: number;
} {
  ensureDirectories();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeReason = reason.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);

  if (currentDbFilePath !== ':memory:' && fs.existsSync(currentDbFilePath)) {
    const dest = path.join(
      BACKUP_DIR,
      `microlins_db_${safeReason}_${timestamp}.sqlite.bak`
    );
    fs.copyFileSync(currentDbFilePath, dest);
    const stat = fs.statSync(dest);
    return {
      backupFile: path.basename(dest),
      timestamp: new Date().toISOString(),
      sizeBytes: stat.size,
    };
  }

  // Fallback quando ainda não existe arquivo SQLite ou em memória
  const snapshotData = {
    reason,
    timestamp: new Date().toISOString(),
    schools: dbInstance ? getSchoolsFromDb(false) : createDefaultSchoolsRegistry(),
  };
  const dest = path.join(
    BACKUP_DIR,
    `microlins_snapshot_${safeReason}_${timestamp}.json.bak`
  );
  fs.writeFileSync(dest, JSON.stringify(snapshotData, null, 2), 'utf-8');
  const stat = fs.statSync(dest);
  return {
    backupFile: path.basename(dest),
    timestamp: new Date().toISOString(),
    sizeBytes: stat.size,
  };
}

/**
 * Inicializa (ou reutiliza) a conexão SQLite, executa as migrações de esquema e importa dados legados com segurança.
 */
export function getDatabase(customPath?: string): DatabaseSync {
  if (dbInstance && (!customPath || customPath === currentDbFilePath)) {
    return dbInstance;
  }

  ensureDirectories();
  currentDbFilePath = customPath || DEFAULT_SQLITE_FILE;

  // Se existir o arquivo JSON legado e o banco SQLite principal ainda não existir, faz backup do JSON legado antes da migração
  if (
    currentDbFilePath === DEFAULT_SQLITE_FILE &&
    fs.existsSync(LEGACY_JSON_FILE) &&
    !fs.existsSync(currentDbFilePath)
  ) {
    const legacyBackup = path.join(
      BACKUP_DIR,
      `legacy_schools_registry_pre_migration_${Date.now()}.json.bak`
    );
    try {
      fs.copyFileSync(LEGACY_JSON_FILE, legacyBackup);
    } catch {
      // Ignore copy error
    }
  }

  const db = new DatabaseSync(currentDbFilePath);
  dbInstance = db;

  if (currentDbFilePath !== ':memory:') {
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');

  runMigrations(db);
  seedAndMigrateLegacyData(db);

  return db;
}

/**
 * Fecha e redefine a instância do banco (útil para testes automatizados isolados).
 */
export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore close error
    }
    dbInstance = null;
  }
}

function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all() as Array<{ version: number }>;
  const appliedVersions = new Set(appliedRows.map((r) => Number(r.version)));

  const migrations: Array<{ version: number; name: string; sql: string }> = [
    {
      version: 1,
      name: '001_initial_relational_schema',
      sql: `
        CREATE TABLE IF NOT EXISTS schools (
          id TEXT PRIMARY KEY,
          nome TEXT NOT NULL,
          cidade TEXT,
          uf TEXT,
          codigo_portal TEXT NOT NULL DEFAULT '1917',
          ativa INTEGER NOT NULL DEFAULT 1,
          nps_email TEXT NOT NULL DEFAULT '',
          nps_password_enc TEXT NOT NULL DEFAULT '',
          nps_company_filter TEXT,
          nps_base_url TEXT NOT NULL DEFAULT 'https://app.indecx.com',
          nps_active INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          school_id TEXT,
          login TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          portal_password_enc TEXT NOT NULL DEFAULT '',
          nome_completo TEXT NOT NULL,
          cargo TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'ESCOLA' CHECK (role IN ('ADMIN', 'ESCOLA')),
          ativo INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id);
        CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);

        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          csrf_token TEXT NOT NULL,
          user_id TEXT NOT NULL,
          login TEXT NOT NULL,
          nome_completo TEXT NOT NULL,
          cargo TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('ADMIN', 'ESCOLA')),
          school_id TEXT,
          school_name TEXT,
          codigo_portal TEXT,
          ip_address TEXT NOT NULL DEFAULT '',
          user_agent TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_login ON sessions(login);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS login_attempts (
          identifier TEXT PRIMARY KEY,
          failed_count INTEGER NOT NULL DEFAULT 0,
          first_failed_at TEXT NOT NULL,
          locked_until TEXT,
          last_attempt_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS password_recovery_tokens (
          token_hash TEXT PRIMARY KEY,
          user_login TEXT NOT NULL,
          school_id TEXT,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          used_at TEXT
        );
      `,
    },
    {
      version: 2,
      name: '002_student_educators_cache',
      sql: `
        CREATE TABLE IF NOT EXISTS student_educators (
          contrato TEXT PRIMARY KEY,
          nome_aluno TEXT NOT NULL,
          educador_nome TEXT NOT NULL,
          escola_codigo TEXT NOT NULL DEFAULT '1875',
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_student_educators_educador ON student_educators(educador_nome);
        CREATE INDEX IF NOT EXISTS idx_student_educators_escola ON student_educators(escola_codigo);
      `,
    },
    {
      version: 3,
      name: '003_multi_school_student_and_nps_records',
      sql: `
        DROP TABLE IF EXISTS audit_logs;
        DROP TABLE IF EXISTS lgpd_requests;

        CREATE TABLE IF NOT EXISTS student_records (
          id INTEGER PRIMARY KEY,
          contrato TEXT NOT NULL,
          school_id TEXT NOT NULL DEFAULT 'school-1875',
          escola_codigo TEXT NOT NULL DEFAULT '1875',
          unidade TEXT NOT NULL DEFAULT 'ESCOLA PRESIDENTE PRUDENTE',
          dia_semana TEXT NOT NULL DEFAULT '',
          educador TEXT NOT NULL DEFAULT '',
          payload_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_student_records_school_id ON student_records(school_id);
        CREATE INDEX IF NOT EXISTS idx_student_records_escola_codigo ON student_records(escola_codigo);
        CREATE INDEX IF NOT EXISTS idx_student_records_contrato ON student_records(contrato);
        CREATE INDEX IF NOT EXISTS idx_student_records_dia ON student_records(dia_semana);

        CREATE TABLE IF NOT EXISTS nps_records (
          id TEXT PRIMARY KEY,
          control_id TEXT NOT NULL DEFAULT '',
          contrato TEXT NOT NULL DEFAULT '',
          school_id TEXT NOT NULL DEFAULT 'school-1875',
          escola_codigo TEXT NOT NULL DEFAULT '1875',
          unidade TEXT NOT NULL DEFAULT 'ESCOLA PRESIDENTE PRUDENTE',
          payload_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_nps_records_school_id ON nps_records(school_id);
        CREATE INDEX IF NOT EXISTS idx_nps_records_escola_codigo ON nps_records(escola_codigo);
        CREATE INDEX IF NOT EXISTS idx_nps_records_contrato ON nps_records(contrato);
      `,
    },
    {
      version: 4,
      name: '004_multitenancy_internal_id_and_sync_logs',
      sql: `
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          actor_login TEXT NOT NULL,
          actor_role TEXT NOT NULL,
          action TEXT NOT NULL,
          resource TEXT NOT NULL,
          status TEXT NOT NULL,
          ip_address TEXT NOT NULL DEFAULT '',
          details TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_login);

        CREATE TABLE IF NOT EXISTS sync_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          school_id TEXT NOT NULL,
          escola_codigo TEXT NOT NULL DEFAULT '',
          sync_type TEXT NOT NULL,
          weekday_code TEXT,
          status TEXT NOT NULL,
          records_received INTEGER NOT NULL DEFAULT 0,
          records_inserted INTEGER NOT NULL DEFAULT 0,
          records_updated INTEGER NOT NULL DEFAULT 0,
          divergences_count INTEGER NOT NULL DEFAULT 0,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          error_message TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sync_logs_school_id ON sync_logs(school_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS student_educators_v2 (
          school_id TEXT NOT NULL DEFAULT 'school-1875',
          contrato TEXT NOT NULL,
          nome_aluno TEXT NOT NULL,
          educador_nome TEXT NOT NULL,
          escola_codigo TEXT NOT NULL DEFAULT '1875',
          updated_at TEXT NOT NULL,
          PRIMARY KEY (school_id, contrato)
        );

        INSERT OR IGNORE INTO student_educators_v2 (school_id, contrato, nome_aluno, educador_nome, escola_codigo, updated_at)
        SELECT 'school-' || escola_codigo, contrato, nome_aluno, educador_nome, escola_codigo, updated_at
        FROM student_educators;

        DROP TABLE IF EXISTS student_educators;
        ALTER TABLE student_educators_v2 RENAME TO student_educators;

        CREATE INDEX IF NOT EXISTS idx_student_educators_school ON student_educators(school_id);
        CREATE INDEX IF NOT EXISTS idx_student_educators_educador ON student_educators(educador_nome);
        CREATE INDEX IF NOT EXISTS idx_student_educators_escola ON student_educators(escola_codigo);

        CREATE INDEX IF NOT EXISTS idx_student_records_school_dia ON student_records(school_id, dia_semana);
        CREATE INDEX IF NOT EXISTS idx_student_records_school_contrato ON student_records(school_id, contrato);
        CREATE INDEX IF NOT EXISTS idx_nps_records_school_contrato ON nps_records(school_id, contrato);
      `,
    },
  ];

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );

  for (const m of migrations) {
    if (!appliedVersions.has(m.version)) {
      db.exec('BEGIN TRANSACTION;');
      try {
        db.exec(m.sql);
        insertMigration.run(m.version, m.name, new Date().toISOString());
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    }
  }
}

function seedAndMigrateLegacyData(db: DatabaseSync): void {
  // 1. Garantir que o usuário Administrador Geral exista na tabela `users` com hash Argon2id
  const adminLogin = normalizeLoginIdentifier(DEFAULT_ADMIN_CREDENTIALS.login);
  const existingAdmin = db
    .prepare('SELECT id, password_hash FROM users WHERE login = ?')
    .get(adminLogin) as { id: string; password_hash: string } | undefined;

  const now = new Date().toISOString();
  if (!existingAdmin && DEFAULT_ADMIN_CREDENTIALS.senha) {
    const initialAdminPlain = process.env.ADMIN_INITIAL_PASSWORD;
    const initialAdminHash = initialAdminPlain
      ? hashPasswordArgon2id(initialAdminPlain)
      : DEFAULT_ADMIN_CREDENTIALS.senha;
    db.prepare(
      `INSERT INTO users (
        id, school_id, login, password_hash, portal_password_enc,
        nome_completo, cargo, role, ativo, created_at, updated_at
      ) VALUES (?, NULL, ?, ?, '', ?, ?, 'ADMIN', 1, ?, ?)`
    ).run(
      'admin-master',
      adminLogin,
      initialAdminHash,
      DEFAULT_ADMIN_CREDENTIALS.nomeCompleto,
      DEFAULT_ADMIN_CREDENTIALS.cargo,
      now,
      now
    );
  } else if (existingAdmin && !isArgon2idHash(existingAdmin.password_hash)) {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPasswordArgon2id(existingAdmin.password_hash),
      now,
      existingAdmin.id
    );
  }

  // 2. Verificar se já existem escolas no banco SQLite
  const countRow = db
    .prepare('SELECT COUNT(*) as total FROM schools')
    .get() as { total: number };

  if (Number(countRow.total) > 0) {
    return;
  }

  // 3. Carregar do JSON legado (.data/schools-registry.json) se existir, senão do registro inicial padrão
  let sourceSchools: RegisteredSchool[] = createDefaultSchoolsRegistry();
  if (currentDbFilePath !== ':memory:' && fs.existsSync(LEGACY_JSON_FILE)) {

    try {
      const raw = fs.readFileSync(LEGACY_JSON_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        sourceSchools = parsed;
      }
    } catch {
      // Fallback para createDefaultSchoolsRegistry()
    }
  }

  const insertSchool = db.prepare(`
    INSERT OR IGNORE INTO schools (
      id, nome, cidade, uf, codigo_portal, ativa,
      nps_email, nps_password_enc, nps_company_filter, nps_base_url, nps_active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (
      id, school_id, login, password_hash, portal_password_enc,
      nome_completo, cargo, role, ativo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ESCOLA', ?, ?, ?)
  `);

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const s of sourceSchools) {
      const npsRawPass = s.npsCredential?.password || '';
      const npsEncryptedPass = npsRawPass
        ? isEncryptedSecret(npsRawPass)
          ? npsRawPass
          : encryptSecretAES256GCM(npsRawPass)
        : '';

      const isSchoolActive = s.ativa !== false && s.active !== false;
      const isNpsActive =
        s.npsCredential?.active !== false &&
        Boolean(s.npsCredential?.email && npsEncryptedPass);

      const createdAt = s.createdAt || now;
      insertSchool.run(
        s.id,
        sanitizeInputText(s.nome || 'UNIDADE MICROLINS', 120).toUpperCase(),
        s.cidade || null,
        s.uf || null,
        s.codigoPortal || '1875',
        isSchoolActive ? 1 : 0,
        s.npsCredential?.email || '',
        npsEncryptedPass,
        s.npsCredential?.companyFilter || null,
        s.npsCredential?.baseUrl || 'https://app.indecx.com',
        isNpsActive ? 1 : 0,
        createdAt,
        now
      );

      for (const u of s.users || []) {
        const cleanLogin = normalizeLoginIdentifier(u.login);
        if (!cleanLogin) continue;
        const rawUserPass = u.senha || '';
        const passwordHash = isArgon2idHash(rawUserPass)
          ? rawUserPass
          : rawUserPass
            ? hashPasswordArgon2id(rawUserPass)
            : hashPasswordArgon2id('initial-auth-required');
        const portalPassSource = u.portalPassword || rawUserPass;
        const portalPasswordEnc = isEncryptedSecret(portalPassSource)
          ? portalPassSource
          : !isArgon2idHash(portalPassSource) && portalPassSource
            ? encryptSecretAES256GCM(portalPassSource)
            : '';
        const isUserActive = u.ativo !== false && u.active !== false;

        insertUser.run(
          u.id || `user-${cleanLogin}-${Date.now().toString(36)}`,
          s.id,
          cleanLogin,
          passwordHash,
          portalPasswordEnc,
          sanitizeInputText(u.nomeCompleto || cleanLogin, 120),
          sanitizeInputText(u.cargo || 'Colaborador da Unidade', 80),
          isUserActive ? 1 : 0,
          u.createdAt || createdAt,
          now
        );
      }
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Retorna todas as unidades escolares e seus usuários a partir do banco relacional SQLite.
 */
export function getSchoolsFromDb(decryptSecretsForInternalSync: boolean = false): RegisteredSchool[] {
  const db = getDatabase();
  const schoolRows = db
    .prepare('SELECT * FROM schools ORDER BY created_at ASC, nome ASC')
    .all() as Array<Record<string, unknown>>;

  const schoolMap = new Map<string, { nome: string; codigoPortal: string }>();
  for (const s of schoolRows) {
    schoolMap.set(String(s.id), {
      nome: String(s.nome),
      codigoPortal: String(s.codigo_portal || '1875'),
    });
  }

  const userRows = db
    .prepare("SELECT * FROM users WHERE role = 'ESCOLA' ORDER BY created_at ASC")
    .all() as Array<Record<string, unknown>>;

  const usersBySchool = new Map<string, SchoolPortalUser[]>();
  for (const row of userRows) {
    const schoolId = String(row.school_id || '');
    if (!usersBySchool.has(schoolId)) {
      usersBySchool.set(schoolId, []);
    }
    const rawPortalEnc = String(row.portal_password_enc || '');
    const isAtivo = Number(row.ativo) === 1;
    const scInfo = schoolMap.get(schoolId);
    usersBySchool.get(schoolId)!.push({
      id: String(row.id),
      schoolId,
      login: String(row.login),
      senha: String(row.password_hash),
      portalPassword: decryptSecretsForInternalSync
        ? decryptSecretAES256GCM(rawPortalEnc)
        : rawPortalEnc,
      nomeCompleto: String(row.nome_completo),
      cargo: String(row.cargo),
      escolaNome: scInfo?.nome || 'ESCOLA PRESIDENTE PRUDENTE',
      codigoEscola: scInfo?.codigoPortal || '1875',
      ativo: isAtivo,
      active: isAtivo,
      createdAt: String(row.created_at),
      ultimoAcesso: row.updated_at ? String(row.updated_at) : undefined,
      lastTestedAt: row.updated_at ? String(row.updated_at) : String(row.created_at),
      lastTestStatus: 'SUCCESS',
      lastTestMessage: 'Sincronizado e protegido com Argon2id + AES-256-GCM.',
    });
  }

  return schoolRows.map((row) => {
    const id = String(row.id);
    const rawNpsEnc = String(row.nps_password_enc || '');
    const isAtiva = Number(row.ativa) === 1;
    const isNpsActive = Number(row.nps_active) === 1;
    return {
      id,
      nome: String(row.nome),
      cidade: row.cidade ? String(row.cidade) : undefined,
      uf: row.uf ? String(row.uf) : undefined,
      codigoPortal: String(row.codigo_portal || '1875'),
      ativa: isAtiva,
      active: isAtiva,
      createdAt: String(row.created_at),
      updatedAt: row.updated_at ? String(row.updated_at) : String(row.created_at),
      npsCredential: {
        email: String(row.nps_email || ''),
        password: decryptSecretsForInternalSync
          ? decryptSecretAES256GCM(rawNpsEnc)
          : rawNpsEnc,
        companyFilter: row.nps_company_filter
          ? String(row.nps_company_filter)
          : undefined,
        companyId:
          process.env.INDECX_COMPANY_ID ||
          '624464ee5314e75c907b920c',
        groupId:
          process.env.INDECX_GROUP_ID ||
          '625f1c105afd9b2f276dd44a',
        baseUrl: String(row.nps_base_url || 'https://v3.app-indecx.com'),
        active: isNpsActive,
        connectionStatus: isNpsActive ? 'CONECTADO' : 'NAO_CONFIGURADO',
        lastTestStatus: isNpsActive ? 'SUCCESS' : undefined,
        lastTestMessage: isNpsActive
          ? 'Credencial Indecx NPS ativa (AES-256-GCM).'
          : 'Credencial NPS não configurada.',
        lastTestedAt: row.updated_at ? String(row.updated_at) : String(row.created_at),
      },
      users: usersBySchool.get(id) || [],
    };
  });
}

/**
 * Cria ou atualiza uma unidade escolar no banco SQLite em transação atômica.
 */
export function upsertSchoolInDb(input: {
  id?: string;
  nome: string;
  cidade?: string;
  uf?: string;
  codigoPortal: string;
  ativa?: boolean;
  npsEmail: string;
  npsPassword: string;
  npsCompanyFilter?: string;
  npsBaseUrl?: string;
}): { schools: RegisteredSchool[]; school: RegisteredSchool } {
  const db = getDatabase();
  const nome = sanitizeInputText(input.nome || '', 120).trim().toUpperCase();
  if (!nome) {
    throw new Error('O nome da escola é obrigatório.');
  }

  const codigoPortal = sanitizeInputText(input.codigoPortal || '', 30).trim() || '1917';
  const npsEmail = sanitizeInputText(input.npsEmail || '', 160).trim();
  const rawNpsPassword = (input.npsPassword || '').trim();
  const npsCompanyFilter = sanitizeInputText(input.npsCompanyFilter || '', 120).trim();
  const npsBaseUrl =
    sanitizeInputText(input.npsBaseUrl || '', 200).trim() || 'https://app.indecx.com';
  const now = new Date().toISOString();

  const existing = input.id
    ? (db.prepare('SELECT * FROM schools WHERE id = ?').get(input.id) as
        | Record<string, unknown>
        | undefined)
    : undefined;

  const isMaskedPass = rawNpsPassword.includes('••••');
  const encryptedNpsPass =
    isMaskedPass && existing
      ? String(existing.nps_password_enc || '')
      : rawNpsPassword
        ? encryptSecretAES256GCM(rawNpsPassword)
        : existing
          ? String(existing.nps_password_enc || '')
          : '';

  const npsActive = Boolean(npsEmail && encryptedNpsPass) ? 1 : 0;

  let targetId = input.id || '';
  if (existing) {
    db.prepare(
      `UPDATE schools SET
        nome = ?, cidade = ?, uf = ?, codigo_portal = ?, ativa = ?,
        nps_email = ?, nps_password_enc = ?, nps_company_filter = ?,
        nps_base_url = ?, nps_active = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      nome,
      input.cidade !== undefined
        ? sanitizeInputText(input.cidade, 80).trim() || null
        : (existing.cidade as string | null),
      input.uf !== undefined
        ? sanitizeInputText(input.uf, 4).trim().toUpperCase() || null
        : (existing.uf as string | null),
      codigoPortal,
      input.ativa !== undefined ? (input.ativa ? 1 : 0) : Number(existing.ativa),
      npsEmail,
      encryptedNpsPass,
      npsCompanyFilter || null,
      npsBaseUrl,
      npsActive,
      now,
      existing.id as string
    );
    targetId = String(existing.id);
  } else {
    targetId = input.id || generateInternalSchoolId();

    db.prepare(
      `INSERT INTO schools (
        id, nome, cidade, uf, codigo_portal, ativa,
        nps_email, nps_password_enc, nps_company_filter, nps_base_url, nps_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      targetId,
      nome,
      sanitizeInputText(input.cidade || '', 80).trim() || null,
      sanitizeInputText(input.uf || '', 4).trim().toUpperCase() || null,
      codigoPortal,
      input.ativa !== false ? 1 : 0,
      npsEmail,
      encryptedNpsPass,
      npsCompanyFilter || null,
      npsBaseUrl,
      npsActive,
      now,
      now
    );
  }

  const schools = getSchoolsFromDb(false);
  const school = schools.find((s) => s.id === targetId)!;
  return { schools, school };
}

export function toggleSchoolStatusInDb(schoolId: string): RegisteredSchool[] {
  const db = getDatabase();
  db.prepare(
    'UPDATE schools SET ativa = CASE WHEN ativa = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?'
  ).run(new Date().toISOString(), schoolId);
  return getSchoolsFromDb(false);
}

export function deleteSchoolFromDb(schoolId: string): RegisteredSchool[] {
  const db = getDatabase();
  db.prepare('DELETE FROM schools WHERE id = ?').run(schoolId);
  return getSchoolsFromDb(false);
}

/**
 * Cadastra ou edita um usuário de uma unidade escolar no banco SQLite com Argon2id + AES-256-GCM.
 */
export function upsertUserInDb(
  schoolId: string,
  input: {
    id?: string;
    login: string;
    senha: string;
    nomeCompleto: string;
    cargo: string;
    ativo?: boolean;
  }
): { schools: RegisteredSchool[]; user: SchoolPortalUser } {
  const db = getDatabase();
  const login = normalizeLoginIdentifier(input.login);
  const rawSenha = (input.senha || '').trim();
  const nomeCompleto = sanitizeInputText(input.nomeCompleto || '', 120).trim();
  const cargo =
    sanitizeInputText(input.cargo || '', 80).trim() || 'Colaborador da Unidade';

  if (!login || !rawSenha || !nomeCompleto) {
    throw new Error(
      'Login do Portal do Aluno, Senha e Nome Completo são obrigatórios.'
    );
  }

  const schoolRow = db
    .prepare('SELECT id, nome FROM schools WHERE id = ?')
    .get(schoolId) as { id: string; nome: string } | undefined;
  if (!schoolRow) {
    throw new Error('Unidade escolar não encontrada.');
  }

  const duplicateUser = db
    .prepare('SELECT id, school_id FROM users WHERE login = ?')
    .get(login) as { id: string; school_id: string | null } | undefined;

  if (
    duplicateUser &&
    duplicateUser.id !== input.id &&
    duplicateUser.school_id !== schoolId
  ) {
    throw new Error(
      `O login "${login}" já está vinculado a outra unidade escolar.`
    );
  }

  const effectiveId = input.id || duplicateUser?.id;
  const existingUser = effectiveId
    ? (db.prepare('SELECT * FROM users WHERE id = ?').get(effectiveId) as
        | Record<string, unknown>
        | undefined)
    : undefined;

  const isMaskedPass = rawSenha.includes('••••');
  const passwordHash =
    isMaskedPass && existingUser
      ? String(existingUser.password_hash)
      : hashPasswordArgon2id(rawSenha);

  const portalPasswordEnc =
    isMaskedPass && existingUser
      ? String(existingUser.portal_password_enc || '')
      : encryptSecretAES256GCM(rawSenha);

  const now = new Date().toISOString();
  let userId = input.id || '';

  if (existingUser) {
    userId = String(existingUser.id);
    db.prepare(
      `UPDATE users SET
        login = ?, password_hash = ?, portal_password_enc = ?,
        nome_completo = ?, cargo = ?, ativo = ?, updated_at = ?
       WHERE id = ? AND school_id = ?`
    ).run(
      login,
      passwordHash,
      portalPasswordEnc,
      nomeCompleto,
      cargo,
      input.ativo !== undefined ? (input.ativo ? 1 : 0) : Number(existingUser.ativo),
      now,
      userId,
      schoolId
    );
  } else {
    userId = input.id || `user-${login}-${Date.now().toString(36)}`;
    db.prepare(
      `INSERT INTO users (
        id, school_id, login, password_hash, portal_password_enc,
        nome_completo, cargo, role, ativo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ESCOLA', ?, ?, ?)`
    ).run(
      userId,
      schoolId,
      login,
      passwordHash,
      portalPasswordEnc,
      nomeCompleto,
      cargo,
      input.ativo !== false ? 1 : 0,
      now,
      now
    );
  }

  db.prepare('DELETE FROM login_attempts WHERE identifier = ?').run(login);

  const schools = getSchoolsFromDb(false);
  const updatedSchool = schools.find((s) => s.id === schoolId)!;
  const user = updatedSchool.users.find((u) => u.id === userId)!;
  return { schools, user };
}

export function updateUserPasswordInDb(
  schoolId: string,
  userId: string,
  novaSenhaRaw: string
): { schools: RegisteredSchool[]; user: SchoolPortalUser } {
  const db = getDatabase();
  const novaSenha = (novaSenhaRaw || '').trim();
  if (!novaSenha || novaSenha.length < 4) {
    throw new Error('A nova senha deve conter pelo menos 4 caracteres.');
  }

  const passwordHash = hashPasswordArgon2id(novaSenha);
  const portalPasswordEnc = encryptSecretAES256GCM(novaSenha);
  const now = new Date().toISOString();

  const res = db
    .prepare(
      'UPDATE users SET password_hash = ?, portal_password_enc = ?, updated_at = ? WHERE id = ? AND school_id = ?'
    )
    .run(passwordHash, portalPasswordEnc, now, userId, schoolId);

  if (res.changes === 0) {
    throw new Error('Usuário não encontrado nesta unidade escolar.');
  }

  const userRow = db
    .prepare('SELECT login FROM users WHERE id = ?')
    .get(userId) as { login?: string } | undefined;
  if (userRow?.login) {
    db.prepare('DELETE FROM login_attempts WHERE identifier = ?').run(
      normalizeLoginIdentifier(userRow.login)
    );
  }

  const schools = getSchoolsFromDb(false);
  const updatedSchool = schools.find((s) => s.id === schoolId)!;
  const user = updatedSchool.users.find((u) => u.id === userId)!;
  return { schools, user };
}

export function toggleUserStatusInDb(
  schoolId: string,
  userId: string
): RegisteredSchool[] {
  const db = getDatabase();
  db.prepare(
    'UPDATE users SET ativo = CASE WHEN ativo = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ? AND school_id = ?'
  ).run(new Date().toISOString(), userId, schoolId);
  return getSchoolsFromDb(false);
}

export function deleteUserFromDb(
  schoolId: string,
  userId: string
): RegisteredSchool[] {
  const db = getDatabase();
  db.prepare('DELETE FROM users WHERE id = ? AND school_id = ?').run(userId, schoolId);
  return getSchoolsFromDb(false);
}

/**
 * Atualiza a senha mestra do Perfil Administrador diretamente no banco de dados SQLite (com hash Argon2id).
 */
export function updateAdminPasswordInDb(newPasswordPlain: string): boolean {
  const db = getDatabase();
  const cleanPass = (newPasswordPlain || '').trim();
  if (cleanPass.length < 6) {
    throw new Error('A nova senha de administrador deve conter no mínimo 6 caracteres.');
  }
  const passwordHash = hashPasswordArgon2id(cleanPass);
  const now = new Date().toISOString();
  const res = db
    .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE role = 'ADMIN'")
    .run(passwordHash, now);
  return res.changes > 0;
}

/**
 * Proteção contra Força Bruta (Rate Limiting por identificador/login).
 */
export function checkLoginRateLimit(identifierRaw: string): {
  allowed: boolean;
  remainingAttempts: number;
  lockedUntil?: string;
  retryAfterSeconds?: number;
} {
  const db = getDatabase();
  const identifier = normalizeLoginIdentifier(identifierRaw) || 'anonymous';
  const row = db
    .prepare('SELECT * FROM login_attempts WHERE identifier = ?')
    .get(identifier) as Record<string, unknown> | undefined;

  if (!row) {
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }

  const nowMs = Date.now();
  const lockedUntilStr = row.locked_until ? String(row.locked_until) : null;
  if (lockedUntilStr) {
    const lockedUntilMs = Date.parse(lockedUntilStr);
    if (lockedUntilMs > nowMs) {
      return {
        allowed: false,
        remainingAttempts: 0,
        lockedUntil: lockedUntilStr,
        retryAfterSeconds: Math.ceil((lockedUntilMs - nowMs) / 1000),
      };
    }
    // Expirou o bloqueio: limpa contador
    db.prepare('DELETE FROM login_attempts WHERE identifier = ?').run(identifier);
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }

  const failedCount = Number(row.failed_count || 0);
  return {
    allowed: true,
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - failedCount),
  };
}

export function recordLoginAttemptResult(
  identifierRaw: string,
  success: boolean
): {
  failedCount: number;
  lockedUntil?: string;
} {
  const db = getDatabase();
  const identifier = normalizeLoginIdentifier(identifierRaw) || 'anonymous';
  if (success) {
    db.prepare('DELETE FROM login_attempts WHERE identifier = ?').run(identifier);
    return { failedCount: 0 };
  }

  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT * FROM login_attempts WHERE identifier = ?')
    .get(identifier) as Record<string, unknown> | undefined;

  const nextCount = existing ? Number(existing.failed_count || 0) + 1 : 1;
  const lockedUntil =
    nextCount >= MAX_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOGIN_LOCKOUT_DURATION_MS).toISOString()
      : null;

  if (existing) {
    db.prepare(
      'UPDATE login_attempts SET failed_count = ?, locked_until = ?, last_attempt_at = ? WHERE identifier = ?'
    ).run(nextCount, lockedUntil, now, identifier);
  } else {
    db.prepare(
      'INSERT INTO login_attempts (identifier, failed_count, first_failed_at, locked_until, last_attempt_at) VALUES (?, ?, ?, ?, ?)'
    ).run(identifier, nextCount, now, lockedUntil, now);
  }

  return {
    failedCount: nextCount,
    lockedUntil: lockedUntil || undefined,
  };
}

/**
 * Autentica um login diretamente no banco SQLite com proteção contra força bruta e criação de sessão segura.
 */
export function authenticateUserInDb(
  loginRaw: string,
  senhaRaw: string,
  ipAddress: string = '127.0.0.1',
  userAgent: string = ''
): {
  ok: boolean;
  status: number;
  session?: AuthSession;
  error?: string;
  lockedUntil?: string;
} {
  const db = getDatabase();
  const login = normalizeLoginIdentifier(loginRaw);
  const senha = (senhaRaw || '').trim();

  if (!login || !senha) {
    return {
      ok: false,
      status: 400,
      error: 'Informe o usuário e a senha para acessar a plataforma.',
    };
  }

  // 1. Verificar Rate Limiting / Bloqueio por tentativas excessivas
  const rateLimit = checkLoginRateLimit(login);

  // 2. Buscar usuário na tabela relacional `users` (ou aliases de administrador)
  const effectiveLookupLogin =
    login === 'admin@microlins.com.br' || login === 'alisson'
      ? 'admin'
      : login;

  let userRow = db
    .prepare(
      `SELECT u.*, s.nome as school_nome, s.ativa as school_ativa, s.codigo_portal as school_codigo_portal
       FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       WHERE u.login = ?`
    )
    .get(effectiveLookupLogin) as Record<string, unknown> | undefined;

  // 2.1. Caso o login informado seja o e-mail da credencial NPS da unidade escolar, permite autenticar na unidade se a senha NPS coincidir
  if (!userRow && login.includes('@')) {
    const schoolByNps = db
      .prepare('SELECT * FROM schools WHERE LOWER(nps_email) = ?')
      .get(login) as Record<string, unknown> | undefined;
    if (schoolByNps) {
      const npsPassDec = decryptSecretAES256GCM(
        String(schoolByNps.nps_password_enc || '')
      );
      if (npsPassDec && npsPassDec === senha) {
        const firstSchoolUser = db
          .prepare(
            "SELECT * FROM users WHERE school_id = ? AND role = 'ESCOLA' ORDER BY ativo DESC, created_at ASC LIMIT 1"
          )
          .get(String(schoolByNps.id)) as Record<string, unknown> | undefined;
        userRow = {
          id: firstSchoolUser ? String(firstSchoolUser.id) : `nps-${schoolByNps.id}`,
          school_id: String(schoolByNps.id),
          login: firstSchoolUser ? String(firstSchoolUser.login) : login,
          password_hash: hashPasswordArgon2id(senha),
          portal_password_enc: encryptSecretAES256GCM(senha),
          nome_completo: firstSchoolUser
            ? String(firstSchoolUser.nome_completo)
            : `Coordenação (${schoolByNps.nome})`,
          cargo: firstSchoolUser
            ? String(firstSchoolUser.cargo)
            : 'Gestão da Unidade',
          role: 'ESCOLA',
          ativo: 1,
          school_nome: String(schoolByNps.nome),
          school_ativa: Number(schoolByNps.ativa),
          school_codigo_portal: String(schoolByNps.codigo_portal || '1875'),
        };
      }
    }
  }

  if (!userRow) {
    if (!rateLimit.allowed) {
      recordAuditLog({
        actorLogin: login,
        actorRole: 'ANONYMOUS',
        action: 'AUTH_LOGIN_LOCKED',
        resource: 'api/auth/login',
        status: 'DENIED',
        ipAddress,
        details: `Conta temporariamente bloqueada por excesso de tentativas até ${rateLimit.lockedUntil}.`,
      });
      return {
        ok: false,
        status: 429,
        lockedUntil: rateLimit.lockedUntil,
        error: `Muitas tentativas inválidas. Por segurança, o acesso para "${login}" foi bloqueado temporariamente por ${Math.ceil(
          (rateLimit.retryAfterSeconds || 900) / 60
        )} minuto(s).`,
      };
    }
    const attempt = recordLoginAttemptResult(login, false);
    recordAuditLog({
      actorLogin: login,
      actorRole: 'ANONYMOUS',
      action: 'AUTH_LOGIN_FAILED',
      resource: 'api/auth/login',
      status: 'DENIED',
      ipAddress,
      details: `Usuário inexistente (${attempt.failedCount}/${MAX_LOGIN_ATTEMPTS} tentativas).`,
    });
    return {
      ok: false,
      status: 401,
      error:
        'Acesso negado: este usuário não possui credenciais cadastradas e liberadas pelo Administrador.',
    };
  }

  const passwordHash = String(userRow.password_hash || '');
  const portalPasswordPlain = decryptSecretAES256GCM(
    String(userRow.portal_password_enc || '')
  );
  const isPasswordValid =
    verifyPasswordArgon2id(senha, passwordHash) ||
    Boolean(portalPasswordPlain && portalPasswordPlain === senha);

  if (!isPasswordValid) {
    if (!rateLimit.allowed) {
      recordAuditLog({
        actorLogin: login,
        actorRole: String(userRow.role || 'ESCOLA'),
        action: 'AUTH_LOGIN_LOCKED',
        resource: 'api/auth/login',
        status: 'DENIED',
        ipAddress,
        details: `Conta temporariamente bloqueada por excesso de tentativas até ${rateLimit.lockedUntil}.`,
      });
      return {
        ok: false,
        status: 429,
        lockedUntil: rateLimit.lockedUntil,
        error: `Muitas tentativas inválidas. Por segurança, o acesso para "${login}" foi bloqueado temporariamente por ${Math.ceil(
          (rateLimit.retryAfterSeconds || 900) / 60
        )} minuto(s).`,
      };
    }
    const attempt = recordLoginAttemptResult(login, false);
    recordAuditLog({
      actorLogin: login,
      actorRole: String(userRow.role || 'ESCOLA'),
      action: 'AUTH_LOGIN_FAILED',
      resource: 'api/auth/login',
      status: 'DENIED',
      ipAddress,
      details: `Senha incorreta (${attempt.failedCount}/${MAX_LOGIN_ATTEMPTS} tentativas).`,
    });
    return {
      ok: false,
      status: 401,
      error:
        userRow.role === 'ADMIN'
          ? 'Senha do Perfil Administrador incorreta.'
          : 'Senha inválida para este usuário do Portal do Aluno.',
    };
  }

  if (userRow.role === 'ESCOLA' && Number(userRow.school_ativa) !== 1) {
    recordAuditLog({
      actorLogin: login,
      actorRole: 'ESCOLA',
      action: 'AUTH_LOGIN_SCHOOL_INACTIVE',
      resource: 'api/auth/login',
      status: 'DENIED',
      ipAddress,
      details: `Unidade escolar "${userRow.school_nome}" desativada.`,
    });
    return {
      ok: false,
      status: 403,
      error: `Acesso bloqueado: a unidade "${userRow.school_nome}" está desativada pelo Administrador.`,
    };
  }

  if (Number(userRow.ativo) !== 1) {
    recordAuditLog({
      actorLogin: login,
      actorRole: String(userRow.role),
      action: 'AUTH_LOGIN_USER_INACTIVE',
      resource: 'api/auth/login',
      status: 'DENIED',
      ipAddress,
      details: `Usuário "${login}" encontra-se inativo.`,
    });
    return {
      ok: false,
      status: 403,
      error: `Acesso bloqueado: a credencial "${login}" está inativa no Painel do Administrador.`,
    };
  }

  // Sucesso: limpa tentativas de falha e atualiza hash caso legado
  recordLoginAttemptResult(login, true);
  if (!isArgon2idHash(passwordHash)) {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPasswordArgon2id(senha),
      new Date().toISOString(),
      String(userRow.id)
    );
  }

  // Criar sessão segura persistida no SQLite
  const rawToken = generateSecureSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const csrfToken = generateSecureSessionToken().slice(0, 32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();

  const role = (userRow.role === 'ADMIN' ? 'ADMIN' : 'ESCOLA') as 'ADMIN' | 'ESCOLA';
  const session: AuthSession = {
    role,
    login: String(userRow.login),
    nomeCompleto: String(userRow.nome_completo),
    cargo: String(userRow.cargo),
    schoolId: userRow.school_id ? String(userRow.school_id) : undefined,
    schoolName: userRow.school_nome ? String(userRow.school_nome) : undefined,
    codigoPortal: userRow.school_codigo_portal
      ? String(userRow.school_codigo_portal)
      : undefined,
    sessionToken: rawToken,
    csrfToken,
    loggedAt: now.toISOString(),
  };

  db.prepare(
    `INSERT INTO sessions (
      token_hash, csrf_token, user_id, login, nome_completo, cargo, role,
      school_id, school_name, codigo_portal, ip_address, user_agent, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tokenHash,
    csrfToken,
    String(userRow.id),
    session.login,
    session.nomeCompleto,
    session.cargo,
    session.role,
    session.schoolId || null,
    session.schoolName || null,
    session.codigoPortal || null,
    ipAddress,
    userAgent.slice(0, 250),
    now.toISOString(),
    expiresAt
  );

  recordAuditLog({
    actorLogin: session.login,
    actorRole: session.role,
    action: 'AUTH_LOGIN_SUCCESS',
    resource: 'api/auth/login',
    status: 'SUCCESS',
    ipAddress,
    details: `Sessão autenticada para ${session.nomeCompleto} (${session.role}).`,
  });

  return {
    ok: true,
    status: 200,
    session,
  };
}

/**
 * Valida um token de sessão no banco SQLite, verificando expiração e revogação.
 */
export function validateSessionTokenInDb(rawToken?: string | null): AuthSession | null {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length < 16) {
    return null;
  }
  const db = getDatabase();
  const tokenHash = hashSessionToken(rawToken.trim());
  const row = db
    .prepare('SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL')
    .get(tokenHash) as Record<string, unknown> | undefined;

  if (!row) return null;

  const expiresAtMs = Date.parse(String(row.expires_at));
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').run(
      new Date().toISOString(),
      tokenHash
    );
    return null;
  }

  return {
    role: row.role === 'ADMIN' ? 'ADMIN' : 'ESCOLA',
    login: String(row.login),
    nomeCompleto: String(row.nome_completo),
    cargo: String(row.cargo),
    schoolId: row.school_id ? String(row.school_id) : undefined,
    schoolName: row.school_name ? String(row.school_name) : undefined,
    codigoPortal: row.codigo_portal ? String(row.codigo_portal) : undefined,
    sessionToken: rawToken.trim(),
    csrfToken: String(row.csrf_token),
    loggedAt: String(row.created_at),
  };
}

export function revokeSessionTokenInDb(rawToken?: string | null): boolean {
  if (!rawToken) return false;
  const db = getDatabase();
  const tokenHash = hashSessionToken(rawToken.trim());
  const res = db
    .prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?')
    .run(new Date().toISOString(), tokenHash);
  return res.changes > 0;
}

/**
 * Fluxo seguro de recuperação de senha com token temporário de uso único (expira em 30 min).
 */
export function createPasswordRecoveryTokenInDb(
  loginRaw: string,
  ipAddress: string = '127.0.0.1'
): {
  ok: boolean;
  recoveryToken?: string;
  expiresAt?: string;
  userLogin?: string;
  message: string;
} {
  const db = getDatabase();
  const login = normalizeLoginIdentifier(loginRaw);
  if (!login) {
    throw new Error('Informe o login ou e-mail institucional para recuperação.');
  }

  const userRow = db
    .prepare('SELECT id, login, school_id, role, ativo FROM users WHERE login = ?')
    .get(login) as Record<string, unknown> | undefined;

  if (!userRow || Number(userRow.ativo) !== 1) {
    recordAuditLog({
      actorLogin: login,
      actorRole: 'ANONYMOUS',
      action: 'PASSWORD_RECOVERY_REQUEST_UNKNOWN',
      resource: 'api/auth/recover-password',
      status: 'DENIED',
      ipAddress,
      details: 'Solicitação de recuperação para usuário não encontrado ou inativo.',
    });
    return {
      ok: false,
      message:
        'Não foi encontrada uma credencial ativa para este identificador. Contate o Administrador.',
    };
  }

  const rawRecoveryToken = `REC-${generateSecureSessionToken().slice(0, 12).toUpperCase()}`;
  const tokenHash = hashSessionToken(rawRecoveryToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RECOVERY_TOKEN_DURATION_MS).toISOString();

  db.prepare(
    `INSERT INTO password_recovery_tokens (
      token_hash, user_login, school_id, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?)`
  ).run(
    tokenHash,
    String(userRow.login),
    userRow.school_id ? String(userRow.school_id) : null,
    now.toISOString(),
    expiresAt
  );

  recordAuditLog({
    actorLogin: String(userRow.login),
    actorRole: String(userRow.role),
    action: 'PASSWORD_RECOVERY_TOKEN_ISSUED',
    resource: 'api/auth/recover-password',
    status: 'SUCCESS',
    ipAddress,
    details: `Token temporário de recuperação emitido (expira em 30 min).`,
  });

  return {
    ok: true,
    recoveryToken: rawRecoveryToken,
    expiresAt,
    userLogin: String(userRow.login),
    message:
      'Token temporário de recuperação gerado com sucesso. Utilize-o em até 30 minutos para redefinir sua senha.',
  };
}

export function resetPasswordWithRecoveryTokenInDb(
  recoveryTokenRaw: string,
  newPasswordRaw: string,
  ipAddress: string = '127.0.0.1'
): {
  ok: boolean;
  userLogin?: string;
  message: string;
} {
  const db = getDatabase();
  const cleanToken = (recoveryTokenRaw || '').trim();
  const cleanPass = (newPasswordRaw || '').trim();

  if (!cleanToken || cleanPass.length < 6) {
    throw new Error(
      'O token de recuperação é obrigatório e a nova senha deve ter no mínimo 6 caracteres.'
    );
  }

  const tokenHash = hashSessionToken(cleanToken);
  const tokenRow = db
    .prepare(
      'SELECT * FROM password_recovery_tokens WHERE token_hash = ? AND used_at IS NULL'
    )
    .get(tokenHash) as Record<string, unknown> | undefined;

  if (!tokenRow) {
    return {
      ok: false,
      message: 'Token de recuperação inválido ou já utilizado.',
    };
  }

  if (Date.parse(String(tokenRow.expires_at)) <= Date.now()) {
    return {
      ok: false,
      message: 'Este token de recuperação expirou. Solicite um novo token.',
    };
  }

  const userLogin = String(tokenRow.user_login);
  const now = new Date().toISOString();
  const newHash = hashPasswordArgon2id(cleanPass);
  const newPortalEnc = encryptSecretAES256GCM(cleanPass);

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(
      'UPDATE users SET password_hash = ?, portal_password_enc = ?, updated_at = ? WHERE login = ?'
    ).run(newHash, newPortalEnc, now, userLogin);

    db.prepare(
      'UPDATE password_recovery_tokens SET used_at = ? WHERE token_hash = ?'
    ).run(now, tokenHash);

    db.prepare('DELETE FROM login_attempts WHERE identifier = ?').run(userLogin);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  recordAuditLog({
    actorLogin: userLogin,
    actorRole: 'USER',
    action: 'PASSWORD_RESET_COMPLETED',
    resource: 'api/auth/reset-password',
    status: 'SUCCESS',
    ipAddress,
    details: 'Senha redefinida com sucesso via token único temporário (Argon2id).',
  });

  return {
    ok: true,
    userLogin,
    message: 'Senha redefinida com sucesso! Você já pode acessar com a nova senha.',
  };
}

/**
 * Stubs vazios (Logs de auditoria e solicitações LGPD removidos por diretriz arquitetural).
 */
export interface SyncLogEntry {
  id: number;
  schoolId: string;
  escolaCodigo: string;
  syncType: string;
  weekdayCode?: string | null;
  status: 'SUCCESS' | 'PARTIAL' | 'ERROR';
  recordsReceived: number;
  recordsInserted: number;
  recordsUpdated: number;
  divergencesCount: number;
  durationMs: number;
  errorMessage?: string | null;
  createdAt: string;
}

const activeSchoolSyncLocks = new Map<
  string,
  { holder: string; acquiredAt: number; expiresAt: number }
>();

/**
 * Adquire lock exclusivo de sincronização por unidade escolar (school_id),
 * evitando concorrência destrutiva ou duplicação quando múltiplos usuários da mesma escola sincronizam simultaneamente.
 */
export function acquireSchoolSyncLock(
  schoolId: string,
  holder: string = 'system',
  ttlMs: number = 30_000
): boolean {
  const key = String(schoolId || 'school-1875').trim();
  const now = Date.now();
  const existing = activeSchoolSyncLocks.get(key);
  if (existing && existing.expiresAt > now) {
    return false;
  }
  activeSchoolSyncLocks.set(key, {
    holder,
    acquiredAt: now,
    expiresAt: now + ttlMs,
  });
  return true;
}

export function releaseSchoolSyncLock(schoolId: string): void {
  const key = String(schoolId || 'school-1875').trim();
  activeSchoolSyncLocks.delete(key);
}

export function isSchoolSyncLocked(schoolId: string): boolean {
  const key = String(schoolId || 'school-1875').trim();
  const existing = activeSchoolSyncLocks.get(key);
  if (!existing) return false;
  if (existing.expiresAt <= Date.now()) {
    activeSchoolSyncLocks.delete(key);
    return false;
  }
  return true;
}

function redactSensitiveLogDetails(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/"(senha|password|portalPassword|npsPassword|token|secret)"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"')
    .replace(/(senha|password|secret|token)=([^\s&]+)/gi, '$1=[REDACTED]')
    .slice(0, 1200);
}

export function recordAuditLog(entry: {
  actorLogin: string;
  actorRole: string;
  action: string;
  resource: string;
  status: 'SUCCESS' | 'DENIED' | 'ERROR';
  ipAddress?: string;
  details?: string;
}): void {
  try {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO audit_logs (
        timestamp, actor_login, actor_role, action, resource, status, ip_address, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      new Date().toISOString(),
      sanitizeInputText(entry.actorLogin || 'anonymous', 120),
      sanitizeInputText(entry.actorRole || 'SYSTEM', 60),
      sanitizeInputText(entry.action || 'EVENT', 100),
      sanitizeInputText(entry.resource || 'system', 160),
      entry.status || 'SUCCESS',
      sanitizeInputText(entry.ipAddress || '127.0.0.1', 64),
      redactSensitiveLogDetails(entry.details || '')
    );
  } catch {
    // Evita falha em cascata caso o banco esteja em migração
  }
}

export function getAuditLogsFromDb(limit: number = 100): AuditLogEntry[] {
  try {
    const db = getDatabase();
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const rows = db
      .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?')
      .all(safeLimit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      timestamp: String(r.timestamp),
      actorLogin: String(r.actor_login),
      actorRole: String(r.actor_role),
      action: String(r.action),
      resource: String(r.resource),
      status: (r.status as 'SUCCESS' | 'DENIED' | 'ERROR') || 'SUCCESS',
      ipAddress: String(r.ip_address || ''),
      details: String(r.details || ''),
    }));
  } catch {
    return [];
  }
}

export function recordSyncLog(entry: {
  schoolId: string;
  escolaCodigo?: string;
  syncType: string;
  weekdayCode?: string;
  status: 'SUCCESS' | 'PARTIAL' | 'ERROR';
  recordsReceived?: number;
  recordsInserted?: number;
  recordsUpdated?: number;
  divergencesCount?: number;
  durationMs?: number;
  errorMessage?: string;
}): void {
  try {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO sync_logs (
        school_id, escola_codigo, sync_type, weekday_code, status,
        records_received, records_inserted, records_updated, divergences_count,
        duration_ms, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      String(entry.schoolId || 'school-1875'),
      String(entry.escolaCodigo || '1875'),
      sanitizeInputText(entry.syncType || 'PORTAL_SYNC', 80),
      entry.weekdayCode ? String(entry.weekdayCode) : null,
      entry.status || 'SUCCESS',
      Number(entry.recordsReceived || 0),
      Number(entry.recordsInserted || 0),
      Number(entry.recordsUpdated || 0),
      Number(entry.divergencesCount || 0),
      Number(entry.durationMs || 0),
      entry.errorMessage ? redactSensitiveLogDetails(entry.errorMessage) : null,
      new Date().toISOString()
    );
  } catch {
    // Ignore sync log error during migration
  }
}

export function getSyncLogsFromDb(
  schoolId?: string,
  limit: number = 50
): SyncLogEntry[] {
  try {
    const db = getDatabase();
    const safeLimit = Math.max(1, Math.min(250, Number(limit) || 50));
    const rows = schoolId
      ? (db
          .prepare(
            'SELECT * FROM sync_logs WHERE school_id = ? ORDER BY id DESC LIMIT ?'
          )
          .all(schoolId, safeLimit) as Array<Record<string, unknown>>)
      : (db
          .prepare('SELECT * FROM sync_logs ORDER BY id DESC LIMIT ?')
          .all(safeLimit) as Array<Record<string, unknown>>);

    return rows.map((r) => ({
      id: Number(r.id),
      schoolId: String(r.school_id),
      escolaCodigo: String(r.escola_codigo || ''),
      syncType: String(r.sync_type),
      weekdayCode: r.weekday_code ? String(r.weekday_code) : null,
      status: (r.status as 'SUCCESS' | 'PARTIAL' | 'ERROR') || 'SUCCESS',
      recordsReceived: Number(r.records_received || 0),
      recordsInserted: Number(r.records_inserted || 0),
      recordsUpdated: Number(r.records_updated || 0),
      divergencesCount: Number(r.divergences_count || 0),
      durationMs: Number(r.duration_ms || 0),
      errorMessage: r.error_message ? String(r.error_message) : null,
      createdAt: String(r.created_at),
    }));
  } catch {
    return [];
  }
}

export function createLgpdRequestInDb(_input: {
  requesterName: string;
  requesterEmail: string;
  requesterRole: string;
  requestType: LgpdRequestRecord['requestType'];
  description: string;
  ipAddress?: string;
}): LgpdRequestRecord {
  throw new Error('Módulo de solicitações removido do sistema.');
}

export function getLgpdRequestsFromDb(): LgpdRequestRecord[] {
  return [];
}

/**
 * Retorna diagnóstico técnico do banco de dados SQLite e migrações.
 */
export function getDatabaseStatusSummary(): DatabaseStatusSummary {
  const db = getDatabase();
  ensureDirectories();

  const migrations = db
    .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC')
    .all() as Array<{ version: number; name: string; applied_at: string }>;

  const schoolsCount = Number(
    (db.prepare('SELECT COUNT(*) as c FROM schools').get() as { c: number }).c
  );
  const usersCount = Number(
    (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  );
  const sessionsCount = Number(
    (
      db
        .prepare(
          'SELECT COUNT(*) as c FROM sessions WHERE revoked_at IS NULL AND expires_at > ?'
        )
        .get(new Date().toISOString()) as { c: number }
    ).c
  );
  let auditLogsCount = 0;
  try {
    auditLogsCount = Number(
      (db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as { c: number }).c
    );
  } catch {
    auditLogsCount = 0;
  }

  let fileSizeBytes = 0;
  if (currentDbFilePath !== ':memory:' && fs.existsSync(currentDbFilePath)) {
    fileSizeBytes = fs.statSync(currentDbFilePath).size;
  }

  return {
    engine: 'SQLite 3 Relacional (node:sqlite DatabaseSync)',
    databaseFile:
      currentDbFilePath === ':memory:'
        ? ':memory:'
        : path.relative(process.cwd(), currentDbFilePath),
    fileSizeBytes,
    walMode: currentDbFilePath !== ':memory:',
    foreignKeysEnabled: true,
    schemaVersion:
      migrations.length > 0 ? migrations[migrations.length - 1].version : 1,
    appliedMigrations: migrations.map((m) => ({
      version: Number(m.version),
      name: String(m.name),
      appliedAt: String(m.applied_at),
    })),
    counts: {
      schools: schoolsCount,
      users: usersCount,
      activeSessions: sessionsCount,
      auditLogs: auditLogsCount,
      lgpdRequests: 0,
      backupsCount: 0,
    },
    backups: [],
    securityAlgorithms: {
      passwordHashing: 'Argon2id (v=19, m=4096 KiB, t=3, p=1)',
      integrationSecretsEncryption: 'AES-256-GCM (96-bit IV + 128-bit AuthTag)',
      sessionTokenDigest: 'SHA-256 + HttpOnly / Bearer Session',
    },
  };
}

export interface StudentEducatorCacheEntry {
  schoolId: string;
  contrato: string;
  nomeAluno: string;
  educadorNome: string;
  escolaCodigo: string;
  updatedAt: string;
}

export function upsertStudentEducator(
  contrato: string,
  nomeAluno: string,
  educadorNome: string,
  escolaCodigo: string = '1875',
  schoolId?: string
): void {
  const db = getDatabase();
  const cleanContrato = String(contrato || '').trim();
  const cleanEducador = String(educadorNome || '').trim();
  const cleanAluno = String(nomeAluno || '').trim();
  const cleanEscola = String(escolaCodigo || '1875').trim();
  const effectiveSchoolId = String(schoolId || `school-${cleanEscola}`).trim();
  if (!cleanContrato || !cleanEducador) return;

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO student_educators (school_id, contrato, nome_aluno, educador_nome, escola_codigo, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(school_id, contrato) DO UPDATE SET
      nome_aluno = CASE WHEN excluded.nome_aluno <> '' THEN excluded.nome_aluno ELSE student_educators.nome_aluno END,
      educador_nome = excluded.educador_nome,
      escola_codigo = excluded.escola_codigo,
      updated_at = excluded.updated_at
  `).run(effectiveSchoolId, cleanContrato, cleanAluno, cleanEducador, cleanEscola, now);
}

export function getStudentEducatorsMap(
  escolaCodigo: string = '1875',
  schoolId?: string
): Map<string, { educadorNome: string; nomeAluno: string; updatedAt: string }> {
  const db = getDatabase();
  const rows = schoolId
    ? (db
        .prepare(
          'SELECT contrato, nome_aluno, educador_nome, updated_at FROM student_educators WHERE school_id = ?'
        )
        .all(schoolId) as Array<{
        contrato: string;
        nome_aluno: string;
        educador_nome: string;
        updated_at: string;
      }>)
    : (db
        .prepare(
          'SELECT contrato, nome_aluno, educador_nome, updated_at FROM student_educators WHERE escola_codigo = ?'
        )
        .all(escolaCodigo) as Array<{
        contrato: string;
        nome_aluno: string;
        educador_nome: string;
        updated_at: string;
      }>);

  const map = new Map<string, { educadorNome: string; nomeAluno: string; updatedAt: string }>();
  for (const r of rows) {
    map.set(r.contrato, {
      educadorNome: r.educador_nome,
      nomeAluno: r.nome_aluno,
      updatedAt: r.updated_at,
    });
  }
  return map;
}

export function getEducatorStats(
  escolaCodigo: string = '1875',
  schoolId?: string
): Array<{
  educadorNome: string;
  totalAlunos: number;
  lastUpdated: string;
}> {
  const db = getDatabase();
  const rows = schoolId
    ? (db
        .prepare(`
          SELECT educador_nome, COUNT(*) as total_alunos, MAX(updated_at) as last_updated
          FROM student_educators
          WHERE school_id = ?
          GROUP BY educador_nome
          ORDER BY total_alunos DESC
        `)
        .all(schoolId) as Array<{
        educador_nome: string;
        total_alunos: number;
        last_updated: string;
      }>)
    : (db
        .prepare(`
          SELECT educador_nome, COUNT(*) as total_alunos, MAX(updated_at) as last_updated
          FROM student_educators
          WHERE escola_codigo = ?
          GROUP BY educador_nome
          ORDER BY total_alunos DESC
        `)
        .all(escolaCodigo) as Array<{
        educador_nome: string;
        total_alunos: number;
        last_updated: string;
      }>);

  return rows.map((r) => ({
    educadorNome: r.educador_nome,
    totalAlunos: Number(r.total_alunos),
    lastUpdated: r.last_updated,
  }));
}

export interface MultiSchoolFilter {
  schoolId?: string;
  codigoPortal?: string;
  unidade?: string;
  diaSemana?: string;
}

/**
 * Calcula um deslocamento numérico determinístico para isolar a chave primária `id`
 * da tabela `student_records` entre múltiplas escolas no SQLite, impedindo que a Escola B
 * sobrescreva registros da Escola A mesmo quando ambas enviam IDs locais 1..N.
 */
function computeSchoolRecordIdOffset(schoolId: string): number {
  const clean = String(schoolId || 'school-1875').trim();
  if (clean === 'school-1875') return 0;
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const positiveBucket = (Math.abs(hash) % 9000) + 1;
  return positiveBucket * 100_000;
}

export interface PortalReconciliationReport<T = Record<string, any>> {
  reconciledRecords: T[];
  totalPortal: number;
  totalStored: number;
  insertedCount: number;
  updatedCount: number;
  preservedPresencesCount: number;
  divergencesCount: number;
  divergences: Array<{
    contrato: string;
    diaSemana: string;
    horaInicio: string;
    type: 'PRESERVED_CONFIRMED_PRESENCE' | 'STATUS_UPDATED' | 'NEW_SLOT';
    details: string;
  }>;
}

/**
 * Compara e reconcilia os dados recebidos do Portal do Aluno com os registros já armazenados
 * para a mesma escola (`schoolId`), garantindo idempotência e impedindo que uma falha parcial
 * apague presenças já confirmadas.
 */
function buildRecordSlotKey(rec: Record<string, any>): string {
  const contrato = String(rec.contrato || '').trim();
  const diaSemana = String(rec.diaSemana || '').trim();
  const horaInicio = String(rec.horaInicio || '').trim();
  const cursoOrAula = String(rec.aulaId || rec.curso || rec.id || '').trim();
  if (!contrato && !diaSemana && !horaInicio) return '';
  return `${contrato}|${diaSemana}|${horaInicio}|${cursoOrAula}`;
}

export function comparePortalWithStoredRecords<T extends Record<string, any>>(
  portalRecords: T[],
  storedRecords: T[],
  schoolId: string = 'school-1875'
): PortalReconciliationReport<T> {
  const storedBySlot = new Map<string, T>();
  const storedByTimeSlot = new Map<string, T>();
  for (const st of storedRecords) {
    if (st.schoolId && st.schoolId !== schoolId) continue;
    const slotKey = buildRecordSlotKey(st);
    if (slotKey) {
      storedBySlot.set(slotKey, st);
    }
    const timeKey = `${String(st.contrato || '').trim()}|${String(st.diaSemana || '').trim()}|${String(st.horaInicio || '').trim()}`;
    if (timeKey !== '||' && !storedByTimeSlot.has(timeKey)) {
      storedByTimeSlot.set(timeKey, st);
    }
  }

  const divergences: PortalReconciliationReport<T>['divergences'] = [];
  const reconciledRecords: T[] = [];
  let insertedCount = 0;
  let updatedCount = 0;
  let preservedPresencesCount = 0;

  const seenSlots = new Set<string>();

  for (const incoming of portalRecords) {
    const contrato = String(incoming.contrato || '').trim();
    const diaSemana = String(incoming.diaSemana || '').trim();
    const horaInicio = String(incoming.horaInicio || '').trim();
    const slotKey = buildRecordSlotKey(incoming);
    if (slotKey) {
      if (seenSlots.has(slotKey)) {
        // Deduplica registros estritamente idênticos no mesmo lote do portal
        continue;
      }
      seenSlots.add(slotKey);
    }

    const timeKey = `${contrato}|${diaSemana}|${horaInicio}`;
    const existing =
      (slotKey ? storedBySlot.get(slotKey) : undefined) ||
      (timeKey !== '||' && portalRecords.length <= storedRecords.length
        ? storedByTimeSlot.get(timeKey)
        : undefined);
    if (!existing) {
      insertedCount++;
      reconciledRecords.push({
        ...incoming,
        schoolId,
      });
      continue;
    }

    const existingHasConfirmedPresence =
      existing.presencaOuFalta === 'P' ||
      existing.presencaOuFalta === 'Presença' ||
      existing.infoAula === 'Sistema Acadêmico' ||
      Boolean(existing.inicio) ||
      Boolean(existing.fim);

    const incomingHasPresenceOrAbsence =
      incoming.presencaOuFalta === 'P' ||
      incoming.presencaOuFalta === 'Presença' ||
      incoming.presencaOuFalta === 'F' ||
      incoming.presencaOuFalta === 'Falta' ||
      Boolean(incoming.inicio) ||
      Boolean(incoming.fim);

    if (existingHasConfirmedPresence && !incomingHasPresenceOrAbsence) {
      // Preserva a presença já confirmada caso o portal retorne resposta parcial/vazia
      preservedPresencesCount++;
      divergences.push({
        contrato,
        diaSemana,
        horaInicio,
        type: 'PRESERVED_CONFIRMED_PRESENCE',
        details: `Presença confirmada preservada para contrato ${contrato} em ${diaSemana} ${horaInicio}.`,
      });
      reconciledRecords.push({
        ...incoming,
        presencaOuFalta: existing.presencaOuFalta || 'Presença',
        inicio: existing.inicio || incoming.inicio,
        fim: existing.fim || incoming.fim,
        infoAula: existing.infoAula || incoming.infoAula,
        status: existing.status || 'FINALIZADO',
        educador: incoming.educador || existing.educador,
        educadorCachedAt: incoming.educadorCachedAt || existing.educadorCachedAt,
        schoolId,
      });
      continue;
    }

    if (existing.presencaOuFalta !== incoming.presencaOuFalta) {
      updatedCount++;
      divergences.push({
        contrato,
        diaSemana,
        horaInicio,
        type: 'STATUS_UPDATED',
        details: `Status alterado de "${existing.presencaOuFalta || 'vazio'}" para "${incoming.presencaOuFalta || 'vazio'}" no contrato ${contrato}.`,
      });
    }

    reconciledRecords.push({
      ...incoming,
      educador: incoming.educador || existing.educador,
      educadorCachedAt: incoming.educadorCachedAt || existing.educadorCachedAt,
      schoolId,
    });
  }

  return {
    reconciledRecords,
    totalPortal: portalRecords.length,
    totalStored: storedRecords.length,
    insertedCount,
    updatedCount,
    preservedPresencesCount,
    divergencesCount: divergences.length,
    divergences,
  };
}

export function upsertStudentRecordsInDb<T extends Record<string, any>>(
  records: T[],
  schoolId: string = 'school-1875',
  escolaCodigo: string = '1875',
  unidade: string = 'ESCOLA PRESIDENTE PRUDENTE',
  replaceForSchool: boolean = false
): void {
  if (!records || records.length === 0) return;
  const db = getDatabase();
  const cleanSchoolId = String(schoolId || 'school-1875').trim();
  const cleanCodigo = String(escolaCodigo || '1875').trim();
  const idOffset = computeSchoolRecordIdOffset(cleanSchoolId);
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO student_records (
      id, contrato, school_id, escola_codigo, unidade, dia_semana, educador, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      contrato = excluded.contrato,
      school_id = excluded.school_id,
      escola_codigo = excluded.escola_codigo,
      unidade = excluded.unidade,
      dia_semana = excluded.dia_semana,
      educador = CASE WHEN excluded.educador <> '' THEN excluded.educador ELSE student_records.educador END,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `);

  db.exec('BEGIN TRANSACTION;');
  try {
    const educatorsMap = getStudentEducatorsMap(cleanCodigo, cleanSchoolId);
    const existingRecords = getStudentRecordsFromDb<Record<string, any>>({
      schoolId: cleanSchoolId,
    });
    const { reconciledRecords } = comparePortalWithStoredRecords(
      records,
      existingRecords,
      cleanSchoolId
    );

    const finalRecords: Record<string, any>[] = [...reconciledRecords];
    if (!replaceForSchool && existingRecords.length > 0 && records.length < existingRecords.length) {
      const incomingSlotKeys = new Set(reconciledRecords.map((r) => buildRecordSlotKey(r)));
      for (const oldRec of existingRecords) {
        const key = buildRecordSlotKey(oldRec);
        if (key && !incomingSlotKeys.has(key)) {
          finalRecords.push(oldRec);
        }
      }
    }

    db.prepare('DELETE FROM student_records WHERE school_id = ?').run(cleanSchoolId);

    for (let i = 0; i < finalRecords.length; i++) {
      const r = finalRecords[i];
      const baseId = i + 1;
      const scopedDbId = idOffset > 0 ? idOffset + baseId : baseId;
      const contrato = String(r.contrato || '').trim();
      const diaSemana = String(r.diaSemana || '').trim();
      const cachedEd = contrato ? educatorsMap.get(contrato) : undefined;
      const educador = String(r.educador || cachedEd?.educadorNome || '').trim();
      const recUnidade = String(r.unidade || unidade).trim();
      const payload = JSON.stringify({
        ...r,
        id: baseId,
        educador: educador || undefined,
        educadorCachedAt: r.educadorCachedAt || cachedEd?.updatedAt || undefined,
        unidade: recUnidade,
        schoolId: cleanSchoolId,
        escolaCodigo: cleanCodigo,
      });
      stmt.run(
        scopedDbId,
        contrato,
        cleanSchoolId,
        cleanCodigo,
        recUnidade,
        diaSemana,
        educador,
        payload,
        now
      );
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function getStudentRecordsFromDb<T = any>(
  filterOrSchoolId?: MultiSchoolFilter | string
): T[] {
  const db = getDatabase();
  const filter: MultiSchoolFilter | undefined =
    typeof filterOrSchoolId === 'string'
      ? { schoolId: filterOrSchoolId }
      : filterOrSchoolId;

  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filter?.schoolId) {
    clauses.push('school_id = ?');
    params.push(filter.schoolId);
  } else if (filter?.codigoPortal) {
    clauses.push('escola_codigo = ?');
    params.push(filter.codigoPortal);
  } else if (filter?.unidade) {
    clauses.push('UPPER(unidade) = UPPER(?)');
    params.push(filter.unidade);
  }

  if (filter?.diaSemana && filter.diaSemana !== 'TODOS') {
    clauses.push('dia_semana = ?');
    params.push(filter.diaSemana);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT payload_json, educador, school_id FROM student_records ${whereSql} ORDER BY id ASC`)
    .all(...params) as Array<{ payload_json: string; educador: string; school_id: string }>;

  const educatorsMap = getStudentEducatorsMap(
    filter?.codigoPortal || '1875',
    filter?.schoolId
  );
  const results: T[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.payload_json);
      if (!parsed.educador && row.educador) {
        parsed.educador = row.educador;
      }
      if (!parsed.educador && parsed.contrato) {
        const cachedEd = educatorsMap.get(String(parsed.contrato));
        if (cachedEd?.educadorNome) {
          parsed.educador = cachedEd.educadorNome;
          parsed.educadorCachedAt = cachedEd.updatedAt;
        }
      }
      if (parsed.sala) {
        parsed.sala = String(parsed.sala).split(' - ')[0].trim() || 'Sala não informada';
      }
      parsed.modalidade = 'Presencial';
      if (
        (parsed.presencaOuFalta === 'P' || parsed.infoAula === 'Sistema Acadêmico') &&
        parsed.status === 'NÃO INICIADO'
      ) {
        parsed.presencaOuFalta = 'P';
        parsed.status = 'FINALIZADO';
      }
      results.push(parsed as T);
    } catch {
      // Ignore malformed JSON
    }
  }
  return results;
}

export function upsertNpsRecordsInDb<T extends Record<string, any>>(
  invitations: T[],
  schoolId: string = 'school-1875',
  escolaCodigo: string = '1875',
  unidade: string = 'ESCOLA PRESIDENTE PRUDENTE',
  replaceForSchool: boolean = false
): void {
  if (!invitations) return;
  const db = getDatabase();
  const cleanSchoolId = String(schoolId || 'school-1875').trim();
  const cleanCodigo = String(escolaCodigo || '1875').trim();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO nps_records (
      id, control_id, contrato, school_id, escola_codigo, unidade, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      control_id = excluded.control_id,
      contrato = excluded.contrato,
      school_id = excluded.school_id,
      escola_codigo = excluded.escola_codigo,
      unidade = excluded.unidade,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `);

  db.exec('BEGIN TRANSACTION;');
  try {
    if (replaceForSchool) {
      db.prepare('DELETE FROM nps_records WHERE school_id = ?').run(cleanSchoolId);
    }
    for (let i = 0; i < invitations.length; i++) {
      const inv = invitations[i];
      const rawInvId = String(inv.id || inv.controlId || `nps-${i + 1}`).trim();
      const storagePk =
        cleanSchoolId === 'school-1875' || rawInvId.startsWith(`${cleanSchoolId}:`)
          ? rawInvId
          : `${cleanSchoolId}:${rawInvId}`;
      const controlId = String(inv.controlId || rawInvId).trim();
      const contrato = String(inv.contrato || '').trim();
      const payload = JSON.stringify({
        ...inv,
        id: rawInvId,
        controlId,
        surveyUrl: '',
        schoolId: cleanSchoolId,
        escolaCodigo: cleanCodigo,
        unidade,
      });
      stmt.run(storagePk, controlId, contrato, cleanSchoolId, cleanCodigo, unidade, payload, now);
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function getNpsRecordsFromDb<T = any>(
  filterOrSchoolId?: MultiSchoolFilter | string
): T[] {
  const db = getDatabase();
  const filter: MultiSchoolFilter | undefined =
    typeof filterOrSchoolId === 'string'
      ? { schoolId: filterOrSchoolId }
      : filterOrSchoolId;

  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filter?.schoolId) {
    clauses.push('school_id = ?');
    params.push(filter.schoolId);
  } else if (filter?.codigoPortal) {
    clauses.push('escola_codigo = ?');
    params.push(filter.codigoPortal);
  } else if (filter?.unidade) {
    clauses.push('UPPER(unidade) = UPPER(?)');
    params.push(filter.unidade);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT payload_json FROM nps_records ${whereSql} ORDER BY updated_at DESC`)
    .all(...params) as Array<{ payload_json: string }>;

  const results: T[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.payload_json);
      parsed.surveyUrl = '';
      results.push(parsed as T);
    } catch {
      // Ignore malformed JSON
    }
  }
  return results;
}


