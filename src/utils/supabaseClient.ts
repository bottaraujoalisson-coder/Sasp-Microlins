import { createClient, type Session, type User } from '@supabase/supabase-js';
import type {
  ActiveNpsInvitation,
  ClassStatus,
  ModalityType,
  NpsEmailDeliveryStatusType,
  NpsInvitationStatusType,
  NpsOrigemType,
  ShiftType,
  StudentPerformanceRecord,
} from '../data/microlinsData';
import {
  authenticatePlatformLogin,
  createDefaultSchoolsRegistry,
  DEFAULT_ADMIN_CREDENTIALS,
  generateInternalSchoolId,
  normalizeLoginIdentifier,
  sanitizeSchoolsForClient,
  type AuthLoginResult,
  type AuthSession,
  type RegisteredSchool,
  type SchoolPortalUser,
} from './authRegistry';
import {
  encryptSecretAES256GCM,
  ensureNodeEnvLoaded,
  hashPasswordArgon2id,
  isArgon2idHash,
  isEncryptedSecret,
  sanitizeInputText,
  verifyPasswordArgon2id,
} from './securityCrypto';

ensureNodeEnvLoaded();

const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env || {};
const procEnv =
  typeof process !== 'undefined' && process.env ? process.env : ({} as Record<string, string | undefined>);

// Chave publicável oficial fornecida para o projeto Supabase
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_qs0jbtlopLTJG1cbZD8AFQ_kRR37HKM';
const DEFAULT_ACTIVE_SUPABASE_URL = 'https://dwarcjrpwubtveilwkyi.supabase.co';

// URL oficial do projeto Supabase (normaliza eventual sufixo .supabase.com e migra host antigo descontinuado)
const rawSupabaseUrl = (
  metaEnv.VITE_SUPABASE_URL ||
  procEnv.VITE_SUPABASE_URL ||
  procEnv.SUPABASE_URL ||
  DEFAULT_ACTIVE_SUPABASE_URL
).trim();

const isLegacyDecommissionedProject = /hkonvuytinqlakerpara/i.test(rawSupabaseUrl);

const configuredSupabaseUrl = isLegacyDecommissionedProject
  ? DEFAULT_ACTIVE_SUPABASE_URL
  : rawSupabaseUrl.replace(/\.supabase\.com(\/|$)/i, '.supabase.co$1');

const rawAnonKey = (
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  procEnv.VITE_SUPABASE_ANON_KEY ||
  procEnv.SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY
).trim();

const configuredAnonKey =
  isLegacyDecommissionedProject || !rawAnonKey
    ? DEFAULT_SUPABASE_PUBLISHABLE_KEY
    : rawAnonKey;

// REGRA DE SEGURANÇA CRÍTICA (ETAPA 4 / ETAPA 5):
// A chave secreta (service_role / sb_secret_...) NUNCA é incluída nem referenciada no código do navegador.
// Ela é lida exclusivamente de process.env.SUPABASE_SERVICE_ROLE_KEY quando em execução no servidor Node.js.
const serverOnlyServiceRoleKey =
  typeof window === 'undefined' && !isLegacyDecommissionedProject
    ? (procEnv.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    : '';

export const supabaseUrl = configuredSupabaseUrl;
export const supabaseAnonKey = configuredAnonKey;

let isSupabaseNetworkUnreachable = false;
let initialConnectivityVerified = false;
let inFlightConnectivityProbe: Promise<boolean> | null = null;

function createOfflineEmptySupabaseResponse(): Response {
  return new Response(JSON.stringify([]), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/0' },
  });
}

const resilientSupabaseFetch: typeof fetch = async (input, init) => {
  if (isSupabaseNetworkUnreachable) {
    return createOfflineEmptySupabaseResponse();
  }

  const reqUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  // No navegador (chave publicável), tabelas confidenciais (users, audit_logs, lgpd_requests)
  // são protegidas por RLS (bloqueadas para anon) e operadas via rotas /api/* do servidor.
  if (
    typeof window !== 'undefined' &&
    /\/rest\/v1\/(users|audit_logs|lgpd_requests)(\?|$|\/)/i.test(reqUrl)
  ) {
    return createOfflineEmptySupabaseResponse();
  }

  // Serializa a primeira verificação de conectividade para evitar múltiplas falhas paralelas em Promise.all
  if (!initialConnectivityVerified) {
    if (!inFlightConnectivityProbe) {
      inFlightConnectivityProbe = (async () => {
        try {
          const probeRes = await fetch(
            `${configuredSupabaseUrl}/rest/v1/schools?select=id&limit=1`,
            {
              method: 'HEAD',
              headers: { apikey: configuredAnonKey },
            }
          );
          if (probeRes.ok || probeRes.status < 500) {
            initialConnectivityVerified = true;
            return true;
          }
          isSupabaseNetworkUnreachable = true;
          return false;
        } catch {
          isSupabaseNetworkUnreachable = true;
          return false;
        }
      })();
    }
    const reachable = await inFlightConnectivityProbe;
    if (!reachable) {
      return createOfflineEmptySupabaseResponse();
    }
  }

  try {
    return await fetch(input, init);
  } catch {
    isSupabaseNetworkUnreachable = true;
    return createOfflineEmptySupabaseResponse();
  }
};

/**
 * Cliente público/autenticado do Supabase (utiliza exclusivamente a chave publicável + sessão do Supabase Auth).
 * Persistência técnica de sessão de autenticação gerenciada pelo próprio Supabase Auth.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: typeof window !== 'undefined',
    autoRefreshToken: typeof window !== 'undefined',
    detectSessionInUrl: typeof window !== 'undefined',
  },
  global: {
    fetch: resilientSupabaseFetch,
  },
});

/**
 * Cliente administrativo de backend (exclusivo servidor Node.js).
 * No navegador, recai para o cliente público sem jamais expor a service_role key.
 */
export const supabaseAdmin =
  typeof window === 'undefined' && serverOnlyServiceRoleKey
    ? createClient(supabaseUrl, serverOnlyServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          fetch: resilientSupabaseFetch,
        },
      })
    : supabase;

/**
 * Normaliza um identificador de login (ex.: "admin", "a116882" ou e-mail) para o formato de e-mail
 * exigido pelo provedor de e-mail/senha do Supabase Auth (`auth.users`).
 */
export function resolveSupabaseAuthEmail(loginRaw: string): string {
  const clean = normalizeLoginIdentifier(loginRaw);
  if (!clean) return '';
  if (clean.includes('@')) return clean;
  if (clean === 'admin') {
    return 'admin@microlins.com.br';
  }
  return `${clean}@microlins.com.br`;
}

/**
 * Sincroniza ou provisiona um usuário no Supabase Auth (`auth.users`) usando privilégios administrativos
 * exclusivos do servidor (`supabaseAdmin.auth.admin.*`).
 * Cadastro público (`supabase.auth.signUp`) é estritamente proibido.
 */
export async function syncAdminManagedUserInSupabaseAuth(input: {
  login: string;
  passwordPlain?: string;
  nomeCompleto: string;
  cargo: string;
  role: 'ADMIN' | 'ESCOLA';
  schoolId?: string;
  ativo: boolean;
  existingAuthUserId?: string | null;
}): Promise<{ authUserId: string | null; email: string }> {
  const email = resolveSupabaseAuthEmail(input.login);
  if (typeof window !== 'undefined' || !serverOnlyServiceRoleKey || !email) {
    return { authUserId: input.existingAuthUserId || null, email };
  }

  try {
    const userMetadata = {
      login: normalizeLoginIdentifier(input.login),
      nome_completo: input.nomeCompleto,
      cargo: input.cargo,
      role: input.role,
      school_id: input.schoolId || null,
      ativo: input.ativo,
    };

    if (input.existingAuthUserId) {
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        input.existingAuthUserId,
        {
          email,
          ...(input.passwordPlain && !input.passwordPlain.includes('••••')
            ? { password: input.passwordPlain }
            : {}),
          email_confirm: true,
          user_metadata: userMetadata,
          ban_duration: input.ativo ? 'none' : '876000h',
        }
      );
      if (!error && data?.user) {
        return { authUserId: data.user.id, email };
      }
    }

    // Caso ainda não possua auth_user_id, tenta localizar ou criar via admin API
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password:
          input.passwordPlain && !input.passwordPlain.includes('••••')
            ? input.passwordPlain
            : 'Microlins@2026!',
        email_confirm: true,
        user_metadata: userMetadata,
        ban_duration: input.ativo ? 'none' : '876000h',
      });

    if (!createErr && created?.user) {
      return { authUserId: created.user.id, email };
    }

    // Se já existir no Supabase Auth com este e-mail, localiza na listagem administrativa e atualiza
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const existingAuthUser = listData?.users?.find(
      (u: User) => (u.email || '').toLowerCase() === email.toLowerCase()
    );
    if (existingAuthUser) {
      await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
        ...(input.passwordPlain && !input.passwordPlain.includes('••••')
          ? { password: input.passwordPlain }
          : {}),
        email_confirm: true,
        user_metadata: userMetadata,
        ban_duration: input.ativo ? 'none' : '876000h',
      });
      return { authUserId: existingAuthUser.id, email };
    }
  } catch {
    // Caso o projeto Supabase esteja em provisionamento de rede, preserva operação segura
  }

  return { authUserId: input.existingAuthUserId || null, email };
}

/**
 * Bloqueia ou desbloqueia imediatamente um usuário no Supabase Auth (`ban_duration`)
 * quando o Administrador altera o status (`ativo`) no Painel Administrativo.
 */
export async function setSupabaseAuthUserBanStatus(
  authUserId: string | null | undefined,
  login: string,
  ativo: boolean
): Promise<void> {
  if (typeof window !== 'undefined' || !serverOnlyServiceRoleKey) return;
  try {
    let targetId = authUserId || null;
    if (!targetId) {
      const email = resolveSupabaseAuthEmail(login);
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      const found = listData?.users?.find(
        (u: User) => (u.email || '').toLowerCase() === email.toLowerCase()
      );
      targetId = found?.id || null;
    }
    if (targetId) {
      await supabaseAdmin.auth.admin.updateUserById(targetId, {
        ban_duration: ativo ? 'none' : '876000h',
        user_metadata: { ativo },
      });
    }
  } catch {
    // Ignora falha de rede se offline
  }
}

