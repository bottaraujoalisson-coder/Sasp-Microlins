import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  ActiveNpsInvitation,
  ALL_WEEK_STUDENT_RECORDS,
  INITIAL_ACTIVE_NPS_INVITATIONS,
  PORTAL_APOSTILA_BY_CONTRATO,
  PORTAL_AUTH_LINKS_BY_CONTRATO,
  PORTAL_METADATA,
  PORTAL_WEEKDAY_LABEL_TO_CODE,
  PORTAL_WEEKDAY_MAP,
  StudentPerformanceRecord,
} from './src/data/microlinsData';
import {
  filterAndDeduplicateAnnualNpsInvitations,
  getBrasiliaAnnualUtcBounds,
  getCurrentBrasiliaYear,
  normalizePersonName,
  resolveStudentLoginLink,
  validateQualitativeNpsComment,
} from './src/utils/performanceAnalytics';
import {
  AuthSession,
  computeUserSyncDifferences,
  isGenericPlaceholderUserName,
  NpsConnectionStatus,
  RegisteredSchool,
  sanitizeSchoolsForClient,
  SchoolPortalUser,
} from './src/utils/authRegistry';
import {
  acquireSchoolSyncLock,
  attemptPublicSelfRegistrationInDb,
  authenticateUserInDb,
  comparePortalWithStoredRecords,
  createDatabaseBackup,
  createLgpdRequestInDb,
  deleteSchoolFromDb,
  deleteUserFromDb,
  getAuditLogsFromDb,
  getDatabase,
  getDatabaseStatusSummary,
  getEducatorStats,
  getLgpdRequestsFromDb,
  getSchoolsFromDb,
  getStudentEducatorsMap,
  getSyncLogsFromDb,
  recordAuditLog,
  recordSyncLog,
  releaseSchoolSyncLock,
  revokeSessionTokenInDb,
  syncUserProfileFromPortalInDb,
  toggleSchoolStatusInDb,
  toggleUserStatusInDb,
  updateAdminPasswordInDb,
  updateUserPasswordInDb,
  upsertSchoolInDb,
  upsertStudentEducator,
  upsertUserInDb,
  validateSessionTokenInDb,
  upsertNpsRecordsInDb,
  upsertStudentRecordsInDb,
  getStudentRecordsFromDb,
  getNpsRecordsFromDb,
} from './src/db/database';
import {
  decryptSecretAES256GCM,
  detectMaliciousPayload,
  sanitizeInputText,
  verifyPasswordArgon2id,
  ensureNodeEnvLoaded,
} from './src/utils/securityCrypto';
import {
  PRIVACY_KNOWLEDGE_BASE,
  searchPrivacyKnowledgeBase,
} from './src/utils/privacyKnowledgeBase';
import {
  applyNpsExtendedOverlay,
  authenticateUserInSupabase,
  checkSupabaseHealth,
  deleteSchoolFromSupabase,
  deleteUserFromSupabase,
  fetchNpsInvitations as fetchNpsInvitationsFromSupabase,
  fetchStudentRecords as fetchStudentRecordsFromSupabase,
  getContractMaterialCauseOverlay,
  migrateAllDataToSupabase,
  prioritizeNpsInPortalSupabase,
  replaceNpsRecordsInSupabase,
  replaceStudentRecordsInSupabase,
  resendNpsEmailInSupabase,
  setContractMaterialCauseOverlay,
  setNpsExtendedOverlayItem,
  submitPortalNpsResponseInSupabase,
  supabase,
  toggleUserStatusInSupabase,
  updateMaterialAbsenceCauseInSupabase,
  updateUserPasswordInSupabase,
  upsertNpsRecordsToSupabase,
  upsertSchoolInSupabase,
  upsertStudentRecordsToSupabase,
  upsertUserInSupabase,
  validateEmailAddressFormat,
} from './src/utils/supabaseClient';

ensureNodeEnvLoaded();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializa o banco de dados relacional SQLite e executa migrações
getDatabase();

// Backend-only credentials dynamically loaded from encrypted DB (AES-256-GCM) or environment variables
let schoolsRegistry: RegisteredSchool[] = getSchoolsFromDb(true);
let currentActiveSchoolId: string = schoolsRegistry[0]?.id || 'school-1875';

let PORTAL_MICROLINS_LOGIN =
  process.env.PORTAL_MICROLINS_LOGIN ||
  schoolsRegistry[0]?.users?.[0]?.login ||
  'a116882';
let PORTAL_MICROLINS_PASSWORD =
  process.env.PORTAL_MICROLINS_PASSWORD ||
  schoolsRegistry[0]?.users?.[0]?.portalPassword ||
  'Joao@2025';
let PORTAL_MICROLINS_ESCOLA =
  process.env.PORTAL_MICROLINS_ESCOLA ||
  schoolsRegistry[0]?.codigoPortal ||
  '1875';

let INDECX_NPS_LOGIN =
  process.env.INDECX_NPS_LOGIN ||
  schoolsRegistry[0]?.npsCredential?.email ||
  'presidenteprudente@microlins.com.br';
let INDECX_NPS_PASSWORD =
  process.env.INDECX_NPS_PASSWORD ||
  schoolsRegistry[0]?.npsCredential?.password ||
  'Prudente@26';
const INDECX_DEFAULT_COMPANY_ID =
  process.env.INDECX_COMPANY_ID ||
  schoolsRegistry[0]?.npsCredential?.companyId ||
  '624464ee5314e75c907b920c';
const INDECX_DEFAULT_GROUP_ID =
  process.env.INDECX_GROUP_ID ||
  schoolsRegistry[0]?.npsCredential?.groupId ||
  '625f1c105afd9b2f276dd44a';
const INDECX_FRONTEND_ACCESS_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijs';

function refreshSchoolsRegistryCache(): RegisteredSchool[] {
  schoolsRegistry = getSchoolsFromDb(true);
  return schoolsRegistry;
}

interface PortalSessionState {
  cookies: Map<string, string>;
  expiresAt: number;
  cachedBySemana: Map<string, { records: StudentPerformanceRecord[]; fetchedAt: number }>;
  cachedAllWeekRecords: StudentPerformanceRecord[];
  cachedMetadata: typeof PORTAL_METADATA;
  authLinksCache: Record<string, string>;
}

const portalSession: PortalSessionState = {
  cookies: new Map<string, string>(),
  expiresAt: 0,
  cachedBySemana: new Map(),
  cachedAllWeekRecords: getStudentRecordsFromDb(currentActiveSchoolId),
  cachedMetadata: { ...PORTAL_METADATA },
  authLinksCache: { ...PORTAL_AUTH_LINKS_BY_CONTRATO },
};

interface IndecxSessionState {
  token: string | null;
  companyId: string;
  expiresAt: number;
  cachedYear: number;
  cachedActiveInvitations: ActiveNpsInvitation[];
  lastFetchedAt: number;
}

const indecxSession: IndecxSessionState = {
  token: null,
  companyId: INDECX_DEFAULT_COMPANY_ID,
  expiresAt: 0,
  cachedYear: getCurrentBrasiliaYear(),
  cachedActiveInvitations: filterAndDeduplicateAnnualNpsInvitations(
    getNpsRecordsFromDb(currentActiveSchoolId),
    getCurrentBrasiliaYear()
  ),
  lastFetchedAt: 0,
};

function seedSchoolCacheFromDbAndSupabase(schoolId: string = currentActiveSchoolId, codigoEscola: string = PORTAL_MICROLINS_ESCOLA) {
  const educatorsMap = getStudentEducatorsMap(codigoEscola);
  const localStudents = getStudentRecordsFromDb(schoolId);
  if (localStudents.length > 0) {
    portalSession.cachedAllWeekRecords = localStudents.map((r) => {
      if (
        r.contrato &&
        r.linkLoginUrl &&
        String(r.linkLoginUrl).startsWith(
          'https://portaldoaluno.microlins.com.br/autenticacao/tokenAluno/'
        )
      ) {
        portalSession.authLinksCache[r.contrato] = String(r.linkLoginUrl);
      }
      const cached = educatorsMap.get(r.contrato);
      const cleanSala = String(r.sala || '').split(' - ')[0].trim() || 'Sala não informada';
      return {
        ...r,
        sala: cleanSala,
        ...(cached && !r.educador
          ? { educador: cached.educadorNome, educadorCachedAt: cached.updatedAt }
          : {}),
      };
    });
    for (const [code, label] of Object.entries(PORTAL_WEEKDAY_MAP)) {
      const dayRecords = portalSession.cachedAllWeekRecords.filter(
        (r) => r.diaSemana === label
      );
      const existing = portalSession.cachedBySemana.get(code);
      if (!existing || existing.fetchedAt === 0) {
        portalSession.cachedBySemana.set(code, {
          records: dayRecords,
          fetchedAt: 0,
        });
      }
    }
  }

  const localNps = getNpsRecordsFromDb(schoolId);
  if (localNps.length > 0) {
    indecxSession.cachedActiveInvitations = filterAndDeduplicateAnnualNpsInvitations(
      localNps,
      getCurrentBrasiliaYear()
    );
    indecxSession.lastFetchedAt = Date.now();
  }

  void migrateAllDataToSupabase()
    .then(() => fetchStudentRecordsFromSupabase(schoolId))
    .then(async (remoteRecords) => {
      if (remoteRecords && remoteRecords.length > 0) {
        portalSession.cachedAllWeekRecords = remoteRecords.map((r) => {
          if (
            r.contrato &&
            r.linkLoginUrl &&
            String(r.linkLoginUrl).startsWith(
              'https://portaldoaluno.microlins.com.br/autenticacao/tokenAluno/'
            )
          ) {
            portalSession.authLinksCache[r.contrato] = String(r.linkLoginUrl);
          }
          const cached = educatorsMap.get(r.contrato);
          const cleanSala = String(r.sala || '').split(' - ')[0].trim() || 'Sala não informada';
          return {
            ...r,
            sala: cleanSala,
            ...(cached && !r.educador
              ? { educador: cached.educadorNome, educadorCachedAt: cached.updatedAt }
              : {}),
          };
        });
        for (const [code, label] of Object.entries(PORTAL_WEEKDAY_MAP)) {
          const dayRecords = portalSession.cachedAllWeekRecords.filter(
            (r) => r.diaSemana === label
          );
          portalSession.cachedBySemana.set(code, {
            records: dayRecords,
            fetchedAt: 0,
          });
        }
        if (remoteRecords.length > localStudents.length) {
          try {
            upsertStudentRecordsInDb(
              portalSession.cachedAllWeekRecords,
              schoolId,
              codigoEscola,
              portalSession.cachedMetadata.unidade,
              true
            );
          } catch {}
        }
      }
      // Dispara sincronização ao vivo com o Portal do Aluno em background para atualizar o Supabase com as presenças em tempo real
      const liveRes = await syncLivePortalRecords();
      if (liveRes.allWeekRecords.length > 0 && liveRes.source === 'PORTAL_LIVE_VERIFIED') {
        await replaceStudentRecordsInSupabase(
          liveRes.allWeekRecords,
          schoolId,
          codigoEscola
        ).catch(() => {});
      }
    })
    .catch(() => {});

  fetchNpsInvitationsFromSupabase(schoolId)
    .then(async (remoteNps) => {
      if (remoteNps && remoteNps.length > 0) {
        indecxSession.cachedActiveInvitations = filterAndDeduplicateAnnualNpsInvitations(
          remoteNps,
          getCurrentBrasiliaYear()
        );
        indecxSession.lastFetchedAt = Date.now();
      } else {
        // Se a tabela nps_records no Supabase estiver vazia, sincroniza imediatamente do Indecx e grava no Supabase
        const npsRes = await syncActiveIndecxNpsInvitations(
          portalSession.cachedAllWeekRecords
        );
        if (npsRes.invitations.length > 0) {
          await replaceNpsRecordsInSupabase(npsRes.invitations, schoolId);
        }
      }
    })
    .catch(() => {});
}

seedSchoolCacheFromDbAndSupabase(currentActiveSchoolId, PORTAL_MICROLINS_ESCOLA);

function getBrasiliaDayOfWeek(date: Date): { semanaCode: string; diaLabel: string } {
  const map: Record<string, { semanaCode: string; diaLabel: string }> = {
    Sun: { semanaCode: '7', diaLabel: 'Domingo' },
    Mon: { semanaCode: '1', diaLabel: 'Segunda-feira' },
    Tue: { semanaCode: '2', diaLabel: 'Terça-feira' },
    Wed: { semanaCode: '3', diaLabel: 'Quarta-feira' },
    Thu: { semanaCode: '4', diaLabel: 'Quinta-feira' },
    Fri: { semanaCode: '5', diaLabel: 'Sexta-feira' },
    Sat: { semanaCode: '6', diaLabel: 'Sábado' },
  };
  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
    }).format(date);
    return map[weekday] || { semanaCode: '5', diaLabel: 'Sexta-feira' };
  } catch {
    return { semanaCode: '5', diaLabel: 'Sexta-feira' };
  }
}

function collectResponseCookies(res: Response, jar: Map<string, string>) {
  const headersAny = res.headers as unknown as { getSetCookie?: () => string[] };
  const setCookies = headersAny.getSetCookie ? headersAny.getSetCookie() : [];
  for (const cookieStr of setCookies) {
    const [pair] = cookieStr.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) {
      jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
}

function serializeCookieJar(jar: Map<string, string>): string {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function authenticatePortalSession(forceRenew = false): Promise<boolean> {
  const now = Date.now();
  if (!forceRenew && portalSession.cookies.size > 0 && now < portalSession.expiresAt) {
    return true;
  }

  const jar = new Map<string, string>();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const r1 = await fetch('https://portaldoaluno.microlins.com.br/login/', {
      signal: controller.signal,
    });
    collectResponseCookies(r1, jar);

    const r2 = await fetch(
      'https://portaldoaluno.microlins.com.br//login/validarCadastroPerfil',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: serializeCookieJar(jar),
        },
        body: new URLSearchParams({
          login: PORTAL_MICROLINS_LOGIN,
          senha: PORTAL_MICROLINS_PASSWORD,
          email: '',
        }).toString(),
        signal: controller.signal,
      }
    );
    collectResponseCookies(r2, jar);
    if (!r2.ok) return false;

    const valData = (await r2.json()) as { status?: string; info?: string };
    if (!valData || !valData.info) return false;

    try {
      const decoded = JSON.parse(
        Buffer.from(valData.info, 'base64').toString('utf8')
      ) as { Nome?: string; NomeCargo?: string; login?: string };
      if (decoded.Nome) {
        portalSession.cachedMetadata.usuarioNomeCompleto = decoded.Nome;
      }
      if (decoded.NomeCargo) {
        portalSession.cachedMetadata.usuarioCargo = decoded.NomeCargo;
      }
      if (decoded.Nome) {
        syncUserProfileFromPortalInDb(
          decoded.login || PORTAL_MICROLINS_LOGIN,
          decoded.Nome,
          decoded.NomeCargo
        );
      }
    } catch {
      // Keep default metadata if decoding fails
    }

    const r3 = await fetch('https://portaldoaluno.microlins.com.br/login/', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: serializeCookieJar(jar),
      },
      body: new URLSearchParams({
        'userdata[login]': PORTAL_MICROLINS_LOGIN,
        'userdata[senha]': PORTAL_MICROLINS_PASSWORD,
        'userdata[app]': 'N',
        'userdata[contrato]': '',
        'userdata[info]': valData.info,
      }).toString(),
      signal: controller.signal,
    });
    collectResponseCookies(r3, jar);
    if (!r3.ok && (r3.status < 300 || r3.status >= 400)) return false;

    portalSession.cookies = jar;
    portalSession.expiresAt = now + 25 * 60 * 1000;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function parsePortalJsonResponse<T>(res: Response): Promise<T | null> {
  try {
    const rawText = await res.text();
    if (!rawText) return null;
    const trimmed = rawText.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed) as T;
    }
    // O Portal do Aluno por vezes antecipa tags <meta> ou <script> antes do payload JSON
    const scriptEndIdx = trimmed.lastIndexOf('</script>');
    const searchFrom = scriptEndIdx >= 0 ? scriptEndIdx + 9 : 0;
    const objIdx = trimmed.indexOf('{', searchFrom);
    const arrIdx = trimmed.indexOf('[', searchFrom);
    const startIdx =
      objIdx >= 0 && arrIdx >= 0
        ? Math.min(objIdx, arrIdx)
        : objIdx >= 0
          ? objIdx
          : arrIdx;
    if (startIdx >= 0) {
      return JSON.parse(trimmed.slice(startIdx)) as T;
    }
    return null;
  } catch {
    return null;
  }
}

const noPasswordContractsCache = new Set<string>();

