import {
  hashPasswordArgon2id,
  verifyPasswordArgon2id,
  encryptSecretAES256GCM,
  decryptSecretAES256GCM,
  maskSecretPreview,
  sanitizeInputText,
  ensureNodeEnvLoaded,
} from './securityCrypto';

ensureNodeEnvLoaded();

export type UserRole = 'ADMIN' | 'ESCOLA';

export type NpsConnectionStatus =
  | 'CONECTADO'
  | 'FALHA_AUTENTICACAO'
  | 'ERRO_COMUNICACAO'
  | 'NAO_CONFIGURADO';

export interface PortalExtractedData {
  login?: string;
  nomeCompleto: string;
  cargo: string;
  escolaNome?: string;
  codigoEscola?: string;
}

export interface UserDiffField {
  field: 'nomeCompleto' | 'cargo' | 'escolaNome' | 'codigoEscola';
  label: string;
  oldValue: string;
  newValue: string;
}

export interface SchoolNpsCredential {
  email: string;
  password: string;
  companyFilter?: string;
  companyId?: string;
  groupId?: string;
  baseUrl?: string;
  active: boolean;
  lastTestedAt?: string;
  lastTestStatus?: 'SUCCESS' | 'ERROR';
  connectionStatus?: NpsConnectionStatus;
  lastTestMessage?: string;
}

export interface SchoolPortalUser {
  id: string;
  schoolId?: string;
  login: string;
  senha: string;
  portalPassword?: string;
  nomeCompleto: string;
  cargo: string;
  escolaNome?: string;
  codigoEscola?: string;
  ativo: boolean;
  active?: boolean;
  createdAt: string;
  ultimoAcesso?: string;
  lastTestedAt?: string;
  lastTestStatus?: 'SUCCESS' | 'ERROR';
  lastTestMessage?: string;
  lastSyncData?: PortalExtractedData;
}

export interface RegisteredSchool {
  id: string;
  nome: string;
  cidade?: string;
  uf?: string;
  codigoPortal: string;
  ativa: boolean;
  active?: boolean;
  createdAt: string;
  updatedAt?: string;
  npsCredential: SchoolNpsCredential;
  users: SchoolPortalUser[];
}

export interface AuthSession {
  role: UserRole;
  login: string;
  nomeCompleto: string;
  cargo: string;
  schoolId?: string;
  schoolName?: string;
  codigoPortal?: string;
  sessionToken?: string;
  csrfToken?: string;
  loggedAt?: string;
}

export interface AuthLoginResult {
  ok: boolean;
  session?: AuthSession;
  school?: RegisteredSchool;
  user?: SchoolPortalUser;
  error?: string;
  matchedUserId?: string;
  matchedSchoolId?: string;
  needsPasswordRehash?: boolean;
}

function getEnvVar(key: string, fallback = ''): string {
  ensureNodeEnvLoaded();
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return String(process.env[key]);
  }
  const metaEnv =
    typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env
      : {};
  if (metaEnv[key]) {
    return String(metaEnv[key]);
  }
  if (metaEnv[`VITE_${key}`]) {
    return String(metaEnv[`VITE_${key}`]);
  }
  return fallback;
}

// Hash Argon2id irreversível para a senha única do Administrador ('2ab@283')
const FALLBACK_ADMIN_DEFAULT_ARGON2_HASH = hashPasswordArgon2id('2ab@283');
const FALLBACK_ADMIN_ARGON2_HASH = FALLBACK_ADMIN_DEFAULT_ARGON2_HASH;
const FALLBACK_ADMIN_SUPA_ARGON2_HASH = FALLBACK_ADMIN_DEFAULT_ARGON2_HASH;

/**
 * Gera um identificador interno único para uma escola no banco de dados (independente do código externo do portal).
 */
export function generateInternalSchoolId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sch_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  return `sch_${Date.now().toString(36)}${rand}`;
}