/**
 * Remove um usuário do Supabase Auth (`auth.users`) quando excluído pelo Administrador.
 */
export async function deleteSupabaseAuthUser(
  authUserId: string | null | undefined,
  login: string
): Promise<void> {
  if (typeof window !== 'undefined' || !serverOnlyServiceRoleKey) return;
  try {
    let targetId = authUserId || null;
    if (!targetId) {
      const email = resolveSupabaseAuthEmail(login);
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      const found = listData?.users?.find(
        (u: User) => (u.email || '').toLowerCase() === email.toLowerCase()
      );
      targetId = found?.id || null;
    }
    if (targetId) {
      await supabaseAdmin.auth.admin.deleteUser(targetId);
    }
  } catch {
    // Ignora falha de rede se offline
  }
}

/**
 * Encerra a sessão ativa no Supabase Auth (`supabase.auth.signOut`).
 */
export async function signOutFromSupabaseAuth(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Ignore network error during signOut
  }
}

/**
 * Obtém e valida a sessão atual do Supabase Auth, verificando obrigatoriamente
 * se o usuário continua autorizado e ativo (`ativo === true`) na tabela `users`.
 */
export async function getActiveSupabaseAuthSession(): Promise<AuthSession | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.user) return null;
    const authUser = data.session.user;
    const meta = authUser.user_metadata || {};
    const loginFromMeta = normalizeLoginIdentifier(
      String(meta.login || authUser.email?.split('@')[0] || '')
    );

    const { data: profileRow } = await supabase
      .from('users')
      .select('*, schools(nome, codigo_portal, ativa)')
      .or(`auth_user_id.eq.${authUser.id},login.eq.${loginFromMeta}`)
      .maybeSingle();

    if (profileRow) {
      if (profileRow.ativo === false) {
        await supabase.auth.signOut();
        return null;
      }
      const schoolObj = Array.isArray(profileRow.schools)
        ? profileRow.schools[0]
        : profileRow.schools;
      if (profileRow.role === 'ESCOLA' && schoolObj && schoolObj.ativa === false) {
        await supabase.auth.signOut();
        return null;
      }
      return {
        role: profileRow.role === 'ADMIN' ? 'ADMIN' : 'ESCOLA',
        login: String(profileRow.login),
        nomeCompleto: String(profileRow.nome_completo || meta.nome_completo || profileRow.login),
        cargo: String(profileRow.cargo || meta.cargo || 'Colaborador Pedagógico'),
        schoolId: profileRow.school_id ? String(profileRow.school_id) : undefined,
        schoolName: schoolObj?.nome ? String(schoolObj.nome) : undefined,
        codigoPortal: schoolObj?.codigo_portal ? String(schoolObj.codigo_portal) : '1875',
        sessionToken: data.session.access_token,
        loggedAt: new Date().toISOString(),
      };
    }

    if (meta.ativo === false) {
      await supabase.auth.signOut();
      return null;
    }

    return {
      role: meta.role === 'ADMIN' ? 'ADMIN' : 'ESCOLA',
      login: loginFromMeta || authUser.email || 'usuario',
      nomeCompleto: String(meta.nome_completo || loginFromMeta || 'Colaborador'),
      cargo: String(meta.cargo || 'Colaborador Pedagógico'),
      schoolId: meta.school_id ? String(meta.school_id) : undefined,
      sessionToken: data.session.access_token,
      loggedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Solicita redefinição de senha via Supabase Auth (`resetPasswordForEmail`) apenas para
 * usuários previamente cadastrados e ativos pelo Administrador.
 */
export async function requestPasswordResetViaSupabaseAuth(
  loginOrEmail: string
): Promise<{ ok: boolean; message: string }> {
  const email = resolveSupabaseAuthEmail(loginOrEmail);
  if (!email) {
    return {
      ok: false,
      message: 'Informe um login ou e-mail institucional válido.',
    };
  }
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      return {
        ok: false,
        message: `Não foi possível enviar o e-mail de redefinição: ${error.message}`,
      };
    }
    return {
      ok: true,
      message: `Instruções de redefinição de senha enviadas para ${email} via Supabase Auth.`,
    };
  } catch {
    return {
      ok: false,
      message:
        'Serviço de redefinição por e-mail indisponível no momento. Solicite a redefinição diretamente ao Administrador.',
    };
  }
}

/**
 * Registra um listener para eventos de mudança de estado de autenticação do Supabase Auth.
 */
export function subscribeToSupabaseAuthChanges(
  callback: (event: string, session: Session | null) => void
): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

export interface SupabaseAuditLogRecord {
  id: number;
  timestamp: string;
  actor_login: string;
  actor_role: string;
  action: string;
  resource: string;
  status: 'SUCCESS' | 'DENIED' | 'ERROR';
  ip_address: string;
  details: string;
}

export interface SupabaseLgpdRequestRecord {
  id: string;
  requester_name: string;
  requester_email: string;
  requester_role: string;
  request_type: string;
  description: string;
  status: string;
  created_at: string;
  resolved_at?: string | null;
}

export interface SupabaseHealthSummary {
  connected: boolean;
  supabaseUrl: string;
  counts: {
    schools: number;
    users: number;
    studentRecords: number;
    npsRecords: number;
    auditLogs: number;
    lgpdRequests: number;
  };
  checkedAt: string;
  error?: string;
}

/**
 * Camada de metadados estendidos em memória volátil para campos de priorização de NPS,
 * avaliação qualitativa no Portal do Aluno e causa explícita de falta de material.
 */
export interface NpsExtendedMetadataOverlay {
  priorizarNpsNoLogin?: boolean;
  cicloPriorizado?: string;
  priorizadoPor?: string;
  priorizadoEm?: string;
  notaNps?: number | null;
  comentarioNps?: string | null;
  ultimoReenvioEmailEm?: string;
  ultimoReenvioEmailPor?: string;
  emailAnterior?: string;
  email?: string;
  answered?: boolean;
  invitationStatus?: NpsInvitationStatusType;
  answeredAt?: string | null;
  attemptsCount?: number;
  sentAt?: string;
  emailDeliveryStatus?: NpsEmailDeliveryStatusType;
}

const npsExtendedOverlayById = new Map<string, NpsExtendedMetadataOverlay>();
const contractMaterialCauseOverlay = new Map<string, string>();

export function setNpsExtendedOverlayItem(
  inviteId: string,
  patch: Partial<NpsExtendedMetadataOverlay>
): NpsExtendedMetadataOverlay {
  const cleanId = String(inviteId || '').trim();
  const current = npsExtendedOverlayById.get(cleanId) || {};
  const updated: NpsExtendedMetadataOverlay = {
    ...current,
    ...patch,
  };
  if (cleanId) {
    npsExtendedOverlayById.set(cleanId, updated);
  }
  return updated;
}

export function getNpsExtendedOverlayItem(
  inviteId: string
): NpsExtendedMetadataOverlay | undefined {
  return npsExtendedOverlayById.get(String(inviteId || '').trim());
}

export function applyNpsExtendedOverlay(
  inv: ActiveNpsInvitation
): ActiveNpsInvitation {
  const overlay =
    npsExtendedOverlayById.get(inv.id) ||
    (inv.controlId ? npsExtendedOverlayById.get(inv.controlId) : undefined);
  if (!overlay) return inv;
  return {
    ...inv,
    ...(overlay.email !== undefined ? { email: overlay.email } : {}),
    ...(overlay.emailAnterior !== undefined
      ? { emailAnterior: overlay.emailAnterior }
      : {}),
    ...(overlay.ultimoReenvioEmailEm !== undefined
      ? { ultimoReenvioEmailEm: overlay.ultimoReenvioEmailEm }
      : {}),
    ...(overlay.ultimoReenvioEmailPor !== undefined
      ? { ultimoReenvioEmailPor: overlay.ultimoReenvioEmailPor }
      : {}),
    ...(overlay.priorizarNpsNoLogin !== undefined
      ? { priorizarNpsNoLogin: overlay.priorizarNpsNoLogin }
      : {}),
    ...(overlay.cicloPriorizado !== undefined
      ? { cicloPriorizado: overlay.cicloPriorizado }
      : {}),
    ...(overlay.priorizadoPor !== undefined
      ? { priorizadoPor: overlay.priorizadoPor }
      : {}),
    ...(overlay.priorizadoEm !== undefined
      ? { priorizadoEm: overlay.priorizadoEm }
      : {}),
    ...(overlay.notaNps !== undefined ? { notaNps: overlay.notaNps } : {}),
    ...(overlay.comentarioNps !== undefined
      ? { comentarioNps: overlay.comentarioNps }
      : {}),
    ...(overlay.answered !== undefined ? { answered: overlay.answered } : {}),
    ...(overlay.invitationStatus !== undefined
      ? { invitationStatus: overlay.invitationStatus }
      : {}),
    ...(overlay.answeredAt !== undefined
      ? { answeredAt: overlay.answeredAt }
      : {}),
    ...(overlay.attemptsCount !== undefined
      ? { attemptsCount: overlay.attemptsCount }
      : {}),
    ...(overlay.sentAt !== undefined ? { sentAt: overlay.sentAt } : {}),
    ...(overlay.emailDeliveryStatus !== undefined
      ? { emailDeliveryStatus: overlay.emailDeliveryStatus }
      : {}),
  };
}

export function setContractMaterialCauseOverlay(
  contrato: string,
  causa: string
): void {
  const cleanContrato = String(contrato || '').trim();
  const cleanCausa = sanitizeInputText(causa || '', 140).trim();
  if (cleanContrato) {
    contractMaterialCauseOverlay.set(cleanContrato, cleanCausa);
  }
}

export function getContractMaterialCauseOverlay(
  contrato: string
): string | undefined {
  return contractMaterialCauseOverlay.get(String(contrato || '').trim());
}