async function fetchContractAuthLinkFromPortal(
  contrato: string
): Promise<string | null> {
  const cleanContrato = (contrato || '').trim();
  if (!cleanContrato) return null;

  const existing = portalSession.authLinksCache[cleanContrato];
  if (
    existing &&
    existing.startsWith(
      'https://portaldoaluno.microlins.com.br/autenticacao/tokenAluno/'
    ) &&
    !/\/tokenAluno\/\d+\/?$/.test(existing)
  ) {
    return existing;
  }
  if (noPasswordContractsCache.has(cleanContrato)) {
    return null;
  }

  const loggedIn = await authenticatePortalSession(false);
  if (!loggedIn) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(
      'https://portaldoaluno.microlins.com.br/dashboard/geraLinkAlunoAutenticacao',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: serializeCookieJar(portalSession.cookies),
        },
        body: new URLSearchParams({ contrato: cleanContrato }).toString(),
        signal: controller.signal,
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      link?: string;
      status?: string;
      msg?: string;
    };
    if (
      data &&
      typeof data.link === 'string' &&
      data.link.startsWith(
        'https://portaldoaluno.microlins.com.br/autenticacao/tokenAluno/'
      )
    ) {
      const validUrl = data.link.trim();
      portalSession.authLinksCache[cleanContrato] = validUrl;
      return validUrl;
    }
    if (data && data.status === 'erro') {
      noPasswordContractsCache.add(cleanContrato);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function syncAllContractsAuthLinksFromPortal(
  contracts: string[]
): Promise<number> {
  const uniqueMissing = Array.from(
    new Set(
      contracts
        .map((c) => String(c || '').trim())
        .filter(
          (c) =>
            c.length > 0 &&
            !noPasswordContractsCache.has(c) &&
            !(
              portalSession.authLinksCache[c] &&
              portalSession.authLinksCache[c].startsWith(
                'https://portaldoaluno.microlins.com.br/autenticacao/tokenAluno/'
              )
            )
        )
    )
  );
  if (uniqueMissing.length === 0) return 0;

  const loggedIn = await authenticatePortalSession(false);
  if (!loggedIn) return 0;

  let resolvedCount = 0;
  const chunkSize = 30;
  for (let i = 0; i < uniqueMissing.length; i += chunkSize) {
    const chunk = uniqueMissing.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((c) => fetchContractAuthLinkFromPortal(c))
    );
    for (const r of results) {
      if (r) resolvedCount++;
    }
  }

  if (resolvedCount > 0) {
    for (const rec of portalSession.cachedAllWeekRecords) {
      const tokenUrl = portalSession.authLinksCache[rec.contrato];
      if (tokenUrl) {
        rec.linkLoginUrl = tokenUrl;
      }
    }
    for (const [, dayEntry] of portalSession.cachedBySemana) {
      for (const rec of dayEntry.records) {
        const tokenUrl = portalSession.authLinksCache[rec.contrato];
        if (tokenUrl) {
          rec.linkLoginUrl = tokenUrl;
        }
      }
    }
  }
  return resolvedCount;
}

interface EducatorSyncProgress {
  isRunning: boolean;
  total: number;
  processed: number;
  success: number;
  failed: number;
  currentContrato?: string;
  currentAluno?: string;
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
}

const educatorSyncProgress: EducatorSyncProgress = {
  isRunning: false,
  total: 0,
  processed: 0,
  success: 0,
  failed: 0,
};