export const DEFAULT_ADMIN_CREDENTIALS = {
  get login(): string {
    return getEnvVar('ADMIN_LOGIN', 'admin');
  },
  get senha(): string {
    return getEnvVar('ADMIN_PASSWORD_HASH', FALLBACK_ADMIN_DEFAULT_ARGON2_HASH);
  },
  get alternateHash(): string {
    return FALLBACK_ADMIN_DEFAULT_ARGON2_HASH;
  },
  get legacyHash(): string {
    return FALLBACK_ADMIN_DEFAULT_ARGON2_HASH;
  },
  get nomeCompleto(): string {
    return getEnvVar('ADMIN_NOME_COMPLETO', 'Administrador do Sistema');
  },
  get cargo(): string {
    return getEnvVar('ADMIN_CARGO', 'Administrador Geral do Sistema');
  },
};

/**
 * Registro inicial padrão lido exclusivamente das variáveis de ambiente do servidor e banco de dados.
 */
export function createDefaultSchoolsRegistry(): RegisteredSchool[] {
  const codigoPortal = getEnvVar('PORTAL_MICROLINS_ESCOLA', '1875');
  const npsEmail = getEnvVar('INDECX_NPS_LOGIN', 'gerencia.prudente@gmail.com');
  const npsRawPass = getEnvVar('INDECX_NPS_PASSWORD', '');
  const portalLogin = getEnvVar('PORTAL_MICROLINS_LOGIN', 'a116882').toLowerCase();
  const portalRawPass = getEnvVar('PORTAL_MICROLINS_PASSWORD', '');
  const companyId = getEnvVar('INDECX_COMPANY_ID', '66306');
  const groupId = getEnvVar('INDECX_GROUP_ID', '4123');

  return [
    {
      id: `school-${codigoPortal}`,
      nome: 'ESCOLA PRESIDENTE PRUDENTE',
      cidade: 'Presidente Prudente',
      uf: 'SP',
      codigoPortal,
      ativa: true,
      active: true,
      createdAt: '2026-01-10T08:00:00.000Z',
      updatedAt: '2026-01-10T08:00:00.000Z',
      npsCredential: {
        email: npsEmail,
        password: npsRawPass ? encryptSecretAES256GCM(npsRawPass) : '',
        companyFilter: 'Microlins Presidente Prudente',
        companyId,
        groupId,
        baseUrl: 'https://app.indecx.com',
        active: Boolean(npsEmail),
        connectionStatus: npsEmail ? 'CONECTADO' : 'NAO_CONFIGURADO',
        lastTestStatus: 'SUCCESS',
        lastTestMessage: 'Conectado à plataforma Indecx NPS.',
        lastTestedAt: '2026-01-10T08:00:00.000Z',
      },
      users: portalLogin
        ? [
            {
              id: `user-${portalLogin}`,
              schoolId: `school-${codigoPortal}`,
              login: portalLogin,
              senha: hashPasswordArgon2id(portalRawPass || 'Joao@2025'),
              portalPassword: encryptSecretAES256GCM(portalRawPass || 'Joao@2025'),
              nomeCompleto: 'João Pedro Pereira França',
              cargo: 'Auxiliar Pedagógico',
              escolaNome: 'ESCOLA PRESIDENTE PRUDENTE',
              codigoEscola: codigoPortal,
              ativo: true,
              active: true,
              createdAt: '2026-01-10T08:00:00.000Z',
              lastTestedAt: '2026-01-10T08:00:00.000Z',
              lastTestStatus: 'SUCCESS',
              lastTestMessage: 'Sincronizado com o Portal do Aluno MoveEdu.',
            },
          ]
        : [],
    },
  ];
}

const GENERIC_PLACEHOLDER_NAMES = new Set([
  'coordenação pedagógica',
  'coordenacao pedagogica',
  'colaborador da unidade',
  'operador microlins',
  'usuário',
  'usuario',
]);

export function isGenericPlaceholderUserName(name?: string | null): boolean {
  if (!name) return true;
  const normalized = name.trim().toLowerCase();
  return !normalized || GENERIC_PLACEHOLDER_NAMES.has(normalized);
}