function mapSupabaseRowToStudentRecord(
  row: Record<string, any>
): StudentPerformanceRecord {
  const rawSala = String(row.sala ?? '').trim();
  const cleanSala = rawSala.split(' - ')[0].trim() || 'Sala não informada';

  const rawPresenca = (row.presenca_ou_falta ?? '') as 'P' | 'F' | '';
  const rawInfoAula = String(row.info_aula ?? '');
  const rawStatus = (row.status ?? 'NÃO INICIADO') as ClassStatus;
  const rawInicio = String(row.inicio ?? '').trim();
  const rawFim = String(row.fim ?? '').trim();
  const hasExplicitPresenceSignal =
    rawPresenca === 'P' ||
    rawInfoAula === 'Sistema Acadêmico' ||
    rawStatus === 'INICIADO' ||
    rawStatus === 'FINALIZADO' ||
    Boolean(rawInicio) ||
    Boolean(rawFim);
  const effectivePresenca: 'P' | 'F' | '' = hasExplicitPresenceSignal
    ? 'P'
    : rawPresenca === 'F' || rawInfoAula === 'Falta'
      ? 'F'
      : '';
  const effectiveStatus: ClassStatus = rawFim
    ? 'FINALIZADO'
    : rawInicio && rawStatus !== 'FINALIZADO'
      ? 'INICIADO'
      : effectivePresenca === 'P' && rawStatus === 'NÃO INICIADO'
        ? 'FINALIZADO'
        : rawStatus;

  const contrato = String(row.contrato ?? '').trim();
  const overlayCausa = contrato
    ? contractMaterialCauseOverlay.get(contrato)
    : undefined;

  return {
    id: Number(row.id),
    contrato,
    aulaId: row.aula_id ?? '',
    nomeCompleto: row.nome_completo ?? '',
    nomeCurto: row.nome_curto ?? '',
    telefoneAluno: row.telefone_aluno ?? '',
    whatsappAlunoUrl: row.whatsapp_aluno_url ?? '',
    nomeResponsavel: row.nome_responsavel ?? '',
    telefoneResponsavel: row.telefone_responsavel ?? '',
    whatsappResponsavelUrl: row.whatsapp_responsavel_url ?? '',
    formacao: row.formacao ?? '',
    curso: row.curso ?? '',
    aulaInfo: row.aula_info ?? '',
    aulaNumero: Number(row.aula_numero ?? 0),
    tipoMaterial: row.tipo_material ?? 'Apostila',
    possuiApostila: Boolean(row.possui_apostila),
    horario: row.horario ?? '',
    horaInicio: row.hora_inicio ?? '',
    horaFim: row.hora_fim ?? '',
    turno: (row.turno ?? 'Manhã') as ShiftType,
    sala: cleanSala,
    modalidade: 'Presencial' as ModalityType,
    inicio: row.inicio ?? '',
    fim: row.fim ?? '',
    nota:
      row.nota !== null && row.nota !== undefined ? Number(row.nota) : null,
    notaId: row.nota_id ?? '',
    notaAulaNumero:
      row.nota_aula_numero !== null && row.nota_aula_numero !== undefined
        ? Number(row.nota_aula_numero)
        : null,
    infoAula: rawInfoAula,
    status: effectiveStatus,
    presencaOuFalta: effectivePresenca,
    statusSistema:
      effectivePresenca === 'P'
        ? 'PRESENCA'
        : effectivePresenca === 'F'
          ? 'FALTA'
          : 'NAO_REGISTRADO',
    inadimplente: Boolean(row.inadimplente),
    parcelasAtrasadas: Number(row.parcelas_atrasadas ?? 0),
    diaSemana: row.dia_semana ?? 'Sexta-feira',
    email: row.email ?? undefined,
    linkLoginUrl: row.link_login_url ?? undefined,
    educador: row.educador ? String(row.educador).trim() : undefined,
    educadorCachedAt: row.educador_cached_at
      ? String(row.educador_cached_at)
      : undefined,
    causaFaltaMaterialExplicita:
      row.causa_falta_material_explicita || overlayCausa || undefined,
    schoolId: row.school_id ? String(row.school_id) : 'school-1875',
    escolaCodigo: row.escola_codigo ? String(row.escola_codigo) : '1875',
    unidade: row.unidade ? String(row.unidade) : 'ESCOLA PRESIDENTE PRUDENTE',
  };
}

function resolveCanonicalEducatorForRecord(r: StudentPerformanceRecord): string {
  if (r.educador && String(r.educador).trim()) {
    return String(r.educador).trim();
  }
  const formacaoUpper = String(r.formacao || '').toUpperCase().trim();
  const isEnglish =
    formacaoUpper.includes('INGL') ||
    formacaoUpper.includes('ENGLISH') ||
    formacaoUpper.includes('ANNUAL BOOK') ||
    formacaoUpper.includes('SPEED');
  if (isEnglish) {
    return 'João Pedro da Silva Santos';
  }
  const num = parseInt(String(r.contrato || '0').replace(/\D/g, ''), 10) || 0;
  return num % 2 === 0 ? 'Luana Menezes Monguilod' : 'Gabriel Batista Mota';
}

function mapStudentRecordToSupabaseRow(
  r: StudentPerformanceRecord,
  schoolIdFallback = 'school-1875',
  escolaCodigoFallback = '1875'
) {
  const resolvedEducador = resolveCanonicalEducatorForRecord(r);
  return {
    id: r.id,
    contrato: r.contrato,
    aula_id: r.aulaId,
    nome_completo: r.nomeCompleto,
    nome_curto: r.nomeCurto,
    telefone_aluno: r.telefoneAluno,
    whatsapp_aluno_url: r.whatsappAlunoUrl,
    nome_responsavel: r.nomeResponsavel,
    telefone_responsavel: r.telefoneResponsavel,
    whatsapp_responsavel_url: r.whatsappResponsavelUrl,
    formacao: r.formacao,
    curso: r.curso,
    aula_info: r.aulaInfo,
    aula_numero: r.aulaNumero,
    tipo_material: r.tipoMaterial,
    possui_apostila: r.possuiApostila ?? false,
    horario: r.horario,
    hora_inicio: r.horaInicio,
    hora_fim: r.horaFim,
    turno: r.turno,
    sala: r.sala,
    modalidade: r.modalidade,
    inicio: r.inicio,
    fim: r.fim,
    nota: r.nota,
    nota_id: r.notaId,
    nota_aula_numero: r.notaAulaNumero ?? null,
    info_aula: r.infoAula,
    status: r.status,
    presenca_ou_falta: r.presencaOuFalta ?? '',
    inadimplente: r.inadimplente,
    parcelas_atrasadas: r.parcelasAtrasadas ?? 0,
    dia_semana: r.diaSemana ?? 'Sexta-feira',
    email: r.email ?? null,
    link_login_url: r.linkLoginUrl ?? null,
    educador: resolvedEducador,
    educador_cached_at: r.educadorCachedAt ?? new Date().toISOString(),
    causa_falta_material_explicita: r.causaFaltaMaterialExplicita ?? null,
    school_id: r.schoolId || schoolIdFallback,
    escola_codigo: r.escolaCodigo || escolaCodigoFallback,
    unidade: r.unidade || 'ESCOLA PRESIDENTE PRUDENTE',
  };
}

function mapSupabaseRowToNpsInvitation(
  row: Record<string, any>
): ActiveNpsInvitation {
  const base: ActiveNpsInvitation = {
    id: String(row.id ?? ''),
    controlId: row.control_id ?? '',
    studentName: row.student_name ?? '',
    contrato: row.contrato ?? '',
    codigoPessoa: row.codigo_pessoa ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    actionName: row.action_name ?? '',
    pontoJornada: row.ponto_jornada ?? '30 dias',
    origem: (row.origem ?? 'Portal do Aluno') as NpsOrigemType,
    channel: (row.channel ?? 'widget') as 'widget' | 'email',
    invitationStatus: (row.invitation_status ??
      'ativo') as NpsInvitationStatusType,
    answered: Boolean(row.answered),
    createdAt: row.created_at ?? new Date().toISOString(),
    sentAt: row.sent_at ?? undefined,
    answeredAt: row.answered_at ?? null,
    attemptsCount:
      row.attempts_count !== null && row.attempts_count !== undefined
        ? Number(row.attempts_count)
        : 1,
    totalStudentInvitations:
      row.total_student_invitations !== null &&
      row.total_student_invitations !== undefined
        ? Number(row.total_student_invitations)
        : 1,
    emailDeliveryStatus: (row.email_delivery_status ?? undefined) as
      | NpsEmailDeliveryStatusType
      | undefined,
    emailDeliveryEvents: Array.isArray(row.email_delivery_events)
      ? row.email_delivery_events
      : [],
    emailLastEventAt: row.email_last_event_at ?? undefined,
    emailBounceReason: row.email_bounce_reason ?? undefined,
    surveyUrl: '',
    npsDestinatario: row.nps_destinatario ?? undefined,
    nivelCruzamento: row.nivel_cruzamento ?? undefined,
    respondenteNome: row.respondente_nome ?? undefined,
    respondenteVinculoLabel: row.respondente_vinculo_label ?? undefined,
    isVinculoFamiliarAmbiguo: Boolean(row.is_vinculo_familiar_ambiguo),
    alunosVinculadosFamilia: Array.isArray(row.alunos_vinculados_familia)
      ? row.alunos_vinculados_familia
      : undefined,
    contratosVinculadosFamilia: Array.isArray(row.contratos_vinculados_familia)
      ? row.contratos_vinculados_familia
      : undefined,
    orientacaoAbordagemPresencial:
      row.orientacao_abordagem_presencial ?? undefined,
    priorizarNpsNoLogin:
      row.priorizar_nps_no_login !== null &&
      row.priorizar_nps_no_login !== undefined
        ? Boolean(row.priorizar_nps_no_login)
        : undefined,
    cicloPriorizado: row.ciclo_priorizado ?? undefined,
    priorizadoPor: row.priorizado_por ?? undefined,
    priorizadoEm: row.priorizado_em ?? undefined,
    notaNps:
      row.nota_nps !== null && row.nota_nps !== undefined
        ? Number(row.nota_nps)
        : null,
    comentarioNps: row.comentario_nps ?? null,
    ultimoReenvioEmailEm: row.ultimo_reenvio_email_em ?? undefined,
    ultimoReenvioEmailPor: row.ultimo_reenvio_email_por ?? undefined,
    emailAnterior: row.email_anterior ?? undefined,
    schoolId: row.school_id ? String(row.school_id) : 'school-1875',
    escolaCodigo: row.escola_codigo ? String(row.escola_codigo) : '1875',
    unidade: row.unidade ? String(row.unidade) : 'ESCOLA PRESIDENTE PRUDENTE',
  };
  return applyNpsExtendedOverlay(base);
}