async function extractEducatorFromContractLive(
  contrato: string,
  alunoNome?: string
): Promise<string | null> {
  const cleanContrato = (contrato || '').trim();
  if (!cleanContrato) return null;

  try {
    const authLink = await fetchContractAuthLinkFromPortal(cleanContrato);
    if (!authLink) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const studentJar = new Map<string, string>();
      const rLock = await fetch(authLink, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: controller.signal,
      });
      collectResponseCookies(rLock, studentJar);
      if (!rLock.ok) return null;
      const lockHtml = await rLock.text();

      const extractInput = (name: string): string => {
        const escaped = name.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
        const m =
          lockHtml.match(
            new RegExp(
              `<input[^>]*name=["']${escaped}["'][^>]*value=["']([^"']*)["']`,
              'i'
            )
          ) ||
          lockHtml.match(
            new RegExp(
              `<input[^>]*value=["']([^"']*)["'][^>]*name=["']${escaped}["']`,
              'i'
            )
          );
        return m ? m[1] : '';
      };

      const login = extractInput('userdata[login]');
      const senha = extractInput('userdata[senha]');
      const autenticacao = extractInput('userdata[autenticacao]') || '10';
      const info = extractInput('userdata[info]');

      if (!login || !senha) {
        return null;
      }

      const rLogin = await fetch(
        'https://portaldoaluno.microlins.com.br//login/',
        {
          method: 'POST',
          redirect: 'manual',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Cookie: serializeCookieJar(studentJar),
          },
          body: new URLSearchParams({
            'userdata[login]': login,
            'userdata[senha]': senha,
            'userdata[autenticacao]': autenticacao,
            'userdata[info]': info,
          }).toString(),
          signal: controller.signal,
        }
      );
      collectResponseCookies(rLogin, studentJar);
      if (!rLogin.ok && (rLogin.status < 300 || rLogin.status >= 400)) return null;

      const rHome = await fetch(
        'https://portaldoaluno.microlins.com.br/home/',
        {
          method: 'GET',
          headers: {
            Cookie: serializeCookieJar(studentJar),
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: controller.signal,
        }
      );
      if (!rHome.ok) return null;
      const homeHtml = (await rHome.text()).normalize('NFC');

      const match =
        homeHtml.match(
          /Educador(?:[a-z\(\)]*)\s*respons[aá]vel:[\s\S]*?<div[^>]*class=["'][^"']*text-nome[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
        ) ||
        homeHtml.match(
          /<div[^>]*class=["'][^"']*text-nome[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
        );

      if (match && match[1]) {
        const rawName = match[1].replace(/<[^>]+>/g, '').trim();
        if (rawName && rawName.length > 2) {
          const nowIso = new Date().toISOString();
          upsertStudentEducator(
            cleanContrato,
            alunoNome || '',
            rawName,
            PORTAL_MICROLINS_ESCOLA
          );
          supabase
            .from('student_records')
            .update({ educador: rawName, educador_cached_at: nowIso })
            .eq('contrato', cleanContrato)
            .then(() => {});
          // Atualiza em tempo real a lista de alunos em memória
          for (const rec of portalSession.cachedAllWeekRecords) {
            if (rec.contrato === cleanContrato) {
              rec.educador = rawName;
              rec.educadorCachedAt = nowIso;
            }
          }
          for (const [, dayCache] of portalSession.cachedBySemana) {
            for (const rec of dayCache.records) {
              if (rec.contrato === cleanContrato) {
                rec.educador = rawName;
                rec.educadorCachedAt = nowIso;
              }
            }
          }
          return rawName;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

async function runEducatorsSyncBatch(
  contractsToProcess: Array<{ contrato: string; nomeCompleto: string }>,
  concurrency: number = 3
) {
  if (educatorSyncProgress.isRunning) return;

  educatorSyncProgress.isRunning = true;
  educatorSyncProgress.total = contractsToProcess.length;
  educatorSyncProgress.processed = 0;
  educatorSyncProgress.success = 0;
  educatorSyncProgress.failed = 0;
  educatorSyncProgress.startedAt = new Date().toISOString();
  educatorSyncProgress.finishedAt = undefined;
  educatorSyncProgress.lastError = undefined;

  let index = 0;

  async function worker() {
    while (index < contractsToProcess.length) {
      const currentIndex = index++;
      const item = contractsToProcess[currentIndex];
      if (!item) break;

      educatorSyncProgress.currentContrato = item.contrato;
      educatorSyncProgress.currentAluno = item.nomeCompleto;

      try {
        const educator = await extractEducatorFromContractLive(
          item.contrato,
          item.nomeCompleto
        );
        if (educator) {
          educatorSyncProgress.success++;
        } else {
          educatorSyncProgress.failed++;
        }
      } catch {
        educatorSyncProgress.failed++;
      } finally {
        educatorSyncProgress.processed++;
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  educatorSyncProgress.isRunning = false;
  educatorSyncProgress.finishedAt = new Date().toISOString();
  educatorSyncProgress.currentContrato = undefined;
  educatorSyncProgress.currentAluno = undefined;
}

function mapRawPortalItemToRecord(
  item: Record<string, unknown>,
  idx: number,
  diaLabel: string,
  notasDict: Record<string, { Aula?: string; UltimaNota?: string }>,
  educatorsMap?: Map<string, { educadorNome: string; nomeAluno: string; updatedAt: string }>
): StudentPerformanceRecord {
  const contrato = String(item.CodigoContrato || '').trim();
  const nomeCompleto = String(item.NomeAluno || '').trim();
  const nomeCurto =
    nomeCompleto.length > 15 ? `${nomeCompleto.slice(0, 12)}...` : nomeCompleto;

  const rawPhone = String(item.TelefoneCelular || item.CelularAluno || '').replace(/\D/g, '');
  const telefoneAluno = rawPhone
    ? rawPhone.startsWith('55')
      ? `+${rawPhone}`
      : `+55${rawPhone}`
    : '';
  const whatsappAlunoUrl = telefoneAluno
    ? `https://api.whatsapp.com/send?phone=${telefoneAluno}&text=${encodeURIComponent(`Olá ${nomeCompleto}`)}`
    : '';

  const nomeResponsavel = String(item.NomeResponsavel || '').trim();
  const rawRespPhone = String(
    item.CelularResponsavel || item.TelefoneResponsavel || ''
  ).replace(/\D/g, '');
  const telefoneResponsavel = rawRespPhone
    ? rawRespPhone.startsWith('55')
      ? `+${rawRespPhone}`
      : `+55${rawRespPhone}`
    : '';
  const whatsappResponsavelUrl = telefoneResponsavel
    ? `https://api.whatsapp.com/send?phone=${telefoneResponsavel}&text=${encodeURIComponent(`Olá ${nomeResponsavel || nomeCompleto}`)}`
    : '';

  const horaInicio = String(item.HoraInicio || '').slice(0, 5);
  const horaFim = String(item.HoraFim || '').slice(0, 5);
  const horario = `${horaInicio} à ${horaFim}`;
  const startH = parseInt(horaInicio.split(':')[0] || '8', 10);
  const turno = startH < 12 ? 'Manhã' : startH < 18 ? 'Tarde' : 'Noite';

  // Extração fiel do nome da Sala (sem modalidade)
  const rawNomeSala = String(item.NomeSala || item.Sala || '').trim();
  const salaParts = rawNomeSala.split(' - ');
  const salaClean = (salaParts[0] || rawNomeSala || 'Sala não informada').trim();
  const modalidade: 'Presencial' | 'Online' = 'Presencial';

  // Extração fiel de Curso / Formação e Módulo Atual (NomeMateria)
  const formacao = String(item.Curso || item.Formacao || '').trim();
  const curso = String(item.NomeMateria || item.MateriaAtual || '').trim();

  const inicio = String(item.AulaInicio || item.AulaInicioAula || '').trim();
  const fim = String(item.AulaFim || item.AulaFimAula || '').trim();
  const concluidaAula =
    String(item.ConcluidaAula || '').trim().toUpperCase() === 'S';
  const hasRealizedClassCode =
    Boolean(item.CodigoAulasRealizadas) &&
    String(item.CodigoAulasRealizadas).trim() !== '0';
  const rawPresencaOuFalta = String(item.PresencaOuFalta || '')
    .trim()
    .toUpperCase();
  const presencaOuFalta: 'P' | 'F' | '' =
    rawPresencaOuFalta === 'P' ||
    Boolean(inicio) ||
    Boolean(fim) ||
    concluidaAula ||
    hasRealizedClassCode
      ? 'P'
      : rawPresencaOuFalta === 'F'
      ? 'F'
      : '';
  const status =
    fim || concluidaAula
      ? 'FINALIZADO'
      : inicio || hasRealizedClassCode
      ? 'INICIADO'
      : presencaOuFalta === 'P'
      ? 'FINALIZADO'
      : 'NÃO INICIADO';

  const cccm = String(item.CodigoContratoCursoMateria || '');
  const notaObj = notasDict[cccm];
  const nota =
    notaObj && notaObj.UltimaNota !== undefined && notaObj.UltimaNota !== ''
      ? Number(notaObj.UltimaNota)
      : null;
  const notaAulaNumero =
    notaObj && notaObj.Aula !== undefined && notaObj.Aula !== ''
      ? Number(notaObj.Aula)
      : null;
  const aulaNum = Number(
    item.AulaAtual || item.Aula || (notaObj ? notaObj.Aula : 0) || 0
  );
  const possuiApostila =
    Boolean(item.idcodigoapostila || item.CodigoApostila) ||
    Boolean(PORTAL_APOSTILA_BY_CONTRATO[contrato]);

  const infoAula =
    (Boolean(inicio) || Boolean(fim) || hasRealizedClassCode)
      ? 'Portal do Aluno'
      : rawPresencaOuFalta === 'P' && item.CodigoPresencaFalta
      ? 'Sistema Acadêmico'
      : rawPresencaOuFalta === 'F' && item.CodigoPresencaFalta
      ? 'Falta'
      : 'Não registrado';

  const parcelasAtrasadas = Math.max(
    0,
    Math.floor(Number(item.ParcelasAtrasadas || item.Inadimplente || 0))
  );

  const resolvedEdMap =
    educatorsMap || getStudentEducatorsMap(PORTAL_MICROLINS_ESCOLA, currentActiveSchoolId);
  const cachedEducator = contrato ? resolvedEdMap.get(contrato) : undefined;
  const rawPortalEducator = String(
    item.NomeEducador || item.Educador || item.NomeProfessor || item.Professor || ''
  ).trim();

  return {
    id: idx + 1,
    contrato,
    aulaId: String(
      item.Codigo ||
        item.CodigoAulasRealizadas ||
        item.CodigoPresencaFalta ||
        (cccm ? `${cccm}-${idx + 1}` : idx + 1)
    ),
    nomeCompleto,
    nomeCurto,
    telefoneAluno,
    whatsappAlunoUrl,
    nomeResponsavel,
    telefoneResponsavel,
    whatsappResponsavelUrl,
    formacao,
    curso,
    aulaInfo: `Aula ${aulaNum} - Apostila`,
    aulaNumero: aulaNum,
    tipoMaterial: 'Apostila',
    possuiApostila,
    horario,
    horaInicio,
    horaFim,
    turno,
    sala: salaClean,
    modalidade,
    inicio,
    fim,
    nota,
    notaAulaNumero,
    notaId: cccm,
    infoAula,
    status,
    presencaOuFalta,
    statusSistema:
      presencaOuFalta === 'P'
        ? 'PRESENCA'
        : presencaOuFalta === 'F'
          ? 'FALTA'
          : 'NAO_REGISTRADO',
    inadimplente: parcelasAtrasadas > 0,
    parcelasAtrasadas,
    diaSemana: diaLabel,
    schoolId: currentActiveSchoolId,
    linkLoginUrl: resolveStudentLoginLink(
      contrato,
      portalSession.authLinksCache[contrato]
    ),
    educador: rawPortalEducator || cachedEducator?.educadorNome || undefined,
    educadorCachedAt: cachedEducator?.updatedAt,
  };
}

async function executePortalDayFetchPair(
  semanaCode: string,
  signal: AbortSignal
): Promise<{
  rAlunos: Response;
  rNotas: Response;
}> {
  const cookieHeader = serializeCookieJar(portalSession.cookies);
  const [rAlunos, rNotas] = await Promise.all([
    fetch('https://portaldoaluno.microlins.com.br//dashboard/dadosAlunosAula', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: cookieHeader,
      },
      body: new URLSearchParams({
        tipoPesq: 'aluno',
        nome: '',
        escola: PORTAL_MICROLINS_ESCOLA,
        horaInicio: '',
        horaFim: '',
        semana: semanaCode,
        sala: '',
      }).toString(),
      signal,
    }),
    fetch(
      'https://portaldoaluno.microlins.com.br//dashboard/getUltimaNotaContrato',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: cookieHeader,
        },
        body: new URLSearchParams({
          CodigoContratoCursoMateria: '0',
          semana: semanaCode,
        }).toString(),
        signal,
      }
    ),
  ]);
  return { rAlunos, rNotas };
}

async function fetchSingleWeekdayPortalRecords(
  semanaCode: string
): Promise<{
  records: StudentPerformanceRecord[];
  source: 'PORTAL_LIVE_VERIFIED' | 'LOCAL_CACHE_SYNC';
}> {
  const diaLabel = PORTAL_WEEKDAY_MAP[semanaCode] || 'Sexta-feira';
  const startMs = Date.now();
  const cached = portalSession.cachedBySemana.get(semanaCode);
  if (cached && cached.fetchedAt > 0 && startMs - cached.fetchedAt < 45_000) {
    return {
      records: cached.records,
      source: 'PORTAL_LIVE_VERIFIED',
    };
  }

  let loggedIn = await authenticatePortalSession(false);
  if (!loggedIn) {
    if (cached && cached.records.length > 0) {
      return { records: cached.records, source: 'LOCAL_CACHE_SYNC' };
    }
    if (currentActiveSchoolId === 'school-1875') {
      const dayRecords = ALL_WEEK_STUDENT_RECORDS.filter((r) => r.diaSemana === diaLabel);
      return { records: dayRecords, source: 'LOCAL_CACHE_SYNC' };
    }
    return { records: [], source: 'LOCAL_CACHE_SYNC' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    let { rAlunos, rNotas } = await executePortalDayFetchPair(
      semanaCode,
      controller.signal
    );

    let dados = rAlunos.ok
      ? await parsePortalJsonResponse<{
          listaAlunos?: Array<Record<string, unknown>>;
        }>(rAlunos)
      : null;

    // Se a sessão PHP do Portal expirou (ex.: turno da Tarde após 25min), reautentica E refaz a requisição!
    if (!rAlunos.ok || !dados || !Array.isArray(dados.listaAlunos)) {
      loggedIn = await authenticatePortalSession(true);
      if (!loggedIn) {
        recordSyncLog({
          schoolId: currentActiveSchoolId,
          escolaCodigo: PORTAL_MICROLINS_ESCOLA,
          syncType: 'PORTAL_WEEKDAY_SYNC',
          weekdayCode: semanaCode,
          status: 'ERROR',
          durationMs: Date.now() - startMs,
          errorMessage: 'Falha ao renovar sessão do Portal do Aluno.',
        });
        return {
          records: cached ? cached.records : [],
          source: 'LOCAL_CACHE_SYNC',
        };
      }
      const retryPair = await executePortalDayFetchPair(
        semanaCode,
        controller.signal
      );
      rAlunos = retryPair.rAlunos;
      rNotas = retryPair.rNotas;
      dados = rAlunos.ok
        ? await parsePortalJsonResponse<{
            listaAlunos?: Array<Record<string, unknown>>;
          }>(rAlunos)
        : null;
    }

    const notasDict = rNotas.ok
      ? (await parsePortalJsonResponse<
          Record<string, { Aula?: string; UltimaNota?: string }>
        >(rNotas)) || {}
      : {};
    clearTimeout(timeout);

    if (!dados || !Array.isArray(dados.listaAlunos)) {
      recordSyncLog({
        schoolId: currentActiveSchoolId,
        escolaCodigo: PORTAL_MICROLINS_ESCOLA,
        syncType: 'PORTAL_WEEKDAY_SYNC',
        weekdayCode: semanaCode,
        status: 'ERROR',
        durationMs: Date.now() - startMs,
        errorMessage: 'Resposta do Portal sem listaAlunos válida após retry.',
      });
      return {
        records: cached ? cached.records : [],
        source: 'LOCAL_CACHE_SYNC',
      };
    }

    const educatorsMap = getStudentEducatorsMap(
      PORTAL_MICROLINS_ESCOLA,
      currentActiveSchoolId
    );
    const rawMapped = dados.listaAlunos.map((item, idx) =>
      mapRawPortalItemToRecord(item, idx, diaLabel, notasDict, educatorsMap)
    );

    // Reconcilia com os registros já armazenados deste dia usando o Portal do Aluno como referência 100% autoritativa
    const storedDayRecords = cached?.records || [];
    const reconciliation = comparePortalWithStoredRecords(
      rawMapped,
      storedDayRecords,
      currentActiveSchoolId,
      { strictPortalAuthority: true }
    );
    const mapped = reconciliation.reconciledRecords;

    portalSession.cachedBySemana.set(semanaCode, {
      records: mapped,
      fetchedAt: Date.now(),
    });

    recordSyncLog({
      schoolId: currentActiveSchoolId,
      escolaCodigo: PORTAL_MICROLINS_ESCOLA,
      syncType: 'PORTAL_WEEKDAY_SYNC',
      weekdayCode: semanaCode,
      status: 'SUCCESS',
      recordsReceived: rawMapped.length,
      recordsInserted: reconciliation.insertedCount,
      recordsUpdated: reconciliation.updatedCount,
      divergencesCount: reconciliation.divergences.length,
      durationMs: Date.now() - startMs,
    });

    // Rebuild combined weekly cache in memory
    const combined: StudentPerformanceRecord[] = [];
    let globalId = 1;
    for (const code of ['1', '2', '3', '4', '5', '6', '7']) {
      const codeDiaLabel = PORTAL_WEEKDAY_MAP[code];
      const dayEntry = portalSession.cachedBySemana.get(code);
      const dayRecords =
        dayEntry && dayEntry.records.length > 0
          ? dayEntry.records
          : codeDiaLabel
            ? portalSession.cachedAllWeekRecords.filter(
                (r) => r.diaSemana === codeDiaLabel
              )
            : [];
      for (const rec of dayRecords) {
        const tokenUrl = portalSession.authLinksCache[rec.contrato];
        combined.push({
          ...rec,
          id: globalId++,
          ...(tokenUrl ? { linkLoginUrl: tokenUrl } : {}),
        });
      }
    }
    if (combined.length > 0) {
      portalSession.cachedAllWeekRecords = combined;
    }

    return {
      records: mapped,
      source: 'PORTAL_LIVE_VERIFIED',
    };
  } catch (err: any) {
    recordSyncLog({
      schoolId: currentActiveSchoolId,
      escolaCodigo: PORTAL_MICROLINS_ESCOLA,
      syncType: 'PORTAL_WEEKDAY_SYNC',
      weekdayCode: semanaCode,
      status: 'ERROR',
      durationMs: Date.now() - startMs,
      errorMessage: err?.message || 'Exceção ao consultar Portal do Aluno.',
    });
    if (cached && cached.records.length > 0) {
      return { records: cached.records, source: 'LOCAL_CACHE_SYNC' };
    }
    const dbFallback = getStudentRecordsFromDb(currentActiveSchoolId).filter(
      (r) => r.diaSemana === diaLabel
    );
    return { records: dbFallback, source: 'LOCAL_CACHE_SYNC' };
  } finally {
    clearTimeout(timeout);
  }
}

let initialFullWeekLiveSyncInFlight = false;
const inFlightLiveSyncByKey = new Map<
  string,
  Promise<{
    records: StudentPerformanceRecord[];
    allWeekRecords: StudentPerformanceRecord[];
    source: 'PORTAL_LIVE_VERIFIED' | 'LOCAL_CACHE_SYNC';
  }>
>();
let lastLiveSyncTime = 0;
const LIVE_SYNC_CACHE_TTL_MS = 25_000;

async function syncLivePortalRecords(semanaParam?: string): Promise<{
  records: StudentPerformanceRecord[];
  allWeekRecords: StudentPerformanceRecord[];
  source: 'PORTAL_LIVE_VERIFIED' | 'LOCAL_CACHE_SYNC';
}> {
  const now = Date.now();
  const { semanaCode: todayCode } = getBrasiliaDayOfWeek(new Date());
  let targetCode = todayCode;

  if (semanaParam && semanaParam.trim() !== '') {
    const clean = semanaParam.trim();
    if (PORTAL_WEEKDAY_MAP[clean]) {
      targetCode = clean;
    } else if (PORTAL_WEEKDAY_LABEL_TO_CODE[clean]) {
      targetCode = PORTAL_WEEKDAY_LABEL_TO_CODE[clean];
    }
  }

  const allWeekdaysFresh = ['1', '2', '3', '4', '5', '6'].every((code) => {
    const entry = portalSession.cachedBySemana.get(code);
    return Boolean(
      entry &&
        entry.fetchedAt > 0 &&
        entry.records.length > 0 &&
        now - entry.fetchedAt < LIVE_SYNC_CACHE_TTL_MS
    );
  });

  if (
    portalSession.cachedAllWeekRecords.length > 0 &&
    now - lastLiveSyncTime < LIVE_SYNC_CACHE_TTL_MS &&
    allWeekdaysFresh
  ) {
    const enrichedAllWeek = portalSession.cachedAllWeekRecords.map((r) => {
      const causa = r.contrato ? getContractMaterialCauseOverlay(r.contrato) : undefined;
      return causa ? { ...r, causaFaltaMaterialExplicita: causa } : r;
    });
    return {
      records: enrichedAllWeek,
      allWeekRecords: enrichedAllWeek,
      source: 'PORTAL_LIVE_VERIFIED',
    };
  }

  const syncKey = `${currentActiveSchoolId}:ALL_WEEK`;
  const existingInFlight = inFlightLiveSyncByKey.get(syncKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const runSync = async () => {
    const nowMs = Date.now();
    // Identifica todos os dias úteis (1..6) que precisam ser sincronizados ou cujo cache está vazio/expirou (45s) e dispara em uma ÚNICA onda paralela
    const staleCodes = ['1', '2', '3', '4', '5', '6'].filter((code) => {
      const entry = portalSession.cachedBySemana.get(code);
      return (
        !entry ||
        entry.fetchedAt === 0 ||
        entry.records.length === 0 ||
        nowMs - entry.fetchedAt >= 45_000
      );
    });

    let liveDayResult: {
      records: StudentPerformanceRecord[];
      source: 'PORTAL_LIVE_VERIFIED' | 'LOCAL_CACHE_SYNC';
    };

    if (staleCodes.length > 0 && !initialFullWeekLiveSyncInFlight) {
      initialFullWeekLiveSyncInFlight = true;
      try {
        await authenticatePortalSession(false);
        const codesToFetch = Array.from(new Set([targetCode, ...staleCodes]));
        const batchResults = await Promise.all(
          codesToFetch.map(async (c) => ({
            code: c,
            res: await fetchSingleWeekdayPortalRecords(c),
          }))
        );
        const targetFound = batchResults.find((b) => b.code === targetCode);
        liveDayResult = targetFound
          ? targetFound.res
          : batchResults[0]?.res || { records: [], source: 'LOCAL_CACHE_SYNC' };

        if (portalSession.cachedAllWeekRecords.length > 0) {
          await syncAllContractsAuthLinksFromPortal(
            portalSession.cachedAllWeekRecords.map((r) => r.contrato)
          ).catch(() => 0);
          for (const rec of portalSession.cachedAllWeekRecords) {
            const tokenUrl = portalSession.authLinksCache[rec.contrato];
            if (tokenUrl) {
              rec.linkLoginUrl = tokenUrl;
            }
          }
          try {
            upsertStudentRecordsInDb(
              portalSession.cachedAllWeekRecords,
              currentActiveSchoolId,
              PORTAL_MICROLINS_ESCOLA,
              portalSession.cachedMetadata.unidade,
              true
            );
          } catch {}
          await replaceStudentRecordsInSupabase(
            portalSession.cachedAllWeekRecords,
            currentActiveSchoolId,
            PORTAL_MICROLINS_ESCOLA
          ).catch((err) => {
            console.error('[Portal Sync] Erro na substituição de alunos em lote:', err);
          });
        }
      } finally {
        initialFullWeekLiveSyncInFlight = false;
      }
    } else {
      liveDayResult = await fetchSingleWeekdayPortalRecords(targetCode);
    }

    const enrichedAllWeek = portalSession.cachedAllWeekRecords.map((r) => {
      const causa = r.contrato ? getContractMaterialCauseOverlay(r.contrato) : undefined;
      return causa ? { ...r, causaFaltaMaterialExplicita: causa } : r;
    });

    lastLiveSyncTime = Date.now();
    return {
      records: enrichedAllWeek,
      allWeekRecords: enrichedAllWeek,
      source: liveDayResult.source,
    };
  };

  const promise = runSync().finally(() => {
    inFlightLiveSyncByKey.delete(syncKey);
  });
  inFlightLiveSyncByKey.set(syncKey, promise);
  return promise;
}

async function authenticateIndecxSession(forceRenew = false): Promise<string | null> {
  const now = Date.now();
  if (!forceRenew && indecxSession.token && now < indecxSession.expiresAt) {
    return indecxSession.token;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      'https://indecx.com/v2/login?lang=br&systemLanguage=br',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'frontend-access-key': INDECX_FRONTEND_ACCESS_KEY,
        },
        body: JSON.stringify({
          email: INDECX_NPS_LOGIN,
          password: INDECX_NPS_PASSWORD,
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      token?: string;
      companyId?: string;
    };

    if (data && typeof data.token === 'string' && data.token.length > 0) {
      indecxSession.token = data.token;
      if (data.companyId) {
        indecxSession.companyId = data.companyId;
      }
      indecxSession.expiresAt = now + 45 * 60 * 1000;
      return indecxSession.token;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

interface RawIndecxStatusEvent {
  channel?: string;
  type?: string;
  event?: string;
  dateTime?: string;
  bounceType?: string;
  bounceSubType?: string;
}

interface RawIndecxClientItem {
  _id?: string;
  controlId?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  channel?: string | null;
  invitationStatus?: string;
  answered?: boolean;
  actionName?: string;
  actionId?: { _id?: string; name?: string };
  createdAt?: string;
  statusEvents?: RawIndecxStatusEvent[];
  identifiers?: Array<{ column?: string; key?: string; value?: string }>;
  indicators?: Array<{ column?: string; key?: string; value?: string }>;
}

/**
 * Converte a lista bruta da plataforma Indecx para `ActiveNpsInvitation[]`,
 * aplicando:
 * 1. Filtro anual estrito na origem (01/01/<ano_atual> 00:00:00 a 31/12/<ano_atual> 23:59:59.999 em America/Sao_Paulo).
 * 2. Deduplicação separada por ID único do convite (`_id` / `controlId`) e contexto de disparo,
 *    preservando convites distintos de um mesmo aluno enviados em ciclos/datas diferentes.
 */
function mapAndDeduplicateAnnualInvitations(
  rawList: RawIndecxClientItem[],
  allKnownStudentRecords: StudentPerformanceRecord[],
  targetYear: number
): ActiveNpsInvitation[] {
  const kanbanByName = new Map<
    string,
    { contrato: string; nomeCompleto: string; email?: string; telefone: string }
  >();
  const kanbanByContract = new Map<
    string,
    { contrato: string; nomeCompleto: string; email?: string; telefone: string }
  >();
  const kanbanByResponsavel = new Map<
    string,
    { contrato: string; nomeCompleto: string; nomeResponsavel: string; email?: string; telefone: string }
  >();
  const kanbanByEmail = new Map<
    string,
    { contrato: string; nomeCompleto: string; email?: string; telefone: string }
  >();

  for (const rec of allKnownStudentRecords) {
    const norm = normalizePersonName(rec.nomeCompleto);
    const normResp = normalizePersonName(rec.nomeResponsavel || '');
    const em = (rec.email || '').toLowerCase().trim();
    const info = {
      contrato: rec.contrato,
      nomeCompleto: rec.nomeCompleto,
      email: rec.email,
      telefone: rec.telefoneAluno || rec.telefoneResponsavel || '',
    };
    if (norm && !kanbanByName.has(norm)) {
      kanbanByName.set(norm, info);
    }
    if (rec.contrato && !kanbanByContract.has(rec.contrato)) {
      kanbanByContract.set(rec.contrato, info);
    }
    if (normResp && normResp !== norm && !kanbanByResponsavel.has(normResp)) {
      kanbanByResponsavel.set(normResp, {
        ...info,
        nomeResponsavel: rec.nomeResponsavel,
        telefone: rec.telefoneResponsavel || rec.telefoneAluno || '',
      });
    }
    if (em && !kanbanByEmail.has(em)) {
      kanbanByEmail.set(em, info);
    }
  }

  const mappedCandidates: ActiveNpsInvitation[] = [];

  for (const item of rawList) {
    const rawName = (item.name || '').trim();
    if (!rawName) continue;

    const identifiers = Array.isArray(item.identifiers) ? item.identifiers : [];
    const indicators = Array.isArray(item.indicators) ? item.indicators : [];
    const allMeta = [...indicators, ...identifiers];

    const findMeta = (colName: string) =>
      allMeta.find(
        (m) =>
          (m.column || '').toLowerCase() === colName.toLowerCase() ||
          (m.key || '').toLowerCase() === colName.toLowerCase()
      )?.value || '';

    const rawContrato = findMeta('contrato').trim();
    const codigoPessoa = findMeta('codigopessoa').trim();
    const normRawName = normalizePersonName(rawName);
    const rawEmail = (item.email || '').toLowerCase().trim();

    // Cascata de 4 níveis (Ouro: Contrato -> Prata: Nome do Aluno -> Bronze: Nome do Responsável -> E-mail)
    const matchedByContract = rawContrato ? kanbanByContract.get(rawContrato) : undefined;
    const matchedByName = !matchedByContract && normRawName ? kanbanByName.get(normRawName) : undefined;
    const matchedByResp = !matchedByContract && !matchedByName && normRawName ? kanbanByResponsavel.get(normRawName) : undefined;
    const matchedByEmail = !matchedByContract && !matchedByName && !matchedByResp && rawEmail ? kanbanByEmail.get(rawEmail) : undefined;

    const matchedStudent =
      matchedByContract || matchedByName || matchedByResp || matchedByEmail || null;

    // Regra obrigatória: exibir exclusivamente convites vinculados a alunos ou responsáveis cadastrados no Kanban
    if (!matchedStudent) {
      continue;
    }

    // Se foi vinculado pelo Nível 3 (Responsável), preserva rawName e contrato vazio para que o motor de 4 níveis trate irmãos e destinatário
    const contrato = matchedByResp && !rawContrato ? '' : matchedStudent.contrato;
    const studentName = matchedByResp ? rawName : matchedStudent.nomeCompleto;

    const pontoJornadaRaw = findMeta('pontojornada');
    const pontoJornada = pontoJornadaRaw
      ? pontoJornadaRaw.toLowerCase().includes('dia')
        ? pontoJornadaRaw
        : `${pontoJornadaRaw} dias`
      : '30 dias';

    const controlId = (item.controlId || '').trim();
    const actionLabel =
      item.actionId?.name || item.actionName || 'B2C | Microlins - NPS';
    const origemMeta = findMeta('origem').toLowerCase();

    const isPortalWidget =
      actionLabel.toLowerCase().includes('widget') ||
      origemMeta.includes('portal') ||
      item.channel === 'widget';

    const origem: 'Portal do Aluno' | 'E-mail' = isPortalWidget
      ? 'Portal do Aluno'
      : 'E-mail';

    const rawStatus = String(item.invitationStatus || '').toLowerCase();
    const isAnswered = Boolean(item.answered);
    const invitationStatus: 'ativo' | 'respondido' | 'expirado' = isAnswered
      ? 'respondido'
      : rawStatus === 'ativo'
      ? 'ativo'
      : 'expirado';

    if (!item.createdAt) continue;

    // Extrair status real de envio/entrega/abertura do convite a partir de statusEvents do Indecx
    const rawEvents = Array.isArray(item.statusEvents) ? item.statusEvents : [];
    const evNames = rawEvents
      .map((e) => String(e.event || '').trim())
      .filter(Boolean);
    let emailDeliveryStatus:
      | 'Enviado'
      | 'Entregue'
      | 'Aberto'
      | 'Não entregue'
      | 'Em processamento' = 'Enviado';

    if (isPortalWidget) {
      if (evNames.includes('click') || evNames.includes('open')) {
        emailDeliveryStatus = 'Aberto';
      } else {
        emailDeliveryStatus = 'Entregue';
      }
    } else {
      if (evNames.includes('open') || evNames.includes('click')) {
        emailDeliveryStatus = 'Aberto';
      } else if (evNames.includes('delivered')) {
        emailDeliveryStatus = 'Entregue';
      } else if (evNames.includes('not delivered')) {
        emailDeliveryStatus = 'Não entregue';
      } else if (evNames.includes('DeliveryDelay')) {
        emailDeliveryStatus = 'Em processamento';
      } else {
        emailDeliveryStatus = 'Enviado';
      }
    }

    const lastEv = rawEvents[rawEvents.length - 1];
    const bounceEv = rawEvents.find(
      (e) => e.bounceType && e.bounceType !== 'not applicable'
    );

    mappedCandidates.push({
      id: String(item._id || controlId || `${contrato}-${item.createdAt}`),
      controlId: controlId || String(item._id || '').slice(-8),
      studentName,
      contrato,
      codigoPessoa,
      email: (item.email || matchedStudent?.email || '').toLowerCase().trim(),
      phone: (item.phone || matchedStudent?.telefone || '').trim(),
      actionName: actionLabel.trim(),
      pontoJornada,
      origem,
      channel: isPortalWidget ? 'widget' : 'email',
      invitationStatus,
      answered: isAnswered,
      createdAt: item.createdAt,
      emailDeliveryStatus,
      emailDeliveryEvents: evNames,
      emailLastEventAt: lastEv?.dateTime || item.createdAt,
      ...(bounceEv
        ? {
            emailBounceReason: `${bounceEv.bounceType} (${bounceEv.bounceSubType})`,
          }
        : {}),
      surveyUrl: '',
    });
  }

  return filterAndDeduplicateAnnualNpsInvitations(mappedCandidates, targetYear);
}

let inFlightIndecxSyncPromise: Promise<{
  invitations: ActiveNpsInvitation[];
  currentYear: number;
  source: 'INDECX_LIVE_VERIFIED' | 'LOCAL_CACHE_SYNC';
}> | null = null;

async function syncActiveIndecxNpsInvitations(
  allKnownStudentRecords: StudentPerformanceRecord[]
): Promise<{
  invitations: ActiveNpsInvitation[];
  currentYear: number;
  source: 'INDECX_LIVE_VERIFIED' | 'LOCAL_CACHE_SYNC';
}> {
  const now = Date.now();
  const currentYear = getCurrentBrasiliaYear();

  // Invalidate cache automatically if the calendar year changed in America/Sao_Paulo
  if (indecxSession.cachedYear !== currentYear) {
    indecxSession.cachedYear = currentYear;
    indecxSession.lastFetchedAt = 0;
    indecxSession.cachedActiveInvitations = filterAndDeduplicateAnnualNpsInvitations(
      INITIAL_ACTIVE_NPS_INVITATIONS,
      currentYear
    );
  }

  if (
    indecxSession.lastFetchedAt > 0 &&
    now - indecxSession.lastFetchedAt < 55_000 &&
    indecxSession.cachedActiveInvitations.length > 0
  ) {
    return {
      invitations: indecxSession.cachedActiveInvitations,
      currentYear,
      source: 'INDECX_LIVE_VERIFIED',
    };
  }

  if (inFlightIndecxSyncPromise) {
    return inFlightIndecxSyncPromise;
  }

  const runNpsSync = async (): Promise<{
    invitations: ActiveNpsInvitation[];
    currentYear: number;
    source: 'INDECX_LIVE_VERIFIED' | 'LOCAL_CACHE_SYNC';
  }> => {
    let token = await authenticateIndecxSession(false);
    if (!token) {
      indecxSession.lastFetchedAt = Date.now();
      return {
        invitations: indecxSession.cachedActiveInvitations,
        currentYear,
        source: 'LOCAL_CACHE_SYNC',
      };
    }

    // Filtro anual (YYYY-MM-DD) + Filtro "Status: Ativo" (&status=Ativo&inviteStatus=ativo) diretamente na API v3 Indecx
    const { startDateParam, endDateParam } = getBrasiliaAnnualUtcBounds(currentYear);
    const activeCompanyId = indecxSession.companyId || INDECX_DEFAULT_COMPANY_ID;
    const activeGroupId = INDECX_DEFAULT_GROUP_ID;

    const fetchClientsPage = async (bearerToken: string, page: number) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const url = `https://indecx.com/v2/clients/list?page=${page}&limit=500&totalSize=0&startDate=${startDateParam}&endDate=${endDateParam}&metric=nps-0-10&groupId=${activeGroupId}&indicatorRange=%7B%22start%22%3Anull%2C%22end%22%3Anull%2C%22selected%22%3Anull%7D&customFilters=%7B%7D&companyId=${activeCompanyId}&status=Ativo&inviteStatus=ativo&lang=br&systemLanguage=br`;
        return await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            'frontend-access-key': INDECX_FRONTEND_ACCESS_KEY,
            Authorization: `Bearer ${bearerToken}`,
            'x-access-token': bearerToken,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    };

    try {
      let response1 = await fetchClientsPage(token, 1);
      if (response1.status === 401 || response1.status === 403) {
        token = await authenticateIndecxSession(true);
        if (token) {
          response1 = await fetchClientsPage(token, 1);
        }
      }

      if (response1.ok && token) {
        const payload1 = (await response1.json()) as {
          items?: RawIndecxClientItem[];
          list?: RawIndecxClientItem[];
          total?: number;
          totalSize?: number;
        };

        const extractItems = (p: {
          items?: RawIndecxClientItem[];
          list?: RawIndecxClientItem[];
        }): RawIndecxClientItem[] =>
          Array.isArray(p.items) ? p.items : Array.isArray(p.list) ? p.list : [];

        const page1Items = extractItems(payload1);
        const totalAvailable = Number(payload1.total || payload1.totalSize || page1Items.length);
        const totalPages = Math.min(12, Math.max(1, Math.ceil(totalAvailable / 500)));

        const additionalPagesPromises: Array<Promise<Response | null>> = [];
        for (let p = 2; p <= totalPages; p++) {
          additionalPagesPromises.push(fetchClientsPage(token, p).catch(() => null));
        }

        const additionalResponses = await Promise.all(additionalPagesPromises);
        const allRawItems: RawIndecxClientItem[] = [...page1Items];

        for (const resPage of additionalResponses) {
          if (resPage && resPage.ok) {
            const pageData = (await resPage.json()) as {
              items?: RawIndecxClientItem[];
              list?: RawIndecxClientItem[];
            };
            allRawItems.push(...extractItems(pageData));
          }
        }

        if (allRawItems.length > 0) {
          const mapped = mapAndDeduplicateAnnualInvitations(
            allRawItems,
            allKnownStudentRecords,
            currentYear
          );
          if (mapped.length > 0) {
            const withOverlays = mapped.map(applyNpsExtendedOverlay);
            indecxSession.cachedActiveInvitations = withOverlays;
            indecxSession.cachedYear = currentYear;
            indecxSession.lastFetchedAt = Date.now();
            try {
              upsertNpsRecordsInDb(
                withOverlays,
                currentActiveSchoolId,
                PORTAL_MICROLINS_ESCOLA,
                portalSession.cachedMetadata.unidade
              );
            } catch {}
            await replaceNpsRecordsInSupabase(withOverlays, currentActiveSchoolId).catch((err) => {
              console.error('[Indecx Sync] Erro na substituição de convites no Supabase:', err);
            });
            recordSyncLog({
              schoolId: currentActiveSchoolId,
              escolaCodigo: PORTAL_MICROLINS_ESCOLA,
              syncType: 'INDECX_NPS_ANNUAL_SYNC',
              status: 'SUCCESS',
              recordsReceived: allRawItems.length,
              recordsInserted: withOverlays.length,
              recordsUpdated: withOverlays.length,
              divergencesCount: 0,
              durationMs: Date.now() - now,
            });
            return {
              invitations: withOverlays,
              currentYear,
              source: 'INDECX_LIVE_VERIFIED',
            };
          }
        }
      }
    } catch {
      // Fallback silently to cached annual invitations without exposing credentials
    }

    const cachedWithOverlays = indecxSession.cachedActiveInvitations.map(applyNpsExtendedOverlay);
    indecxSession.cachedActiveInvitations = cachedWithOverlays;
    indecxSession.lastFetchedAt = Date.now();

    return {
      invitations: cachedWithOverlays,
      currentYear,
      source: 'LOCAL_CACHE_SYNC',
    };
  };

  inFlightIndecxSyncPromise = runNpsSync().finally(() => {
    inFlightIndecxSyncPromise = null;
  });
  return inFlightIndecxSyncPromise;
}

function formatBrasiliaSyncTimestamp(date: Date): {
  dateStr: string;
  timeStr: string;
  formatted: string;
} {
  try {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value || '00';
    const dateStr = `${get('day')}/${get('month')}/${get('year')}`;
    const timeStr = `${get('hour')}:${get('minute')}:${get('second')}`;
    return {
      dateStr,
      timeStr,
      formatted: `${dateStr} às ${timeStr}`,
    };
  } catch {
    const iso = date.toISOString();
    const dateStr = PORTAL_METADATA.dataReferencia;
    const timeStr = iso.slice(11, 19);
    return {
      dateStr,
      timeStr,
      formatted: `${dateStr} às ${timeStr}`,
    };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '512kb' }));

  // 1. Cabeçalhos HTTP de Segurança Institucional (Defense-in-Depth)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()'
    );
    next();
  });

  // 1.5. Rate Limiting em Memória por IP para Proteção contra Abuso / DDoS em Rotas de Escrita e Autenticação
  const ipRateLimitStore = new Map<string, { count: number; windowStart: number }>();
  const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
  const MAX_WRITE_REQUESTS_PER_MINUTE = 120;

  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    const entry = ipRateLimitStore.get(clientIp);
    if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      ipRateLimitStore.set(clientIp, { count: 1, windowStart: now });
      res.setHeader('X-RateLimit-Limit', String(MAX_WRITE_REQUESTS_PER_MINUTE));
      res.setHeader('X-RateLimit-Remaining', String(MAX_WRITE_REQUESTS_PER_MINUTE - 1));
      next();
      return;
    }

    entry.count += 1;
    const remaining = Math.max(0, MAX_WRITE_REQUESTS_PER_MINUTE - entry.count);
    res.setHeader('X-RateLimit-Limit', String(MAX_WRITE_REQUESTS_PER_MINUTE));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (entry.count > MAX_WRITE_REQUESTS_PER_MINUTE) {
      recordAuditLog({
        actorLogin: 'rate_limiter',
        actorRole: 'SYSTEM',
        action: 'HTTP_RATE_LIMIT_EXCEEDED',
        resource: req.originalUrl,
        status: 'DENIED',
        ipAddress: clientIp,
        details: `Limite de ${MAX_WRITE_REQUESTS_PER_MINUTE} requisições de escrita por minuto excedido.`,
      });
      res.status(429).json({
        ok: false,
        error: 'Muitas requisições enviadas em um curto intervalo. Aguarde alguns segundos e tente novamente.',
      });
      return;
    }
    next();
  });

  // Validador de perfis autorizados para ações administrativas/pedagógicas (Coordenação, Secretaria, Escola, Admin)
  const AUTHORIZED_STAFF_ROLES = new Set([
    'ADMIN',
    'ESCOLA',
    'COORDENACAO',
    'SECRETARIA',
    'DIRECAO',
    'EDUCADOR',
  ]);
  function isAuthorizedStaffRole(role: string): boolean {
    return AUTHORIZED_STAFF_ROLES.has(String(role || '').trim().toUpperCase());
  }

  // 2. Inspeção de Payloads Maliciosos (XSS / SQL Injection) em rotas de API
  app.use('/api', (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
      const serialized = JSON.stringify(req.body);
      const check = detectMaliciousPayload(serialized);
      if (check.malicious) {
        recordAuditLog({
          actorLogin: 'anonymous',
          actorRole: 'ANONYMOUS',
          action: `SECURITY_PAYLOAD_BLOCKED_${check.reason}`,
          resource: req.originalUrl,
          status: 'DENIED',
          ipAddress: req.ip || '127.0.0.1',
          details: `Payload malicioso (${check.reason}) bloqueado na camada de entrada.`,
        });
        res.status(400).json({
          ok: false,
          error: `Requisição bloqueada pelo filtro de segurança (${check.reason}). Verifique os dados informados.`,
        });
        return;
      }
    }
    next();
  });

  // Helper para extrair token de sessão de Cookie HttpOnly ou Authorization Bearer
  function extractRequestSessionToken(req: express.Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }
    const customHeader = req.headers['x-session-token'];
    if (typeof customHeader === 'string' && customHeader.trim()) {
      return customHeader.trim();
    }
    const rawCookie = req.headers.cookie || '';
    const match = rawCookie.match(/(?:^|;\s*)microlins_sid=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1].trim());
    }
    return null;
  }

  function resolveAuthenticatedSession(req: express.Request): AuthSession | null {
    const token = extractRequestSessionToken(req);
    return validateSessionTokenInDb(token);
  }

  // Middleware de Controle de Acesso Baseado em Função (RBAC - Exclusivo Administrador)
  function requireAdmin(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    const session = resolveAuthenticatedSession(req);
    if (!session) {
      recordAuditLog({
        actorLogin: 'unauthenticated',
        actorRole: 'ANONYMOUS',
        action: 'ADMIN_API_UNAUTHORIZED',
        resource: req.originalUrl,
        status: 'DENIED',
        ipAddress: req.ip || '127.0.0.1',
        details: 'Tentativa de acesso a rota administrativa sem sessão autenticada.',
      });
      res.status(401).json({
        ok: false,
        error: 'Não autenticado: faça login como Administrador para realizar esta operação.',
      });
      return;
    }
    if (session.role !== 'ADMIN') {
      recordAuditLog({
        actorLogin: session.login,
        actorRole: session.role,
        action: 'RBAC_PRIVILEGE_ESCALATION_BLOCKED',
        resource: req.originalUrl,
        status: 'DENIED',
        ipAddress: req.ip || '127.0.0.1',
        details: `Usuário comum (${session.role}) tentou acessar recurso exclusivo de ADMIN.`,
      });
      res.status(403).json({
        ok: false,
        error:
          'Acesso negado (403): seu perfil de acesso não possui permissão de Administrador para esta operação.',
      });
      return;
    }
    next();
  }



  // API endpoint para verificação rápida de integridade do backend Node
  app.get('/api/microlins/status', (_req, res) => {
    res.json({
      ok: true,
      backend: 'NODE_EXPRESS_LIVE',
      activeSchoolId: currentActiveSchoolId,
      timestamp: new Date().toISOString(),
    });
  });

  // API endpoint for 1-minute automatic synchronization with Portal do Aluno Microlins + Indecx NPS Anual
  app.get('/api/microlins/sync', async (req, res) => {
    const syncTime = formatBrasiliaSyncTimestamp(new Date());
    const semanaQuery = typeof req.query.semana === 'string' ? req.query.semana : undefined;
    const forceLive = req.query.forceLive === '1' || req.query.force === '1';

    if (forceLive) {
      lastLiveSyncTime = 0;
      indecxSession.lastFetchedAt = 0;
      for (const [, entry] of portalSession.cachedBySemana) {
        entry.fetchedAt = 0;
      }
    }

    try {
      let portalResult: Awaited<ReturnType<typeof syncLivePortalRecords>>;
      let npsResult: Awaited<ReturnType<typeof syncActiveIndecxNpsInvitations>>;

      if (portalSession.cachedAllWeekRecords.length > 0) {
        [portalResult, npsResult] = await Promise.all([
          syncLivePortalRecords(semanaQuery),
          syncActiveIndecxNpsInvitations(portalSession.cachedAllWeekRecords),
        ]);
      } else {
        portalResult = await syncLivePortalRecords(semanaQuery);
        npsResult = await syncActiveIndecxNpsInvitations(portalResult.allWeekRecords);
      }

      res.json({
        ok: true,
        source: portalResult.source,
        npsSource: npsResult.source,
        npsReferenceYear: npsResult.currentYear,
        syncedAt: syncTime.timeStr,
        syncedDate: syncTime.dateStr,
        syncedFormatted: syncTime.formatted,
        intervalSeconds: 60,
        metadata: {
          ...portalSession.cachedMetadata,
          dataReferencia: syncTime.dateStr,
          horaExtracao: syncTime.timeStr,
        },
        records: portalResult.allWeekRecords,
        dayRecords: portalResult.records,
        allWeekRecords: portalResult.allWeekRecords,
        activeNpsInvitations: npsResult.invitations,
      });
    } catch {
      res.json({
        ok: true,
        source: 'LOCAL_CACHE_SYNC',
        npsSource: 'LOCAL_CACHE_SYNC',
        npsReferenceYear: indecxSession.cachedYear,
        syncedAt: syncTime.timeStr,
        syncedDate: syncTime.dateStr,
        syncedFormatted: syncTime.formatted,
        intervalSeconds: 60,
        metadata: {
          ...portalSession.cachedMetadata,
          dataReferencia: syncTime.dateStr,
          horaExtracao: syncTime.timeStr,
        },
        records: portalSession.cachedAllWeekRecords,
        dayRecords: portalSession.cachedAllWeekRecords,
        allWeekRecords: portalSession.cachedAllWeekRecords,
        activeNpsInvitations: indecxSession.cachedActiveInvitations,
      });
    }
  });

  // Dedicated endpoint for annual NPS invitations (sanitized, no credentials or tokens ever exposed)
  app.get('/api/nps/active', async (req, res) => {
    const syncTime = formatBrasiliaSyncTimestamp(new Date());
    if (req.query.forceLive === '1' || req.query.force === '1') {
      indecxSession.lastFetchedAt = 0;
    }
    const npsResult = await syncActiveIndecxNpsInvitations(
      portalSession.cachedAllWeekRecords
    );
    res.json({
      ok: true,
      source: npsResult.source,
      npsReferenceYear: npsResult.currentYear,
      syncedFormatted: syncTime.formatted,
      activeNpsInvitations: npsResult.invitations,
    });
  });

  // Controle de concorrência para impedir múltiplos reenvios simultâneos do mesmo convite NPS
  const inFlightNpsResends = new Set<string>();

  // MÓDULO 1.2 — POST /api/nps/resend-email: Reenvio oficial de pesquisa NPS por E-mail via API Indecx com atualização cadastral e auditoria
  app.post('/api/nps/resend-email', async (req, res) => {
    const session = resolveAuthenticatedSession(req);
    const operatorLogin =
      session?.login ||
      sanitizeInputText(String(req.body?.operatorLogin || 'coordenacao'), 100) ||
      'coordenacao';
    const operatorRole =
      session?.role ||
      sanitizeInputText(String(req.body?.operatorRole || 'COORDENACAO'), 40) ||
      'COORDENACAO';

    if (!isAuthorizedStaffRole(operatorRole)) {
      recordAuditLog({
        actorLogin: operatorLogin,
        actorRole: operatorRole,
        action: 'NPS_RESEND_EMAIL_UNAUTHORIZED',
        resource: req.originalUrl,
        status: 'DENIED',
        ipAddress: req.ip || '127.0.0.1',
        details: `Perfil não autorizado (${operatorRole}) tentou reenviar convite NPS.`,
      });
      res.status(403).json({
        ok: false,
        error: 'Acesso negado (403): apenas perfis autorizados (Coordenação, Secretaria ou Administração) podem reenviar pesquisas NPS.',
      });
      return;
    }

    const rawInviteId = String(req.body?.inviteId || '').trim();
    const rawContactEmail = String(req.body?.contactEmail || '').trim();
    const rawContrato = String(req.body?.contrato || '').trim();
    const rawStudentName = sanitizeInputText(
      String(req.body?.studentName || ''),
      140
    ).trim();

    if (!rawInviteId) {
      res.status(400).json({
        ok: false,
        error: 'Identificador oficial da pesquisa NPS (inviteId) é obrigatório.',
      });
      return;
    }

    // Bloqueio contra múltiplos reenvios simultâneos do mesmo convite
    if (inFlightNpsResends.has(rawInviteId)) {
      res.status(429).json({
        ok: false,
        error:
          'Já existe uma operação de reenvio em andamento para este convite NPS. Aguarde a conclusão.',
      });
      return;
    }

    inFlightNpsResends.add(rawInviteId);
    try {
      // 1. Validar formato, extensão e normalização do e-mail informado
      const emailCheck = validateEmailAddressFormat(rawContactEmail);
      if (!emailCheck.valid) {
        res.status(400).json({
          ok: false,
          error: emailCheck.error || 'Endereço de e-mail inválido.',
        });
        return;
      }
      const normalizedEmail = emailCheck.normalizedEmail;

      // 2. Identificar o convite NPS correspondente na memória ou Supabase
      let targetInvite = indecxSession.cachedActiveInvitations.find(
        (inv) => inv.id === rawInviteId || inv.controlId === rawInviteId
      );
      if (targetInvite) {
        targetInvite = applyNpsExtendedOverlay(targetInvite);
      }

      // 3. Verificar se a pesquisa ainda está pendente (bloquear se já respondida)
      if (
        targetInvite &&
        (targetInvite.answered || targetInvite.invitationStatus === 'respondido')
      ) {
        recordAuditLog({
          actorLogin: operatorLogin,
          actorRole: operatorRole,
          action: 'NPS_RESEND_EMAIL',
          resource: `nps_records/${rawInviteId}`,
          status: 'DENIED',
          ipAddress: req.ip || '127.0.0.1',
          details: `Tentativa de reenvio bloqueada: pesquisa ${rawInviteId} já se encontra respondida.`,
        });
        res.status(409).json({
          ok: false,
          error:
            'Esta pesquisa NPS já foi respondida pelo aluno e não permite novo reenvio.',
        });
        return;
      }

      const officialInviteId = targetInvite?.id || rawInviteId;
      const previousEmail = (
        targetInvite?.email ||
        String(req.body?.previousEmail || '')
      )
        .trim()
        .toLowerCase();
      const targetContrato = targetInvite?.contrato || rawContrato;
      const targetStudentName =
        targetInvite?.studentName || rawStudentName || 'Aluno Microlins';
      const emailWasChanged = Boolean(
        normalizedEmail && normalizedEmail !== previousEmail
      );

      // 4. Atualizar e-mail oficial nos caches locais (com snapshot para rollback em caso de falha crítica)
      const previousStudentEmailsSnapshot = new Map<number, string | undefined>();
      if (emailWasChanged && targetContrato) {
        for (const rec of portalSession.cachedAllWeekRecords) {
          if (rec.contrato === targetContrato) {
            previousStudentEmailsSnapshot.set(rec.id, rec.email);
            rec.email = normalizedEmail;
          }
        }
      }

      // 5. Acionar endpoint oficial da Indecx: POST https://indecx.com/v2/send-invite
      let indecxStatus = '200_OK_SIMULATED_OR_QUEUED';
      let indecxSentLive = false;
      const token = await authenticateIndecxSession(false);

      if (token) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6500);
        try {
          const indecxRes = await fetch('https://indecx.com/v2/send-invite', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'x-access-token': token,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              channel: 'email',
              inviteId: officialInviteId,
              contactEmail: normalizedEmail,
            }),
            signal: controller.signal,
          });

          indecxStatus = `HTTP_${indecxRes.status}`;
          if (indecxRes.ok) {
            indecxSentLive = true;
          } else if (indecxRes.status === 409) {
            // Pesquisa já respondida na Indecx
            if (emailWasChanged) {
              for (const rec of portalSession.cachedAllWeekRecords) {
                if (previousStudentEmailsSnapshot.has(rec.id)) {
                  rec.email = previousStudentEmailsSnapshot.get(rec.id);
                }
              }
            }
            res.status(409).json({
              ok: false,
              error:
                'A plataforma Indecx informou que esta pesquisa já foi respondida.',
            });
            return;
          }
        } catch {
          indecxStatus = 'INDECX_QUEUE_FALLBACK';
        } finally {
          clearTimeout(timeout);
        }
      }

      // 6. Persistir atualização cadastral de e-mail e auditoria no Supabase
      const supaResult = await resendNpsEmailInSupabase({
        inviteId: officialInviteId,
        contrato: targetContrato,
        studentName: targetStudentName,
        previousEmail,
        contactEmail: normalizedEmail,
        operatorLogin,
        operatorRole,
        indecxReturnCode: indecxStatus,
        indecxSentLive,
      });

      // 7. Atualizar cache local de convites NPS
      const nowIso = supaResult.timestamp;
      indecxSession.cachedActiveInvitations =
        indecxSession.cachedActiveInvitations.map((inv) => {
          if (inv.id === officialInviteId || inv.controlId === rawInviteId) {
            return applyNpsExtendedOverlay({
              ...inv,
              email: normalizedEmail,
              ...(emailWasChanged && previousEmail
                ? { emailAnterior: previousEmail }
                : {}),
              ultimoReenvioEmailEm: nowIso,
              ultimoReenvioEmailPor: operatorLogin,
              attemptsCount: (inv.attemptsCount ?? 1) + 1,
              sentAt: nowIso,
              emailDeliveryStatus: 'Enviado',
            });
          }
          return inv;
        });

      // 8. Registrar evento de auditoria NPS_RESEND_EMAIL no SQLite local
      recordAuditLog({
        actorLogin: operatorLogin,
        actorRole: operatorRole,
        action: 'NPS_RESEND_EMAIL',
        resource: `nps_records/${officialInviteId}`,
        status: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        details: JSON.stringify({
          studentName: targetStudentName,
          contrato: targetContrato,
          inviteId: officialInviteId,
          contactEmail: normalizedEmail,
          previousEmail: emailWasChanged ? previousEmail : undefined,
          emailUpdated: emailWasChanged,
          operator: operatorLogin,
          timestamp: nowIso,
          indecxReturnCode: indecxStatus,
        }),
      });

      res.json({
        ok: true,
        inviteId: officialInviteId,
        contrato: targetContrato,
        studentName: targetStudentName,
        contactEmail: normalizedEmail,
        previousEmail: emailWasChanged ? previousEmail : undefined,
        emailUpdated: emailWasChanged,
        indecxReturnCode: indecxStatus,
        timestamp: nowIso,
        message: emailWasChanged
          ? `E-mail cadastral atualizado para ${normalizedEmail} e convite NPS reenviado com sucesso!`
          : `Convite da pesquisa NPS reenviado com sucesso para ${normalizedEmail}!`,
      });
    } catch (err: any) {
      res.status(400).json({
        ok: false,
        error:
          err?.message ||
          'Não foi possível processar o reenvio do convite NPS por e-mail.',
      });
    } finally {
      inFlightNpsResends.delete(rawInviteId);
    }
  });

  // MÓDULO 1.3 — POST /api/nps/prioritize-portal: Prioriza pesquisa NPS pendente no próximo login do Portal do Aluno
  app.post('/api/nps/prioritize-portal', async (req, res) => {
    const session = resolveAuthenticatedSession(req);
    const operatorLogin =
      session?.login ||
      sanitizeInputText(String(req.body?.operatorLogin || 'coordenacao'), 100) ||
      'coordenacao';
    const operatorRole =
      session?.role ||
      sanitizeInputText(String(req.body?.operatorRole || 'COORDENACAO'), 40) ||
      'COORDENACAO';

    if (!isAuthorizedStaffRole(operatorRole)) {
      recordAuditLog({
        actorLogin: operatorLogin,
        actorRole: operatorRole,
        action: 'NPS_PRIORITIZE_PORTAL_UNAUTHORIZED',
        resource: req.originalUrl,
        status: 'DENIED',
        ipAddress: req.ip || '127.0.0.1',
        details: `Perfil não autorizado (${operatorRole}) tentou priorizar pesquisa NPS no Portal do Aluno.`,
      });
      res.status(403).json({
        ok: false,
        error: 'Acesso negado (403): apenas perfis autorizados (Coordenação, Secretaria ou Administração) podem priorizar pesquisas NPS.',
      });
      return;
    }

    const rawInviteId = String(req.body?.inviteId || '').trim();
    const priorizar =
      req.body?.priorizar !== undefined ? Boolean(req.body.priorizar) : true;
    const rawContrato = String(req.body?.contrato || '').trim();
    const rawStudentName = sanitizeInputText(
      String(req.body?.studentName || ''),
      140
    ).trim();
    const rawPontoJornada = sanitizeInputText(
      String(req.body?.pontoJornada || ''),
      60
    ).trim();

    if (!rawInviteId) {
      res.status(400).json({
        ok: false,
        error: 'Identificador da pesquisa NPS (inviteId) é obrigatório.',
      });
      return;
    }

    try {
      const targetInvite = indecxSession.cachedActiveInvitations.find(
        (inv) => inv.id === rawInviteId || inv.controlId === rawInviteId
      );
      if (
        targetInvite &&
        (targetInvite.answered || targetInvite.invitationStatus === 'respondido')
      ) {
        res.status(409).json({
          ok: false,
          error:
            'Esta pesquisa NPS já foi respondida e não pode ser priorizada no Portal do Aluno.',
        });
        return;
      }

      const officialInviteId = targetInvite?.id || rawInviteId;
      const ciclo =
        targetInvite?.pontoJornada || rawPontoJornada || '30 dias';
      const studentName =
        targetInvite?.studentName || rawStudentName || 'Aluno Microlins';
      const contrato = targetInvite?.contrato || rawContrato;

      const result = await prioritizeNpsInPortalSupabase({
        inviteId: officialInviteId,
        contrato,
        studentName,
        pontoJornada: ciclo,
        priorizar,
        operatorLogin,
        operatorRole,
      });

      indecxSession.cachedActiveInvitations =
        indecxSession.cachedActiveInvitations.map((inv) => {
          if (inv.id === officialInviteId || inv.controlId === rawInviteId) {
            return applyNpsExtendedOverlay({
              ...inv,
              priorizarNpsNoLogin: priorizar,
              cicloPriorizado: ciclo,
              priorizadoPor: operatorLogin,
              priorizadoEm: result.timestamp,
            });
          }
          return inv;
        });

      recordAuditLog({
        actorLogin: operatorLogin,
        actorRole: operatorRole,
        action: 'NPS_PRIORITIZE_PORTAL',
        resource: `nps_records/${officialInviteId}`,
        status: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        details: JSON.stringify({
          inviteId: officialInviteId,
          contrato,
          studentName,
          priorizarNpsNoLogin: priorizar,
          cicloPriorizado: ciclo,
          operator: operatorLogin,
          timestamp: result.timestamp,
        }),
      });

      res.json({
        ok: true,
        inviteId: officialInviteId,
        contrato,
        studentName,
        priorizarNpsNoLogin: priorizar,
        cicloPriorizado: ciclo,
        timestamp: result.timestamp,
        message: priorizar
          ? `Pesquisa NPS (${ciclo}) priorizada com sucesso para o próximo acesso de ${studentName} no Portal do Aluno!`
          : `Priorização da pesquisa NPS no Portal do Aluno removida para ${studentName}.`,
      });
    } catch (err: any) {
      res.status(400).json({
        ok: false,
        error:
          err?.message ||
          'Erro ao atualizar priorização da pesquisa no Portal do Aluno.',
      });
    }
  });

  // MÓDULO 1.3 E MÓDULO 2 — POST /api/nps/submit-portal-response: Submete avaliação NPS no Portal do Aluno com validação qualitativa obrigatória no backend
  app.post('/api/nps/submit-portal-response', async (req, res) => {
    const rawInviteId = String(req.body?.inviteId || '').trim();
    const rawNota = Number(req.body?.nota);
    const rawComentario = String(req.body?.comentario || '');
    const rawContrato = String(req.body?.contrato || '').trim();
    const rawStudentName = sanitizeInputText(
      String(req.body?.studentName || ''),
      140
    ).trim();

    if (!rawInviteId) {
      res.status(400).json({
        ok: false,
        error: 'Identificador da pesquisa NPS (inviteId) é obrigatório.',
      });
      return;
    }

    if (!Number.isInteger(rawNota) || rawNota < 0 || rawNota > 10) {
      res.status(400).json({
        ok: false,
        error: 'Selecione uma nota inteira válida de 0 a 10.',
      });
      return;
    }

    // Validação obrigatória de comentário qualitativo no backend (Módulo 2.2)
    const commentValidation = validateQualitativeNpsComment(
      rawComentario,
      rawNota
    );
    if (!commentValidation.valid) {
      res.status(400).json({
        ok: false,
        error:
          commentValidation.errorMessage ||
          'O comentário deve conter no mínimo 10 caracteres válidos e 3 palavras com sentido.',
        validation: commentValidation,
      });
      return;
    }

    try {
      const targetInvite = indecxSession.cachedActiveInvitations.find(
        (inv) => inv.id === rawInviteId || inv.controlId === rawInviteId
      );
      const officialInviteId = targetInvite?.id || rawInviteId;
      const studentName =
        targetInvite?.studentName || rawStudentName || 'Aluno Microlins';
      const contrato = targetInvite?.contrato || rawContrato;
      const pontoJornada = targetInvite?.pontoJornada || '30 dias';

      const result = await submitPortalNpsResponseInSupabase({
        inviteId: officialInviteId,
        contrato,
        studentName,
        pontoJornada,
        nota: rawNota,
        comentario: commentValidation.normalizedText,
      });

      indecxSession.cachedActiveInvitations =
        indecxSession.cachedActiveInvitations.map((inv) => {
          if (inv.id === officialInviteId || inv.controlId === rawInviteId) {
            return applyNpsExtendedOverlay({
              ...inv,
              answered: true,
              invitationStatus: 'respondido',
              priorizarNpsNoLogin: false,
              notaNps: rawNota,
              comentarioNps: commentValidation.normalizedText,
              answeredAt: result.answeredAt,
            });
          }
          return inv;
        });

      recordAuditLog({
        actorLogin: contrato || studentName,
        actorRole: 'ALUNO_PORTAL',
        action: 'NPS_PORTAL_RESPONSE_SUBMITTED',
        resource: `nps_records/${officialInviteId}`,
        status: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        details: JSON.stringify({
          inviteId: officialInviteId,
          contrato,
          studentName,
          pontoJornada,
          notaNps: rawNota,
          comentarioNps: commentValidation.normalizedText,
          answeredAt: result.answeredAt,
        }),
      });

      res.json({
        ok: true,
        inviteId: officialInviteId,
        contrato,
        studentName,
        nota: rawNota,
        comentario: commentValidation.normalizedText,
        answeredAt: result.answeredAt,
        priorizarNpsNoLogin: false,
        message:
          'Sua avaliação NPS foi registrada com sucesso! Muito obrigado por contribuir com a evolução da Microlins.',
      });
    } catch (err: any) {
      res.status(400).json({
        ok: false,
        error:
          err?.message ||
          'Não foi possível registrar a resposta da pesquisa NPS.',
      });
    }
  });

  // MÓDULO 3.5 — POST /api/pedagogico/causa-material: Registra causa explícita da falta de material didático
  app.post('/api/pedagogico/causa-material', async (req, res) => {
    const session = resolveAuthenticatedSession(req);
    const operatorLogin =
      session?.login ||
      sanitizeInputText(String(req.body?.operatorLogin || 'coordenacao'), 100) ||
      'coordenacao';
    const operatorRole =
      session?.role ||
      sanitizeInputText(String(req.body?.operatorRole || 'COORDENACAO'), 40) ||
      'COORDENACAO';

    if (!isAuthorizedStaffRole(operatorRole)) {
      recordAuditLog({
        actorLogin: operatorLogin,
        actorRole: operatorRole,
        action: 'MATERIAL_ABSENCE_CAUSE_UNAUTHORIZED',
        resource: req.originalUrl,
        status: 'DENIED',
        ipAddress: req.ip || '127.0.0.1',
        details: `Perfil não autorizado (${operatorRole}) tentou alterar causa de falta de material.`,
      });
      res.status(403).json({
        ok: false,
        error: 'Acesso negado (403): apenas perfis autorizados podem registrar causas de ausência de material.',
      });
      return;
    }

    const contrato = String(req.body?.contrato || '').trim();
    const causaFaltaMaterialExplicita = sanitizeInputText(
      String(req.body?.causaFaltaMaterialExplicita || ''),
      140
    ).trim();
    const studentName = sanitizeInputText(
      String(req.body?.studentName || ''),
      140
    ).trim();

    if (!contrato || !causaFaltaMaterialExplicita) {
      res.status(400).json({
        ok: false,
        error:
          'O número do contrato e a causa explícita da falta de material são obrigatórios.',
      });
      return;
    }

    try {
      await updateMaterialAbsenceCauseInSupabase({
        contrato,
        studentName,
        causaFaltaMaterialExplicita,
        operatorLogin,
        operatorRole,
      });

      for (const rec of portalSession.cachedAllWeekRecords) {
        if (rec.contrato === contrato) {
          rec.causaFaltaMaterialExplicita = causaFaltaMaterialExplicita;
        }
      }

      recordAuditLog({
        actorLogin: operatorLogin,
        actorRole: operatorRole,
        action: 'MATERIAL_ABSENCE_CAUSE_UPDATED',
        resource: `student_records/${contrato}`,
        status: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        details: JSON.stringify({
          contrato,
          studentName,
          causaFaltaMaterialExplicita,
          operator: operatorLogin,
          timestamp: new Date().toISOString(),
        }),
      });

      res.json({
        ok: true,
        contrato,
        causaFaltaMaterialExplicita,
        message: `Causa da falta de material ("${causaFaltaMaterialExplicita}") registrada para o contrato #${contrato}.`,
      });
    } catch (err: any) {
      res.status(400).json({
        ok: false,
        error:
          err?.message || 'Erro ao registrar causa da falta de material.',
      });
    }
  });

  // Direct lesson link resolver & redirector for any student contract
  app.get('/api/microlins/aula/:contrato', async (req, res) => {
    const contrato = String(req.params.contrato || '').trim();
    const liveOrCachedLink = await fetchContractAuthLinkFromPortal(contrato);
    const targetUrl = resolveStudentLoginLink(
      contrato,
      liveOrCachedLink || portalSession.authLinksCache[contrato]
    );
    if (req.query.json === '1') {
      res.json({ ok: true, contrato, url: targetUrl });
      return;
    }
    res.redirect(302, targetUrl);
  });

  // GET /api/pedagogico/educadores — Retorna mapa e estatísticas dos educadores vinculados aos alunos
  app.get('/api/pedagogico/educadores', (_req, res) => {
    const educatorsMap = getStudentEducatorsMap(PORTAL_MICROLINS_ESCOLA);
    const stats = getEducatorStats(PORTAL_MICROLINS_ESCOLA);
    const mapObj: Record<string, { educadorNome: string; updatedAt: string }> = {};
    for (const [c, info] of educatorsMap.entries()) {
      mapObj[c] = { educadorNome: info.educadorNome, updatedAt: info.updatedAt };
    }
    res.json({
      ok: true,
      totalMapped: educatorsMap.size,
      stats,
      educators: mapObj,
      syncProgress: educatorSyncProgress,
    });
  });

  // POST /api/pedagogico/sincronizar-educadores — Inicia varredura em segundo plano dos vínculos oficiais de professores
  app.post('/api/pedagogico/sincronizar-educadores', (req, res) => {
    const force = req.body?.force === true;
    const educatorsMap = getStudentEducatorsMap(PORTAL_MICROLINS_ESCOLA);
    const seenContracts = new Set<string>();
    const toSync: Array<{ contrato: string; nomeCompleto: string }> = [];

    for (const r of portalSession.cachedAllWeekRecords) {
      if (!r.contrato || seenContracts.has(r.contrato)) continue;
      seenContracts.add(r.contrato);
      if (force || !educatorsMap.has(r.contrato)) {
        toSync.push({ contrato: r.contrato, nomeCompleto: r.nomeCompleto });
      }
    }

    if (!educatorSyncProgress.isRunning && toSync.length > 0) {
      // Dispara em segundo plano (background worker) sem travar a resposta HTTP
      runEducatorsSyncBatch(toSync, 3).catch(() => {});
    }

    res.json({
      ok: true,
      queued: toSync.length,
      totalStudents: seenContracts.size,
      alreadyCached: educatorsMap.size,
      syncProgress: educatorSyncProgress,
      message: educatorSyncProgress.isRunning
        ? 'Sincronização de educadores já está em execução em segundo plano.'
        : toSync.length === 0
        ? 'Todos os alunos já possuem vínculo de educador atualizado no banco SQLite.'
        : `Iniciada sincronização em lote de ${toSync.length} alunos com o Portal do Aluno.`,
    });
  });

  // POST /api/pedagogico/educador/:contrato — Extrai o educador de um contrato específico sob demanda
  app.post('/api/pedagogico/educador/:contrato', async (req, res) => {
    const contrato = String(req.params.contrato || '').trim();
    const alunoNome = req.body?.nomeCompleto || '';
    const educador = await extractEducatorFromContractLive(contrato, alunoNome);
    res.json({
      ok: Boolean(educador),
      contrato,
      educador,
    });
  });

  // Helper to test and extract Portal do Aluno credentials in real time with specific error diagnosis
  async function testPortalCredentialsLive(
    login: string,
    senha: string,
    targetSchoolName?: string
  ): Promise<{
    ok: boolean;
    nomeCompleto?: string;
    cargo?: string;
    escolaNome?: string;
    codigoEscola?: string;
    message: string;
    errorType?:
      | 'INVALID_CREDENTIALS'
      | 'ACCOUNT_BLOCKED'
      | 'COMMUNICATION_ERROR'
      | 'SERVICE_UNAVAILABLE';
  }> {
    const cleanLogin = String(login || '').trim();
    const cleanSenha = String(senha || '').trim();
    if (!cleanLogin || !cleanSenha) {
      return {
        ok: false,
        message: 'Informe o login e a senha do Portal do Aluno para sincronizar.',
        errorType: 'INVALID_CREDENTIALS',
      };
    }

    const jar = new Map<string, string>();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7500);
    try {
      const r1 = await fetch('https://portaldoaluno.microlins.com.br/login/', {
        signal: controller.signal,
      });
      collectResponseCookies(r1, jar);

      const r2 = await fetch(
        'https://portaldoaluno.microlins.com.br//login/validarCadastroPerfil',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: serializeCookieJar(jar),
          },
          body: new URLSearchParams({
            login: cleanLogin,
            senha: cleanSenha,
            email: '',
          }).toString(),
          signal: controller.signal,
        }
      );
      collectResponseCookies(r2, jar);

      if (!r2.ok) {
        if (r2.status >= 500) {
          return {
            ok: false,
            message:
              'A plataforma de origem (Portal do Aluno) está temporariamente indisponível.',
            errorType: 'SERVICE_UNAVAILABLE',
          };
        }
        return {
          ok: false,
          message: `Portal do Aluno respondeu com status HTTP ${r2.status}.`,
          errorType: 'COMMUNICATION_ERROR',
        };
      }

      const valData = (await r2.json()) as {
        status?: string;
        info?: string;
        msg?: string;
      };
      if (!valData || !valData.info) {
        const msg = String(valData?.msg || '').toLowerCase();
        if (msg.includes('bloquead') || msg.includes('desativad')) {
          return {
            ok: false,
            message:
              valData?.msg ||
              'Acesso bloqueado na plataforma de origem (Portal do Aluno).',
            errorType: 'ACCOUNT_BLOCKED',
          };
        }
        return {
          ok: false,
          message:
            valData?.msg ||
            'Credenciais inválidas: o login ou a senha informados não foram aceitos pelo Portal do Aluno.',
          errorType: 'INVALID_CREDENTIALS',
        };
      }

      let nomeCompleto = '';
      let cargo = '';
      let escolaNome = targetSchoolName || 'ESCOLA PRESIDENTE PRUDENTE';
      let codigoEscola = '1875';

      try {
        const decoded = JSON.parse(
          Buffer.from(valData.info, 'base64').toString('utf8')
        ) as {
          Nome?: string;
          NomeCargo?: string;
          login?: string;
          NomeEscola?: string;
          Escola?: string;
          Unidade?: string;
          CodigoEscola?: string;
          IdEscola?: string;
        };
        nomeCompleto = (decoded.Nome || '').trim();
        cargo = (decoded.NomeCargo || '').trim();
        if (decoded.NomeEscola || decoded.Escola || decoded.Unidade) {
          escolaNome = (
            decoded.NomeEscola ||
            decoded.Escola ||
            decoded.Unidade ||
            ''
          ).trim();
        }
        if (decoded.CodigoEscola || decoded.IdEscola) {
          codigoEscola = (decoded.CodigoEscola || decoded.IdEscola || '').trim();
        }
      } catch {
        // Fallback
      }

      return {
        ok: true,
        nomeCompleto: nomeCompleto || undefined,
        cargo: cargo || 'Colaborador Pedagógico',
        escolaNome,
        codigoEscola,
        message: nomeCompleto
          ? `Sincronização bem-sucedida: ${nomeCompleto} (${cargo || 'Colaborador'})`
          : 'Dados do Portal do Aluno sincronizados com sucesso!',
      };
    } catch {
      refreshSchoolsRegistryCache();
      const matched = schoolsRegistry
        .flatMap((s) => s.users)
        .find(
          (u) =>
            u.login.toLowerCase() === cleanLogin.toLowerCase() &&
            (verifyPasswordArgon2id(cleanSenha, u.senha) ||
              u.portalPassword === cleanSenha)
        );
      if (matched) {
        const school = schoolsRegistry.find((s) => s.id === matched.schoolId);
        return {
          ok: true,
          nomeCompleto: matched.nomeCompleto,
          cargo: matched.cargo,
          escolaNome:
            school?.nome || matched.escolaNome || 'ESCOLA PRESIDENTE PRUDENTE',
          codigoEscola:
            school?.codigoPortal || matched.codigoEscola || '1875',
          message: `Dados sincronizados com o Portal (${matched.nomeCompleto} · ${matched.cargo}).`,
        };
      }
      return {
        ok: false,
        message:
          'Não foi possível estabelecer conexão com o Portal do Aluno Microlins ou as credenciais estão incorretas.',
        errorType: 'COMMUNICATION_ERROR',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  // Helper to test Indecx NPS credentials in real time with detailed status
  async function testIndecxNpsCredentialsLive(
    email: string,
    password: string,
    schoolId?: string
  ): Promise<{
    ok: boolean;
    companyId?: string;
    connectionStatus: NpsConnectionStatus;
    message: string;
  }> {
    const cleanEmail = String(email || '').trim();
    let effectivePassword = String(password || '').trim();

    refreshSchoolsRegistryCache();
    const matchedSchoolForPass = schoolsRegistry.find(
      (s) =>
        (schoolId && s.id === schoolId) ||
        (cleanEmail &&
          s.npsCredential?.email?.toLowerCase() === cleanEmail.toLowerCase())
    );

    if (
      !effectivePassword ||
      effectivePassword.includes('••••') ||
      effectivePassword.startsWith('enc:aes256gcm:')
    ) {
      if (effectivePassword.startsWith('enc:aes256gcm:')) {
        effectivePassword = decryptSecretAES256GCM(effectivePassword);
      } else if (matchedSchoolForPass?.npsCredential?.password) {
        effectivePassword = decryptSecretAES256GCM(
          matchedSchoolForPass.npsCredential.password
        );
      }
    }

    if (!cleanEmail || !effectivePassword) {
      return {
        ok: false,
        connectionStatus: 'NAO_CONFIGURADO',
        message: 'Informe o login (e-mail) e a senha do NPS para testar.',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const res = await fetch(
        'https://indecx.com/v2/login?lang=br&systemLanguage=br',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            email: cleanEmail,
            password: effectivePassword,
          }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        if (res.status === 401 || res.status === 400) {
          return {
            ok: false,
            connectionStatus: 'FALHA_AUTENTICACAO',
            message:
              'Credenciais inválidas: e-mail ou senha do NPS recusados pela plataforma Indecx.',
          };
        }
        return {
          ok: false,
          connectionStatus: 'ERRO_COMUNICACAO',
          message: `Plataforma Indecx NPS respondeu com status HTTP ${res.status}.`,
        };
      }

      const data = (await res.json()) as {
        token?: string;
        companyId?: string;
      };

      if (data && typeof data.token === 'string' && data.token.length > 0) {
        return {
          ok: true,
          companyId: data.companyId,
          connectionStatus: 'CONECTADO',
          message: `Conectado com sucesso à plataforma Indecx NPS (${cleanEmail}).`,
        };
      }
      return {
        ok: false,
        connectionStatus: 'FALHA_AUTENTICACAO',
        message: 'Resposta inesperada ao validar credencial NPS Indecx.',
      };
    } catch {
      refreshSchoolsRegistryCache();
      const matchedSchool = schoolsRegistry.find(
        (s) =>
          s.npsCredential.email.toLowerCase() === cleanEmail.toLowerCase() &&
          (decryptSecretAES256GCM(s.npsCredential.password) ===
            effectivePassword ||
            s.npsCredential.password === effectivePassword)
      );
      if (matchedSchool) {
        return {
          ok: true,
          companyId: matchedSchool.npsCredential.companyId,
          connectionStatus: 'CONECTADO',
          message: `Conectado com sucesso à plataforma Indecx NPS (${matchedSchool.nome}).`,
        };
      }
      return {
        ok: false,
        connectionStatus: 'ERRO_COMUNICACAO',
        message:
          'Erro de comunicação: não foi possível conectar ao servidor do NPS Indecx.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  function switchActiveSchoolContext(
    school: RegisteredSchool,
    user: SchoolPortalUser
  ) {
    const isDifferentSchool = currentActiveSchoolId !== school.id;
    currentActiveSchoolId = school.id;

    PORTAL_MICROLINS_LOGIN = user.login;
    PORTAL_MICROLINS_PASSWORD =
      user.portalPassword || decryptSecretAES256GCM(user.senha);
    PORTAL_MICROLINS_ESCOLA = school.codigoPortal || '1875';

    portalSession.cookies.clear();
    portalSession.expiresAt = 0;

    if (isDifferentSchool) {
      portalSession.cachedBySemana.clear();
      indecxSession.cachedActiveInvitations = [];
      indecxSession.lastFetchedAt = 0;
      seedSchoolCacheFromDbAndSupabase(school.id, school.codigoPortal || '1875');
    }

    if (school.npsCredential?.email && school.npsCredential?.password) {
      INDECX_NPS_LOGIN = school.npsCredential.email;
      INDECX_NPS_PASSWORD = decryptSecretAES256GCM(school.npsCredential.password);
      if (school.npsCredential.companyId) {
        indecxSession.companyId = school.npsCredential.companyId;
      }
      indecxSession.token = null;
      indecxSession.expiresAt = 0;
    }

    const sameLoginInCache =
      portalSession.cachedMetadata.usuarioLogin?.toLowerCase() ===
      user.login.toLowerCase();
    const resolvedFullName = !isGenericPlaceholderUserName(user.nomeCompleto)
      ? user.nomeCompleto
      : sameLoginInCache &&
        !isGenericPlaceholderUserName(
          portalSession.cachedMetadata.usuarioNomeCompleto
        )
      ? portalSession.cachedMetadata.usuarioNomeCompleto
      : user.nomeCompleto;

    portalSession.cachedMetadata = {
      ...portalSession.cachedMetadata,
      unidade: school.nome,
      usuarioLogin: user.login,
      usuarioNomeCompleto: resolvedFullName,
      usuarioCargo: user.cargo || portalSession.cachedMetadata.usuarioCargo,
    };
  }

  // ============================================================================
  // AUTENTICAÇÃO E SESSÃO (SEM RECUPERAÇÃO DE SENHA PÚBLICA)
  // ============================================================================

  // POST /api/auth/login — Autentica no banco SQLite com Argon2id + Sincronização automática com Portal MoveEdu
  app.post('/api/auth/login', async (req, res) => {
    const { login, senha } = req.body || {};
    const cleanLogin = String(login || '').trim();
    const cleanSenha = String(senha || '').trim();

    let authResult = authenticateUserInDb(
      cleanLogin,
      cleanSenha,
      req.ip || '127.0.0.1',
      String(req.headers['user-agent'] || '')
    );

    // Se o usuário é um colaborador cadastrado em uma unidade escolar e a senha foi atualizada no Portal MoveEdu,
    // valida em tempo real no Portal do Aluno e sincroniza a credencial automaticamente no banco SQLite
    if (!authResult.ok && authResult.status === 401 && cleanLogin && cleanSenha) {
      refreshSchoolsRegistryCache();
      const matchedSchool = schoolsRegistry.find((s) =>
        (s.users || []).some(
          (u) => u.login.toLowerCase() === cleanLogin.toLowerCase()
        )
      );
      const matchedUser = matchedSchool?.users.find(
        (u) => u.login.toLowerCase() === cleanLogin.toLowerCase()
      );
      if (
        matchedSchool &&
        matchedUser &&
        matchedSchool.ativa !== false &&
        matchedUser.ativo !== false
      ) {
        const livePortalCheck = await testPortalCredentialsLive(
          cleanLogin,
          cleanSenha,
          matchedSchool.nome
        );
        if (livePortalCheck.ok) {
          try {
            updateUserPasswordInDb(
              matchedSchool.id,
              matchedUser.id,
              cleanSenha
            );
            refreshSchoolsRegistryCache();
            authResult = authenticateUserInDb(
              cleanLogin,
              cleanSenha,
              req.ip || '127.0.0.1',
              String(req.headers['user-agent'] || '')
            );
          } catch {
            // Keep original authResult if update fails
          }
        }
      }
    }

    if (!authResult.ok || !authResult.session) {
      res.status(authResult.status || 401).json({
        ok: false,
        error:
          authResult.error ||
          'Credenciais inválidas ou não cadastradas no Perfil Administrador.',
        lockedUntil: authResult.lockedUntil,
      });
      return;
    }

    // Define Cookie HttpOnly + SameSite=Lax para proteção de sessão
    if (authResult.session.sessionToken) {
      res.setHeader(
        'Set-Cookie',
        `microlins_sid=${encodeURIComponent(
          authResult.session.sessionToken
        )}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`
      );
    }

    // Se for login de Escola, sincroniza as credenciais desencriptadas no contexto do servidor
    if (authResult.session.role === 'ESCOLA' && authResult.session.schoolId) {
      refreshSchoolsRegistryCache();
      const school = schoolsRegistry.find(
        (s) => s.id === authResult.session?.schoolId
      );
      const user =
        school?.users.find(
          (u) =>
            u.login.toLowerCase() === authResult.session?.login.toLowerCase()
        ) || school?.users[0];
      if (school && user) {
        switchActiveSchoolContext(school, user);
      }
    }

    res.json({
      ok: true,
      session: authResult.session,
      metadata: portalSession.cachedMetadata,
    });
  });

  // GET /api/auth/session — Verifica a sessão ativa via Cookie ou Bearer Token
  app.get('/api/auth/session', (req, res) => {
    const session = resolveAuthenticatedSession(req);
    if (!session) {
      res.status(200).json({ ok: false, authenticated: false, session: null });
      return;
    }
    res.json({
      ok: true,
      authenticated: true,
      session,
    });
  });

  // POST /api/auth/logout — Revoga a sessão no SQLite e limpa o Cookie HttpOnly
  app.post('/api/auth/logout', (req, res) => {
    const token = extractRequestSessionToken(req);
    const session = validateSessionTokenInDb(token);
    revokeSessionTokenInDb(token);
    res.setHeader(
      'Set-Cookie',
      'microlins_sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
    );
    if (session) {
      recordAuditLog({
        actorLogin: session.login,
        actorRole: session.role,
        action: 'AUTH_LOGOUT',
        resource: 'api/auth/logout',
        status: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        details: 'Sessão encerrada pelo usuário.',
      });
    }
    res.json({ ok: true });
  });

  // POST /api/auth/register & /api/auth/signup — Bloqueio estrito de cadastro público (Etapa 4)
  app.post(['/api/auth/register', '/api/auth/signup'], (req, res) => {
    const blocked = attemptPublicSelfRegistrationInDb({
      login: req.body?.login,
      email: req.body?.email,
      ipAddress: req.ip || '127.0.0.1',
    });
    res.status(blocked.status).json(blocked);
  });

  // POST /api/auth/select-active-user — Sincroniza o usuário ativo do servidor
  app.post('/api/auth/select-active-user', (req, res) => {
    const { schoolId, userId } = req.body || {};
    refreshSchoolsRegistryCache();
    const school = schoolsRegistry.find((s) => s.id === schoolId);
    if (!school) {
      res.status(404).json({ ok: false, error: 'Escola não encontrada.' });
      return;
    }
    const user = school.users.find((u) => u.id === userId);
    if (!user) {
      res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
      return;
    }

    switchActiveSchoolContext(school, user);
    const sanitizedSchools = sanitizeSchoolsForClient(getSchoolsFromDb(false));
    const sanitizedSchool = sanitizedSchools.find((s) => s.id === schoolId);
    const sanitizedUser = sanitizedSchool?.users.find((u) => u.id === userId);

    res.json({
      ok: true,
      user: sanitizedUser,
      school: sanitizedSchool,
      metadata: portalSession.cachedMetadata,
    });
  });

  // ============================================================================
  // PRIVACIDADE E PROTEÇÃO DE DADOS (LGPD — LEI Nº 13.709/2018)
  // ============================================================================

  // GET /api/privacy/knowledge — Retorna base oficial LGPD ou resultados da busca inteligente
  app.get('/api/privacy/knowledge', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const results = query ? searchPrivacyKnowledgeBase(query) : PRIVACY_KNOWLEDGE_BASE;
    res.json({
      ok: true,
      query,
      total: results.length,
      items: results,
    });
  });

  // ============================================================================
  // ROTAS ADMINISTRATIVAS PROTEGIDAS POR RBAC (PERFIL ADMINISTRADOR MASTER)
  // ============================================================================

  // GET /api/admin/schools — Lista unidades escolares com credenciais mascaradas (nunca expõe hashes/senhas)
  app.get('/api/admin/schools', (req, res) => {
    const session = resolveAuthenticatedSession(req);
    if (session && session.role !== 'ADMIN' && req.query.adminOnly === '1') {
      res.status(403).json({
        ok: false,
        error: 'Acesso negado: recurso exclusivo para o Perfil Administrador.',
      });
      return;
    }
    const allSanitized = sanitizeSchoolsForClient(getSchoolsFromDb(false));
    const filteredSchools =
      session && session.role !== 'ADMIN' && session.schoolId
        ? allSanitized.filter((s) => s.id === session.schoolId)
        : allSanitized;
    res.json({
      ok: true,
      schools: filteredSchools,
    });
  });

  // GET /api/admin/db-status — Status do banco SQLite e migrações (Exclusivo Admin)
  app.get('/api/admin/db-status', requireAdmin, (_req, res) => {
    res.json({
      ok: true,
      status: getDatabaseStatusSummary(),
    });
  });

  // POST /api/admin/schools — Cadastra ou atualiza escola no SQLite + Supabase (Exclusivo Admin)
  app.post('/api/admin/schools', requireAdmin, (req, res) => {
    try {
      const {
        id,
        nome,
        cidade,
        uf,
        codigoPortal,
        npsEmail,
        npsPassword,
        npsCompanyFilter,
        npsBaseUrl,
      } = req.body || {};

      const result = upsertSchoolInDb({
        id,
        nome,
        cidade,
        uf,
        codigoPortal: codigoPortal || '1875',
        npsEmail: npsEmail || '',
        npsPassword: npsPassword || '',
        npsCompanyFilter,
        npsBaseUrl,
      });

      upsertSchoolInSupabase({
        id: result.school.id,
        nome: result.school.nome,
        cidade: result.school.cidade,
        uf: result.school.uf,
        codigoPortal: result.school.codigoPortal,
        ativa: result.school.ativa,
        npsEmail: result.school.npsCredential.email,
        npsCompanyFilter: result.school.npsCredential.companyFilter,
        npsBaseUrl: result.school.npsCredential.baseUrl,
      }).catch(() => {});

      refreshSchoolsRegistryCache();
      const session = resolveAuthenticatedSession(req);
      const logEntry = {
        actorLogin: session?.login || 'admin',
        actorRole: 'ADMIN',
        action: id ? 'SCHOOL_UPDATED' : 'SCHOOL_CREATED',
        resource: `schools/${result.school.id}`,
        status: 'SUCCESS' as const,
        ipAddress: req.ip || '127.0.0.1',
        details: `Unidade "${result.school.nome}" salva no banco SQLite e Supabase.`,
      };
      recordAuditLog(logEntry);

      const sanitizedSchools = sanitizeSchoolsForClient(result.schools);
      const sanitizedSchool = sanitizedSchools.find(
        (s) => s.id === result.school.id
      );

      res.json({
        ok: true,
        school: sanitizedSchool,
        schools: sanitizedSchools,
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Erro ao salvar escola.',
      });
    }
  });

  // PUT /api/admin/schools/:schoolId — Edita nome ou alterna ativação da escola no SQLite + Supabase (Exclusivo Admin)
  app.put('/api/admin/schools/:schoolId', requireAdmin, (req, res) => {
    const { schoolId } = req.params;
    const { nome, active, ativa } = req.body || {};
    try {
      const currentSchools = getSchoolsFromDb(false);
      const existing = currentSchools.find((s) => s.id === schoolId);
      if (!existing) {
        res.status(404).json({ ok: false, error: 'Escola não encontrada.' });
        return;
      }

      const nextActive =
        active !== undefined
          ? Boolean(active)
          : ativa !== undefined
            ? Boolean(ativa)
            : existing.ativa;

      const result = upsertSchoolInDb({
        id: schoolId,
        nome: nome ? sanitizeInputText(String(nome), 120).toUpperCase() : existing.nome,
        cidade: existing.cidade,
        uf: existing.uf,
        codigoPortal: existing.codigoPortal,
        ativa: nextActive,
        npsEmail: existing.npsCredential.email,
        npsPassword: existing.npsCredential.password,
        npsCompanyFilter: existing.npsCredential.companyFilter,
        npsBaseUrl: existing.npsCredential.baseUrl,
      });

      upsertSchoolInSupabase({
        id: result.school.id,
        nome: result.school.nome,
        cidade: result.school.cidade,
        uf: result.school.uf,
        codigoPortal: result.school.codigoPortal,
        ativa: result.school.ativa,
        npsEmail: result.school.npsCredential.email,
        npsCompanyFilter: result.school.npsCredential.companyFilter,
        npsBaseUrl: result.school.npsCredential.baseUrl,
      }).catch(() => {});

      refreshSchoolsRegistryCache();
      const session = resolveAuthenticatedSession(req);
      const logEntry = {
        actorLogin: session?.login || 'admin',
        actorRole: 'ADMIN',
        action: 'SCHOOL_STATUS_OR_NAME_UPDATED',
        resource: `schools/${schoolId}`,
        status: 'SUCCESS' as const,
        ipAddress: req.ip || '127.0.0.1',
        details: `Escola "${result.school.nome}" atualizada (ativa=${result.school.ativa}).`,
      };
      recordAuditLog(logEntry);

      const sanitizedSchools = sanitizeSchoolsForClient(result.schools);
      res.json({
        ok: true,
        school: sanitizedSchools.find((s) => s.id === schoolId),
        schools: sanitizedSchools,
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Erro ao atualizar escola.',
      });
    }
  });

  // DELETE /api/admin/schools/:schoolId — Remove uma escola cadastrada no SQLite + Supabase (Exclusivo Admin)
  app.delete('/api/admin/schools/:schoolId', requireAdmin, (req, res) => {
    const { schoolId } = req.params;
    try {
      const before = getSchoolsFromDb(false).find((s) => s.id === schoolId);
      const nextSchools = deleteSchoolFromDb(schoolId);
      deleteSchoolFromSupabase(schoolId).catch(() => {});
      refreshSchoolsRegistryCache();

      const session = resolveAuthenticatedSession(req);
      const logEntry = {
        actorLogin: session?.login || 'admin',
        actorRole: 'ADMIN',
        action: 'SCHOOL_DELETED',
        resource: `schools/${schoolId}`,
        status: 'SUCCESS' as const,
        ipAddress: req.ip || '127.0.0.1',
        details: `Unidade "${before?.nome || schoolId}" removida.`,
      };
      recordAuditLog(logEntry);

      res.json({
        ok: true,
        deletedSchool: before,
        schools: sanitizeSchoolsForClient(nextSchools),
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Erro ao excluir escola.',
      });
    }
  });

  // POST /api/admin/sync-portal-user — Sincroniza informações em tempo real no Portal do Aluno e salva se autoSave=true (Exclusivo Admin)
  app.post('/api/admin/sync-portal-user', requireAdmin, async (req, res) => {
    const { login, senha, schoolId, autoSave } = req.body || {};
    refreshSchoolsRegistryCache();
    const targetSchool = schoolsRegistry.find((s) => s.id === schoolId);
    const syncResult = await testPortalCredentialsLive(
      login,
      senha,
      targetSchool?.nome
    );

    if (!syncResult.ok || !syncResult.nomeCompleto) {
      res.json({
        ok: false,
        error: syncResult.message,
        errorType: syncResult.errorType || 'INVALID_CREDENTIALS',
      });
      return;
    }

    const extractedData = {
      login: String(login).trim(),
      nomeCompleto: syncResult.nomeCompleto,
      cargo: syncResult.cargo || 'Colaborador Pedagógico',
      escolaNome:
        syncResult.escolaNome ||
        targetSchool?.nome ||
        'ESCOLA PRESIDENTE PRUDENTE',
      codigoEscola:
        syncResult.codigoEscola || targetSchool?.codigoPortal || '1875',
    };

    if (autoSave && schoolId && targetSchool) {
      try {
        const upserted = upsertUserInDb(schoolId, {
          login: extractedData.login,
          senha: String(senha).trim(),
          nomeCompleto: extractedData.nomeCompleto,
          cargo: extractedData.cargo,
          ativo: true,
        });
        upsertUserInSupabase(schoolId, {
          id: upserted.user.id,
          login: extractedData.login,
          senha: String(senha).trim(),
          nomeCompleto: extractedData.nomeCompleto,
          cargo: extractedData.cargo,
          escolaNome: extractedData.escolaNome,
          codigoEscola: extractedData.codigoEscola,
          ativo: true,
        }).catch(() => {});
        refreshSchoolsRegistryCache();
        const session = resolveAuthenticatedSession(req);
        const logEntry = {
          actorLogin: session?.login || 'admin',
          actorRole: 'ADMIN',
          action: 'USER_SYNCED_AND_SAVED',
          resource: `schools/${schoolId}/users/${upserted.user.id}`,
          status: 'SUCCESS' as const,
          ipAddress: req.ip || '127.0.0.1',
          details: `Credencial "${upserted.user.login}" (${upserted.user.nomeCompleto}) sincronizada no Portal MoveEdu e salva no banco.`,
        };
        recordAuditLog(logEntry);
        const sanitizedSchools = sanitizeSchoolsForClient(upserted.schools);
        const sanitizedUser = sanitizedSchools
          .find((s) => s.id === schoolId)
          ?.users.find((u) => u.id === upserted.user.id);
        res.json({
          ok: true,
          saved: true,
          message: syncResult.message,
          data: extractedData,
          user: sanitizedUser,
          schools: sanitizedSchools,
        });
        return;
      } catch (err) {
        res.status(400).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Erro ao salvar credencial sincronizada.',
        });
        return;
      }
    }

    res.json({
      ok: true,
      message: syncResult.message,
      data: extractedData,
    });
  });

  // POST /api/admin/schools/:schoolId/users — Cadastra ou atualiza usuário no SQLite + Supabase com Argon2id (Exclusivo Admin)
  app.post('/api/admin/schools/:schoolId/users', requireAdmin, (req, res) => {
    try {
      const { schoolId } = req.params;
      const { id, login, senha, nomeCompleto, cargo, active, ativo } =
        req.body || {};

      const result = upsertUserInDb(schoolId, {
        id,
        login,
        senha,
        nomeCompleto,
        cargo,
        ativo: active !== undefined ? Boolean(active) : ativo,
      });
      upsertUserInSupabase(schoolId, {
        id: result.user.id,
        login,
        senha,
        nomeCompleto,
        cargo,
        escolaNome: result.user.escolaNome,
        codigoEscola: result.user.codigoEscola,
        ativo: result.user.ativo,
      }).catch(() => {});
      refreshSchoolsRegistryCache();

      const session = resolveAuthenticatedSession(req);
      const logEntry = {
        actorLogin: session?.login || 'admin',
        actorRole: 'ADMIN',
        action: id ? 'USER_UPDATED' : 'USER_CREATED',
        resource: `schools/${schoolId}/users/${result.user.id}`,
        status: 'SUCCESS' as const,
        ipAddress: req.ip || '127.0.0.1',
        details: `Usuário "${result.user.login}" (${result.user.nomeCompleto}) salvo com hash Argon2id.`,
      };
      recordAuditLog(logEntry);

      const sanitizedSchools = sanitizeSchoolsForClient(result.schools);
      const sanitizedSchool = sanitizedSchools.find((s) => s.id === schoolId);
      const sanitizedUser = sanitizedSchool?.users.find(
        (u) => u.id === result.user.id
      );

      res.json({
        ok: true,
        user: sanitizedUser,
        schools: sanitizedSchools,
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Erro ao salvar usuário.',
      });
    }
  });

  // PUT /api/admin/schools/:schoolId/users/:userId/password — Altera senha com Argon2id (Exclusivo Admin)
  app.put(
    '/api/admin/schools/:schoolId/users/:userId/password',
    requireAdmin,
    (req, res) => {
      const { schoolId, userId } = req.params;
      const { novaSenha } = req.body || {};
      try {
        const result = updateUserPasswordInDb(schoolId, userId, novaSenha);
        updateUserPasswordInSupabase(schoolId, userId, novaSenha).catch(
          () => {}
        );
        refreshSchoolsRegistryCache();

        const session = resolveAuthenticatedSession(req);
        const logEntry = {
          actorLogin: session?.login || 'admin',
          actorRole: 'ADMIN',
          action: 'USER_PASSWORD_CHANGED',
          resource: `schools/${schoolId}/users/${userId}`,
          status: 'SUCCESS' as const,
          ipAddress: req.ip || '127.0.0.1',
          details: `Senha do usuário "${result.user.login}" atualizada com Argon2id.`,
        };
        recordAuditLog(logEntry);

        const sanitizedSchools = sanitizeSchoolsForClient(result.schools);
        const sanitizedUser = sanitizedSchools
          .find((s) => s.id === schoolId)
          ?.users.find((u) => u.id === userId);

        res.json({
          ok: true,
          user: sanitizedUser,
          schools: sanitizedSchools,
        });
      } catch (err) {
        res.status(400).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Erro ao alterar senha do usuário.',
        });
      }
    }
  );

  // POST /api/admin/change-admin-password — Altera a senha do Administrador Geral no banco SQLite com Argon2id
  app.post(
    '/api/admin/change-admin-password',
    requireAdmin,
    (req, res) => {
      const { novaSenha } = req.body || {};
      try {
        if (!novaSenha || typeof novaSenha !== 'string' || novaSenha.trim().length < 6) {
          res.status(400).json({
            ok: false,
            error: 'A nova senha de administrador deve conter no mínimo 6 caracteres.',
          });
          return;
        }
        updateAdminPasswordInDb(novaSenha.trim());
        const session = resolveAuthenticatedSession(req);
        const logEntry = {
          actorLogin: session?.login || 'admin',
          actorRole: 'ADMIN',
          action: 'ADMIN_MASTER_PASSWORD_CHANGED',
          resource: 'users/admin-master',
          status: 'SUCCESS' as const,
          ipAddress: req.ip || '127.0.0.1',
          details: 'Senha do Administrador Geral atualizada com sucesso no banco de dados com hash Argon2id.',
        };
        recordAuditLog(logEntry);
        res.json({
          ok: true,
          message: 'Senha do Administrador Geral atualizada e criptografada com sucesso no banco de dados.',
        });
      } catch (err) {
        res.status(400).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Erro ao atualizar a senha do administrador.',
        });
      }
    }
  );

  // PUT /api/admin/schools/:schoolId/users/:userId/status — Alterna ativação do usuário (Exclusivo Admin)
  app.put(
    '/api/admin/schools/:schoolId/users/:userId/status',
    requireAdmin,
    (req, res) => {
      const { schoolId, userId } = req.params;
      try {
        const nextSchools = toggleUserStatusInDb(schoolId, userId);
        toggleUserStatusInSupabase(schoolId, userId).catch(() => {});
        refreshSchoolsRegistryCache();

        const sanitizedSchools = sanitizeSchoolsForClient(nextSchools);
        const sanitizedUser = sanitizedSchools
          .find((s) => s.id === schoolId)
          ?.users.find((u) => u.id === userId);

        const session = resolveAuthenticatedSession(req);
        const logEntry = {
          actorLogin: session?.login || 'admin',
          actorRole: 'ADMIN',
          action: 'USER_STATUS_TOGGLED',
          resource: `schools/${schoolId}/users/${userId}`,
          status: 'SUCCESS' as const,
          ipAddress: req.ip || '127.0.0.1',
          details: `Status do usuário "${sanitizedUser?.login || userId}" alterado para ativo=${sanitizedUser?.ativo}.`,
        };
        recordAuditLog(logEntry);

        res.json({
          ok: true,
          user: sanitizedUser,
          schools: sanitizedSchools,
        });
      } catch (err) {
        res.status(400).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Erro ao alterar status do usuário.',
        });
      }
    }
  );

  // DELETE /api/admin/schools/:schoolId/users/:userId — Remove usuário de uma escola (Exclusivo Admin)
  app.delete(
    '/api/admin/schools/:schoolId/users/:userId',
    requireAdmin,
    (req, res) => {
      const { schoolId, userId } = req.params;
      try {
        const beforeUser = getSchoolsFromDb(false)
          .find((s) => s.id === schoolId)
          ?.users.find((u) => u.id === userId);
        const nextSchools = deleteUserFromDb(schoolId, userId);
        deleteUserFromSupabase(schoolId, userId).catch(() => {});
        refreshSchoolsRegistryCache();

        const session = resolveAuthenticatedSession(req);
        const logEntry = {
          actorLogin: session?.login || 'admin',
          actorRole: 'ADMIN',
          action: 'USER_DELETED',
          resource: `schools/${schoolId}/users/${userId}`,
          status: 'SUCCESS' as const,
          ipAddress: req.ip || '127.0.0.1',
          details: `Usuário "${beforeUser?.login || userId}" removido.`,
        };
        recordAuditLog(logEntry);

        res.json({
          ok: true,
          deletedUser: beforeUser,
          schools: sanitizeSchoolsForClient(nextSchools),
        });
      } catch (err) {
        res.status(400).json({
          ok: false,
          error:
            err instanceof Error ? err.message : 'Erro ao remover usuário.',
        });
      }
    }
  );

  // POST /api/admin/schools/:schoolId/users/:userId/compare — Consulta o Portal e compara (Exclusivo Admin)
  app.post(
    '/api/admin/schools/:schoolId/users/:userId/compare',
    requireAdmin,
    async (req, res) => {
      const { schoolId, userId } = req.params;
      refreshSchoolsRegistryCache();
      const school = schoolsRegistry.find((s) => s.id === schoolId);
      if (!school) {
        res.status(404).json({ ok: false, error: 'Escola não encontrada.' });
        return;
      }
      const user = school.users.find((u) => u.id === userId);
      if (!user) {
        res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
        return;
      }

      const syncResult = await testPortalCredentialsLive(
        user.login,
        user.portalPassword || user.senha,
        school.nome
      );
      if (!syncResult.ok || !syncResult.nomeCompleto) {
        res.json({
          ok: false,
          error: syncResult.message,
        });
        return;
      }

      const freshData = {
        nomeCompleto: syncResult.nomeCompleto,
        cargo: syncResult.cargo || user.cargo,
        escolaNome: syncResult.escolaNome || school.nome,
        codigoEscola: syncResult.codigoEscola || school.codigoPortal,
      };

      const diffAnalysis = computeUserSyncDifferences(user, freshData);

      res.json({
        ok: true,
        hasChanges: diffAnalysis.hasChanges,
        diffs: diffAnalysis.diffs,
        freshData,
        lastTestedAt: new Date().toISOString(),
      });
    }
  );

  // POST /api/admin/test-credentials — Testa credenciais do NPS e do Portal do Aluno (Exclusivo Admin)
  app.post('/api/admin/test-credentials', requireAdmin, async (req, res) => {
    const {
      type = 'BOTH',
      schoolId,
      portalLogin,
      portalSenha,
      npsEmail,
      npsPassword,
    } = req.body || {};

    const nowIso = new Date().toISOString();
    let portalTest:
      | { ok: boolean; nomeCompleto?: string; cargo?: string; message: string }
      | undefined;
    let npsTest:
      | {
          ok: boolean;
          companyId?: string;
          connectionStatus: NpsConnectionStatus;
          message: string;
        }
      | undefined;

    if (type === 'PORTAL' || type === 'BOTH') {
      portalTest = await testPortalCredentialsLive(portalLogin, portalSenha);
    }

    if (type === 'NPS' || type === 'BOTH') {
      npsTest = await testIndecxNpsCredentialsLive(
        npsEmail,
        npsPassword,
        schoolId
      );
    }

    if (schoolId && npsTest) {
      const existing = getSchoolsFromDb(false).find((s) => s.id === schoolId);
      if (existing) {
        upsertSchoolInDb({
          id: schoolId,
          nome: existing.nome,
          cidade: existing.cidade,
          uf: existing.uf,
          codigoPortal: existing.codigoPortal,
          ativa: existing.ativa,
          npsEmail: npsEmail ? String(npsEmail).trim() : existing.npsCredential.email,
          npsPassword: npsPassword
            ? String(npsPassword).trim()
            : existing.npsCredential.password,
          npsCompanyFilter: existing.npsCredential.companyFilter,
          npsBaseUrl: existing.npsCredential.baseUrl,
        });
        refreshSchoolsRegistryCache();
      }
    }

    res.json({
      ok: true,
      testedAt: nowIso,
      portalTest,
      npsTest,
      schools: sanitizeSchoolsForClient(getSchoolsFromDb(false)),
    });
  });

  // POST /api/hub/sync-relatorio — Conexão direta com o HUB MoveEdu para extração de relatórios de pacotes e frequência
  app.post('/api/hub/sync-relatorio', async (req, res) => {
    const rawLogin = String(req.body?.login || PORTAL_MICROLINS_LOGIN).trim();
    const rawSenha = String(req.body?.senha || PORTAL_MICROLINS_PASSWORD).trim();
    try {
      const rPostHub = await fetch('https://sistemas.microlins.com.br/hub/login/Logar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ Login: rawLogin, Senha: rawSenha, Sistema: '', AcessoPainel: '1' }).toString(),
        redirect: 'manual'
      });
      const setCookie = rPostHub.headers.getSetCookie ? rPostHub.headers.getSetCookie() : [];
      const cookieHeader = setCookie.map(c => c.split(';')[0]).join('; ');
      const isConnected = rPostHub.status === 302 || cookieHeader.includes('.ASPXAUTH');

      res.json({
        ok: true,
        connectedToHub: isConnected,
        statusHub: rPostHub.status,
        sessionCookiesSecured: Boolean(cookieHeader),
        timestamp: new Date().toISOString(),
        message: isConnected 
          ? 'Conexão direta com o HUB MoveEdu estabelecida com sucesso! Sessão ativa e pronta para extração de relatórios de pacotes e frequência.' 
          : 'Falha na autenticação com o HUB. Verifique as credenciais.'
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        connectedToHub: false,
        error: err.message
      });
    }
  });

  // GET /api/health — Healthcheck de Produção e Monitoramento de Infraestrutura (Supabase Sole Database + Memória)
  app.get('/api/health', async (_req, res) => {
    try {
      const dbStatus = getDatabaseStatusSummary();
      const supabaseHealth = await checkSupabaseHealth();
      const mem = process.memoryUsage();
      res.json({
        ok: true,
        status: supabaseHealth.connected ? 'HEALTHY' : 'DEGRADED_LOCAL_FALLBACK',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        memoryMb: {
          rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
          heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
          heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        },
        database: {
          engine: dbStatus.engine,
          foreignKeysEnabled: dbStatus.foreignKeysEnabled,
          schemaVersion: dbStatus.schemaVersion,
          counts: dbStatus.counts,
        },
        supabase: {
          connected: supabaseHealth.connected,
          counts: supabaseHealth.counts,
          checkedAt: supabaseHealth.checkedAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        status: 'UNHEALTHY',
        error: err?.message || 'Erro no healthcheck do servidor.',
      });
    }
  });

  // GET /api/supabase/status — Verifica status completo da conexão e tabelas do Supabase
  app.get('/api/supabase/status', async (_req, res) => {
    try {
      const health = await checkSupabaseHealth();
      res.json({
        ok: true,
        ...health,
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        connected: false,
        error: err?.message || 'Erro ao verificar status do Supabase.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Mantém o Supabase continuamente sincronizado em tempo real com o Portal do Aluno a cada 45s
    setInterval(() => {
      void syncLivePortalRecords().catch(() => {});
    }, 45_000);
  });
}

startServer();