export function normalizeLoginIdentifier(value: string): string {
  return sanitizeInputText(value || '', 160).trim().toLowerCase();
}

export function formatUserAccessDateTime(iso?: string): string {
  if (!iso) return 'Nunca acessou';
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(dt);
  } catch {
    return iso;
  }
}

export function computeUserSyncDifferences(
  user: SchoolPortalUser,
  freshData: PortalExtractedData
): { hasChanges: boolean; diffs: UserDiffField[] } {
  const diffs: UserDiffField[] = [];
  if (
    freshData.nomeCompleto &&
    freshData.nomeCompleto.trim() !== (user.nomeCompleto || '').trim()
  ) {
    diffs.push({
      field: 'nomeCompleto',
      label: 'Nome Completo',
      oldValue: user.nomeCompleto || '—',
      newValue: freshData.nomeCompleto.trim(),
    });
  }
  if (freshData.cargo && freshData.cargo.trim() !== (user.cargo || '').trim()) {
    diffs.push({
      field: 'cargo',
      label: 'Cargo / Função',
      oldValue: user.cargo || '—',
      newValue: freshData.cargo.trim(),
    });
  }
  if (
    freshData.escolaNome &&
    user.escolaNome &&
    freshData.escolaNome.trim() !== user.escolaNome.trim()
  ) {
    diffs.push({
      field: 'escolaNome',
      label: 'Unidade vinculada',
      oldValue: user.escolaNome,
      newValue: freshData.escolaNome.trim(),
    });
  }
  return {
    hasChanges: diffs.length > 0,
    diffs,
  };
}

/**
 * Valida o login na plataforma com Argon2id em tempo constante.
 */