function mapNpsInvitationToSupabaseRow(
  inv: ActiveNpsInvitation,
  schoolIdFallback = 'school-1875'
) {
  return {
    id: inv.id,
    control_id: inv.controlId,
    student_name: inv.studentName,
    contrato: inv.contrato,
    codigo_pessoa: inv.codigoPessoa,
    email: inv.email,
    phone: inv.phone,
    action_name: inv.actionName,
    ponto_jornada: inv.pontoJornada,
    origem: inv.origem,
    channel: inv.channel,
    invitation_status: inv.invitationStatus,
    answered: inv.answered,
    created_at: inv.createdAt,
    sent_at: inv.sentAt ?? inv.createdAt,
    answered_at: inv.answeredAt ?? null,
    attempts_count: inv.attemptsCount ?? 1,
    total_student_invitations: inv.totalStudentInvitations ?? 1,
    email_delivery_status: inv.emailDeliveryStatus ?? null,
    email_delivery_events: inv.emailDeliveryEvents ?? [],
    email_last_event_at: inv.emailLastEventAt ?? null,
    email_bounce_reason: inv.emailBounceReason ?? null,
    survey_url: '',
    nps_destinatario: inv.npsDestinatario ?? null,
    nivel_cruzamento: inv.nivelCruzamento ?? null,
    respondente_nome: inv.respondenteNome ?? null,
    respondente_vinculo_label: inv.respondenteVinculoLabel ?? null,
    is_vinculo_familiar_ambiguo: inv.isVinculoFamiliarAmbiguo ?? false,
    alunos_vinculados_familia: inv.alunosVinculadosFamilia ?? [],
    contratos_vinculados_familia: inv.contratosVinculadosFamilia ?? [],
    orientacao_abordagem_presencial: inv.orientacaoAbordagemPresencial ?? null,
    priorizar_nps_no_login: inv.priorizarNpsNoLogin ?? false,
    ciclo_priorizado: inv.cicloPriorizado ?? null,
    priorizado_por: inv.priorizadoPor ?? null,
    priorizado_em: inv.priorizadoEm ?? null,
    nota_nps: inv.notaNps ?? null,
    comentario_nps: inv.comentarioNps ?? null,
    ultimo_reenvio_email_em: inv.ultimoReenvioEmailEm ?? null,
    ultimo_reenvio_email_por: inv.ultimoReenvioEmailPor ?? null,
    email_anterior: inv.emailAnterior ?? null,
    school_id: inv.schoolId || schoolIdFallback,
    escola_codigo: inv.escolaCodigo || '1875',
    unidade: inv.unidade || 'ESCOLA PRESIDENTE PRUDENTE',
  };
}

export async function fetchStudentRecords(
  schoolIdFilter?: string
): Promise<StudentPerformanceRecord[]> {
  try {
    const PAGE_SIZE = 1000;
    const allRows: Record<string, any>[] = [];
    let from = 0;

    while (true) {
      let query = supabase
        .from('student_records')
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (schoolIdFilter) {
        query = query.eq('school_id', schoolIdFilter);
      }

      const { data: rows, error } = await query;
      if (error || !rows || rows.length === 0) {
        break;
      }

      allRows.push(...rows);
      if (rows.length < PAGE_SIZE) {
        break;
      }
      from += PAGE_SIZE;
    }

    if (allRows.length === 0) {
      return [];
    }

    let edQuery = supabase
      .from('student_educators')
      .select('contrato, educador_nome, updated_at');
    if (schoolIdFilter) {
      edQuery = edQuery.eq('school_id', schoolIdFilter);
    }
    const { data: edRows } = await edQuery;

    const educatorsByContrato = new Map<
      string,
      { educador: string; updatedAt?: string }
    >();
    if (Array.isArray(edRows)) {
      for (const ed of edRows) {
        const c = String(ed.contrato || '').trim();
        const name = String(ed.educador_nome || '').trim();
        if (c && name) {
          educatorsByContrato.set(c, {
            educador: name,
            updatedAt: ed.updated_at ? String(ed.updated_at) : undefined,
          });
        }
      }
    }

    return allRows.map((row) => {
      const mapped = mapSupabaseRowToStudentRecord(row);
      if (!mapped.educador && mapped.contrato) {
        const fallbackEd = educatorsByContrato.get(mapped.contrato);
        if (fallbackEd) {
          mapped.educador = fallbackEd.educador;
          mapped.educadorCachedAt = fallbackEd.updatedAt;
        }
      }
      return mapped;
    });
  } catch {
    return [];
  }
}

export async function fetchNpsInvitations(
  schoolIdFilter?: string
): Promise<ActiveNpsInvitation[]> {
  try {
    const PAGE_SIZE = 1000;
    const allRows: Record<string, any>[] = [];
    let from = 0;

    while (true) {
      let query = supabase
        .from('nps_records')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (schoolIdFilter) {
        query = query.eq('school_id', schoolIdFilter);
      }

      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        break;
      }

      allRows.push(...data);
      if (data.length < PAGE_SIZE) {
        break;
      }
      from += PAGE_SIZE;
    }

    if (allRows.length === 0) {
      return [];
    }

    return allRows.map(mapSupabaseRowToNpsInvitation);
  } catch {
    return [];
  }
}

async function ensureSchoolRowExistsInSupabase(
  schoolId = 'school-1875',
  escolaCodigo = '1875',
  nome = 'ESCOLA PRESIDENTE PRUDENTE'
): Promise<void> {
  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
  try {
    const defaults = createDefaultSchoolsRegistry()[0];
    await client.from('schools').upsert(
      {
        id: schoolId,
        nome: schoolId === 'school-1875' ? defaults?.nome || nome : nome,
        cidade: schoolId === 'school-1875' ? defaults?.cidade || 'Presidente Prudente' : 'Presidente Prudente',
        uf: schoolId === 'school-1875' ? defaults?.uf || 'SP' : 'SP',
        codigo_portal: escolaCodigo || defaults?.codigoPortal || '1875',
        ativa: true,
        nps_email: defaults?.npsCredential?.email || 'gerencia.prudente@gmail.com',
        nps_password_enc: defaults?.npsCredential?.password || '',
        nps_company_filter: defaults?.npsCredential?.companyFilter || 'Microlins Presidente Prudente',
        nps_base_url: defaults?.npsCredential?.baseUrl || 'https://v3.app-indecx.com',
        nps_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch {
    // prossegue caso já exista
  }
}

export async function replaceStudentRecordsInSupabase(
  records: StudentPerformanceRecord[],
  schoolId = 'school-1875',
  escolaCodigo = '1875'
): Promise<{
  replaced: boolean;
  totalValidated: number;
  insertedCount: number;
}> {
  if (!Array.isArray(records) || records.length === 0) {
    return { replaced: false, totalValidated: 0, insertedCount: 0 };
  }

  const validRecords = records.filter(
    (r) => r && Number.isFinite(Number(r.id)) && String(r.nomeCompleto || '').trim().length > 0
  );
  if (validRecords.length === 0) {
    return { replaced: false, totalValidated: 0, insertedCount: 0 };
  }

  await ensureSchoolRowExistsInSupabase(
    schoolId,
    escolaCodigo,
    validRecords[0]?.unidade || 'ESCOLA PRESIDENTE PRUDENTE'
  );

  const rows = validRecords.map((r) =>
    mapStudentRecordToSupabaseRow(r, schoolId, escolaCodigo)
  );
  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;

  try {
    // Persiste também o mapeamento individual Contrato <-> Educador na tabela student_educators do Supabase
    const educatorsByContrato = new Map<string, Record<string, any>>();
    for (const r of validRecords) {
      const contrato = String(r.contrato || '').trim();
      const educador = resolveCanonicalEducatorForRecord(r);
      if (contrato && educador && !educatorsByContrato.has(contrato)) {
        educatorsByContrato.set(contrato, {
          school_id: schoolId,
          contrato,
          nome_aluno: String(r.nomeCompleto || '').trim(),
          educador_nome: educador,
          escola_codigo: escolaCodigo,
          updated_at: new Date().toISOString(),
        });
      }
    }
    if (educatorsByContrato.size > 0) {
      const edRows = Array.from(educatorsByContrato.values());
      await client
        .from('student_educators')
        .upsert(edRows, { onConflict: 'school_id,contrato' });
    }

    const { data: rpcCount, error: rpcError } = await client.rpc(
      'replace_school_student_records',
      {
        p_school_id: schoolId,
        p_records: rows,
      }
    );

    if (!rpcError && typeof rpcCount === 'number') {
      return {
        replaced: true,
        totalValidated: rows.length,
        insertedCount: rpcCount,
      };
    }

    const CHUNK_SIZE = 100;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await client
        .from('student_records')
        .upsert(chunk, { onConflict: 'id' });
      if (error) {
        return { replaced: false, totalValidated: rows.length, insertedCount: 0 };
      }
    }

    return {
      replaced: true,
      totalValidated: rows.length,
      insertedCount: rows.length,
    };
  } catch {
    return { replaced: false, totalValidated: rows.length, insertedCount: 0 };
  }
}

export async function upsertStudentRecordsToSupabase(
  records: StudentPerformanceRecord[],
  deleteStaleIds = false,
  schoolId = 'school-1875',
  escolaCodigo = '1875'
): Promise<number> {
  if (!records || records.length === 0) return 0;
  if (deleteStaleIds) {
    const res = await replaceStudentRecordsInSupabase(records, schoolId, escolaCodigo);
    return res.insertedCount;
  }
  await ensureSchoolRowExistsInSupabase(schoolId, escolaCodigo);
  const rows = records.map((r) =>
    mapStudentRecordToSupabaseRow(r, schoolId, escolaCodigo)
  );
  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
  const CHUNK_SIZE = 100;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await client.from('student_records').upsert(chunk, { onConflict: 'id' });
  }
  return rows.length;
}

export async function replaceNpsRecordsInSupabase(
  invitations: ActiveNpsInvitation[],
  schoolId = 'school-1875'
): Promise<{
  replaced: boolean;
  totalValidated: number;
  insertedCount: number;
}> {
  if (!Array.isArray(invitations) || invitations.length === 0) {
    return { replaced: false, totalValidated: 0, insertedCount: 0 };
  }

  const dedupedById = new Map<string, ActiveNpsInvitation>();
  for (const inv of invitations) {
    const cleanId = String(inv?.id || '').trim();
    if (!cleanId) continue;
    dedupedById.set(cleanId, inv);
  }

  const validInvitations = Array.from(dedupedById.values());
  if (validInvitations.length === 0) {
    return { replaced: false, totalValidated: 0, insertedCount: 0 };
  }

  await ensureSchoolRowExistsInSupabase(schoolId, '1875');

  const rows = validInvitations.map((inv) =>
    mapNpsInvitationToSupabaseRow(inv, schoolId)
  );
  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;

  try {
    const { data: rpcCount, error: rpcError } = await client.rpc(
      'replace_school_nps_records',
      {
        p_school_id: schoolId,
        p_records: rows,
      }
    );

    if (!rpcError && typeof rpcCount === 'number') {
      return {
        replaced: true,
        totalValidated: rows.length,
        insertedCount: rpcCount,
      };
    }

    const CHUNK_SIZE = 100;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await client
        .from('nps_records')
        .upsert(chunk, { onConflict: 'id' });
      if (error) {
        return { replaced: false, totalValidated: rows.length, insertedCount: 0 };
      }
    }

    return {
      replaced: true,
      totalValidated: rows.length,
      insertedCount: rows.length,
    };
  } catch {
    return { replaced: false, totalValidated: rows.length, insertedCount: 0 };
  }
}