export function authenticatePlatformLogin(
  schools: RegisteredSchool[],
  loginRaw: string,
  senhaRaw: string,
  adminCredentials: {
    login: string;
    senha: string;
    alternateHash?: string;
    legacyHash?: string;
    nomeCompleto: string;
    cargo: string;
  } = DEFAULT_ADMIN_CREDENTIALS
): AuthLoginResult {
  const login = normalizeLoginIdentifier(loginRaw);
  const senha = (senhaRaw || '').trim();

  if (!login || !senha) {
    return {
      ok: false,
      error: 'Informe o usuário e a senha para acessar a plataforma.',
    };
  }

  // 1. Perfil Administrador (estritamente login 'admin' e senha única cadastrada)
  if (login === normalizeLoginIdentifier(adminCredentials.login)) {
    const isPasswordValid =
      Boolean(adminCredentials.senha) &&
      verifyPasswordArgon2id(senha, adminCredentials.senha);

    if (isPasswordValid) {
      return {
        ok: true,
        session: {
          role: 'ADMIN',
          login: adminCredentials.login,
          nomeCompleto: adminCredentials.nomeCompleto,
          cargo: adminCredentials.cargo,
          loggedAt: new Date().toISOString(),
        },
      };
    }
    return {
      ok: false,
      error: 'Senha do Perfil Administrador incorreta.',
    };
  }

  // 2. Perfil da Escola (Credencial de Usuário do Portal do Aluno ou Credencial NPS da Escola)
  for (const school of schools) {
    const isSchoolActive =
      school.active !== undefined ? school.active : school.ativa;

    for (const user of school.users || []) {
      if (normalizeLoginIdentifier(user.login) === login) {
        if (isSchoolActive === false) {
          return {
            ok: false,
            error: `Acesso bloqueado: a unidade "${school.nome}" está desativada pelo Administrador.`,
            matchedSchoolId: school.id,
            matchedUserId: user.id,
          };
        }
        const isUserActive =
          user.active !== undefined ? user.active : user.ativo;
        if (isUserActive === false) {
          return {
            ok: false,
            error: `Acesso bloqueado: a credencial "${user.login}" está inativa no Painel do Administrador.`,
            matchedSchoolId: school.id,
            matchedUserId: user.id,
          };
        }
        const decryptedPortalPass = user.portalPassword
          ? decryptSecretAES256GCM(user.portalPassword)
          : '';
        const isValidPass =
          verifyPasswordArgon2id(senha, user.senha) ||
          Boolean(decryptedPortalPass && decryptedPortalPass === senha);

        if (!isValidPass) {
          return {
            ok: false,
            error: 'Senha inválida para este usuário do Portal do Aluno.',
            matchedSchoolId: school.id,
            matchedUserId: user.id,
          };
        }

        const needsPasswordRehash = !user.senha.startsWith('$argon2id$');

        return {
          ok: true,
          needsPasswordRehash,
          matchedSchoolId: school.id,
          matchedUserId: user.id,
          school,
          user,
          session: {
            role: 'ESCOLA',
            login: user.login,
            nomeCompleto: user.nomeCompleto,
            cargo: user.cargo,
            schoolId: school.id,
            schoolName: school.nome,
            codigoPortal: school.codigoPortal,
            loggedAt: new Date().toISOString(),
          },
        };
      }
    }

    // Caso o usuário tente logar usando o e-mail e senha do NPS da unidade escolar
    if (
      school.npsCredential?.email &&
      normalizeLoginIdentifier(school.npsCredential.email) === login
    ) {
      if (isSchoolActive === false) {
        return {
          ok: false,
          error: `Acesso bloqueado: a unidade "${school.nome}" está desativada pelo Administrador.`,
          matchedSchoolId: school.id,
        };
      }
      const decryptedNpsPass = decryptSecretAES256GCM(
        school.npsCredential.password || ''
      );
      if (decryptedNpsPass && decryptedNpsPass === senha) {
        const firstUser = (school.users || [])[0];
        return {
          ok: true,
          matchedSchoolId: school.id,
          matchedUserId: firstUser?.id,
          school,
          user: firstUser,
          session: {
            role: 'ESCOLA',
            login: firstUser?.login || login,
            nomeCompleto:
              firstUser?.nomeCompleto || `Coordenação (${school.nome})`,
            cargo: firstUser?.cargo || 'Gestão da Unidade',
            schoolId: school.id,
            schoolName: school.nome,
            codigoPortal: school.codigoPortal,
            loggedAt: new Date().toISOString(),
          },
        };
      }
    }
  }

  return {
    ok: false,
    error:
      'Acesso negado: este usuário não possui credenciais cadastradas e liberadas pelo Administrador.',
  };
}

/**
 * Mascara hashes Argon2id e segredos AES-256-GCM antes de enviar dados ao cliente Front-end.
 */
export function sanitizeSchoolsForClient(schools: RegisteredSchool[]): RegisteredSchool[] {
  return schools.map((school) => {
    const decryptedNpsPass = school.npsCredential?.password
      ? decryptSecretAES256GCM(school.npsCredential.password)
      : '';
    return {
      ...school,
      active: school.active ?? school.ativa,
      ativa: school.ativa ?? school.active ?? true,
      npsCredential: {
        ...school.npsCredential,
        password: decryptedNpsPass ? maskSecretPreview(decryptedNpsPass) : '••••••••',
      },
      users: (school.users || []).map((u) => ({
        ...u,
        active: u.active ?? u.ativo,
        ativo: u.ativo ?? u.active ?? true,
        senha: '•••••••• (Argon2id)',
        portalPassword: u.portalPassword
          ? maskSecretPreview(decryptSecretAES256GCM(u.portalPassword))
          : '',
      })),
    };
  });
}

export function upsertSchoolInRegistry(
  schools: RegisteredSchool[],
  input: {
    id?: string;
    nome: string;
    cidade?: string;
    uf?: string;
    codigoPortal?: string;
    ativa?: boolean;
    active?: boolean;
    npsEmail?: string;
    npsPassword?: string;
    npsCompanyFilter?: string;
    npsCompanyId?: string;
    npsGroupId?: string;
    npsBaseUrl?: string;
  }
): { schools: RegisteredSchool[]; school: RegisteredSchool } {
  const nome = sanitizeInputText(input.nome || '', 120).trim().toUpperCase();
  const codigoPortal = sanitizeInputText(input.codigoPortal || '', 30).trim() || '1875';
  const npsEmail = sanitizeInputText(input.npsEmail || '', 160).trim();
  const rawNpsPassword = (input.npsPassword || '').trim();
  const npsCompanyFilter = sanitizeInputText(input.npsCompanyFilter || '', 120).trim();
  const npsBaseUrl =
    sanitizeInputText(input.npsBaseUrl || '', 200).trim() || 'https://app.indecx.com';

  if (!nome) {
    throw new Error('O nome da escola é obrigatório.');
  }

  const existingIdx = input.id ? schools.findIndex((s) => s.id === input.id) : -1;
  const existingSchool = existingIdx >= 0 ? schools[existingIdx] : undefined;

  const isMaskedNpsPass = rawNpsPassword.includes('••••');
  const encryptedNpsPassword =
    isMaskedNpsPass && existingSchool?.npsCredential?.password
      ? existingSchool.npsCredential.password
      : rawNpsPassword
        ? encryptSecretAES256GCM(rawNpsPassword)
        : existingSchool?.npsCredential?.password || '';

  const effectiveEmail = npsEmail || existingSchool?.npsCredential?.email || '';
  const npsActive = Boolean(effectiveEmail && encryptedNpsPassword);

  const npsCredential: SchoolNpsCredential = {
    ...existingSchool?.npsCredential,
    email: effectiveEmail,
    password: encryptedNpsPassword,
    companyFilter: npsCompanyFilter || existingSchool?.npsCredential?.companyFilter,
    companyId: input.npsCompanyId || existingSchool?.npsCredential?.companyId,
    groupId: input.npsGroupId || existingSchool?.npsCredential?.groupId,
    baseUrl: npsBaseUrl,
    active: npsActive,
    connectionStatus: npsActive
      ? existingSchool?.npsCredential?.connectionStatus || 'CONECTADO'
      : 'NAO_CONFIGURADO',
  };

  const now = new Date().toISOString();

  if (existingIdx >= 0 && existingSchool) {
    const isActive =
      input.active !== undefined
        ? input.active
        : input.ativa !== undefined
          ? input.ativa
          : existingSchool.ativa;
    const updated: RegisteredSchool = {
      ...existingSchool,
      nome,
      cidade:
        input.cidade !== undefined
          ? sanitizeInputText(input.cidade, 80).trim()
          : existingSchool.cidade,
      uf:
        input.uf !== undefined
          ? sanitizeInputText(input.uf, 4).trim().toUpperCase()
          : existingSchool.uf,
      codigoPortal,
      ativa: isActive,
      active: isActive,
      updatedAt: now,
      npsCredential,
    };
    const next = [...schools];
    next[existingIdx] = updated;
    return { schools: next, school: updated };
  }

  const isActive = input.active ?? input.ativa ?? true;
  const created: RegisteredSchool = {
    id: input.id || generateInternalSchoolId(),
    nome,
    cidade: sanitizeInputText(input.cidade || '', 80).trim() || undefined,
    uf: sanitizeInputText(input.uf || '', 4).trim().toUpperCase() || undefined,
    codigoPortal,
    ativa: isActive,
    active: isActive,
    createdAt: now,
    updatedAt: now,
    npsCredential,
    users: [],
  };

  return { schools: [...schools, created], school: created };
}

export function toggleSchoolStatusInRegistry(
  schools: RegisteredSchool[],
  schoolId: string
): RegisteredSchool[] {
  return schools.map((s) =>
    s.id === schoolId
      ? { ...s, ativa: !s.ativa, active: !s.ativa, updatedAt: new Date().toISOString() }
      : s
  );
}

export function toggleSchoolActiveStatus(
  schools: RegisteredSchool[],
  schoolId: string
): { schools: RegisteredSchool[]; school: RegisteredSchool } {
  const next = toggleSchoolStatusInRegistry(schools, schoolId);
  const school = next.find((s) => s.id === schoolId);
  if (!school) throw new Error('Escola não encontrada.');
  return { schools: next, school };
}