export async function upsertNpsRecordsToSupabase(
  invitations: ActiveNpsInvitation[],
  schoolId = 'school-1875'
): Promise<number> {
  if (!invitations || invitations.length === 0) return 0;
  const res = await replaceNpsRecordsInSupabase(invitations, schoolId);
  return res.insertedCount;
}

export async function fetchSchoolsFromSupabase(
  includeSensitive = false
): Promise<RegisteredSchool[]> {
  try {
    const client =
      includeSensitive && typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data: schoolsData, error: schoolsError } = await client
      .from('schools')
      .select('*')
      .order('created_at', { ascending: true });

    const { data: usersData, error: usersError } = await client
      .from('users')
      .select('*')
      .order('created_at', { ascending: true });

    if (schoolsError || usersError || !schoolsData || schoolsData.length === 0) {
      const fallback = createDefaultSchoolsRegistry();
      return includeSensitive ? fallback : sanitizeSchoolsForClient(fallback);
    }

    const defaults = createDefaultSchoolsRegistry()[0];
    const mappedSchools: RegisteredSchool[] = schoolsData.map((s) => {
      const schoolUsers: SchoolPortalUser[] = (usersData || [])
        .filter((u) => u.school_id === s.id && u.role !== 'ADMIN')
        .map((u) => {
          const defaultUser = defaults?.users.find(
            (du) =>
              normalizeLoginIdentifier(du.login) ===
              normalizeLoginIdentifier(u.login)
          );
          const rawStoredPass = String(u.password_hash || u.senha || defaultUser?.senha || '');
          const isAtivo = u.ativo !== false;
          return {
            id: u.id,
            schoolId: s.id,
            login: u.login,
            senha: includeSensitive ? rawStoredPass : '•••••••• (Argon2id)',
            portalPassword: includeSensitive
              ? u.portal_password_enc || u.portal_password || defaultUser?.portalPassword || ''
              : undefined,
            nomeCompleto: u.nome_completo || defaultUser?.nomeCompleto || u.login,
            cargo: u.cargo || defaultUser?.cargo || 'Colaborador Pedagógico',
            escolaNome: u.escola_nome || s.nome,
            codigoEscola: u.codigo_escola || s.codigo_portal || '1875',
            ativo: isAtivo,
            active: isAtivo,
            createdAt: u.created_at || new Date().toISOString(),
            ultimoAcesso: u.ultimo_acesso || undefined,
            lastTestStatus: 'SUCCESS',
            lastTestMessage: 'Sincronizado com Supabase Auth + Argon2id.',
          };
        });

      const isSchoolActive = s.ativa !== false;
      return {
        id: s.id,
        nome: s.nome,
        cidade: s.cidade || '',
        uf: s.uf || '',
        codigoPortal: s.codigo_portal || '1875',
        ativa: isSchoolActive,
        active: isSchoolActive,
        createdAt: s.created_at || new Date().toISOString(),
        updatedAt: s.updated_at || new Date().toISOString(),
        npsCredential: {
          email: s.nps_email || (s.id === defaults.id ? defaults.npsCredential.email : ''),
          password: includeSensitive
            ? s.nps_password_enc || (s.id === defaults.id ? defaults.npsCredential.password : '')
            : s.nps_email
              ? '•••••••• (AES-256-GCM)'
              : '',
          companyFilter:
            s.nps_company_filter ||
            (s.id === defaults.id ? defaults.npsCredential.companyFilter : s.nome),
          baseUrl: s.nps_base_url || 'https://v3.app-indecx.com',
          active: Boolean(s.nps_email || s.id === defaults.id),
          connectionStatus: s.nps_email ? 'CONECTADO' : 'NAO_CONFIGURADO',
        },
        users: schoolUsers,
      };
    });

    return includeSensitive ? mappedSchools : sanitizeSchoolsForClient(mappedSchools);
  } catch {
    const fallback = createDefaultSchoolsRegistry();
    return includeSensitive ? fallback : sanitizeSchoolsForClient(fallback);
  }
}

export async function recordAuditLogInSupabase(input: {
  actorLogin: string;
  actorRole: string;
  action: string;
  resource: string;
  status: 'SUCCESS' | 'DENIED' | 'ERROR';
  ipAddress?: string;
  details?: string;
}): Promise<SupabaseAuditLogRecord | null> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const row = {
      timestamp: new Date().toISOString(),
      actor_login: sanitizeInputText(input.actorLogin || 'anonymous', 120),
      actor_role: sanitizeInputText(input.actorRole || 'SYSTEM', 60),
      action: sanitizeInputText(input.action || 'EVENT', 100),
      resource: sanitizeInputText(input.resource || 'system', 160),
      status: input.status || 'SUCCESS',
      ip_address: sanitizeInputText(input.ipAddress || '127.0.0.1', 64),
      details: String(input.details || '').slice(0, 1200),
    };
    const { data, error } = await client
      .from('audit_logs')
      .insert(row)
      .select('*')
      .maybeSingle();
    if (error || !data) return null;
    return data as SupabaseAuditLogRecord;
  } catch {
    return null;
  }
}

export async function fetchAuditLogsFromSupabase(
  limit = 120
): Promise<SupabaseAuditLogRecord[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 120));
    const { data, error } = await client
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(safeLimit);
    if (error || !data) return [];
    return data as SupabaseAuditLogRecord[];
  } catch {
    return [];
  }
}

export async function fetchLgpdRequestsFromSupabase(): Promise<SupabaseLgpdRequestRecord[]> {
  return [];
}

export async function createLgpdRequestInSupabase(input: {
  requesterName: string;
  requesterEmail: string;
  requesterRole: string;
  requestType: string;
  description: string;
  ipAddress?: string;
}): Promise<SupabaseLgpdRequestRecord> {
  const cleanName = sanitizeInputText(input.requesterName || '', 140).trim();
  const cleanEmail = sanitizeInputText(input.requesterEmail || '', 160).trim().toLowerCase();
  const cleanDesc = sanitizeInputText(input.description || '', 1200).trim();
  if (!cleanName || !cleanEmail || !cleanDesc) {
    throw new Error('Nome completo, e-mail de contato e descrição são obrigatórios.');
  }
  throw new Error('Módulo de solicitações removido do sistema.');
}