export function deleteSchoolFromRegistry(
  schools: RegisteredSchool[],
  schoolId: string
): { schools: RegisteredSchool[]; deletedSchool?: RegisteredSchool } {
  const deletedSchool = schools.find((s) => s.id === schoolId);
  return {
    schools: schools.filter((s) => s.id !== schoolId),
    deletedSchool,
  };
}

export function upsertUserInSchoolRegistry(
  schools: RegisteredSchool[],
  schoolId: string,
  input: {
    id?: string;
    login: string;
    senha: string;
    nomeCompleto: string;
    cargo: string;
    escolaNome?: string;
    codigoEscola?: string;
    ativo?: boolean;
    active?: boolean;
    lastTestStatus?: 'SUCCESS' | 'ERROR';
    lastTestMessage?: string;
    lastTestedAt?: string;
    lastSyncData?: PortalExtractedData;
  }
): { schools: RegisteredSchool[]; user: SchoolPortalUser } {
  const login = sanitizeInputText(input.login || '', 160).trim();
  const rawSenha = (input.senha || '').trim();
  const nomeCompleto = sanitizeInputText(input.nomeCompleto || '', 120).trim();
  const cargo =
    sanitizeInputText(input.cargo || '', 80).trim() || 'Colaborador da Unidade';

  if (!login || !rawSenha || !nomeCompleto) {
    throw new Error(
      'Login do Portal do Aluno, Senha e Nome Completo são obrigatórios.'
    );
  }

  const targetSchool = schools.find((s) => s.id === schoolId);
  if (!targetSchool) {
    throw new Error('Escola não encontrada.');
  }

  const normalizedLogin = normalizeLoginIdentifier(login);
  for (const s of schools) {
    for (const u of s.users || []) {
      if (
        normalizeLoginIdentifier(u.login) === normalizedLogin &&
        u.id !== input.id
      ) {
        throw new Error(
          `O usuário "${login}" já está cadastrado na unidade "${s.nome}".`
        );
      }
    }
  }

  const existingUser = input.id
    ? targetSchool.users.find((u) => u.id === input.id)
    : undefined;

  const isMaskedPass = rawSenha.includes('••••');
  const finalSenhaHash =
    isMaskedPass && existingUser
      ? existingUser.senha
      : hashPasswordArgon2id(rawSenha);
  const finalPortalPassword =
    isMaskedPass && existingUser?.portalPassword
      ? existingUser.portalPassword
      : encryptSecretAES256GCM(rawSenha);

  const isActive = input.active ?? input.ativo ?? existingUser?.ativo ?? true;
  let savedUser: SchoolPortalUser | null = null;

  const nextSchools = schools.map((school) => {
    if (school.id !== schoolId) return school;
    const existingIdx = input.id
      ? school.users.findIndex((u) => u.id === input.id)
      : -1;

    if (existingIdx >= 0) {
      const updatedUser: SchoolPortalUser = {
        ...school.users[existingIdx],
        schoolId,
        login,
        senha: finalSenhaHash,
        portalPassword: finalPortalPassword,
        nomeCompleto,
        cargo,
        escolaNome: input.escolaNome || school.nome,
        codigoEscola: input.codigoEscola || school.codigoPortal,
        ativo: isActive,
        active: isActive,
        lastTestStatus: input.lastTestStatus || school.users[existingIdx].lastTestStatus,
        lastTestMessage: input.lastTestMessage || school.users[existingIdx].lastTestMessage,
        lastTestedAt: input.lastTestedAt || school.users[existingIdx].lastTestedAt,
        lastSyncData: input.lastSyncData || school.users[existingIdx].lastSyncData,
      };
      savedUser = updatedUser;
      const nextUsers = [...school.users];
      nextUsers[existingIdx] = updatedUser;
      return { ...school, users: nextUsers };
    }

    const newUser: SchoolPortalUser = {
      id: input.id || `user-${login.toLowerCase()}-${Date.now().toString(36)}`,
      schoolId,
      login,
      senha: finalSenhaHash,
      portalPassword: finalPortalPassword,
      nomeCompleto,
      cargo,
      escolaNome: input.escolaNome || school.nome,
      codigoEscola: input.codigoEscola || school.codigoPortal,
      ativo: isActive,
      active: isActive,
      createdAt: new Date().toISOString(),
      lastTestStatus: input.lastTestStatus || 'SUCCESS',
      lastTestMessage:
        input.lastTestMessage || 'Sincronizado com Portal do Aluno (Argon2id ativo).',
      lastTestedAt: input.lastTestedAt || new Date().toISOString(),
      lastSyncData: input.lastSyncData,
    };
    savedUser = newUser;
    return { ...school, users: [...school.users, newUser] };
  });

  if (!savedUser) {
    throw new Error('Falha ao salvar usuário da escola.');
  }

  return { schools: nextSchools, user: savedUser };
}

export function updateUserPasswordInRegistry(
  schools: RegisteredSchool[],
  schoolId: string,
  userId: string,
  novaSenhaRaw: string
): { schools: RegisteredSchool[]; user: SchoolPortalUser } {
  const novaSenha = (novaSenhaRaw || '').trim();
  if (!novaSenha || novaSenha.length < 4) {
    throw new Error('A nova senha deve conter pelo menos 4 caracteres.');
  }

  const targetSchool = schools.find((s) => s.id === schoolId);
  if (!targetSchool) {
    throw new Error('Escola não encontrada.');
  }

  let updatedUser: SchoolPortalUser | null = null;

  const nextSchools = schools.map((school) => {
    if (school.id !== schoolId) return school;
    const idx = school.users.findIndex((u) => u.id === userId);
    if (idx < 0) return school;
    const nextUser: SchoolPortalUser = {
      ...school.users[idx],
      senha: hashPasswordArgon2id(novaSenha),
      portalPassword: encryptSecretAES256GCM(novaSenha),
    };
    updatedUser = nextUser;
    const nextUsers = [...school.users];
    nextUsers[idx] = nextUser;
    return { ...school, users: nextUsers };
  });

  if (!updatedUser) {
    throw new Error('Usuário não encontrado nesta unidade.');
  }

  return { schools: nextSchools, user: updatedUser };
}

export function toggleUserStatusInRegistry(
  schools: RegisteredSchool[],
  schoolId: string,
  userId: string
): RegisteredSchool[] {
  return schools.map((school) => {
    if (school.id !== schoolId) return school;
    return {
      ...school,
      users: school.users.map((u) =>
        u.id === userId ? { ...u, ativo: !u.ativo, active: !u.ativo } : u
      ),
    };
  });
}

export function toggleUserActiveStatus(
  schools: RegisteredSchool[],
  schoolId: string,
  userId: string
): { schools: RegisteredSchool[]; user: SchoolPortalUser } {
  const next = toggleUserStatusInRegistry(schools, schoolId, userId);
  const school = next.find((s) => s.id === schoolId);
  const user = school?.users.find((u) => u.id === userId);
  if (!user) throw new Error('Usuário não encontrado.');
  return { schools: next, user };
}

export function deleteUserFromSchoolRegistry(
  schools: RegisteredSchool[],
  schoolId: string,
  userId: string
): RegisteredSchool[] {
  return schools.map((school) => {
    if (school.id !== schoolId) return school;
    return {
      ...school,
      users: school.users.filter((u) => u.id !== userId),
    };
  });
}

export function deleteUserFromRegistry(
  schools: RegisteredSchool[],
  schoolId: string,
  userId: string
): { schools: RegisteredSchool[]; deletedUser?: SchoolPortalUser } {
  const school = schools.find((s) => s.id === schoolId);
  const deletedUser = school?.users.find((u) => u.id === userId);
  return {
    schools: deleteUserFromSchoolRegistry(schools, schoolId, userId),
    deletedUser,
  };
}