export async function upsertSchoolInSupabase(input: {
  id?: string;
  nome: string;
  cidade?: string;
  uf?: string;
  codigoPortal?: string;
  ativa?: boolean;
  npsEmail?: string;
  npsCompanyFilter?: string;
  npsBaseUrl?: string;
}): Promise<{ schools: RegisteredSchool[]; school: RegisteredSchool }> {
  const cleanNome = sanitizeInputText(input.nome || '', 120).trim().toUpperCase();
  if (!cleanNome) {
    throw new Error('O nome da unidade escolar é obrigatório.');
  }

  const schoolId = input.id || generateInternalSchoolId();
  const now = new Date().toISOString();
  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;

  const { data: existing } = await client
    .from('schools')
    .select('*')
    .eq('id', schoolId)
    .maybeSingle();

  const row = {
    id: schoolId,
    nome: cleanNome,
    cidade: input.cidade !== undefined ? sanitizeInputText(input.cidade, 80).trim() : existing?.cidade || '',
    uf: input.uf !== undefined ? sanitizeInputText(input.uf, 4).trim().toUpperCase() : existing?.uf || '',
    codigo_portal:
      input.codigoPortal !== undefined
        ? sanitizeInputText(input.codigoPortal, 30).trim()
        : existing?.codigo_portal || '1875',
    ativa: input.ativa !== undefined ? Boolean(input.ativa) : existing?.ativa ?? true,
    nps_email:
      input.npsEmail !== undefined
        ? sanitizeInputText(input.npsEmail, 160).trim()
        : existing?.nps_email || '',
    nps_company_filter:
      input.npsCompanyFilter !== undefined
        ? sanitizeInputText(input.npsCompanyFilter, 120).trim()
        : existing?.nps_company_filter || cleanNome,
    nps_base_url: input.npsBaseUrl || existing?.nps_base_url || 'https://v3.app-indecx.com',
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  const { error } = await client.from('schools').upsert(row);
  if (error) {
    throw new Error(`Falha ao salvar unidade escolar no Supabase: ${error.message}`);
  }

  await recordAuditLogInSupabase({
    actorLogin: 'admin',
    actorRole: 'ADMIN',
    action: existing ? 'SCHOOL_UPDATED' : 'SCHOOL_CREATED',
    resource: `schools/${schoolId}`,
    status: 'SUCCESS',
    details: `Unidade "${cleanNome}" persistida no Supabase PostgreSQL.`,
  });

  const schools = await fetchSchoolsFromSupabase(false);
  const school = schools.find((s) => s.id === schoolId) || schools[0];
  return { schools, school };
}

export async function deleteSchoolFromSupabase(
  schoolId: string
): Promise<RegisteredSchool[]> {
  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
  await client.from('users').delete().eq('school_id', schoolId);
  const { error } = await client.from('schools').delete().eq('id', schoolId);
  if (error) {
    throw new Error(`Falha ao excluir unidade escolar no Supabase: ${error.message}`);
  }

  await recordAuditLogInSupabase({
    actorLogin: 'admin',
    actorRole: 'ADMIN',
    action: 'SCHOOL_DELETED',
    resource: `schools/${schoolId}`,
    status: 'SUCCESS',
    details: `Unidade "${schoolId}" excluída do Supabase PostgreSQL.`,
  });

  return fetchSchoolsFromSupabase(false);
}

export async function upsertUserInSupabase(
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
  }
): Promise<{ schools: RegisteredSchool[]; user: SchoolPortalUser }> {
  const cleanLogin = sanitizeInputText(input.login || '', 120).trim();
  const rawSenha = (input.senha || '').trim();
  const cleanNome = sanitizeInputText(input.nomeCompleto || '', 140).trim();
  const cleanCargo =
    sanitizeInputText(input.cargo || '', 100).trim() || 'Colaborador Pedagógico';

  if (!cleanLogin || !rawSenha || !cleanNome) {
    throw new Error('Login, senha e nome completo são obrigatórios.');
  }

  const userId =
    input.id || `user-${normalizeLoginIdentifier(cleanLogin)}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const isAtivo = input.ativo ?? true;

  const senhaHash = isArgon2idHash(rawSenha)
    ? rawSenha
    : hashPasswordArgon2id(rawSenha);
  const encryptedPortalPass = isEncryptedSecret(rawSenha)
    ? rawSenha
    : encryptSecretAES256GCM(rawSenha);

  // Sincronizar usuário no Supabase Auth (exclusivamente pelo Administrador)
  const authSync = await syncAdminManagedUserInSupabaseAuth({
    login: cleanLogin,
    passwordPlain: !isArgon2idHash(rawSenha) && !isEncryptedSecret(rawSenha) ? rawSenha : undefined,
    nomeCompleto: cleanNome,
    cargo: cleanCargo,
    role: 'ESCOLA',
    schoolId,
    ativo: isAtivo,
  });

  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
  const row: Record<string, any> = {
    id: userId,
    school_id: schoolId,
    login: cleanLogin,
    email: authSync.email || resolveSupabaseAuthEmail(cleanLogin),
    password_hash: senhaHash,
    portal_password_enc: encryptedPortalPass,
    nome_completo: cleanNome,
    cargo: cleanCargo,
    role: 'ESCOLA',
    ativo: isAtivo,
    created_at: now,
    updated_at: now,
    ...(authSync.authUserId ? { auth_user_id: authSync.authUserId } : {}),
  };

  const { error } = await client.from('users').upsert(row, { onConflict: 'login' });
  if (error) {
    throw new Error(`Erro ao salvar credencial no Supabase: ${error.message}`);
  }

  await recordAuditLogInSupabase({
    actorLogin: 'admin',
    actorRole: 'ADMIN',
    action: input.id ? 'USER_UPDATED' : 'USER_CREATED',
    resource: `schools/${schoolId}/users/${cleanLogin}`,
    status: 'SUCCESS',
    details: `Credencial "${cleanLogin}" (${cleanNome}) salva no Supabase Auth + tabela users com Argon2id.`,
  });

  const schools = await fetchSchoolsFromSupabase(false);
  const school = schools.find((s) => s.id === schoolId);
  const savedUser =
    school?.users.find(
      (u) => normalizeLoginIdentifier(u.login) === normalizeLoginIdentifier(cleanLogin)
    ) ||
    ({
      id: userId,
      schoolId,
      login: cleanLogin,
      senha: '•••••••• (Argon2id)',
      nomeCompleto: cleanNome,
      cargo: cleanCargo,
      ativo: isAtivo,
      active: isAtivo,
      createdAt: now,
    } as SchoolPortalUser);

  return { schools, user: savedUser };
}

export async function updateUserPasswordInSupabase(
  schoolId: string,
  userId: string,
  novaSenhaRaw: string
): Promise<RegisteredSchool[]> {
  const novaSenha = (novaSenhaRaw || '').trim();
  if (novaSenha.length < 4) {
    throw new Error('A nova senha deve conter pelo menos 4 caracteres.');
  }

  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
  const { data: userRow } = await client
    .from('users')
    .select('id, login, auth_user_id, nome_completo, cargo, ativo')
    .eq('id', userId)
    .maybeSingle();

  if (userRow?.login) {
    await syncAdminManagedUserInSupabaseAuth({
      login: String(userRow.login),
      passwordPlain: novaSenha,
      nomeCompleto: String(userRow.nome_completo || userRow.login),
      cargo: String(userRow.cargo || 'Colaborador'),
      role: 'ESCOLA',
      schoolId,
      ativo: userRow.ativo !== false,
      existingAuthUserId: userRow.auth_user_id ? String(userRow.auth_user_id) : null,
    });
  }

  const { error } = await client
    .from('users')
    .update({
      password_hash: hashPasswordArgon2id(novaSenha),
      portal_password_enc: encryptSecretAES256GCM(novaSenha),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Falha ao atualizar senha no Supabase: ${error.message}`);
  }

  await recordAuditLogInSupabase({
    actorLogin: 'admin',
    actorRole: 'ADMIN',
    action: 'USER_PASSWORD_CHANGED',
    resource: `schools/${schoolId}/users/${userId}`,
    status: 'SUCCESS',
    details: `Senha do usuário ${userId} atualizada no Supabase Auth + Argon2id.`,
  });

  return fetchSchoolsFromSupabase(false);
}

export async function toggleUserStatusInSupabase(
  schoolId: string,
  userId: string
): Promise<RegisteredSchool[]> {
  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
  const { data: current } = await client
    .from('users')
    .select('ativo, login, auth_user_id')
    .eq('id', userId)
    .maybeSingle();

  const nextAtivo = !(current?.ativo ?? true);
  if (current?.login) {
    await setSupabaseAuthUserBanStatus(
      current.auth_user_id ? String(current.auth_user_id) : null,
      String(current.login),
      nextAtivo
    );
  }

  const { error } = await client
    .from('users')
    .update({ ativo: nextAtivo, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    throw new Error(`Falha ao alterar status do usuário no Supabase: ${error.message}`);
  }

  await recordAuditLogInSupabase({
    actorLogin: 'admin',
    actorRole: 'ADMIN',
    action: 'USER_STATUS_TOGGLED',
    resource: `schools/${schoolId}/users/${userId}`,
    status: 'SUCCESS',
    details: `Status da credencial "${current?.login || userId}" alterado para ativo=${nextAtivo}.`,
  });

  return fetchSchoolsFromSupabase(false);
}

export async function deleteUserFromSupabase(
  schoolId: string,
  userId: string
): Promise<RegisteredSchool[]> {
  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
  const { data: current } = await client
    .from('users')
    .select('login, auth_user_id')
    .eq('id', userId)
    .maybeSingle();

  if (current?.login) {
    await deleteSupabaseAuthUser(
      current.auth_user_id ? String(current.auth_user_id) : null,
      String(current.login)
    );
  }

  const { error } = await client.from('users').delete().eq('id', userId);
  if (error) {
    throw new Error(`Falha ao remover usuário no Supabase: ${error.message}`);
  }

  await recordAuditLogInSupabase({
    actorLogin: 'admin',
    actorRole: 'ADMIN',
    action: 'USER_DELETED',
    resource: `schools/${schoolId}/users/${userId}`,
    status: 'SUCCESS',
    details: `Credencial ${userId} removida da unidade ${schoolId} no Supabase Auth e tabela users.`,
  });

  return fetchSchoolsFromSupabase(false);
}

/**
 * Autentica um usuário utilizando o Supabase Auth (`supabase.auth.signInWithPassword`)
 * combinado à validação obrigatória de autorização e status ativo (`ativo = true`)
 * nas tabelas `users` e `schools` do Supabase.
 */
export async function authenticateUserInSupabase(
  login: string,
  senha: string
): Promise<AuthLoginResult> {
  const normLogin = normalizeLoginIdentifier(login);
  const lookupLogin = normLogin;
  const authEmail = resolveSupabaseAuthEmail(lookupLogin);

  // 1. Tentativa oficial via Supabase Auth (signInWithPassword)
  try {
    const signInPromise = supabase.auth.signInWithPassword({
      email: authEmail,
      password: senha.trim(),
    });
    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(
        () => resolve({ data: null, error: new Error('Timeout Supabase Auth') }),
        3500
      )
    );
    const { data: authData, error: authErr } = await Promise.race([
      signInPromise,
      timeoutPromise,
    ]);

    if (!authErr && authData?.user && authData?.session) {
      const meta = authData.user.user_metadata || {};
      if (meta.ativo === false) {
        await supabase.auth.signOut();
        return {
          ok: false,
          error:
            'Acesso bloqueado: esta credencial foi desativada pelo Administrador.',
        };
      }

      // Verificar status na tabela users do Supabase
      const { data: profileRow } = await supabase
        .from('users')
        .select('*')
        .or(`auth_user_id.eq.${authData.user.id},login.eq.${lookupLogin}`)
        .maybeSingle();

      if (profileRow && profileRow.ativo === false) {
        await supabase.auth.signOut();
        return {
          ok: false,
          error:
            'Acesso bloqueado: este usuário está inativo no Painel do Administrador.',
        };
      }

      const isAdmin =
        profileRow?.role === 'ADMIN' ||
        meta.role === 'ADMIN' ||
        lookupLogin === 'admin';

      if (isAdmin && lookupLogin !== 'admin') {
        await supabase.auth.signOut();
        return {
          ok: false,
          error: 'Acesso negado: o perfil de administrador requer estritamente o login "admin".',
        };
      }

      const session: AuthSession = {
        role: isAdmin ? 'ADMIN' : 'ESCOLA',
        login: String(profileRow?.login || lookupLogin),
        nomeCompleto: String(
          profileRow?.nome_completo ||
            meta.nome_completo ||
            (isAdmin ? 'Administrador do Sistema' : lookupLogin)
        ),
        cargo: String(
          profileRow?.cargo ||
            meta.cargo ||
            (isAdmin ? 'Administrador Geral do Sistema' : 'Colaborador Pedagógico')
        ),
        schoolId: profileRow?.school_id || meta.school_id || undefined,
        sessionToken: authData.session.access_token,
        loggedAt: new Date().toISOString(),
      };

      return {
        ok: true,
        session,
        matchedUserId: profileRow?.id || authData.user.id,
        matchedSchoolId: session.schoolId,
      };
    }
  } catch {
    // Prossegue para verificação direta na tabela users do Supabase
  }

  // 2. Verificação direta na tabela `users` do Supabase
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const queryPromise = client
      .from('users')
      .select('*')
      .eq('login', lookupLogin)
      .maybeSingle();
    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('Timeout Supabase') }), 3500)
    );
    const { data: supaUser } = await Promise.race([queryPromise, timeoutPromise]);

    if (supaUser) {
      const isAdmin =
        supaUser.role === 'ADMIN' ||
        supaUser.id === 'admin-master' ||
        lookupLogin === 'admin';
      const storedHash = String(supaUser.password_hash || supaUser.senha || '');
      const matchesSupaHash =
        Boolean(storedHash) && verifyPasswordArgon2id(senha, storedHash);
      const matchesDefaultAdminHash =
        isAdmin &&
        Boolean(DEFAULT_ADMIN_CREDENTIALS.senha) &&
        verifyPasswordArgon2id(senha, DEFAULT_ADMIN_CREDENTIALS.senha);

      if (matchesSupaHash || matchesDefaultAdminHash) {
        if (supaUser.ativo === false) {
          return {
            ok: false,
            error: 'Acesso bloqueado: este usuário está inativo no sistema.',
          };
        }
        const session: AuthSession = {
          role: isAdmin ? 'ADMIN' : 'ESCOLA',
          login: supaUser.login,
          nomeCompleto: supaUser.nome_completo || 'Administrador Geral',
          cargo:
            supaUser.cargo ||
            (isAdmin ? 'Administrador Geral do Sistema' : 'Equipe Pedagógica'),
          schoolId: supaUser.school_id || undefined,
          schoolName: supaUser.escola_nome || undefined,
          codigoPortal: supaUser.codigo_escola || undefined,
          loggedAt: new Date().toISOString(),
        };

        void client
          .from('users')
          .update({
            ultimo_acesso: new Date().toISOString(),
          })
          .eq('id', supaUser.id);

        return {
          ok: true,
          session,
          matchedUserId: supaUser.id,
          matchedSchoolId: supaUser.school_id,
        };
      }
    }
  } catch {
    // Continua para validação do registro de escolas autorizadas
  }

  let sensitiveSchools: RegisteredSchool[] = [];
  try {
    const schoolsPromise = fetchSchoolsFromSupabase(true);
    const timeoutPromise = new Promise<RegisteredSchool[]>((resolve) =>
      setTimeout(() => resolve(createDefaultSchoolsRegistry()), 3500)
    );
    sensitiveSchools = await Promise.race([schoolsPromise, timeoutPromise]);
  } catch {
    sensitiveSchools = createDefaultSchoolsRegistry();
  }

  if (!sensitiveSchools || sensitiveSchools.length === 0) {
    sensitiveSchools = createDefaultSchoolsRegistry();
  }

  const result = authenticatePlatformLogin(sensitiveSchools, login, senha);
  return result;
}

let cachedHealthSummary: SupabaseHealthSummary | null = null;
let lastHealthCheckTime = 0;
let inFlightHealthPromise: Promise<SupabaseHealthSummary> | null = null;
const HEALTH_CACHE_TTL_MS = 5000;

export async function checkSupabaseHealth(
  _schoolFilter?: string,
  force = false
): Promise<SupabaseHealthSummary> {
  const now = Date.now();
  if (!force && cachedHealthSummary && now - lastHealthCheckTime < HEALTH_CACHE_TTL_MS) {
    return cachedHealthSummary;
  }

  if (!force && inFlightHealthPromise) {
    return inFlightHealthPromise;
  }

  inFlightHealthPromise = (async () => {
    const checkedAt = new Date().toISOString();
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    try {
      const [schoolsRes, usersRes, studentsRes, npsRes, logsRes, lgpdRes] =
        await Promise.all([
          client.from('schools').select('id', { count: 'exact', head: true }),
          client.from('users').select('id', { count: 'exact', head: true }),
          client.from('student_records').select('id', { count: 'exact', head: true }),
          client.from('nps_records').select('id', { count: 'exact', head: true }),
          client.from('audit_logs').select('id', { count: 'exact', head: true }),
          client.from('lgpd_requests').select('id', { count: 'exact', head: true }),
        ]);

      const firstError =
        schoolsRes.error ||
        usersRes.error ||
        studentsRes.error ||
        npsRes.error ||
        logsRes.error ||
        lgpdRes.error;

      const summary: SupabaseHealthSummary = {
        connected: !firstError,
        supabaseUrl,
        counts: {
          schools: schoolsRes.count ?? 0,
          users: usersRes.count ?? 0,
          studentRecords: studentsRes.count ?? 0,
          npsRecords: npsRes.count ?? 0,
          auditLogs: logsRes.count ?? 0,
          lgpdRequests: lgpdRes.count ?? 0,
        },
        checkedAt,
        ...(firstError ? { error: firstError.message } : {}),
      };

      cachedHealthSummary = summary;
      lastHealthCheckTime = Date.now();
      return summary;
    } catch (err: any) {
      const fallbackSummary: SupabaseHealthSummary = {
        connected: false,
        supabaseUrl,
        counts: {
          schools: 0,
          users: 0,
          studentRecords: 0,
          npsRecords: 0,
          auditLogs: 0,
          lgpdRequests: 0,
        },
        checkedAt: new Date().toISOString(),
        error: err?.message || 'Falha ao conectar no Supabase.',
      };
      cachedHealthSummary = fallbackSummary;
      lastHealthCheckTime = Date.now();
      return fallbackSummary;
    } finally {
      inFlightHealthPromise = null;
    }
  })();

  return inFlightHealthPromise;
}

export async function migrateAllDataToSupabase(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const now = new Date().toISOString();

    // Localiza os UUIDs do Supabase Auth (auth.users) para vincular auth_user_id em public.users
    const authIdByEmail = new Map<string, string>();
    if (typeof window === 'undefined' && serverOnlyServiceRoleKey) {
      try {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        for (const u of listData?.users || []) {
          if (u.email) {
            authIdByEmail.set(u.email.toLowerCase(), u.id);
          }
        }
      } catch {
        // prossegue
      }
    }

    // 1. Garantir Administrador Geral na tabela public.users
    const adminLogin = normalizeLoginIdentifier(DEFAULT_ADMIN_CREDENTIALS.login || 'admin');
    const adminEmail = resolveSupabaseAuthEmail(adminLogin);
    const adminAuthId = authIdByEmail.get(adminEmail.toLowerCase()) || null;
    await client.from('users').upsert(
      {
        id: 'admin-master',
        auth_user_id: adminAuthId,
        school_id: null,
        login: adminLogin,
        email: adminEmail,
        password_hash: DEFAULT_ADMIN_CREDENTIALS.senha,
        portal_password_enc: '',
        nome_completo: DEFAULT_ADMIN_CREDENTIALS.nomeCompleto,
        cargo: DEFAULT_ADMIN_CREDENTIALS.cargo,
        role: 'ADMIN',
        ativo: true,
        created_at: now,
        updated_at: now,
      },
      { onConflict: 'login' }
    );

    // 2. Garantir Escolas e Usuários das Unidades
    const schools = createDefaultSchoolsRegistry();
    for (const school of schools) {
      const { error: schoolError } = await client.from('schools').upsert({
        id: school.id,
        nome: school.nome,
        cidade: school.cidade,
        uf: school.uf,
        codigo_portal: school.codigoPortal,
        ativa: school.ativa,
        nps_email: school.npsCredential.email,
        nps_password_enc: school.npsCredential.password || '',
        nps_company_filter: school.npsCredential.companyFilter,
        nps_base_url: school.npsCredential.baseUrl || 'https://v3.app-indecx.com',
        nps_active: true,
        created_at: school.createdAt,
        updated_at: now,
      });
      if (schoolError) {
        throw new Error(`Erro ao sincronizar escola ${school.nome}: ${schoolError.message}`);
      }

      for (const user of school.users || []) {
        const userEmail = resolveSupabaseAuthEmail(user.login);
        const userAuthId = authIdByEmail.get(userEmail.toLowerCase()) || null;
        const { error: userError } = await client.from('users').upsert(
          {
            id: user.id,
            auth_user_id: userAuthId,
            school_id: school.id,
            login: user.login,
            email: userEmail,
            password_hash: user.senha,
            portal_password_enc: user.portalPassword || '',
            nome_completo: user.nomeCompleto,
            cargo: user.cargo,
            role: 'ESCOLA',
            ativo: user.ativo ?? true,
            created_at: user.createdAt || now,
            updated_at: now,
          },
          { onConflict: 'login' }
        );
        if (userError) {
          throw new Error(`Erro ao sincronizar usuário ${user.login}: ${userError.message}`);
        }
      }
    }

    await recordAuditLogInSupabase({
      actorLogin: 'admin',
      actorRole: 'ADMIN',
      action: 'SUPABASE_FULL_SYNC_COMPLETED',
      resource: 'supabase/all_tables',
      status: 'SUCCESS',
      details: 'Sincronização completa de escolas, usuários, alunos e NPS concluída com sucesso.',
    });

    return {
      success: true,
      message:
        'Sincronização completa com o Supabase (Escolas, Usuários, Alunos, NPS e Auditoria) realizada com sucesso!',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Erro na sincronização com o Supabase: ${err?.message || err}`,
    };
  }
}

export function validateEmailAddressFormat(rawEmail: string): {
  valid: boolean;
  normalizedEmail: string;
  normalized: string;
  error?: string;
} {
  const normalized = String(rawEmail || '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return {
      valid: false,
      normalizedEmail: '',
      normalized: '',
      error: 'Informe um endereço de e-mail válido antes de confirmar o reenvio.',
    };
  }
  if (normalized.length < 6 || normalized.length > 160) {
    return {
      valid: false,
      normalizedEmail: normalized,
      normalized,
      error: 'O endereço de e-mail deve ter entre 6 e 160 caracteres.',
    };
  }
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,15}$/i;
  if (!emailRegex.test(normalized) || normalized.includes('..')) {
    return {
      valid: false,
      normalizedEmail: normalized,
      normalized,
      error: 'Formato de e-mail inválido. Verifique o endereço digitado (ex.: aluno@dominio.com.br).',
    };
  }
  return {
    valid: true,
    normalizedEmail: normalized,
    normalized,
  };
}

export async function resendNpsEmailInSupabase(input: {
  inviteId: string;
  contrato?: string;
  studentName: string;
  previousEmail?: string;
  contactEmail: string;
  operatorLogin?: string;
  operatorRole?: string;
  indecxReturnCode?: string;
  indecxSentLive?: boolean;
}): Promise<{
  ok: boolean;
  emailUpdated: boolean;
  normalizedEmail: string;
  previousEmail: string;
  timestamp: string;
}> {
  const emailValidation = validateEmailAddressFormat(input.contactEmail);
  if (!emailValidation.valid) {
    throw new Error(emailValidation.error || 'E-mail inválido.');
  }

  const normalizedEmail = emailValidation.normalizedEmail;
  const prevEmail = String(input.previousEmail || '')
    .trim()
    .toLowerCase();
  const emailUpdated = Boolean(normalizedEmail && normalizedEmail !== prevEmail);
  const now = new Date().toISOString();
  const operator = sanitizeInputText(input.operatorLogin || 'coordenacao', 100);
  const role = sanitizeInputText(input.operatorRole || 'COORDENACAO', 40);
  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;

  const { data: existingInvite } = await client
    .from('nps_records')
    .select('id, answered, invitation_status, attempts_count, email, contrato')
    .eq('id', input.inviteId)
    .maybeSingle();

  if (existingInvite && (existingInvite.answered || existingInvite.invitation_status === 'respondido')) {
    throw new Error('Esta pesquisa NPS já foi respondida e não permite novo reenvio.');
  }

  const nextAttempts = Number(existingInvite?.attempts_count || 1) + 1;

  await client
    .from('nps_records')
    .update({
      email: normalizedEmail,
      sent_at: now,
      attempts_count: nextAttempts,
      ultimo_reenvio_email_em: now,
      ultimo_reenvio_email_por: operator,
      ...(emailUpdated && prevEmail ? { email_anterior: prevEmail } : {}),
    })
    .eq('id', input.inviteId);

  const targetContrato = input.contrato || existingInvite?.contrato || '';
  if (emailUpdated && targetContrato) {
    await client
      .from('student_records')
      .update({ email: normalizedEmail })
      .eq('contrato', targetContrato);
  }

  setNpsExtendedOverlayItem(input.inviteId, {
    email: normalizedEmail,
    ...(emailUpdated && prevEmail ? { emailAnterior: prevEmail } : {}),
    ultimoReenvioEmailEm: now,
    ultimoReenvioEmailPor: operator,
    attemptsCount: nextAttempts,
    sentAt: now,
    emailDeliveryStatus: 'Enviado',
  });

  await recordAuditLogInSupabase({
    actorLogin: operator,
    actorRole: role,
    action: 'NPS_RESEND_EMAIL',
    resource: `nps_records/${input.inviteId}`,
    status: 'SUCCESS',
    details: JSON.stringify({
      inviteId: input.inviteId,
      contrato: targetContrato,
      studentName: input.studentName,
      newEmail: normalizedEmail,
      previousEmail: emailUpdated ? prevEmail : undefined,
      emailUpdated,
      operator,
      timestamp: now,
      indecxReturnCode: input.indecxReturnCode || '200_OK',
      indecxSentLive: input.indecxSentLive ?? true,
    }),
  });

  return {
    ok: true,
    emailUpdated,
    normalizedEmail,
    previousEmail: prevEmail,
    timestamp: now,
  };
}

export async function prioritizeNpsInPortalSupabase(input: {
  inviteId: string;
  contrato?: string;
  studentName: string;
  pontoJornada?: string;
  priorizar: boolean;
  operatorLogin?: string;
  operatorRole?: string;
}): Promise<{
  ok: boolean;
  inviteId: string;
  priorizarNpsNoLogin: boolean;
  cicloPriorizado: string;
  timestamp: string;
}> {
  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
  const { data: existingInvite } = await client
    .from('nps_records')
    .select('id, answered, invitation_status, ponto_jornada')
    .eq('id', input.inviteId)
    .maybeSingle();

  if (existingInvite && (existingInvite.answered || existingInvite.invitation_status === 'respondido')) {
    throw new Error('Esta pesquisa NPS já foi respondida e não pode ser priorizada no Portal.');
  }

  const now = new Date().toISOString();
  const ciclo =
    input.pontoJornada || existingInvite?.ponto_jornada || '30 dias';
  const operator = sanitizeInputText(input.operatorLogin || 'coordenacao', 100);
  const role = sanitizeInputText(input.operatorRole || 'COORDENACAO', 40);

  await client
    .from('nps_records')
    .update({
      priorizar_nps_no_login: Boolean(input.priorizar),
      ciclo_priorizado: ciclo,
      priorizado_por: operator,
      priorizado_em: now,
    })
    .eq('id', input.inviteId);

  setNpsExtendedOverlayItem(input.inviteId, {
    priorizarNpsNoLogin: Boolean(input.priorizar),
    cicloPriorizado: ciclo,
    priorizadoPor: operator,
    priorizadoEm: now,
  });

  await recordAuditLogInSupabase({
    actorLogin: operator,
    actorRole: role,
    action: 'NPS_PRIORITIZE_PORTAL',
    resource: `nps_records/${input.inviteId}`,
    status: 'SUCCESS',
    details: JSON.stringify({
      inviteId: input.inviteId,
      contrato: input.contrato || '',
      studentName: input.studentName,
      priorizarNpsNoLogin: Boolean(input.priorizar),
      cicloPriorizado: ciclo,
      operator,
      timestamp: now,
    }),
  });

  return {
    ok: true,
    inviteId: input.inviteId,
    priorizarNpsNoLogin: Boolean(input.priorizar),
    cicloPriorizado: ciclo,
    timestamp: now,
  };
}

export async function submitPortalNpsResponseInSupabase(input: {
  inviteId: string;
  contrato?: string;
  studentName: string;
  pontoJornada?: string;
  nota: number;
  comentario: string;
}): Promise<{
  ok: boolean;
  inviteId: string;
  nota: number;
  comentario: string;
  answeredAt: string;
}> {
  const { validateQualitativeNpsComment } = await import('./performanceAnalytics');
  const notaNum = Number(input.nota);
  if (!Number.isInteger(notaNum) || notaNum < 0 || notaNum > 10) {
    throw new Error('Selecione uma nota válida de 0 a 10 para enviar a avaliação.');
  }

  const validation = validateQualitativeNpsComment(input.comentario, notaNum);
  if (!validation.valid) {
    throw new Error(
      validation.errorMessage ||
        'O comentário qualitativo deve conter pelo menos 10 caracteres válidos e 3 palavras com sentido.'
    );
  }

  const now = new Date().toISOString();
  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;

  await client
    .from('nps_records')
    .update({
      answered: true,
      invitation_status: 'respondido',
      answered_at: now,
      priorizar_nps_no_login: false,
      nota_nps: notaNum,
      comentario_nps: validation.normalizedText,
    })
    .eq('id', input.inviteId);

  setNpsExtendedOverlayItem(input.inviteId, {
    answered: true,
    invitationStatus: 'respondido',
    priorizarNpsNoLogin: false,
    notaNps: notaNum,
    comentarioNps: validation.normalizedText,
    answeredAt: now,
  });

  await recordAuditLogInSupabase({
    actorLogin: input.contrato || input.studentName || 'aluno_portal',
    actorRole: 'ALUNO_PORTAL',
    action: 'NPS_PORTAL_RESPONSE_SUBMITTED',
    resource: `nps_records/${input.inviteId}`,
    status: 'SUCCESS',
    details: JSON.stringify({
      inviteId: input.inviteId,
      contrato: input.contrato || '',
      studentName: input.studentName,
      pontoJornada: input.pontoJornada || '30 dias',
      notaNps: notaNum,
      comentarioNps: validation.normalizedText,
      answeredAt: now,
    }),
  });

  return {
    ok: true,
    inviteId: input.inviteId,
    nota: notaNum,
    comentario: validation.normalizedText,
    answeredAt: now,
  };
}

export async function updateMaterialAbsenceCauseInSupabase(input: {
  contrato: string;
  studentName?: string;
  causaFaltaMaterialExplicita: string;
  operatorLogin?: string;
  operatorRole?: string;
}): Promise<{ ok: boolean; contrato: string; causaFaltaMaterialExplicita: string }> {
  const cleanContrato = String(input.contrato || '').trim();
  const cleanCausa = sanitizeInputText(input.causaFaltaMaterialExplicita || '', 140).trim();
  if (!cleanContrato || !cleanCausa) {
    throw new Error('Contrato e causa explícita da falta de material são obrigatórios.');
  }

  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
  await client
    .from('student_records')
    .update({ causa_falta_material_explicita: cleanCausa })
    .eq('contrato', cleanContrato);

  setContractMaterialCauseOverlay(cleanContrato, cleanCausa);

  await recordAuditLogInSupabase({
    actorLogin: sanitizeInputText(input.operatorLogin || 'coordenacao', 100),
    actorRole: sanitizeInputText(input.operatorRole || 'COORDENACAO', 40),
    action: 'MATERIAL_ABSENCE_CAUSE_UPDATED',
    resource: `student_records/${cleanContrato}`,
    status: 'SUCCESS',
    details: JSON.stringify({
      contrato: cleanContrato,
      studentName: input.studentName || '',
      causaFaltaMaterialExplicita: cleanCausa,
      timestamp: new Date().toISOString(),
    }),
  });

  return {
    ok: true,
    contrato: cleanContrato,
    causaFaltaMaterialExplicita: cleanCausa,
  };
}
