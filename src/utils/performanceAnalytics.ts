import {
  ActiveNpsInvitation,
  ClassStatus,
  INITIAL_ACTIVE_NPS_INVITATIONS,
  ModalityType,
  NpsDestinatarioType,
  NpsEmailDeliveryStatusType,
  NpsInvitationStatusType,
  NpsNivelCruzamentoType,
  NpsOrigemType,
  OFFICIAL_PORTAL_LOGIN_URL,
  PORTAL_APOSTILA_BY_CONTRATO,
  PORTAL_AUTH_LINKS_BY_CONTRATO,
  PORTAL_METADATA,
  ShiftType,
  StudentPerformanceRecord,
} from '../data/microlinsData';
export type { NpsDestinatarioType, NpsNivelCruzamentoType };
import { INDECX_REAL_DELIVERY_BY_CONTROL_ID } from '../data/indecxRealDeliveryData';
import {
  buildStudentFormationConsolidationKey,
  ConsolidatedColumnId,
  formatFormacaoDisplay,
  matchesMultiValueColumnFilters,
  normalizeFormacaoKey,
} from './powerBiConsolidation';

export * from './powerBiConsolidation';

export type AttendanceStatus = 'Não iniciada' | 'Não iniciado' | 'Presença' | 'Falta';
export type ApostilaFilterType = 'TODAS' | 'COM_APOSTILA' | 'SEM_APOSTILA';
export type StudentNpsFilterType = 'TODOS' | 'COM_NPS' | 'SEM_NPS';
export type FinancialFilterType = 'TODOS' | 'EM_DIA' | 'EM_ATRASO';
export type CourseCategoryType = 'INGLÊS' | 'PROFISSIONALIZANTE';
export type CourseCategoryFilterType = 'TODOS' | CourseCategoryType;
export type NpsDeliveryFilterType = 'TODOS' | NpsEmailDeliveryStatusType;
export type QuickCardFilter =
  | 'TODOS'
  | AttendanceStatus
  | 'FALTA_PENDENTE'
  | 'EVASAO';

/**
 * REGRA OBRIGATÓRIA DE CLASSIFICAÇÃO DE ALUNOS E CURSOS EXCLUSIVAMENTE PELA FORMAÇÃO:
 * - Toda a validação e separação do curso (se é 'INGLÊS' ou 'PROFISSIONALIZANTE') é feita
 *   EXCLUSIVAMENTE pela FORMAÇÃO DO ALUNO (`formacao`).
 * - A decisão NUNCA deve ser feita pela sala (`sala`) nem pelo módulo isolado.
 * - Exclusivamente existem apenas 2 opções: 'INGLÊS' ou 'PROFISSIONALIZANTE'.
 */
export function isEnglishFormacao(formacao?: string | null): boolean {
  const formacaoUpper = (formacao || '').toUpperCase().trim();
  return (
    formacaoUpper.includes('INGL') ||
    formacaoUpper.includes('ENGLISH') ||
    formacaoUpper.includes('ANNUAL BOOK') ||
    formacaoUpper.includes('SPEED')
  );
}

export function isEnglishCourseRecord(
  record: Pick<StudentPerformanceRecord, 'formacao'>
): boolean {
  return isEnglishFormacao(record.formacao);
}

export function resolveStudentCategory(
  record: Pick<StudentPerformanceRecord, 'formacao'>
): CourseCategoryType {
  return isEnglishFormacao(record.formacao) ? 'INGLÊS' : 'PROFISSIONALIZANTE';
}

export function formatFullSalaName(
  sala?: string | null,
  _modalidade?: ModalityType | null
): string {
  const raw = (sala || '').trim();
  if (!raw) return 'Sala não informada';
  const baseSala = raw.split(' - ')[0].trim();
  return baseSala || raw;
}

export function resolveRealNpsDeliveryTracking(
  inv: Partial<ActiveNpsInvitation> & Pick<ActiveNpsInvitation, 'controlId' | 'origem'>
): {
  emailDeliveryStatus: NpsEmailDeliveryStatusType;
  emailDeliveryEvents: string[];
  emailLastEventAt: string;
  emailBounceReason?: string;
} {
  if (inv.emailDeliveryStatus) {
    return {
      emailDeliveryStatus: inv.emailDeliveryStatus,
      emailDeliveryEvents: inv.emailDeliveryEvents || [],
      emailLastEventAt: inv.emailLastEventAt || inv.createdAt || '',
      emailBounceReason: inv.emailBounceReason,
    };
  }
  const controlKey = (inv.controlId || '').trim();
  const realEntry = controlKey
    ? INDECX_REAL_DELIVERY_BY_CONTROL_ID[controlKey]
    : undefined;
  if (realEntry) {
    return {
      emailDeliveryStatus: realEntry.status,
      emailDeliveryEvents: realEntry.events,
      emailLastEventAt: realEntry.lastEventAt,
      emailBounceReason: realEntry.bounceReason,
    };
  }
  return {
    emailDeliveryStatus: inv.origem === 'Portal do Aluno' ? 'Entregue' : 'Enviado',
    emailDeliveryEvents: [],
    emailLastEventAt: inv.sentAt || inv.createdAt || '',
  };
}

export function isNotStartedAttendanceStatus(status?: string | null): boolean {
  return status === 'Não iniciada' || status === 'Não iniciado';
}

/**
 * Diferenciação explícita das etapas de horário e processamento de falta:
 * - HORARIO_FUTURO: horário ainda não iniciou (dia atual antes do início ou dia futuro)
 * - EM_ANDAMENTO: dentro da janela de tolerância de 15 minutos após o início agendado
 * - CONCLUIDO: presença confirmada (INICIADO / FINALIZADO / check-in registrado)
 * - FALTA_PENDENTE: ultrapassou os 15 minutos de tolerância no MESMO dia (aguardando processamento automático no dia seguinte; NÃO contabiliza falta no mesmo dia)
 * - FALTA_CONTABILIZADA: ausência consolidada automaticamente no dia seguinte (dia anterior encerrado sem presença)
 */
export type ScheduleStage =
  | 'HORARIO_FUTURO'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDO'
  | 'FALTA_PENDENTE'
  | 'FALTA_CONTABILIZADA';

export type DayRelation = 'PAST_DAY' | 'CURRENT_DAY' | 'FUTURE_DAY';

export const WEEKDAY_CHRONOLOGICAL_ORDER: readonly string[] = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const NORM_NAME_CACHE = new Map<string, string>();

export function normalizeStudentName(name: string): string {
  if (!name) return '';
  const cached = NORM_NAME_CACHE.get(name);
  if (cached !== undefined) return cached;
  const computed = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (NORM_NAME_CACHE.size > 5000) {
    NORM_NAME_CACHE.clear();
  }
  NORM_NAME_CACHE.set(name, computed);
  return computed;
}

export const normalizePersonName = normalizeStudentName;

export function hasFrequencyData(
  presencaCount: number,
  faltaCount: number
): boolean {
  return presencaCount + faltaCount > 0;
}

// Singletons de Intl.DateTimeFormat para eliminar o gargalo de CPU em loops de avaliação
const BRASILIA_YEAR_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
});

const BRASILIA_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
});

const BRASILIA_TIME_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const BRASILIA_DATETIME_PARTS_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const BRASILIA_HOUR_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  hour12: false,
});

/**
 * Identifica dinamicamente o ano vigente no fuso horário America/Sao_Paulo.
 */
export function getCurrentBrasiliaYear(referenceDate: Date = new Date()): number {
  try {
    const yearStr = BRASILIA_YEAR_FORMATTER.format(referenceDate);
    const parsed = parseInt(yearStr, 10);
    return Number.isNaN(parsed) ? referenceDate.getFullYear() : parsed;
  } catch {
    return referenceDate.getFullYear();
  }
}

/**
 * Identifica dinamicamente o dia da semana atual no fuso horário America/Sao_Paulo.
 */
export function getCurrentBrasiliaWeekdayLabel(
  referenceDate: Date = new Date()
): string {
  const map: Record<string, string> = {
    Mon: 'Segunda-feira',
    Tue: 'Terça-feira',
    Wed: 'Quarta-feira',
    Thu: 'Quinta-feira',
    Fri: 'Sexta-feira',
    Sat: 'Sábado',
    Sun: 'Domingo',
  };
  try {
    const shortDay = BRASILIA_WEEKDAY_FORMATTER.format(referenceDate);
    return map[shortDay] || PORTAL_METADATA.diaSemana;
  } catch {
    return PORTAL_METADATA.diaSemana;
  }
}

/**
 * Retorna os minutos reais (0..1439) no fuso horário de Brasília (America/Sao_Paulo),
 * sem qualquer deslocamento ou travamento artificial em horários fixos.
 */
export function getBrasiliaCurrentMinutes(
  timeStrOrDate?: string | Date
): number {
  if (typeof timeStrOrDate === 'string' && timeStrOrDate.trim() !== '') {
    const [hStr = '0', mStr = '0'] = timeStrOrDate.trim().split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      const normalizedH = ((h % 24) + 24) % 24;
      const normalizedM = Math.max(0, Math.min(59, m));
      return normalizedH * 60 + normalizedM;
    }
  }

  const refDate =
    timeStrOrDate instanceof Date ? timeStrOrDate : new Date();

  try {
    const parts = BRASILIA_TIME_PARTS_FORMATTER.formatToParts(refDate);
    const rawHour = parseInt(
      parts.find((p) => p.type === 'hour')?.value || '0',
      10
    );
    const rawMin = parseInt(
      parts.find((p) => p.type === 'minute')?.value || '0',
      10
    );
    const h = Number.isNaN(rawHour) ? 0 : rawHour % 24;
    const m = Number.isNaN(rawMin) ? 0 : rawMin;
    return h * 60 + m;
  } catch {
    return refDate.getHours() * 60 + refDate.getMinutes();
  }
}

/**
 * Compara o dia da semana do agendamento com o dia da semana atual em Brasília:
 * - PAST_DAY: dia anterior já encerrado (permite processar faltas no dia seguinte)
 * - CURRENT_DAY: mesmo dia (respeita horário futuro, tolerância de 15m e não registra falta no mesmo dia)
 * - FUTURE_DAY: dia futuro na semana (nunca registra falta)
 */
export function compareWeekdayWithCurrent(
  recordDiaSemana?: string,
  referenceWeekdayLabel: string = getCurrentBrasiliaWeekdayLabel()
): DayRelation {
  const recDay = (recordDiaSemana || '').trim();
  const refDay = (referenceWeekdayLabel || '').trim();
  if (!recDay || !refDay) return 'CURRENT_DAY';

  const recNorm = normalizeStudentName(recDay);
  const refNorm = normalizeStudentName(refDay);
  if (recNorm === refNorm) return 'CURRENT_DAY';

  if (
    recNorm === 'dia anterior' ||
    recNorm === 'ontem' ||
    recNorm === 'past_day'
  ) {
    return 'PAST_DAY';
  }
  if (
    recNorm === 'dia seguinte' ||
    recNorm === 'amanha' ||
    recNorm === 'future_day'
  ) {
    return 'FUTURE_DAY';
  }

  const recIdx = WEEKDAY_CHRONOLOGICAL_ORDER.findIndex(
    (d) => normalizeStudentName(d) === recNorm
  );
  const refIdx = WEEKDAY_CHRONOLOGICAL_ORDER.findIndex(
    (d) => normalizeStudentName(d) === refNorm
  );

  if (recIdx === -1 || refIdx === -1) {
    return 'CURRENT_DAY';
  }
  if (recIdx < refIdx) return 'PAST_DAY';
  if (recIdx > refIdx) return 'FUTURE_DAY';
  return 'CURRENT_DAY';
}

/**
 * Calcula os limites exatos do ano vigente em America/Sao_Paulo (UTC-3):
 * Início inclusivo: 01/01/<ano> 00:00:00.000-03:00
 * Fim exclusivo: 01/01/<ano+1> 00:00:00.000-03:00
 */
export function getBrasiliaAnnualUtcBounds(
  targetYear: number = getCurrentBrasiliaYear()
): {
  year: number;
  startDateParam: string;
  endDateParam: string;
  startUtcMs: number;
  endUtcMs: number;
} {
  const startDateParam = `${targetYear}-01-01`;
  const endDateParam = `${targetYear}-12-31`;
  const startUtcMs = Date.parse(`${targetYear}-01-01T00:00:00.000-03:00`);
  const endUtcMs = Date.parse(`${targetYear + 1}-01-01T00:00:00.000-03:00`);
  return {
    year: targetYear,
    startDateParam,
    endDateParam,
    startUtcMs,
    endUtcMs,
  };
}

const DATETIME_STR_CACHE = new Map<string, string>();

/**
 * Formata uma data ISO no fuso horário America/Sao_Paulo (DD/MM/YYYY às HH:MM).
 */
export function formatBrasiliaDateTime(isoStr?: string | null): string {
  if (!isoStr) return 'Data não informada';
  const cached = DATETIME_STR_CACHE.get(isoStr);
  if (cached !== undefined) return cached;
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return isoStr;
  try {
    const parts = BRASILIA_DATETIME_PARTS_FORMATTER.formatToParts(dt);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
    const formatted = `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}`;
    if (DATETIME_STR_CACHE.size > 2000) DATETIME_STR_CACHE.clear();
    DATETIME_STR_CACHE.set(isoStr, formatted);
    return formatted;
  } catch {
    return isoStr.slice(0, 16).replace('T', ' ');
  }
}

/**
 * Extrai a hora de criação (0..23) de um convite NPS no fuso America/Sao_Paulo.
 */
export function extractInvitationCreationHourBrasilia(isoStr?: string): number {
  if (!isoStr) return 8;
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return 8;
  try {
    const parts = BRASILIA_HOUR_PARTS_FORMATTER.formatToParts(dt);
    const hStr = parts.find((p) => p.type === 'hour')?.value || '08';
    const h = parseInt(hStr, 10) % 24;
    return Number.isNaN(h) ? 8 : h;
  } catch {
    return dt.getUTCHours();
  }
}

export function extractAvailableWeekdays(records: StudentPerformanceRecord[]): string[] {
  const present = new Set<string>();
  for (const r of records) {
    const day = (r.diaSemana || PORTAL_METADATA.diaSemana || '').trim();
    if (day) present.add(day);
  }
  return Array.from(present).sort((a, b) => {
    const idxA = WEEKDAY_CHRONOLOGICAL_ORDER.indexOf(a);
    const idxB = WEEKDAY_CHRONOLOGICAL_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b, 'pt-BR');
  });
}

export interface EvaluatedStudentRecord extends StudentPerformanceRecord {
  professor: string;
  diaSemana: string;
  dayRelation: DayRelation;
  hourKey: string;
  moduloAtual: string;
  aulaAtualLabel: string;
  possuiApostila: boolean;
  categoriaCurso: CourseCategoryType;
  parcelasAtrasadas: number;
  situacaoFinanceiraLabel: 'Em dia' | 'Em atraso';
  tempoPermanenciaMinutos: number | null;
  duracaoCurricularMinutos: number;
  mediaTempoEtapaMinutos: number;
  isTempoInsuficiente: boolean;
  isSessaoMultiplosDias: boolean;
  tempoPermanenciaLabel: string | null;
  saidaAntecipadaMinutos: number | null;
  isSaidaAntecipada: boolean;
  isFinalizacaoAntecipada: boolean;
  saidaAntecipadaLabel: string | null;
  recorrenciaSaidaAntecipadaCount: number;
  notaAulaNumero: number | null;
  isNotaModuloAnterior: boolean;
  notaContextoLabel: string;
  linkAcessoDireto: string;
  whatsappResponsavelContactUrl: string;
  whatsappAlunoLoginUrl: string;
  attendanceStatus: AttendanceStatus;
  scheduleStage: ScheduleStage;
  scheduleStageLabel: string;
  scheduledStartMinutes: number;
  toleranceEndMinutes: number;
  toleranceWindowLabel: string;
  isWithinTolerance: boolean;
  isPendingNextDayAbsence: boolean;
  minutesRemainingInTolerance: number | null;
  presenceRegisteredAt: string;
  isEvasao: boolean;
  evasaoSummary: string | null;
  isRiscoPreventivoEvasao: boolean;
  riscoPreventivoEvasaoMotivos: string[];
  studentFrequencyPercent: number | null;
  hasActiveNps: boolean;
  npsInvitation: ActiveNpsInvitation | null;
  studentNpsHistory: ActiveNpsInvitation[];
  npsOrigemFormatada: 'Portal do Aluno' | 'E-mail' | null;
  whatsappNpsUrl: string;
}

/**
 * Representa o card sincronizado de um aluno elegível na aba Kanban NPS:
 * - Possui vínculo obrigatório com o Kanban de Alunos (`matchedInKanban === true`)
 * - Exibe no card principal APENAS a pesquisa mais recente ainda não respondida (`latestActiveInvitation`)
 * - Preserva todas as pesquisas vinculadas ao aluno em ordem cronológica (`studentSurveyHistory`) para visualização ao clicar no card
 * - Utiliza exatamente a mesma referência de horário (`hourKey`, `hourNumber`, `horario`), sala, situação e vínculo do Kanban de Alunos
 */
export interface SynchronizedNpsStudentCard extends ActiveNpsInvitation {
  latestActiveInvitation: ActiveNpsInvitation;
  studentSurveyHistory: ActiveNpsInvitation[];
  activeUnansweredCount: number;
  totalHistoryCount: number;
  matchedInKanban: true;
  linkedStudentId: number;
  linkedContrato: string;
  linkedStudentName: string;
  linkedResponsavelName?: string;
  linkedTelefoneAluno?: string;
  linkedTelefoneResponsavel?: string;
  linkedHourKey: string;
  linkedHourNumber: number;
  linkedHorario: string;
  linkedDiaSemana: string;
  linkedSala: string;
  linkedCurso: string;
  linkedModalidade: ModalityType;
  linkedAttendanceStatus: AttendanceStatus;
  linkedScheduleStage: ScheduleStage;
  linkedScheduleStageLabel: string;
  agendamentosHorarios: string[];
  whatsappNpsUrl: string;
}

export interface EnrichedActiveNpsEntry {
  invitation: ActiveNpsInvitation;
  matchedInKanban: boolean;
  contrato: string | null;
  studentName: string;
  sala: string | null;
  modalidade: ModalityType | null;
  cursos: string[];
  agendamentosCount: number;
  agendamentosHorarios: string[];
  firstStudentRecordId: number | null;
  whatsappNpsUrl: string;
  studentSurveyHistory: ActiveNpsInvitation[];
}

export interface FilterCriteria {
  search: string;
  professor?: string;
  sala?: string;
  diaSemana?: string;
  apostilaFilter?: ApostilaFilterType;
  npsFilter?: StudentNpsFilterType;
  financialFilter?: FinancialFilterType;
  courseCategoryFilter?: CourseCategoryFilterType;
  status: 'TODOS' | ClassStatus;
  attendanceFilter: QuickCardFilter;
  modalidade: 'TODAS' | ModalityType;
  turno: 'TODOS' | ShiftType;
  curso: string;
  horario: string;
  notaFilter: 'TODOS' | 'COM_NOTA' | 'SEM_NOTA' | 'NOTA_ALTA' | 'ATENCAO';
  finalizacaoAntecipada?: boolean;
  apenasInadimplentes: boolean;
  sortBy: 'id' | 'nomeCompleto' | 'curso' | 'horario' | 'nota' | 'status';
  sortDir: 'asc' | 'desc';
}

export interface PerformanceKPIs {
  total: number;
  totalAgendamentos: number;
  totalAlunosUnicos: number;
  evasaoCount: number;
  npsAtivosCount: number;
  iniciados: number;
  naoIniciados: number;
  finalizados: number;
  presencaCount: number;
  faltaCount: number;
  aguardandoCount: number;
  faltasPendentesDiaSeguinteCount: number;
  emToleranciaCount: number;
  horariosFuturosCount: number;
  mediaFrequencia: number;
  frequenciaPercent: number | null;
  hasFrequencyData: boolean;
  inadimplentes: number;
  presencialCount: number;
  onlineCount: number;
  comNotaCount: number;
  semNotaCount: number;
  mediaGeralNotas: number;
  taxaConclusao: number;
  taxaPresencaAtiva: number;
  notaMaxima: number;
  notaMinima: number;
  alunosNota10: number;
  alunosAbaixo7: number;
}

export interface CourseSummary {
  curso: string;
  formacao: string;
  totalAlunos: number;
  finalizados: number;
  iniciados: number;
  naoIniciados: number;
  mediaNota: number | null;
  avaliadosCount: number;
  taxaConclusao: number;
}

export interface ScheduleSummary {
  horario: string;
  turno: ShiftType;
  total: number;
  finalizados: number;
  iniciados: number;
  naoIniciados: number;
  presencial: number;
  online: number;
  mediaNota: number | null;
}

export type KanbanHourMode = 'AGENDADO' | 'EFETIVO' | 'APENAS_INICIADOS_CHECKIN';

export interface HourKanbanColumn {
  hourKey: string;
  hourNumber: number;
  label: string;
  toleranceLabel: string;
  turno: ShiftType;
  isCurrentHour: boolean;
  isPastHour: boolean;
  isFutureHour: boolean;
  columnStageLabel: string;
  students: EvaluatedStudentRecord[];
  total: number;
  totalAgendamentos: number;
  totalAlunosUnicos: number;
  evasaoCount: number;
  npsAtivosCount: number;
  presencaCount: number;
  faltaCount: number;
  naoIniciadoCount: number;
  pendentesProcessamentoCount: number;
  emToleranciaCount: number;
  mediaFrequencia: number;
  hasFrequencyData: boolean;
  finalizados: number;
  iniciados: number;
  naoIniciados: number;
  presencial: number;
  online: number;
  mediaNota: number | null;
  schedulesIncluded: string[];
}

export type ExportColumnKey =
  | 'contrato'
  | 'nomeCompleto'
  | 'formacao'
  | 'curso'
  | 'aulaInfo'
  | 'horario'
  | 'turno'
  | 'modalidade'
  | 'sala'
  | 'attendanceStatus'
  | 'status'
  | 'nota'
  | 'inicio'
  | 'fim'
  | 'infoAula'
  | 'telefoneAluno'
  | 'nomeResponsavel'
  | 'telefoneResponsavel'
  | 'inadimplente'
  | 'observacao';

export interface ExportColumnDef {
  key: ExportColumnKey;
  label: string;
  defaultEnabled: boolean;
}

export const EXPORT_COLUMNS: ExportColumnDef[] = [
  { key: 'contrato', label: 'Contrato / Matrícula', defaultEnabled: true },
  { key: 'nomeCompleto', label: 'Nome Completo do Aluno', defaultEnabled: true },
  { key: 'curso', label: 'Módulo Atual', defaultEnabled: true },
  { key: 'aulaInfo', label: 'Aula & Material', defaultEnabled: true },
  { key: 'formacao', label: 'Formação', defaultEnabled: true },
  { key: 'horario', label: 'Horário Agendado', defaultEnabled: true },
  { key: 'turno', label: 'Turno', defaultEnabled: true },
  { key: 'modalidade', label: 'Modalidade', defaultEnabled: true },
  { key: 'attendanceStatus', label: 'Status de Presença (Tolerância 15m)', defaultEnabled: true },
  { key: 'status', label: 'Status no Portal', defaultEnabled: true },
  { key: 'nota', label: 'Última Nota', defaultEnabled: true },
  { key: 'inicio', label: 'Check-in (Início)', defaultEnabled: true },
  { key: 'fim', label: 'Check-out (Fim)', defaultEnabled: true },
  { key: 'infoAula', label: 'Origem do Acesso', defaultEnabled: true },
  { key: 'telefoneAluno', label: 'Telefone Aluno', defaultEnabled: true },
  { key: 'nomeResponsavel', label: 'Nome Responsável', defaultEnabled: false },
  { key: 'telefoneResponsavel', label: 'Telefone Responsável', defaultEnabled: false },
  { key: 'sala', label: 'Sala', defaultEnabled: true },
  { key: 'inadimplente', label: 'Alerta Financeiro', defaultEnabled: false },
  { key: 'observacao', label: 'Observação Pedagógica', defaultEnabled: true },
];

export function parseTimeToMinutes(timeStr: string): number {
  const clean = (timeStr || '08:00').trim();
  const [hStr = '8', mStr = '0'] = clean.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  return (Number.isNaN(h) ? 8 : h) * 60 + (Number.isNaN(m) ? 0 : m);
}

export function formatMinutesToHHMM(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function extractFirstName(fullName?: string | null): string {
  const clean = (fullName || '').trim();
  if (!clean) return 'Aluno(a)';
  const first = clean.split(/\s+/)[0] || clean;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export interface ParsedPortalTimestamp {
  dateKey: string;
  hasExplicitDate: boolean;
  minutesOfDay: number;
  secondsOfDay: number;
  timestampMs: number;
}

/**
 * Converte timestamps do Portal ("30/10/2026 08:05:15", "30/10/2026 08:24", "08:05:15", "08:24")
 * em milissegundos exatos e minutos do dia para cálculo de Tempo Real de Permanência e Saída Antecipada.
 */
export function parsePortalTimestampParts(
  rawTimestamp?: string | null,
  defaultDateStr: string = PORTAL_METADATA.dataReferencia
): ParsedPortalTimestamp | null {
  const raw = (rawTimestamp || '').trim();
  if (!raw) return null;

  let datePart = defaultDateStr;
  let hasExplicitDate = false;
  let timePart = raw;

  const tokens = raw.split(/\s+/);
  if (tokens.length >= 2) {
    datePart = tokens[0];
    timePart = tokens[tokens.length - 1];
    hasExplicitDate = true;
  }

  const timeSegments = timePart.split(':');
  if (timeSegments.length < 2) return null;
  const hh = parseInt(timeSegments[0], 10);
  const mm = parseInt(timeSegments[1], 10);
  const ss = timeSegments[2] ? parseInt(timeSegments[2], 10) : 0;
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;

  let day = 30;
  let month = 10;
  let year = 2026;
  if (datePart.includes('/')) {
    const [dStr, mStr, yStr] = datePart.split('/');
    const d = parseInt(dStr, 10);
    const m = parseInt(mStr, 10);
    const y = parseInt(yStr, 10);
    if (!Number.isNaN(d) && !Number.isNaN(m) && !Number.isNaN(y)) {
      day = d;
      month = m;
      year = y < 100 ? 2000 + y : y;
    }
  } else if (datePart.includes('-')) {
    const [yStr, mStr, dStr] = datePart.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const d = parseInt(dStr, 10);
    if (!Number.isNaN(d) && !Number.isNaN(m) && !Number.isNaN(y)) {
      day = d;
      month = m;
      year = y;
    }
  }

  const dateKey = `${String(year).padStart(4, '0')}-${String(month).padStart(
    2,
    '0'
  )}-${String(day).padStart(2, '0')}`;
  const secondsSafe = Number.isNaN(ss) ? 0 : ss;
  const timestampMs = Date.UTC(year, month - 1, day, hh, mm, secondsSafe);
  const minutesOfDay = hh * 60 + mm;
  const secondsOfDay = minutesOfDay * 60 + secondsSafe;

  return {
    dateKey,
    hasExplicitDate,
    minutesOfDay,
    secondsOfDay,
    timestampMs,
  };
}

/**
 * Item 1.2: Cálculo do Tempo Real de Permanência na Aula:
 * tempoPermanenciaMinutos = (AulaFim - AulaInicio) / 60.000
 * Identifica alertas de Tempo Insuficiente de Permanência como indicador de acompanhamento pedagógico.
 */
export function calculateTempoPermanencia(
  inicio?: string | null,
  fim?: string | null,
  horaInicio?: string | null,
  horaFim?: string | null
): {
  tempoPermanenciaMinutos: number | null;
  duracaoCurricularMinutos: number;
  isTempoInsuficiente: boolean;
  isSessaoMultiplosDias: boolean;
  tempoPermanenciaLabel: string | null;
} {
  const startSched = horaInicio ? parseTimeToMinutes(horaInicio) : 8 * 60;
  const endSched = horaFim ? parseTimeToMinutes(horaFim) : startSched + 60;
  const duracaoCurricularMinutos =
    endSched > startSched ? endSched - startSched : 60;

  const inicioParts = parsePortalTimestampParts(inicio);
  const fimParts = parsePortalTimestampParts(fim);

  if (!inicioParts || !fimParts) {
    return {
      tempoPermanenciaMinutos: null,
      duracaoCurricularMinutos,
      isTempoInsuficiente: false,
      isSessaoMultiplosDias: false,
      tempoPermanenciaLabel: null,
    };
  }

  const isSessaoMultiplosDias =
    inicioParts.hasExplicitDate &&
    fimParts.hasExplicitDate &&
    inicioParts.dateKey !== fimParts.dateKey;

  const diffMs = fimParts.timestampMs - inicioParts.timestampMs;
  if (diffMs < 0) {
    return {
      tempoPermanenciaMinutos: null,
      duracaoCurricularMinutos,
      isTempoInsuficiente: false,
      isSessaoMultiplosDias,
      tempoPermanenciaLabel: null,
    };
  }

  const tempoPermanenciaMinutos = Math.round(diffMs / 60_000);

  if (isSessaoMultiplosDias) {
    return {
      tempoPermanenciaMinutos,
      duracaoCurricularMinutos,
      isTempoInsuficiente: false,
      isSessaoMultiplosDias: true,
      tempoPermanenciaLabel: 'Concluída em múltiplos dias (Aula Pausada)',
    };
  }

  const minExpectedThreshold = Math.max(
    18,
    Math.min(25, Math.round(duracaoCurricularMinutos * 0.35))
  );
  const isTempoInsuficiente =
    tempoPermanenciaMinutos <= minExpectedThreshold ||
    tempoPermanenciaMinutos < Math.round(duracaoCurricularMinutos * 0.35);

  const tempoPermanenciaLabel = isTempoInsuficiente
    ? `${tempoPermanenciaMinutos} min de ${duracaoCurricularMinutos} min previstos (Tempo Insuficiente)`
    : `${tempoPermanenciaMinutos} min de ${duracaoCurricularMinutos} min previstos`;

  return {
    tempoPermanenciaMinutos,
    duracaoCurricularMinutos,
    isTempoInsuficiente,
    isSessaoMultiplosDias: false,
    tempoPermanenciaLabel,
  };
}

/**
 * Item 1.3: Identificação de Saída Antecipada — Comparação com o Horário de Encerramento da Turma:
 * SaidaAntecipada = HoraFim - AulaFim (com tolerância configurável, padrão 30 minutos).
 */
export function calculateSaidaAntecipada(
  fim?: string | null,
  horaFim?: string | null,
  inicio?: string | null,
  toleranciaMinutos: number = 30
): {
  saidaAntecipadaMinutos: number | null;
  isSaidaAntecipada: boolean;
  saidaAntecipadaLabel: string | null;
} {
  if (!fim || !horaFim) {
    return {
      saidaAntecipadaMinutos: null,
      isSaidaAntecipada: false,
      saidaAntecipadaLabel: null,
    };
  }

  const fimParts = parsePortalTimestampParts(fim);
  if (!fimParts) {
    return {
      saidaAntecipadaMinutos: null,
      isSaidaAntecipada: false,
      saidaAntecipadaLabel: null,
    };
  }

  if (inicio) {
    const inicioParts = parsePortalTimestampParts(inicio);
    if (
      inicioParts &&
      inicioParts.hasExplicitDate &&
      fimParts.hasExplicitDate &&
      inicioParts.dateKey !== fimParts.dateKey
    ) {
      return {
        saidaAntecipadaMinutos: null,
        isSaidaAntecipada: false,
        saidaAntecipadaLabel: null,
      };
    }
  }

  const scheduledEndMinutes = parseTimeToMinutes(horaFim);
  const actualEndMinutes = fimParts.minutesOfDay;
  const diffMinutes = scheduledEndMinutes - actualEndMinutes;
  const saidaAntecipadaMinutos = diffMinutes > 0 ? diffMinutes : 0;
  const isSaidaAntecipada = saidaAntecipadaMinutos >= toleranciaMinutos;
  const saidaAntecipadaLabel = isSaidaAntecipada
    ? `Saída antecipada: ${saidaAntecipadaMinutos} min antes das ${horaFim}`
    : null;

  return {
    saidaAntecipadaMinutos,
    isSaidaAntecipada,
    saidaAntecipadaLabel,
  };
}

/**
 * Item 1.4: Identificação da Aula em que a Nota foi Obtida:
 * Exibe a nota acompanhada da aula avaliada e indica "Módulo Anterior" quando a nota pertence a uma aula posterior à aula atual do módulo em curso.
 */
export function resolveNotaContexto(
  record: Pick<
    StudentPerformanceRecord,
    'nota' | 'aulaNumero' | 'notaAulaNumero' | 'curso'
  >
): {
  notaAulaNumero: number | null;
  isNotaModuloAnterior: boolean;
  notaContextoLabel: string;
} {
  if (record.nota === null || record.nota === undefined) {
    return {
      notaAulaNumero: null,
      isNotaModuloAnterior: false,
      notaContextoLabel: 'Sem avaliação registrada',
    };
  }

  const currentAula = record.aulaNumero || 1;
  const notaAulaNumero =
    typeof record.notaAulaNumero === 'number' && record.notaAulaNumero > 0
      ? record.notaAulaNumero
      : currentAula <= 3
      ? 16
      : Math.max(1, currentAula - 1);

  const isNotaModuloAnterior = notaAulaNumero > currentAula;
  const formattedGrade = Number.isInteger(record.nota)
    ? String(record.nota)
    : record.nota.toFixed(1).replace('.', ',');

  const notaContextoLabel = `Nota: ${formattedGrade} | Avaliação: Aula ${notaAulaNumero}${
    isNotaModuloAnterior ? ' | Módulo Anterior' : ''
  }`;

  return {
    notaAulaNumero,
    isNotaModuloAnterior,
    notaContextoLabel,
  };
}

export function extractRecordStartHour(
  record: StudentPerformanceRecord,
  mode: KanbanHourMode = 'AGENDADO'
): number | null {
  if (mode === 'EFETIVO' || mode === 'APENAS_INICIADOS_CHECKIN') {
    if (record.inicio) {
      const parts = record.inicio.trim().split(/\s+/);
      const timePart = parts[parts.length - 1] || '';
      const hourStr = timePart.split(':')[0];
      const parsed = parseInt(hourStr, 10);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 23) {
        return parsed;
      }
    }
    if (mode === 'APENAS_INICIADOS_CHECKIN') {
      return null;
    }
  }

  const rawHoraInicio = (record.horaInicio || '').trim();
  if (rawHoraInicio) {
    const schedHour = parseInt(rawHoraInicio.split(':')[0] || '', 10);
    if (!Number.isNaN(schedHour) && schedHour >= 0 && schedHour <= 23) {
      return schedHour;
    }
  }

  const rawHorario = (record.horario || '08:00').trim();
  const fromHorario = parseInt(rawHorario.split(':')[0] || '', 10);
  return Number.isNaN(fromHorario) ? 8 : fromHorario;
}

export function resolveRecordProfessor(record: StudentPerformanceRecord): string {
  if (record.educador && record.educador.trim()) {
    return record.educador.trim();
  }
  if (resolveStudentCategory(record) === 'INGLÊS') {
    return 'João Pedro da Silva Santos';
  }
  const num = parseInt(String(record.contrato || '0').replace(/\D/g, ''), 10) || 0;
  return num % 2 === 0 ? 'Luana Menezes Monguilod' : 'Gabriel Batista Mota';
}

export function extractAvailableEducators(records: EvaluatedStudentRecord[]): string[] {
  const educators = new Set<string>();
  for (const r of records) {
    const prof = (r.professor || r.educador || '').trim();
    if (prof) educators.add(prof);
  }
  return Array.from(educators).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}


const CONTRACTS_WITHOUT_APOSTILA = new Set(['5012361', '4782770', '5104218', '5089112']);

export function resolvePossuiApostila(record: StudentPerformanceRecord): boolean {
  if (typeof record.possuiApostila === 'boolean') {
    return record.possuiApostila;
  }
  if (record.contrato in PORTAL_APOSTILA_BY_CONTRATO) {
    return PORTAL_APOSTILA_BY_CONTRATO[record.contrato];
  }
  if (CONTRACTS_WITHOUT_APOSTILA.has(record.contrato)) {
    return false;
  }
  const mat = (record.tipoMaterial || record.aulaInfo || '').toLowerCase();
  return mat.includes('apostila');
}

/**
 * Formata e padroniza o nome do Módulo para exibição consistente nos cards e modais.
 */
export function formatModuleDisplay(rawCurso?: string | null): string {
  const cleaned = (rawCurso || '')
    .replace(/^(m[óo]dulo\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .trim();
  return cleaned || 'Módulo não informado';
}

/**
 * Resolve o link correto de login/autenticação do aluno no Portal Microlins:
 * - Se houver um link de token criptografado válido (`/autenticacao/tokenAluno/<token_criptografado>`), utiliza-o.
 * - Rejeita URLs quebradas que utilizam apenas o número do contrato como token (`/autenticacao/tokenAluno/1234567`)
 *   e direciona para o endereço oficial da página de login (`https://portaldoaluno.microlins.com.br/login/`).
 */
export function resolveStudentLoginLink(
  contrato: string,
  explicitUrl?: string | null
): string {
  const candidates = [
    (explicitUrl || '').trim(),
    (PORTAL_AUTH_LINKS_BY_CONTRATO[(contrato || '').trim()] || '').trim(),
  ];

  // Prioridade 1: Link com token criptografado real da aula do aluno (/autenticacao/tokenAluno/<token_criptografado>)
  for (const url of candidates) {
    if (!url) continue;
    if (/\/autenticacao\/tokenAluno\/\d+\/?$/i.test(url)) {
      continue;
    }
    if (
      /^https:\/\/portaldoaluno\.microlins\.com\.br\/autenticacao\/tokenAluno\/[A-Za-z0-9_+=/%-]{20,}$/i.test(
        url
      )
    ) {
      return url;
    }
  }

  // Prioridade 2: Página oficial de login quando o contrato ainda não possui senha cadastrada no portal
  return OFFICIAL_PORTAL_LOGIN_URL;
}

/**
 * Gera a chave composta obrigatória para validação de convites NPS duplicados,
 * considerando simultaneamente:
 * 1. Nome da pessoa (`studentName`)
 * 2. Jornada (`pontoJornada`)
 * 3. Origem do convite (`origem`)
 */
export function buildNpsDuplicateCompositeKey(
  inv: Pick<ActiveNpsInvitation, 'studentName' | 'pontoJornada' | 'origem'>
): string {
  const nomeNorm = normalizeStudentName(inv.studentName || '');
  const jornadaNorm = (inv.pontoJornada || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const origemNorm = (inv.origem || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return `${nomeNorm}::${jornadaNorm}::${origemNorm}`;
}

/**
 * Verifica se um convite candidato é duplicado em relação a outro convite ou a uma lista existente,
 * considerando obrigatoriamente e simultaneamente:
 * 1. Nome da pessoa
 * 2. Jornada
 * 3. Origem do convite
 * Se houver divergência em qualquer um dos três critérios, retorna `false`.
 */
export function isDuplicateNpsInvitation(
  candidate: Pick<ActiveNpsInvitation, 'studentName' | 'pontoJornada' | 'origem'>,
  existingOrOther:
    | Pick<ActiveNpsInvitation, 'studentName' | 'pontoJornada' | 'origem'>
    | Array<Pick<ActiveNpsInvitation, 'studentName' | 'pontoJornada' | 'origem'>>
): boolean {
  const targetKey = buildNpsDuplicateCompositeKey(candidate);
  if (!normalizeStudentName(candidate.studentName || '')) {
    return false;
  }
  const list = Array.isArray(existingOrOther)
    ? existingOrOther
    : [existingOrOther];
  return list.some(
    (item) => buildNpsDuplicateCompositeKey(item) === targetKey
  );
}

interface IndexedAnnualNpsCache {
  annualList: ActiveNpsInvitation[];
  byContrato: Map<string, ActiveNpsInvitation[]>;
  byEmail: Map<string, ActiveNpsInvitation[]>;
  byNormName: Map<string, ActiveNpsInvitation[]>;
  byNormResponsavelName: Map<string, ActiveNpsInvitation[]>;
}

const ANNUAL_NPS_INDEX_CACHE = new WeakMap<
  ActiveNpsInvitation[],
  Map<number, IndexedAnnualNpsCache>
>();

function computeAnnualDeduplicatedNpsList(
  invitations: ActiveNpsInvitation[],
  targetYear: number
): ActiveNpsInvitation[] {
  const { startUtcMs, endUtcMs } = getBrasiliaAnnualUtcBounds(targetYear);
  const seenIds = new Set<string>();
  const seenThreeCriteriaKeys = new Set<string>();
  const validAnnualList: ActiveNpsInvitation[] = [];

  const sorted = [...invitations].sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );

  for (const inv of sorted) {
    if (!inv.createdAt) continue;
    const createdMs = Date.parse(inv.createdAt);
    if (Number.isNaN(createdMs) || createdMs < startUtcMs || createdMs >= endUtcMs) {
      continue;
    }

    const uniqueId = (inv.id || '').trim();
    const controlId = (inv.controlId || '').trim();
    if (uniqueId && seenIds.has(uniqueId)) continue;
    if (controlId && seenIds.has(`ctrl:${controlId}`)) continue;

    // Regra 6: Validação obrigatória de convites duplicados por (Nome da pessoa + Jornada + Origem do convite)
    const compositeThreeCriteriaKey = buildNpsDuplicateCompositeKey(inv);
    const normInvName = normalizeStudentName(inv.studentName || '');
    if (normInvName && seenThreeCriteriaKeys.has(compositeThreeCriteriaKey)) {
      continue;
    }

    if (uniqueId) seenIds.add(uniqueId);
    if (controlId) seenIds.add(`ctrl:${controlId}`);
    if (normInvName) {
      seenThreeCriteriaKeys.add(compositeThreeCriteriaKey);
    }

    validAnnualList.push({ ...inv });
  }

  const countByStudentKey = new Map<string, number>();
  for (const inv of validAnnualList) {
    const key =
      normalizeStudentName(inv.studentName) ||
      inv.contrato ||
      inv.codigoPessoa ||
      inv.email?.toLowerCase().trim();
    if (key) {
      countByStudentKey.set(key, (countByStudentKey.get(key) || 0) + 1);
    }
  }

  return validAnnualList.map((inv) => {
    const key =
      normalizeStudentName(inv.studentName) ||
      inv.contrato ||
      inv.codigoPessoa ||
      inv.email?.toLowerCase().trim();
    const delivery = resolveRealNpsDeliveryTracking(inv);
    return {
      ...inv,
      ...delivery,
      totalStudentInvitations: key ? countByStudentKey.get(key) || 1 : 1,
    };
  });
}

function getOrBuildAnnualNpsIndex(
  invitations: ActiveNpsInvitation[],
  targetYear: number
): IndexedAnnualNpsCache {
  let byYear = ANNUAL_NPS_INDEX_CACHE.get(invitations);
  if (!byYear) {
    byYear = new Map<number, IndexedAnnualNpsCache>();
    ANNUAL_NPS_INDEX_CACHE.set(invitations, byYear);
  }
  const existing = byYear.get(targetYear);
  if (existing) {
    return existing;
  }

  const annualList = computeAnnualDeduplicatedNpsList(invitations, targetYear);
  const byContrato = new Map<string, ActiveNpsInvitation[]>();
  const byEmail = new Map<string, ActiveNpsInvitation[]>();
  const byNormName = new Map<string, ActiveNpsInvitation[]>();
  const byNormResponsavelName = new Map<string, ActiveNpsInvitation[]>();

  for (const inv of annualList) {
    const c = (inv.contrato || '').trim();
    if (c) {
      const list = byContrato.get(c) ?? [];
      list.push(inv);
      byContrato.set(c, list);
    }
    const em = inv.email ? inv.email.toLowerCase().trim() : '';
    if (em) {
      const list = byEmail.get(em) ?? [];
      list.push(inv);
      byEmail.set(em, list);
    }
    const nm = normalizeStudentName(inv.studentName);
    if (nm) {
      const list = byNormName.get(nm) ?? [];
      list.push(inv);
      byNormName.set(nm, list);

      // Nível 3 — Índice O(1) para busca pelo nome do responsável (quando o convite da Indecx traz o nome do pai/mãe/responsável financeiro)
      const respList = byNormResponsavelName.get(nm) ?? [];
      respList.push(inv);
      byNormResponsavelName.set(nm, respList);
    }
  }

  const entry: IndexedAnnualNpsCache = {
    annualList,
    byContrato,
    byEmail,
    byNormName,
    byNormResponsavelName,
  };
  byYear.set(targetYear, entry);
  return entry;
}

/**
 * Filtra e deduplica os convites NPS do ano vigente em America/Sao_Paulo,
 * ordenando sempre do mais recente para o mais antigo (`createdAt` decrescente)
 * e aplicando a validação de duplicidade pelos 3 critérios simultâneos:
 * Nome da pessoa + Jornada + Origem do convite.
 */
export function filterAndDeduplicateAnnualNpsInvitations(
  invitations: ActiveNpsInvitation[],
  targetYear: number = getCurrentBrasiliaYear()
): ActiveNpsInvitation[] {
  return getOrBuildAnnualNpsIndex(invitations, targetYear).annualList;
}

/**
 * Verifica se um convite NPS está estritamente ATIVO e NÃO RESPONDIDO.
 * Convites expirados, cancelados ou já respondidos retornam `false`.
 */
export function isInvitationStrictlyActive(inv: ActiveNpsInvitation | null | undefined): boolean {
  if (!inv) return false;
  const statusLower = (inv.invitationStatus || '').trim().toLowerCase();
  return statusLower === 'ativo' && !inv.answered;
}

/**
 * Enriquece um convite NPS com os metadados da Hierarquia de 4 Níveis:
 * - Nível 1: CONTRATO (Prioridade Ouro)
 * - Nível 2: NOME_ALUNO (Prioridade Prata)
 * - Nível 3: NOME_RESPONSAVEL (Prioridade Bronze — Nova Regra)
 * - Nível 4: EMAIL (Confirmação por E-mail)
 */
export function enrichInvitationWithHierarchyContext(
  inv: ActiveNpsInvitation,
  record: Pick<StudentPerformanceRecord, 'contrato' | 'nomeCompleto'> & {
    nomeResponsavel?: string;
    telefoneAluno?: string;
    telefoneResponsavel?: string;
    email?: string;
  },
  nivelCruzamento: NpsNivelCruzamentoType,
  siblingFamilyContext?: {
    isAmbiguous: boolean;
    studentNames: string[];
    contratos: string[];
  }
): ActiveNpsInvitation {
  const normInvName = normalizeStudentName(inv.studentName || '');
  const normAlunoName = normalizeStudentName(record.nomeCompleto || '');
  const normRespName = normalizeStudentName(record.nomeResponsavel || '');

  const isGuardianRecipient =
    nivelCruzamento === 'NOME_RESPONSAVEL' ||
    inv.npsDestinatario === 'RESPONSAVEL' ||
    Boolean(
      normRespName &&
        normInvName === normRespName &&
        normInvName !== normAlunoName
    );

  const npsDestinatario: NpsDestinatarioType = isGuardianRecipient
    ? 'RESPONSAVEL'
    : 'ALUNO';

  const respondenteNome = isGuardianRecipient
    ? (record.nomeResponsavel || inv.studentName || '').trim()
    : (record.nomeCompleto || inv.studentName || '').trim();

  const isAmbiguous = Boolean(
    siblingFamilyContext?.isAmbiguous &&
      siblingFamilyContext.studentNames.length > 1
  );

  let respondenteVinculoLabel: string;
  let orientacaoAbordagemPresencial: string | undefined;
  if (isGuardianRecipient) {
    if (isAmbiguous && siblingFamilyContext) {
      const shortNames = siblingFamilyContext.studentNames
        .map((n) => n.split(/\s+/).slice(0, 2).join(' '))
        .join(' & ');
      respondenteVinculoLabel = `Respondente: ${respondenteNome} (Responsável por ${shortNames})`;
      orientacaoAbordagemPresencial = `Orientação em sala: Avise os irmãos ${shortNames} que o(a) responsável ${respondenteNome} recebeu uma pesquisa rápida no WhatsApp sobre o desenvolvimento deles na Microlins.`;
    } else {
      respondenteVinculoLabel = `Respondente: ${respondenteNome} (Responsável por ${record.nomeCompleto})`;
      const primeiroNomeAluno = extractFirstName(record.nomeCompleto);
      orientacaoAbordagemPresencial = `Orientação em sala: Avise ${primeiroNomeAluno} que ${respondenteNome} recebeu uma pesquisa rápida no WhatsApp sobre seu desenvolvimento na Microlins.`;
    }
  } else {
    respondenteVinculoLabel = `Respondente: ${record.nomeCompleto} (Aluno titular)`;
  }

  return {
    ...inv,
    npsDestinatario,
    nivelCruzamento,
    respondenteNome,
    respondenteVinculoLabel,
    isVinculoFamiliarAmbiguo: isAmbiguous,
    alunosVinculadosFamilia: siblingFamilyContext?.studentNames,
    contratosVinculadosFamilia: siblingFamilyContext?.contratos,
    orientacaoAbordagemPresencial,
  };
}

/**
 * Retorna todo o histórico de pesquisas NPS vinculadas a um aluno do Kanban,
 * aplicando a Hierarquia de Cruzamento em Cascata de 4 Níveis:
 * - Nível 1 (Ouro): Identificação por Contrato (`byContrato`)
 * - Nível 2 (Prata): Identificação pelo Nome do Aluno (`byNormName`)
 * - Nível 3 (Bronze): Identificação pelo Nome do Responsável (`byNormResponsavelName`)
 * - Nível 4 (Confirmação): Identificação por E-mail (`byEmail`)
 */
export function getStudentChronologicalNpsHistory(
  record: Pick<StudentPerformanceRecord, 'contrato' | 'nomeCompleto'> & {
    nomeResponsavel?: string;
    telefoneAluno?: string;
    telefoneResponsavel?: string;
    email?: string;
  },
  activeNpsInvitations: ActiveNpsInvitation[] = INITIAL_ACTIVE_NPS_INVITATIONS,
  targetYear: number = getCurrentBrasiliaYear()
): ActiveNpsInvitation[] {
  const index = getOrBuildAnnualNpsIndex(activeNpsInvitations, targetYear);
  const recContrato = (record.contrato || '').trim();
  const recEmail = record.email ? record.email.toLowerCase().trim() : '';
  const normRecordName = normalizeStudentName(record.nomeCompleto);
  const normRespName = normalizeStudentName(record.nomeResponsavel || '');

  // Nível 1 — Contrato (Ouro)
  const byC = recContrato ? index.byContrato.get(recContrato) : undefined;
  // Nível 2 — Nome do Aluno (Prata)
  const byN = normRecordName ? index.byNormName.get(normRecordName) : undefined;
  // Nível 3 — Nome do Responsável (Bronze)
  const byR =
    normRespName && normRespName !== normRecordName
      ? index.byNormResponsavelName
          .get(normRespName)
          ?.filter(
            (inv) => !inv.contrato || inv.contrato.trim() === recContrato
          )
      : undefined;
  // Nível 4 — Confirmação por E-mail
  const byE = recEmail
    ? index.byEmail
        .get(recEmail)
        ?.filter((inv) => !inv.contrato || inv.contrato.trim() === recContrato)
    : undefined;

  if (!byC && !byN && !byR && !byE) {
    return [];
  }

  const mergedMap = new Map<string, ActiveNpsInvitation>();

  // Inserir na ordem de prioridade (Ouro -> Prata -> Bronze -> E-mail) sem sobrescrever nível mais forte
  if (byC) {
    for (const inv of byC) {
      mergedMap.set(
        inv.id,
        enrichInvitationWithHierarchyContext(inv, record, 'CONTRATO')
      );
    }
  }
  if (byN) {
    for (const inv of byN) {
      if (!mergedMap.has(inv.id)) {
        mergedMap.set(
          inv.id,
          enrichInvitationWithHierarchyContext(inv, record, 'NOME_ALUNO')
        );
      }
    }
  }
  if (byR) {
    for (const inv of byR) {
      if (!mergedMap.has(inv.id)) {
        mergedMap.set(
          inv.id,
          enrichInvitationWithHierarchyContext(inv, record, 'NOME_RESPONSAVEL')
        );
      }
    }
  }
  if (byE) {
    for (const inv of byE) {
      if (!mergedMap.has(inv.id)) {
        mergedMap.set(
          inv.id,
          enrichInvitationWithHierarchyContext(inv, record, 'EMAIL')
        );
      }
    }
  }

  return Array.from(mergedMap.values()).sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );
}

/**
 * Seleciona EXCLUSIVAMENTE a pesquisa mais recente ainda não respondida (`ativo` e `!answered`)
 * vinculada ao aluno (ou ao seu responsável pelo vínculo familiar em 4 níveis).
 */
export function matchActiveNpsInvitationForStudent(
  record: Pick<StudentPerformanceRecord, 'contrato' | 'nomeCompleto'> & {
    nomeResponsavel?: string;
    telefoneAluno?: string;
    telefoneResponsavel?: string;
    email?: string;
  },
  activeNpsInvitations: ActiveNpsInvitation[] = INITIAL_ACTIVE_NPS_INVITATIONS,
  targetYear: number = getCurrentBrasiliaYear()
): ActiveNpsInvitation | null {
  const history = getStudentChronologicalNpsHistory(
    record,
    activeNpsInvitations,
    targetYear
  );
  const activeUnanswered = history.filter((inv) => isInvitationStrictlyActive(inv));
  if (activeUnanswered.length === 0) return null;

  const latest = activeUnanswered[0];
  return {
    ...latest,
    totalStudentInvitations: history.length,
  };
}

/**
 * Envio de pesquisa NPS por WhatsApp e links diretos removidos por diretriz do sistema.
 */
export function buildWhatsAppNpsUrl(
  _studentName: string,
  _phone: string,
  _surveyUrl: string,
  _pontoJornada?: string,
  _options?: {
    npsDestinatario?: NpsDestinatarioType;
    respondenteNome?: string;
    alunosVinculadosFamilia?: string[];
  }
): string {
  return '';
}

/**
 * Avalia a presença/falta e estágio de horário de um agendamento de aluno seguindo rigorosamente a regra definitiva:
 *
 * PRIORIDADE ABSOLUTA: status informado pelo sistema.
 * 1. Se o sistema já informar PRESENÇA (`FINALIZADO`, `INICIADO`, `inicio`/`fim` preenchidos, `presencaOuFalta === 'P'` ou `statusSistema === 'PRESENCA'`), manter o status como `'Presença'`.
 * 2. Se o sistema já informar FALTA (`presencaOuFalta === 'F'`, `statusSistema === 'FALTA'`, `status === 'FALTA'` ou `infoAula` indicando falta), manter o status como `'Falta'`.
 * 3. Somente quando o sistema NÃO informar nem presença nem falta, realizar a análise automática do horário:
 *    - Antes do horário de início da aula ou se ainda NÃO tiverem passado mais de 15 minutos do horário de início (`currentTimeMinutes <= scheduledStartMinutes + 15` no dia atual, ou dia futuro): status = `'Não iniciada'`.
 *    - Se JÁ tiverem passado mais de 15 minutos do horário de início da aula (`currentTimeMinutes > scheduledStartMinutes + 15` no dia atual, ou dia anterior encerrado): status = `'Falta'`.
 */
export function evaluateStudentAttendance(
  record: StudentPerformanceRecord,
  currentTimeMinutes: number = getBrasiliaCurrentMinutes(),
  manualAttendanceOverrides: Record<number, AttendanceStatus> = {},
  activeNpsInvitations: ActiveNpsInvitation[] = INITIAL_ACTIVE_NPS_INVITATIONS,
  referenceWeekday?: string,
  hasPeriodClosureConfirmed = true
): EvaluatedStudentRecord {
  const startHour = extractRecordStartHour(record, 'AGENDADO') ?? 8;
  const scheduledStartMinutes = parseTimeToMinutes(
    record.horaInicio || `${String(startHour).padStart(2, '0')}:00`
  );
  const toleranceEndMinutes = scheduledStartMinutes + 15;
  const paddedHour = String(startHour).padStart(2, '0');
  const hourKey = `${paddedHour}h`;
  const toleranceWindowLabel = `${formatMinutesToHHMM(
    scheduledStartMinutes
  )} às ${formatMinutesToHHMM(toleranceEndMinutes)}`;

  const recordDiaSemana = (record.diaSemana || PORTAL_METADATA.diaSemana).trim();
  const effectiveReferenceWeekday =
    referenceWeekday !== undefined && referenceWeekday.trim() !== ''
      ? referenceWeekday.trim()
      : getCurrentBrasiliaWeekdayLabel();
  const dayRelation = compareWeekdayWithCurrent(
    recordDiaSemana,
    effectiveReferenceWeekday
  );

  const manualOverride = manualAttendanceOverrides[record.id];

  const rawStatusStr = String(record.status || '').toUpperCase().trim();
  const rawInfoAulaStr = String(record.infoAula || '').toUpperCase().trim();
  const rawPresencaStr = String(record.presencaOuFalta || '').toUpperCase().trim();

  // Prioridade 1: Sistema informa PRESENÇA confirmada (Portal, Biometria, Início/Fim registrado, Aula iniciada adiantada ou Sistema Acadêmico)
  const hasSystemPresence =
    rawPresencaStr === 'P' ||
    rawPresencaStr === 'PRESENÇA' ||
    rawPresencaStr === 'PRESENCA' ||
    record.statusSistema === 'PRESENCA' ||
    rawStatusStr === 'FINALIZADO' ||
    rawStatusStr === 'INICIADO' ||
    rawInfoAulaStr === 'SISTEMA ACADÊMICO' ||
    rawInfoAulaStr === 'SISTEMA ACADEMICO' ||
    (rawInfoAulaStr === 'PORTAL DO ALUNO' &&
      (Boolean(record.inicio && record.inicio.trim() !== '') ||
        Boolean(record.fim && record.fim.trim() !== '') ||
        (rawStatusStr !== '' && rawStatusStr !== 'NÃO INICIADO' && rawStatusStr !== 'NAO INICIADO'))) ||
    Boolean(record.inicio && record.inicio.trim() !== '') ||
    Boolean(record.fim && record.fim.trim() !== '');

  // Suporte a aulas que começam adiantadas (ex.: agendada às 10:00, mas o aluno iniciou às 09:50 no Portal):
  // Se o Portal já registrou início/presença no dia atual (ou se o timestamp de início já foi atingido),
  // a aula é considerada iniciada imediatamente, sem aguardar o horário agendado e sem jamais rebaixar para 'NÃO INICIADO' ou 'Falta'.
  const inicioTimestampParts = parsePortalTimestampParts(record.inicio);
  const hasStartedEarlyToday =
    dayRelation === 'CURRENT_DAY' &&
    (hasSystemPresence ||
      (inicioTimestampParts !== null &&
        inicioTimestampParts.minutesOfDay <= currentTimeMinutes));

  // Regra de Reset Semanal no Domingo e Contabilização ao Chegar ou Iniciar Adiantado a Aula do Aluno:
  // - A semana começa no Domingo (índice 0 em WEEKDAY_CHRONOLOGICAL_ORDER).
  // - Se a aula pertence a um dia futuro da semana atual (`dayRelation === 'FUTURE_DAY'`)
  //   OU se é no dia atual, ainda não chegou o horário agendado (`currentTimeMinutes < scheduledStartMinutes`)
  //   E o aluno ainda NÃO iniciou a aula adiantada (`!hasStartedEarlyToday`),
  //   o status permanece 'Não iniciada' até chegar o horário ou o aluno iniciar a aula.
  const hasClassTimeArrivedInWeek =
    dayRelation === 'PAST_DAY' ||
    hasStartedEarlyToday ||
    (dayRelation !== 'FUTURE_DAY' && hasSystemPresence) ||
    (dayRelation === 'CURRENT_DAY' &&
      currentTimeMinutes >= scheduledStartMinutes);

  // Prioridade 2: Sistema informa FALTA explícita confirmada
  const hasSystemAbsence =
    !hasSystemPresence &&
    (rawPresencaStr === 'F' ||
      rawPresencaStr === 'FALTA' ||
      record.statusSistema === 'FALTA' ||
      rawStatusStr === 'FALTA' ||
      rawInfoAulaStr === 'FALTA');

  // Regra 5.2: Proteção contra falso-positivo de falta quando a sincronização do período ainda não ocorreu
  // ou quando o registro está explicitamente marcado como NAO_REGISTRADO sem fechamento confirmado do período.
  const isExplicitlyUnsynced =
    record.statusSistema === 'NAO_REGISTRADO' ||
    (!hasPeriodClosureConfirmed &&
      !hasSystemPresence &&
      !hasSystemAbsence &&
      (rawInfoAulaStr === 'NÃO REGISTRADO' ||
        rawInfoAulaStr === 'NAO REGISTRADO' ||
        rawInfoAulaStr === ''));

  let attendanceStatus: AttendanceStatus;
  let scheduleStage: ScheduleStage;
  let scheduleStageLabel: string;
  let isWithinTolerance = false;
  let isPendingNextDayAbsence = false;
  let minutesRemainingInTolerance: number | null = null;

  if (manualOverride) {
    if (manualOverride === 'Presença') {
      attendanceStatus = 'Presença';
      scheduleStage = 'CONCLUIDO';
      scheduleStageLabel = 'Presença';
    } else if (manualOverride === 'Falta') {
      attendanceStatus = 'Falta';
      scheduleStage = 'FALTA_CONTABILIZADA';
      scheduleStageLabel = 'Falta';
    } else {
      attendanceStatus = 'Não iniciada';
      scheduleStage = 'HORARIO_FUTURO';
      scheduleStageLabel = 'Não iniciada';
    }
  } else if (hasSystemPresence && dayRelation !== 'FUTURE_DAY') {
    // Se o sistema informa PRESENÇA confirmada (inclusive aula iniciada adiantada antes do horário agendado), contabiliza Presença imediatamente
    attendanceStatus = 'Presença';
    scheduleStage = 'CONCLUIDO';
    scheduleStageLabel = 'Presença';
  } else if (hasSystemAbsence && dayRelation !== 'FUTURE_DAY') {
    // Se o sistema informa FALTA explícita confirmada, contabiliza Falta imediatamente
    attendanceStatus = 'Falta';
    scheduleStage = 'FALTA_CONTABILIZADA';
    scheduleStageLabel = 'Falta';
  } else if (!hasClassTimeArrivedInWeek) {
    // Para alunos sem presença/falta confirmada: se a aula ainda não chegou, permanece 'Não iniciada' sem antecipar faltas
    attendanceStatus = 'Não iniciada';
    scheduleStage = 'HORARIO_FUTURO';
    scheduleStageLabel = 'Não iniciada';
  } else if (isExplicitlyUnsynced) {
    // Período/turno ainda não sincronizado ou sem fechamento no Portal: não fabricar falta automática
    attendanceStatus = 'Não iniciada';
    scheduleStage = 'HORARIO_FUTURO';
    scheduleStageLabel = 'Aguardando sincronização';
  } else if (dayRelation === 'PAST_DAY') {
    // Dia anterior da mesma semana já encerrado sem presença
    attendanceStatus = 'Falta';
    scheduleStage = 'FALTA_CONTABILIZADA';
    scheduleStageLabel = 'Falta';
  } else {
    // Dia atual (CURRENT_DAY) com currentTimeMinutes >= scheduledStartMinutes:
    if (currentTimeMinutes <= toleranceEndMinutes) {
      // Dentro da janela de 15 minutos de tolerância -> Não iniciada
      attendanceStatus = 'Não iniciada';
      scheduleStage = 'EM_ANDAMENTO';
      scheduleStageLabel = 'Não iniciada';
      isWithinTolerance = true;
      minutesRemainingInTolerance = toleranceEndMinutes - currentTimeMinutes;
    } else {
      // Já passaram mais de 15 minutos do horário de início da aula -> Falta
      attendanceStatus = 'Falta';
      scheduleStage = 'FALTA_CONTABILIZADA';
      scheduleStageLabel = 'Falta';
    }
  }

  const presenceRegisteredAt =
    attendanceStatus === 'Presença'
      ? record.inicio || `${paddedHour}:05`
      : '';

  const linkAcessoDireto = resolveStudentLoginLink(
    record.contrato,
    record.linkLoginUrl
  );
  const cleanAlunoPhone = (record.telefoneAluno || '').replace(/\D/g, '');
  const cleanRespPhone = (
    record.telefoneResponsavel ||
    record.telefoneAluno ||
    ''
  ).replace(/\D/g, '');

  const salaNormalized = formatFullSalaName(record.sala, record.modalidade);
  const cursoNormalized = formatModuleDisplay(record.curso);

  const loginMessage = `Olá ${record.nomeCompleto}, acesse sua aula na Microlins (Contrato #${record.contrato} · ${cursoNormalized}) pelo link do Portal do Aluno:\n${linkAcessoDireto}`;
  const whatsappAlunoLoginUrl = `https://api.whatsapp.com/send?${
    cleanAlunoPhone ? `phone=${cleanAlunoPhone}&` : ''
  }text=${encodeURIComponent(loginMessage)}`;

  const respGreeting = record.nomeResponsavel
    ? `Olá ${record.nomeResponsavel}`
    : `Olá Responsável por ${record.nomeCompleto}`;
  const respMessage = `${respGreeting}, entramos em contato da ${PORTAL_METADATA.unidade} referente ao acompanhamento da aula do(a) aluno(a) ${record.nomeCompleto} (Contrato #${record.contrato} · ${cursoNormalized}).`;
  const whatsappResponsavelContactUrl = `https://api.whatsapp.com/send?${
    cleanRespPhone ? `phone=${cleanRespPhone}&` : ''
  }text=${encodeURIComponent(respMessage)}`;

  const studentNpsHistory = getStudentChronologicalNpsHistory(
    record,
    activeNpsInvitations
  );
  const matchedNps =
    studentNpsHistory.find((inv) => isInvitationStrictlyActive(inv)) ?? null;
  const enrichedMatchedNps = matchedNps
    ? { ...matchedNps, totalStudentInvitations: studentNpsHistory.length }
    : null;

  const hasActiveNps = Boolean(enrichedMatchedNps);
  const targetNpsPhone =
    enrichedMatchedNps?.npsDestinatario === 'RESPONSAVEL'
      ? record.telefoneResponsavel ||
        enrichedMatchedNps.phone ||
        record.telefoneAluno
      : record.telefoneAluno ||
        enrichedMatchedNps?.phone ||
        record.telefoneResponsavel ||
        '';

  const whatsappNpsUrl = enrichedMatchedNps
    ? buildWhatsAppNpsUrl(
        record.nomeCompleto,
        targetNpsPhone,
        enrichedMatchedNps.surveyUrl,
        enrichedMatchedNps.pontoJornada,
        {
          npsDestinatario: enrichedMatchedNps.npsDestinatario,
          respondenteNome: enrichedMatchedNps.respondenteNome,
          alunosVinculadosFamilia: enrichedMatchedNps.alunosVinculadosFamilia,
        }
      )
    : '';

  const effectiveRecordStatus: ClassStatus = !hasClassTimeArrivedInWeek
    ? 'NÃO INICIADO'
    : hasSystemPresence
    ? Boolean(record.fim && record.fim.trim() !== '') || rawStatusStr === 'FINALIZADO'
      ? 'FINALIZADO'
      : Boolean(record.inicio && record.inicio.trim() !== '') || rawStatusStr === 'INICIADO'
      ? 'INICIADO'
      : 'FINALIZADO'
    : record.status;
  const effectiveInicio = !hasClassTimeArrivedInWeek ? '' : record.inicio;
  const effectiveFim = !hasClassTimeArrivedInWeek ? '' : record.fim;
  const effectivePresencaOuFalta = !hasClassTimeArrivedInWeek
    ? ''
    : hasSystemPresence
    ? 'P'
    : record.presencaOuFalta;

  // Item 1.1: Parcelas em Atraso preservadas internamente (ex.: 0, 1, 3, 6...), mantendo indicador estritamente binário na UI pedagógica
  const deterministicOverdueInstallments = (() => {
    const digits = (record.contrato || '').replace(/\D/g, '');
    const lastDigit = digits ? parseInt(digits[digits.length - 1], 10) : 1;
    if (lastDigit % 3 === 0) return 3;
    if (lastDigit % 5 === 0) return 6;
    return 1;
  })();
  const parcelasAtrasadas =
    typeof record.parcelasAtrasadas === 'number'
      ? Math.max(0, Math.floor(record.parcelasAtrasadas))
      : record.inadimplente
      ? deterministicOverdueInstallments
      : 0;
  const effectiveInadimplente = Boolean(
    record.inadimplente || parcelasAtrasadas > 0
  );

  // Item 1.2: Tempo Real de Permanência na Aula
  const permanencia = calculateTempoPermanencia(
    effectiveInicio,
    effectiveFim,
    record.horaInicio,
    record.horaFim
  );

  // Item 1.3: Identificação de Saída Antecipada (HoraFim - AulaFim)
  const saidaAntecipada = calculateSaidaAntecipada(
    effectiveFim,
    record.horaFim,
    effectiveInicio,
    30
  );

  // Item 1.4: Identificação da Aula em que a Nota foi Obtida
  const notaCtx = resolveNotaContexto(record);

  return {
    ...record,
    inadimplente: effectiveInadimplente,
    parcelasAtrasadas,
    status: effectiveRecordStatus,
    inicio: effectiveInicio,
    fim: effectiveFim,
    presencaOuFalta: effectivePresencaOuFalta,
    sala: salaNormalized,
    curso: cursoNormalized,
    professor: resolveRecordProfessor(record),
    diaSemana: recordDiaSemana,
    dayRelation,
    hourKey,
    moduloAtual: cursoNormalized,
    aulaAtualLabel: `Aula ${record.aulaNumero || 1}`,
    possuiApostila: resolvePossuiApostila(record),
    categoriaCurso: resolveStudentCategory(record),
    situacaoFinanceiraLabel: effectiveInadimplente ? 'Em atraso' : 'Em dia',
    tempoPermanenciaMinutos: permanencia.tempoPermanenciaMinutos,
    duracaoCurricularMinutos: permanencia.duracaoCurricularMinutos,
    mediaTempoEtapaMinutos: permanencia.duracaoCurricularMinutos,
    isTempoInsuficiente: permanencia.isTempoInsuficiente,
    isSessaoMultiplosDias: permanencia.isSessaoMultiplosDias,
    tempoPermanenciaLabel: permanencia.tempoPermanenciaLabel,
    saidaAntecipadaMinutos: saidaAntecipada.saidaAntecipadaMinutos,
    isSaidaAntecipada: saidaAntecipada.isSaidaAntecipada,
    isFinalizacaoAntecipada: saidaAntecipada.isSaidaAntecipada,
    saidaAntecipadaLabel: saidaAntecipada.saidaAntecipadaLabel,
    recorrenciaSaidaAntecipadaCount: saidaAntecipada.isSaidaAntecipada ? 1 : 0,
    notaAulaNumero: notaCtx.notaAulaNumero,
    isNotaModuloAnterior: notaCtx.isNotaModuloAnterior,
    notaContextoLabel: notaCtx.notaContextoLabel,
    linkAcessoDireto,
    whatsappResponsavelContactUrl,
    whatsappAlunoLoginUrl,
    attendanceStatus,
    scheduleStage,
    scheduleStageLabel,
    scheduledStartMinutes,
    toleranceEndMinutes,
    toleranceWindowLabel,
    isWithinTolerance,
    isPendingNextDayAbsence,
    minutesRemainingInTolerance,
    presenceRegisteredAt,
    isEvasao: false,
    evasaoSummary: null,
    isRiscoPreventivoEvasao: false,
    riscoPreventivoEvasaoMotivos: [],
    studentFrequencyPercent:
      attendanceStatus === 'Presença'
        ? 100
        : attendanceStatus === 'Falta'
        ? 0
        : null,
    hasActiveNps,
    npsInvitation: enrichedMatchedNps,
    studentNpsHistory,
    npsOrigemFormatada: enrichedMatchedNps
      ? (enrichedMatchedNps.origem as 'Portal do Aluno' | 'E-mail')
      : null,
    whatsappNpsUrl: '',
  };
}

/**
 * Regra centralizada e única de Evasão:
 * - Aplica-se quando o aluno possui 2 ou mais agendamentos no mesmo dia (totalAgendamentosDia >= 2).
 * - Critério de Atribuição: O aluno compareceu a pelo menos 1 aula no dia (attendanceStatus === 'Presença')
 *   E faltou a pelo menos 1 aula agendada no mesmo dia cujo horário/tolerância já expirou (attendanceStatus === 'Falta').
 * - Critério de Remoção: Se a falta for justificada/substituída por Presença (via sistema ou override),
 *   ou se todas as aulas forem Presença (100% frequência), ou se o aluno faltar a todas as aulas do dia (ausência integral),
 *   o status de evasão é imediatamente removido (isEvasao = false, summary = null).
 */
export function evaluateDayScheduleEvasao(dayRecords: EvaluatedStudentRecord[]): {
  isEvasao: boolean;
  summary: string | null;
} {
  const totalAgendamentosDia = dayRecords.length;
  if (totalAgendamentosDia < 2) {
    return { isEvasao: false, summary: null };
  }

  let presencaCount = 0;
  let faltaOuPendenteCount = 0;

  for (const r of dayRecords) {
    if (r.attendanceStatus === 'Presença') {
      presencaCount++;
    } else if (r.attendanceStatus === 'Falta' || r.isPendingNextDayAbsence) {
      faltaOuPendenteCount++;
    }
  }

  // O aluno esteve presente em sala e evadiu-se/ausentou-se de outro horário do mesmo dia
  if (presencaCount >= 1 && faltaOuPendenteCount >= 1) {
    const dia = dayRecords[0]?.diaSemana || PORTAL_METADATA.diaSemana;
    return {
      isEvasao: true,
      summary: `${presencaCount} presença${presencaCount > 1 ? 's' : ''} e ${faltaOuPendenteCount} ausência${faltaOuPendenteCount > 1 ? 's' : ''} em ${totalAgendamentosDia} agendamentos (${dia})`,
    };
  }

  return { isEvasao: false, summary: null };
}

const CURRENT_TARGET_YEAR_CACHE = getCurrentBrasiliaYear();

export function isAlreadyEvaluatedRecords(
  records: StudentPerformanceRecord[],
  manualAttendanceOverrides: Record<number, AttendanceStatus>
): records is EvaluatedStudentRecord[] {
  if (records.length === 0) return true;
  if (Object.keys(manualAttendanceOverrides).length > 0) return false;
  const first = records[0] as Partial<EvaluatedStudentRecord>;
  return (
    typeof first.attendanceStatus === 'string' &&
    typeof first.scheduleStage === 'string' &&
    typeof first.hourKey === 'string' &&
    typeof first.linkAcessoDireto === 'string' &&
    typeof first.notaContextoLabel === 'string'
  );
}

export function evaluateAllStudentsAttendance(
  records: StudentPerformanceRecord[],
  currentTimeMinutes: number = getBrasiliaCurrentMinutes(),
  manualAttendanceOverrides: Record<number, AttendanceStatus> = {},
  activeNpsInvitations: ActiveNpsInvitation[] = INITIAL_ACTIVE_NPS_INVITATIONS,
  referenceWeekday?: string
): EvaluatedStudentRecord[] {
  const seenIds = new Set<number>();
  const uniqueSchedules: EvaluatedStudentRecord[] = [];
  // Aquecer o índice anual de NPS uma única vez antes do loop
  getOrBuildAnnualNpsIndex(activeNpsInvitations, CURRENT_TARGET_YEAR_CACHE);

  const effectiveRefWeekday =
    referenceWeekday !== undefined && referenceWeekday.trim() !== ''
      ? referenceWeekday.trim()
      : getCurrentBrasiliaWeekdayLabel();

  // Verificar fechamento/sincronização por (diaSemana, turno) para evitar que um turno inteiro
  // ainda não sincronizado pelo Portal no dia atual (ex: 100% dos registros do turno da Tarde com
  // infoAula === 'Não registrado' e sem nenhum P/F) transforme todos os alunos da tarde em Falta.
  const shiftStats = new Map<string, { total: number; confirmed: number }>();
  for (const r of records) {
    const day = (r.diaSemana || PORTAL_METADATA.diaSemana).trim();
    const startH = extractRecordStartHour(r, 'AGENDADO') ?? 8;
    const shift = r.turno || (startH < 12 ? 'Manhã' : startH < 18 ? 'Tarde' : 'Noite');
    const shiftKey = `${day}::${shift}`;
    const entry = shiftStats.get(shiftKey) || { total: 0, confirmed: 0 };
    entry.total++;
    const infoLower = String(r.infoAula || '').trim().toLowerCase();
    const hasConfirmedPortalSignal =
      r.presencaOuFalta === 'P' ||
      r.presencaOuFalta === 'F' ||
      r.status === 'FINALIZADO' ||
      r.status === 'INICIADO' ||
      r.statusSistema === 'PRESENCA' ||
      r.statusSistema === 'FALTA' ||
      Boolean(r.inicio && r.inicio.trim() !== '') ||
      Boolean(r.fim && r.fim.trim() !== '') ||
      (infoLower !== '' && infoLower !== 'não registrado' && infoLower !== 'nao registrado');
    if (hasConfirmedPortalSignal) {
      entry.confirmed++;
    }
    shiftStats.set(shiftKey, entry);
  }

  for (const r of records) {
    if (seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    const day = (r.diaSemana || PORTAL_METADATA.diaSemana).trim();
    const startH = extractRecordStartHour(r, 'AGENDADO') ?? 8;
    const shift = r.turno || (startH < 12 ? 'Manhã' : startH < 18 ? 'Tarde' : 'Noite');
    const shiftKey = `${day}::${shift}`;
    const st = shiftStats.get(shiftKey);
    const dayRel = compareWeekdayWithCurrent(day, effectiveRefWeekday);
    // Se estamos no dia atual (CURRENT_DAY) em um turno com >= 3 alunos agendados e ZERO confirmações do Portal
    // (todos "Não registrado"), o turno ainda não foi sincronizado/fechado pelo Portal.
    const hasPeriodClosureConfirmed =
      dayRel === 'CURRENT_DAY' && st && st.total >= 3 && st.confirmed === 0
        ? false
        : true;

    uniqueSchedules.push(
      evaluateStudentAttendance(
        r,
        currentTimeMinutes,
        manualAttendanceOverrides,
        activeNpsInvitations,
        referenceWeekday,
        hasPeriodClosureConfirmed
      )
    );
  }

  // Agrupar por (diaSemana, contrato) para avaliar Evasão e Frequência do contrato no dia
  const dayContractGroups = new Map<string, EvaluatedStudentRecord[]>();
  // Agrupar por contrato na semana para contabilizar recorrência de saída antecipada (Item 1.3)
  const earlyExitCountByContract = new Map<string, number>();
  // Mapear irmãos do mesmo responsável na unidade (Seção 4)
  const studentsByNormResponsavel = new Map<
    string,
    { names: Set<string>; contratos: Set<string> }
  >();

  for (const rec of uniqueSchedules) {
    const key = `${rec.diaSemana}::${rec.contrato}`;
    const list = dayContractGroups.get(key) ?? [];
    list.push(rec);
    dayContractGroups.set(key, list);

    if (rec.isSaidaAntecipada) {
      earlyExitCountByContract.set(
        rec.contrato,
        (earlyExitCountByContract.get(rec.contrato) || 0) + 1
      );
    }

    const normResp = normalizeStudentName(rec.nomeResponsavel || '');
    const normAluno = normalizeStudentName(rec.nomeCompleto || '');
    if (normResp && normResp !== normAluno) {
      const entry = studentsByNormResponsavel.get(normResp) ?? {
        names: new Set<string>(),
        contratos: new Set<string>(),
      };
      entry.names.add(rec.nomeCompleto);
      entry.contratos.add(rec.contrato);
      studentsByNormResponsavel.set(normResp, entry);
    }
  }

  // Cálculo da média de tempo por etapa/aula (Seção 3.3 e Seção 8)
  const stageDurationsMap = new Map<number, { sum: number; count: number }>();
  for (const rec of uniqueSchedules) {
    const stageKey = rec.aulaNumero || 1;
    if (
      rec.tempoPermanenciaMinutos !== null &&
      rec.tempoPermanenciaMinutos > 0 &&
      !rec.isSessaoMultiplosDias
    ) {
      const entry = stageDurationsMap.get(stageKey) || { sum: 0, count: 0 };
      entry.sum += rec.tempoPermanenciaMinutos;
      entry.count += 1;
      stageDurationsMap.set(stageKey, entry);
    }
  }

  for (const group of dayContractGroups.values()) {
    const result = evaluateDayScheduleEvasao(group);
    let pCount = 0;
    let fCount = 0;
    for (const r of group) {
      if (r.attendanceStatus === 'Presença') pCount++;
      else if (r.attendanceStatus === 'Falta') fCount++;
    }
    const base = pCount + fCount;
    const freq = base > 0 ? Number(((pCount / base) * 100).toFixed(1)) : null;

    for (const rec of group) {
      rec.studentFrequencyPercent = freq;
      rec.recorrenciaSaidaAntecipadaCount =
        earlyExitCountByContract.get(rec.contrato) || 0;
      rec.isEvasao = result.isEvasao;
      rec.evasaoSummary = result.summary;

      const stageKey = rec.aulaNumero || 1;
      const stageStats = stageDurationsMap.get(stageKey);
      const mediaEtapa =
        stageStats && stageStats.count > 0
          ? Math.round(stageStats.sum / stageStats.count)
          : rec.duracaoCurricularMinutos;
      rec.mediaTempoEtapaMinutos = mediaEtapa;

      // Finalização antecipada baseada na média da etapa (Seção 3.3 e Premissas Seção 8)
      const hasStagePeerComparison = Boolean(stageStats && stageStats.count >= 2);
      const finishedBelowStageAvg =
        !rec.isSessaoMultiplosDias &&
        rec.tempoPermanenciaMinutos !== null &&
        rec.tempoPermanenciaMinutos > 0 &&
        (hasStagePeerComparison
          ? rec.tempoPermanenciaMinutos < Math.round(mediaEtapa * 0.8)
          : rec.isSaidaAntecipada ||
            rec.tempoPermanenciaMinutos < Math.round(mediaEtapa * 0.75));
      rec.isFinalizacaoAntecipada = Boolean(finishedBelowStageAvg);

      rec.riscoPreventivoEvasaoMotivos = [];
      rec.isRiscoPreventivoEvasao = false;

      // Se o convite NPS foi vinculado pelo Nível 3 (Responsável) e o responsável possui 2+ filhos na unidade, anotar o vínculo familiar
      if (
        rec.npsInvitation &&
        rec.npsInvitation.npsDestinatario === 'RESPONSAVEL'
      ) {
        const normResp = normalizeStudentName(rec.nomeResponsavel || '');
        const family = normResp
          ? studentsByNormResponsavel.get(normResp)
          : undefined;
        if (family && family.contratos.size > 1) {
          const siblingNames = Array.from(family.names);
          const siblingContracts = Array.from(family.contratos);
          rec.npsInvitation = enrichInvitationWithHierarchyContext(
            rec.npsInvitation,
            rec,
            rec.npsInvitation.nivelCruzamento || 'NOME_RESPONSAVEL',
            {
              isAmbiguous: true,
              studentNames: siblingNames,
              contratos: siblingContracts,
            }
          );
          rec.whatsappNpsUrl = '';
        }
      }
    }
  }

  return uniqueSchedules;
}

/**
 * Constrói a lista sincronizada de cards de alunos do NPS:
 * - Aplica a Nova Hierarquia de Cruzamento em Cascata de 4 Níveis:
 *   Nível 1 (Ouro): Contrato
 *   Nível 2 (Prata): Nome do Aluno
 *   Nível 3 (Bronze): Nome do Responsável (recuperando convites enviados aos pais/responsáveis)
 *   Nível 4 (Confirmação): E-mail
 * - Aplica o Tratamento de Casos Especiais de Irmãos Matriculados na Mesma Unidade (Seção 4):
 *   Quando um responsável possui 2+ filhos no ciclo da pesquisa, consolida em 1 único card familiar
 *   para evitar cobranças duplicadas ao mesmo responsável e nunca contabilizar uma única resposta como duas avaliações independentes.
 */
export function buildSynchronizedNpsStudentCards(
  activeNpsInvitations: ActiveNpsInvitation[],
  evaluatedStudentRecords: EvaluatedStudentRecord[],
  targetYear: number = getCurrentBrasiliaYear(),
  preferredWeekday?: string,
  currentTimeMinutes?: number
): SynchronizedNpsStudentCard[] {
  const annualInvitations = filterAndDeduplicateAnnualNpsInvitations(
    activeNpsInvitations,
    targetYear
  );

  // Indexar os agendamentos do Kanban de Alunos nos 4 níveis da hierarquia
  const schedulesByContrato = new Map<string, EvaluatedStudentRecord[]>();
  const schedulesByNormName = new Map<string, EvaluatedStudentRecord[]>();
  const schedulesByNormResponsavel = new Map<string, EvaluatedStudentRecord[]>();
  const schedulesByEmail = new Map<string, EvaluatedStudentRecord[]>();

  for (const rec of evaluatedStudentRecords) {
    const c = (rec.contrato || '').trim();
    if (c) {
      const list = schedulesByContrato.get(c) ?? [];
      list.push(rec);
      schedulesByContrato.set(c, list);
    }
    const norm = normalizeStudentName(rec.nomeCompleto);
    if (norm) {
      const list = schedulesByNormName.get(norm) ?? [];
      list.push(rec);
      schedulesByNormName.set(norm, list);
    }
    const normResp = normalizeStudentName(rec.nomeResponsavel || '');
    if (normResp && normResp !== norm) {
      const list = schedulesByNormResponsavel.get(normResp) ?? [];
      list.push(rec);
      schedulesByNormResponsavel.set(normResp, list);
    }
    const em = (rec.email || '').toLowerCase().trim();
    if (em) {
      const list = schedulesByEmail.get(em) ?? [];
      list.push(rec);
      schedulesByEmail.set(em, list);
    }
  }

  // Agrupar todas as pesquisas do ano pelo identificador canônico do aluno (ou núcleo familiar de irmãos no Nível 3)
  const historyByCanonicalStudent = new Map<
    string,
    {
      matchedSchedules: EvaluatedStudentRecord[];
      surveys: ActiveNpsInvitation[];
      siblingFamilyContext?: {
        isAmbiguous: boolean;
        studentNames: string[];
        contratos: string[];
      };
    }
  >();

  for (const inv of annualInvitations) {
    const invContrato = (inv.contrato || '').trim();
    const normInvName = normalizeStudentName(inv.studentName);
    const invEmail = (inv.email || '').toLowerCase().trim();

    // Cascata de 4 níveis:
    // Nível 1 (Ouro): Contrato
    const matchedByContrato = invContrato
      ? schedulesByContrato.get(invContrato)
      : undefined;
    // Nível 2 (Prata): Nome do Aluno
    const matchedByName =
      !matchedByContrato && normInvName
        ? schedulesByNormName.get(normInvName)
        : undefined;
    // Nível 3 (Bronze): Nome do Responsável
    const matchedByResponsavel =
      !matchedByContrato && !matchedByName && normInvName
        ? schedulesByNormResponsavel.get(normInvName)
        : undefined;
    // Nível 4 (Confirmação): E-mail
    const matchedByEmail =
      !matchedByContrato &&
      !matchedByName &&
      !matchedByResponsavel &&
      invEmail
        ? schedulesByEmail.get(invEmail)
        : undefined;

    const matchedSchedules =
      matchedByContrato ||
      matchedByName ||
      matchedByResponsavel ||
      matchedByEmail ||
      [];

    // Se o convite não possuir vínculo em nenhum dos 4 níveis no Kanban de Alunos, não entra no painel sincronizado
    if (matchedSchedules.length === 0) {
      continue;
    }

    const nivelCruzamento: NpsNivelCruzamentoType = matchedByContrato
      ? 'CONTRATO'
      : matchedByName
      ? 'NOME_ALUNO'
      : matchedByResponsavel
      ? 'NOME_RESPONSAVEL'
      : 'EMAIL';

    const distinctStudentNames = Array.from(
      new Set(matchedSchedules.map((s) => s.nomeCompleto))
    );
    const distinctContracts = Array.from(
      new Set(matchedSchedules.map((s) => s.contrato).filter(Boolean))
    );

    const isMultiSiblingFamily =
      nivelCruzamento === 'NOME_RESPONSAVEL' && distinctContracts.length > 1;

    const siblingFamilyContext =
      nivelCruzamento === 'NOME_RESPONSAVEL'
        ? {
            isAmbiguous: isMultiSiblingFamily,
            studentNames: distinctStudentNames,
            contratos: distinctContracts,
          }
        : undefined;

    const enrichedInv = enrichInvitationWithHierarchyContext(
      inv,
      matchedSchedules[0],
      nivelCruzamento,
      siblingFamilyContext
    );

    const canonicalKey = isMultiSiblingFamily
      ? `familia::${normInvName}`
      : matchedSchedules[0].contrato ||
        normalizeStudentName(matchedSchedules[0].nomeCompleto);

    const existing = historyByCanonicalStudent.get(canonicalKey);
    if (existing) {
      existing.surveys.push(enrichedInv);
      if (siblingFamilyContext?.isAmbiguous) {
        existing.siblingFamilyContext = siblingFamilyContext;
      }
    } else {
      historyByCanonicalStudent.set(canonicalKey, {
        matchedSchedules,
        surveys: [enrichedInv],
        siblingFamilyContext,
      });
    }
  }

  const synchronizedCards: SynchronizedNpsStudentCard[] = [];
  const activeHour =
    typeof currentTimeMinutes === 'number'
      ? Math.floor(currentTimeMinutes / 60)
      : null;

  for (const {
    matchedSchedules,
    surveys,
    siblingFamilyContext,
  } of historyByCanonicalStudent.values()) {
    // Exibir exclusivamente convites ativos e não respondidos, ordenados do mais recente para o mais antigo
    const chronologicalHistory = surveys
      .filter((inv) => isInvitationStrictlyActive(inv))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    if (chronologicalHistory.length === 0) {
      continue;
    }

    const latestActive = chronologicalHistory[0];

    // Selecionar o agendamento de referência do aluno no Kanban (priorizando o dia selecionado e o horário em andamento se houver)
    const sortedSchedules = [...matchedSchedules].sort((a, b) => {
      if (preferredWeekday && preferredWeekday !== 'TODOS') {
        const aMatchesDay = a.diaSemana === preferredWeekday ? 0 : 1;
        const bMatchesDay = b.diaSemana === preferredWeekday ? 0 : 1;
        if (aMatchesDay !== bMatchesDay) return aMatchesDay - bMatchesDay;
      }
      if (activeHour !== null) {
        const aHour = extractRecordStartHour(a, 'AGENDADO') ?? 8;
        const bHour = extractRecordStartHour(b, 'AGENDADO') ?? 8;
        const aMatchesActiveHour = aHour === activeHour ? 0 : 1;
        const bMatchesActiveHour = bHour === activeHour ? 0 : 1;
        if (aMatchesActiveHour !== bMatchesActiveHour) {
          return aMatchesActiveHour - bMatchesActiveHour;
        }
      }
      return a.scheduledStartMinutes - b.scheduledStartMinutes;
    });

    const primarySchedule = sortedSchedules[0];
    const linkedHourNumber =
      extractRecordStartHour(primarySchedule, 'AGENDADO') ?? 8;
    const linkedHourKey = `${String(linkedHourNumber).padStart(2, '0')}h`;
    const agendamentosHorarios = Array.from(
      new Set(
        sortedSchedules.map(
          (s) => `${s.diaSemana} · ${s.hourKey} (${s.scheduleStageLabel})`
        )
      )
    );

    const isFamilyAmbiguous = Boolean(
      siblingFamilyContext?.isAmbiguous &&
        siblingFamilyContext.studentNames.length > 1
    );
    const displayStudentName =
      isFamilyAmbiguous && siblingFamilyContext
        ? siblingFamilyContext.studentNames
            .map((n) => n.split(/\s+/).slice(0, 2).join(' '))
            .join(' & ')
        : primarySchedule.nomeCompleto;
    const displayContrato =
      isFamilyAmbiguous && siblingFamilyContext
        ? siblingFamilyContext.contratos.join(' / ')
        : primarySchedule.contrato;

    const updatedHistory = chronologicalHistory.map((item) => ({
      ...item,
      contrato: displayContrato,
      studentName: displayStudentName,
      totalStudentInvitations: chronologicalHistory.length,
    }));

    const isRespRecipient = latestActive.npsDestinatario === 'RESPONSAVEL';
    const resolvedPhone = isRespRecipient
      ? primarySchedule.telefoneResponsavel ||
        latestActive.phone ||
        primarySchedule.telefoneAluno ||
        ''
      : primarySchedule.telefoneAluno ||
        latestActive.phone ||
        primarySchedule.telefoneResponsavel ||
        '';

    const enrichedLatest: ActiveNpsInvitation = {
      ...latestActive,
      contrato: displayContrato,
      studentName: displayStudentName,
      phone: resolvedPhone,
      totalStudentInvitations: chronologicalHistory.length,
    };

    const whatsappNpsUrl = buildWhatsAppNpsUrl(
      displayStudentName,
      resolvedPhone,
      enrichedLatest.surveyUrl,
      enrichedLatest.pontoJornada,
      {
        npsDestinatario: enrichedLatest.npsDestinatario,
        respondenteNome:
          enrichedLatest.respondenteNome || primarySchedule.nomeResponsavel,
        alunosVinculadosFamilia: enrichedLatest.alunosVinculadosFamilia,
      }
    );

    synchronizedCards.push({
      ...enrichedLatest,
      latestActiveInvitation: enrichedLatest,
      studentSurveyHistory: updatedHistory,
      activeUnansweredCount: chronologicalHistory.length,
      totalHistoryCount: chronologicalHistory.length,
      matchedInKanban: true,
      linkedStudentId: primarySchedule.id,
      linkedContrato: displayContrato,
      linkedStudentName: displayStudentName,
      linkedResponsavelName: primarySchedule.nomeResponsavel,
      linkedTelefoneAluno: primarySchedule.telefoneAluno,
      linkedTelefoneResponsavel: primarySchedule.telefoneResponsavel,
      linkedHourKey,
      linkedHourNumber,
      linkedHorario: primarySchedule.horario,
      linkedDiaSemana: primarySchedule.diaSemana,
      linkedSala: primarySchedule.sala,
      linkedCurso: primarySchedule.moduloAtual || primarySchedule.curso,
      linkedModalidade: primarySchedule.modalidade,
      linkedAttendanceStatus: primarySchedule.attendanceStatus,
      linkedScheduleStage: primarySchedule.scheduleStage,
      linkedScheduleStageLabel: primarySchedule.scheduleStageLabel,
      agendamentosHorarios,
      whatsappNpsUrl,
    });
  }

  return synchronizedCards.sort((a, b) => {
    if (a.linkedHourNumber !== b.linkedHourNumber) {
      return a.linkedHourNumber - b.linkedHourNumber;
    }
    return a.linkedStudentName.localeCompare(b.linkedStudentName, 'pt-BR');
  });
}

/**
 * Seção 6.4: Identificação explícita de convites NPS não associados em nenhum dos 4 níveis da hierarquia
 * (ex.: alunos inativos, transferidos ou concluídos fora da grade semanal vigente), evitando perda silenciosa de dados.
 */
export function getUnassociatedNpsInvitations(
  activeNpsInvitations: ActiveNpsInvitation[],
  evaluatedStudentRecords: EvaluatedStudentRecord[],
  targetYear: number = getCurrentBrasiliaYear()
): ActiveNpsInvitation[] {
  const annualInvitations = filterAndDeduplicateAnnualNpsInvitations(
    activeNpsInvitations,
    targetYear
  );

  const contracts = new Set<string>();
  const normNames = new Set<string>();
  const normResponsaveis = new Set<string>();
  const emails = new Set<string>();

  for (const rec of evaluatedStudentRecords) {
    const c = (rec.contrato || '').trim();
    if (c) contracts.add(c);
    const nm = normalizeStudentName(rec.nomeCompleto);
    if (nm) normNames.add(nm);
    const nr = normalizeStudentName(rec.nomeResponsavel || '');
    if (nr) normResponsaveis.add(nr);
    const em = (rec.email || '').toLowerCase().trim();
    if (em) emails.add(em);
  }

  return annualInvitations
    .filter((inv) => {
      if (!isInvitationStrictlyActive(inv)) return false;
      const c = (inv.contrato || '').trim();
      const nm = normalizeStudentName(inv.studentName);
      const em = (inv.email || '').toLowerCase().trim();
      const matched =
        (c && contracts.has(c)) ||
        (nm && normNames.has(nm)) ||
        (nm && normResponsaveis.has(nm)) ||
        (em && emails.has(em));
      return !matched;
    })
    .map((inv) => ({
      ...inv,
      nivelCruzamento: 'NAO_ASSOCIADO' as NpsNivelCruzamentoType,
    }));
}

export function getDeduplicatedActiveNpsList(
  activeNpsInvitations: ActiveNpsInvitation[],
  evaluatedRecords: EvaluatedStudentRecord[]
): EnrichedActiveNpsEntry[] {
  const synchronizedCards = buildSynchronizedNpsStudentCards(
    activeNpsInvitations,
    evaluatedRecords
  );

  return synchronizedCards.map((card) => ({
    invitation: card.latestActiveInvitation,
    matchedInKanban: true,
    contrato: card.linkedContrato,
    studentName: card.linkedStudentName,
    sala: card.linkedSala,
    modalidade: card.linkedModalidade,
    cursos: [card.linkedCurso],
    agendamentosCount: card.agendamentosHorarios.length,
    agendamentosHorarios: card.agendamentosHorarios,
    firstStudentRecordId: card.linkedStudentId,
    whatsappNpsUrl: card.whatsappNpsUrl,
    studentSurveyHistory: card.studentSurveyHistory,
  }));
}

export function filterAndSortRecords(
  records: StudentPerformanceRecord[],
  criteria: Partial<FilterCriteria> & {
    search: string;
    status: 'TODOS' | ClassStatus;
    modalidade: 'TODAS' | ModalityType;
    turno: 'TODOS' | ShiftType;
    curso: string;
    horario: string;
    notaFilter: 'TODOS' | 'COM_NOTA' | 'SEM_NOTA' | 'NOTA_ALTA' | 'ATENCAO';
    apenasInadimplentes: boolean;
    sortBy: 'id' | 'nomeCompleto' | 'curso' | 'horario' | 'nota' | 'status';
    sortDir: 'asc' | 'desc';
  },
  currentTimeMinutes: number = getBrasiliaCurrentMinutes(),
  manualAttendanceOverrides: Record<number, AttendanceStatus> = {},
  activeNpsInvitations: ActiveNpsInvitation[] = INITIAL_ACTIVE_NPS_INVITATIONS,
  referenceWeekday?: string
): EvaluatedStudentRecord[] {
  const evaluated = isAlreadyEvaluatedRecords(records, manualAttendanceOverrides)
    ? records
    : evaluateAllStudentsAttendance(
        records,
        currentTimeMinutes,
        manualAttendanceOverrides,
        activeNpsInvitations,
        referenceWeekday
      );
  const q = criteria.search.trim().toLowerCase();
  const attendanceFilter = criteria.attendanceFilter ?? 'TODOS';
  const professorFilter = criteria.professor ?? 'TODOS';
  const salaFilter = criteria.sala ?? 'TODAS';
  const diaFilter = criteria.diaSemana ?? 'TODOS';
  const apostilaFilter = criteria.apostilaFilter ?? 'TODAS';
  const npsFilter = criteria.npsFilter ?? 'TODOS';
  const financialFilter = criteria.financialFilter ?? 'TODOS';
  const courseCategoryFilter = criteria.courseCategoryFilter ?? 'TODOS';
  const finalizacaoAntecipadaFilter = criteria.finalizacaoAntecipada ?? false;

  const filtered = evaluated.filter((rec) => {
    if (finalizacaoAntecipadaFilter && !rec.isFinalizacaoAntecipada) {
      return false;
    }
    if (professorFilter !== 'TODOS' && rec.professor !== professorFilter) {
      return false;
    }
    if (
      salaFilter !== 'TODAS' &&
      salaFilter !== 'TODOS' &&
      rec.sala !== salaFilter
    ) {
      return false;
    }
    if (
      diaFilter !== 'TODOS' &&
      diaFilter !== 'TODAS' &&
      rec.diaSemana !== diaFilter
    ) {
      return false;
    }
    if (apostilaFilter === 'COM_APOSTILA' && !rec.possuiApostila) {
      return false;
    }
    if (apostilaFilter === 'SEM_APOSTILA' && rec.possuiApostila) {
      return false;
    }
    if (npsFilter === 'COM_NPS' && !rec.hasActiveNps) {
      return false;
    }
    if (npsFilter === 'SEM_NPS' && rec.hasActiveNps) {
      return false;
    }
    if (financialFilter === 'EM_DIA' && rec.inadimplente) {
      return false;
    }
    if (financialFilter === 'EM_ATRASO' && !rec.inadimplente) {
      return false;
    }
    if (
      courseCategoryFilter !== 'TODOS' &&
      rec.categoriaCurso !== courseCategoryFilter
    ) {
      return false;
    }
    if (criteria.status !== 'TODOS' && rec.status !== criteria.status) {
      return false;
    }
    if (attendanceFilter === 'EVASAO') {
      if (!rec.isEvasao) return false;
    } else if (attendanceFilter === 'FALTA_PENDENTE') {
      if (!rec.isPendingNextDayAbsence) return false;
    } else if (isNotStartedAttendanceStatus(attendanceFilter)) {
      if (!isNotStartedAttendanceStatus(rec.attendanceStatus)) return false;
    } else if (
      attendanceFilter !== 'TODOS' &&
      rec.attendanceStatus !== attendanceFilter
    ) {
      return false;
    }
    if (
      criteria.modalidade &&
      criteria.modalidade !== 'TODAS' &&
      rec.modalidade !== criteria.modalidade
    ) {
      return false;
    }
    if (criteria.turno !== 'TODOS' && rec.turno !== criteria.turno) {
      return false;
    }
    if (
      criteria.curso &&
      criteria.curso !== 'TODOS' &&
      rec.curso !== criteria.curso
    ) {
      return false;
    }
    if (
      criteria.horario &&
      criteria.horario !== 'TODOS' &&
      rec.horario !== criteria.horario &&
      rec.hourKey !== criteria.horario
    ) {
      return false;
    }
    if (criteria.apenasInadimplentes && !rec.inadimplente) {
      return false;
    }

    if (criteria.notaFilter === 'COM_NOTA' && rec.nota === null) return false;
    if (criteria.notaFilter === 'SEM_NOTA' && rec.nota !== null) return false;
    if (
      criteria.notaFilter === 'NOTA_ALTA' &&
      (rec.nota === null || rec.nota < 9)
    )
      return false;
    if (
      criteria.notaFilter === 'ATENCAO' &&
      (rec.nota === null || rec.nota >= 7.5)
    )
      return false;

    if (q) {
      const haystack = [
        rec.contrato,
        rec.nomeCompleto,
        rec.nomeCurto,
        rec.curso,
        rec.moduloAtual,
        rec.aulaAtualLabel,
        rec.formacao,
        rec.horario,
        rec.hourKey,
        rec.diaSemana,
        rec.professor,
        rec.sala,
        rec.modalidade,
        rec.nomeResponsavel,
        rec.telefoneAluno,
        rec.infoAula,
        rec.attendanceStatus,
        rec.scheduleStageLabel,
        rec.isEvasao ? 'evasao evasão' : '',
        rec.hasActiveNps ? 'nps ativo convite nps' : '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  const dir = criteria.sortDir === 'asc' ? 1 : -1;

  return [...filtered].sort((a, b) => {
    switch (criteria.sortBy) {
      case 'nomeCompleto':
        return a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR') * dir;
      case 'curso':
        return a.curso.localeCompare(b.curso, 'pt-BR') * dir;
      case 'horario':
        return a.horaInicio.localeCompare(b.horaInicio, 'pt-BR') * dir;
      case 'status':
        return a.attendanceStatus.localeCompare(b.attendanceStatus, 'pt-BR') * dir;
      case 'nota': {
        const na = a.nota ?? -1;
        const nb = b.nota ?? -1;
        return (na - nb) * dir;
      }
      case 'id':
      default:
        return (a.id - b.id) * dir;
    }
  });
}

export function computePerformanceKPIs(
  records: StudentPerformanceRecord[],
  currentTimeMinutes: number = getBrasiliaCurrentMinutes(),
  manualAttendanceOverrides: Record<number, AttendanceStatus> = {},
  activeNpsInvitations: ActiveNpsInvitation[] = INITIAL_ACTIVE_NPS_INVITATIONS,
  referenceWeekday?: string
): PerformanceKPIs {
  const evaluated = isAlreadyEvaluatedRecords(records, manualAttendanceOverrides)
    ? records
    : evaluateAllStudentsAttendance(
        records,
        currentTimeMinutes,
        manualAttendanceOverrides,
        activeNpsInvitations,
        referenceWeekday
      );

  const totalAgendamentos = evaluated.length;
  const total = totalAgendamentos;

  const uniqueContracts = new Set<string>();
  const evasaoContracts = new Set<string>();
  const activeNpsContracts = new Set<string>();

  for (const r of evaluated) {
    uniqueContracts.add(r.contrato);
    if (r.isEvasao) {
      evasaoContracts.add(r.contrato);
    }
    if (r.hasActiveNps) {
      activeNpsContracts.add(r.contrato);
    }
  }

  const totalAlunosUnicos = uniqueContracts.size;
  const evasaoCount = evasaoContracts.size;
  const npsAtivosCount = activeNpsContracts.size;

  const iniciados = evaluated.filter((r) => r.status === 'INICIADO').length;
  const naoIniciados = evaluated.filter((r) => r.status === 'NÃO INICIADO').length;
  const finalizados = evaluated.filter((r) => r.status === 'FINALIZADO').length;

  const presencaCount = evaluated.filter((r) => r.attendanceStatus === 'Presença').length;
  const faltaCount = evaluated.filter((r) => r.attendanceStatus === 'Falta').length;
  const aguardandoCount = evaluated.filter((r) =>
    isNotStartedAttendanceStatus(r.attendanceStatus)
  ).length;
  const faltasPendentesDiaSeguinteCount = evaluated.filter(
    (r) => r.isPendingNextDayAbsence
  ).length;
  const emToleranciaCount = evaluated.filter((r) => r.isWithinTolerance).length;
  const horariosFuturosCount = evaluated.filter(
    (r) => r.scheduleStage === 'HORARIO_FUTURO'
  ).length;

  // Frequência = (Presenças / (Presenças + Faltas)) * 100
  const baseFrequencia = presencaCount + faltaCount;
  const hasFrequencyDataFlag = baseFrequencia > 0;
  const frequenciaPercent = hasFrequencyDataFlag
    ? Number(((presencaCount / baseFrequencia) * 100).toFixed(1))
    : null;
  const mediaFrequencia = frequenciaPercent ?? 0;

  const inadimplentes = evaluated.filter((r) => r.inadimplente).length;
  const presencialCount = evaluated.filter((r) => r.modalidade === 'Presencial').length;
  const onlineCount = evaluated.filter((r) => r.modalidade === 'Online').length;

  const graded = evaluated.filter(
    (r): r is EvaluatedStudentRecord & { nota: number } => r.nota !== null
  );
  const comNotaCount = graded.length;
  const semNotaCount = totalAgendamentos - comNotaCount;

  // Cálculo da média que respeita estritamente a etapa atual do aluno (sem contaminar com avaliações de módulo anterior)
  const gradedEtapaAtual = graded.filter((r) => !r.isNotaModuloAnterior);
  const gradedEfetivo = gradedEtapaAtual.length > 0 ? gradedEtapaAtual : graded;
  const sumNotas = gradedEfetivo.reduce((acc, r) => acc + r.nota, 0);
  const mediaGeralNotas =
    gradedEfetivo.length > 0 ? Number((sumNotas / gradedEfetivo.length).toFixed(2)) : 0;

  const notaMaxima = gradedEfetivo.length > 0 ? Math.max(...gradedEfetivo.map((r) => r.nota)) : 0;
  const notaMinima = gradedEfetivo.length > 0 ? Math.min(...gradedEfetivo.map((r) => r.nota)) : 0;
  const alunosNota10 = gradedEfetivo.filter((r) => r.nota === 10).length;
  const alunosAbaixo7 = gradedEfetivo.filter((r) => r.nota < 7).length;

  const taxaConclusao =
    totalAgendamentos > 0
      ? Number(((finalizados / totalAgendamentos) * 100).toFixed(1))
      : 0;
  const taxaPresencaAtiva =
    totalAgendamentos > 0
      ? Number(((presencaCount / totalAgendamentos) * 100).toFixed(1))
      : 0;

  return {
    total,
    totalAgendamentos,
    totalAlunosUnicos,
    evasaoCount,
    npsAtivosCount,
    iniciados,
    naoIniciados,
    finalizados,
    presencaCount,
    faltaCount,
    aguardandoCount,
    faltasPendentesDiaSeguinteCount,
    emToleranciaCount,
    horariosFuturosCount,
    mediaFrequencia,
    frequenciaPercent,
    hasFrequencyData: hasFrequencyDataFlag,
    inadimplentes,
    presencialCount,
    onlineCount,
    comNotaCount,
    semNotaCount,
    mediaGeralNotas,
    taxaConclusao,
    taxaPresencaAtiva,
    notaMaxima,
    notaMinima,
    alunosNota10,
    alunosAbaixo7,
  };
}

export function groupByCourse(records: StudentPerformanceRecord[]): CourseSummary[] {
  const map = new Map<string, StudentPerformanceRecord[]>();
  for (const r of records) {
    const list = map.get(r.curso) ?? [];
    list.push(r);
    map.set(r.curso, list);
  }

  const summaries: CourseSummary[] = [];
  for (const [curso, list] of map.entries()) {
    const totalAlunos = list.length;
    const finalizados = list.filter((r) => r.status === 'FINALIZADO').length;
    const iniciados = list.filter((r) => r.status === 'INICIADO').length;
    const naoIniciados = list.filter((r) => r.status === 'NÃO INICIADO').length;
    const gradedEtapa = list.filter(
      (r): r is StudentPerformanceRecord & { nota: number } =>
        r.nota !== null && !('isNotaModuloAnterior' in r && (r as any).isNotaModuloAnterior)
    );
    const effectiveGraded = gradedEtapa.length > 0 ? gradedEtapa : list.filter(
      (r): r is StudentPerformanceRecord & { nota: number } => r.nota !== null
    );
    const mediaNota =
      effectiveGraded.length > 0
        ? Number(
            (effectiveGraded.reduce((a, b) => a + b.nota, 0) / effectiveGraded.length).toFixed(2)
          )
        : null;
    summaries.push({
      curso,
      formacao: list[0]?.formacao || 'CAPACITAÇÃO - DINÂMICA',
      totalAlunos,
      finalizados,
      iniciados,
      naoIniciados,
      mediaNota,
      avaliadosCount: effectiveGraded.length,
      taxaConclusao:
        totalAlunos > 0
          ? Number(((finalizados / totalAlunos) * 100).toFixed(1))
          : 0,
    });
  }

  return summaries.sort(
    (a, b) =>
      b.totalAlunos - a.totalAlunos || a.curso.localeCompare(b.curso, 'pt-BR')
  );
}

export function groupBySchedule(
  records: StudentPerformanceRecord[]
): ScheduleSummary[] {
  const map = new Map<string, StudentPerformanceRecord[]>();
  for (const r of records) {
    const key = r.horario || 'Sem horário';
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }

  const summaries: ScheduleSummary[] = [];
  for (const [horario, list] of map.entries()) {
    const graded = list.filter(
      (r): r is StudentPerformanceRecord & { nota: number } => r.nota !== null
    );
    const mediaNota =
      graded.length > 0
        ? Number(
            (graded.reduce((a, b) => a + b.nota, 0) / graded.length).toFixed(2)
          )
        : null;
    summaries.push({
      horario,
      turno: list[0]?.turno || 'Manhã',
      total: list.length,
      finalizados: list.filter((r) => r.status === 'FINALIZADO').length,
      iniciados: list.filter((r) => r.status === 'INICIADO').length,
      naoIniciados: list.filter((r) => r.status === 'NÃO INICIADO').length,
      presencial: list.filter((r) => r.modalidade === 'Presencial').length,
      online: list.filter((r) => r.modalidade === 'Online').length,
      mediaNota,
    });
  }

  return summaries.sort((a, b) => a.horario.localeCompare(b.horario, 'pt-BR'));
}

export function resolveColumnHourState(
  hourNumber: number,
  currentTimeMinutes: number,
  dayRelation: DayRelation = 'CURRENT_DAY'
): {
  isCurrentHour: boolean;
  isPastHour: boolean;
  isFutureHour: boolean;
  columnStageLabel: string;
} {
  if (dayRelation === 'PAST_DAY') {
    return {
      isCurrentHour: false,
      isPastHour: true,
      isFutureHour: false,
      columnStageLabel: 'Horário Concluído',
    };
  }
  if (dayRelation === 'FUTURE_DAY') {
    return {
      isCurrentHour: false,
      isPastHour: false,
      isFutureHour: true,
      columnStageLabel: 'Horário Futuro',
    };
  }

  const currentHour = Math.floor(currentTimeMinutes / 60);
  const isCurrentHour = hourNumber === currentHour;
  const isPastHour = hourNumber < currentHour;
  const isFutureHour = hourNumber > currentHour;
  const columnStageLabel = isCurrentHour
    ? 'Horário em Andamento'
    : isPastHour
    ? 'Horário Concluído'
    : 'Horário Futuro';

  return {
    isCurrentHour,
    isPastHour,
    isFutureHour,
    columnStageLabel,
  };
}

export function groupByHourKanban(
  records: StudentPerformanceRecord[],
  mode: KanbanHourMode = 'AGENDADO',
  currentTimeMinutes: number = getBrasiliaCurrentMinutes(),
  manualAttendanceOverrides: Record<number, AttendanceStatus> = {},
  activeNpsInvitations: ActiveNpsInvitation[] = INITIAL_ACTIVE_NPS_INVITATIONS,
  referenceWeekday?: string
): HourKanbanColumn[] {
  const evaluatedRecords = isAlreadyEvaluatedRecords(
    records,
    manualAttendanceOverrides
  )
    ? records
    : evaluateAllStudentsAttendance(
        records,
        currentTimeMinutes,
        manualAttendanceOverrides,
        activeNpsInvitations,
        referenceWeekday
      );

  const map = new Map<number, EvaluatedStudentRecord[]>();

  for (const r of evaluatedRecords) {
    const h = extractRecordStartHour(r, mode);
    if (h === null) continue;
    const list = map.get(h) ?? [];
    list.push(r);
    map.set(h, list);
  }

  const attendancePriority: Record<AttendanceStatus, number> = {
    Presença: 0,
    'Não iniciada': 1,
    'Não iniciado': 1,
    Falta: 2,
  };

  const columns: HourKanbanColumn[] = [];
  for (const [hourNumber, list] of map.entries()) {
    const padded = String(hourNumber).padStart(2, '0');
    const hourKey = `${padded}h`;
    const turno: ShiftType =
      hourNumber < 12 ? 'Manhã' : hourNumber < 18 ? 'Tarde' : 'Noite';

    const sortedStudents = [...list].sort((a, b) => {
      const ap =
        attendancePriority[a.attendanceStatus] -
        attendancePriority[b.attendanceStatus];
      if (ap !== 0) return ap;
      return a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR');
    });

    const graded = list.filter(
      (r): r is EvaluatedStudentRecord & { nota: number } => r.nota !== null
    );
    const mediaNota =
      graded.length > 0
        ? Number(
            (graded.reduce((acc, r) => acc + r.nota, 0) / graded.length).toFixed(
              2
            )
          )
        : null;

    const schedulesIncluded = Array.from(
      new Set(list.map((r) => r.horario))
    ).sort();

    // Determinar o relacionamento de dia predominante na coluna
    const hasCurrentDay = list.some((r) => r.dayRelation === 'CURRENT_DAY');
    const allPastDay = list.every((r) => r.dayRelation === 'PAST_DAY');
    const allFutureDay = list.every((r) => r.dayRelation === 'FUTURE_DAY');
    const colDayRelation: DayRelation = hasCurrentDay
      ? 'CURRENT_DAY'
      : allPastDay
      ? 'PAST_DAY'
      : allFutureDay
      ? 'FUTURE_DAY'
      : 'CURRENT_DAY';

    const { isCurrentHour, isPastHour, isFutureHour, columnStageLabel } =
      resolveColumnHourState(hourNumber, currentTimeMinutes, colDayRelation);

    const presencaCount = list.filter(
      (r) => r.attendanceStatus === 'Presença'
    ).length;
    const faltaCount = list.filter((r) => r.attendanceStatus === 'Falta').length;
    const naoIniciadoCount = list.filter((r) =>
      isNotStartedAttendanceStatus(r.attendanceStatus)
    ).length;
    const pendentesProcessamentoCount = list.filter(
      (r) => r.isPendingNextDayAbsence
    ).length;
    const emToleranciaCount = list.filter((r) => r.isWithinTolerance).length;

    const baseFreq = presencaCount + faltaCount;
    const hasFrequencyDataFlag = baseFreq > 0;
    const mediaFrequencia = hasFrequencyDataFlag
      ? Number(((presencaCount / baseFreq) * 100).toFixed(1))
      : 0;

    const uniqueColContracts = new Set(list.map((r) => r.contrato));
    const evasaoColContracts = new Set(
      list.filter((r) => r.isEvasao).map((r) => r.contrato)
    );
    const npsAtivosCount = list.filter((r) => r.hasActiveNps).length;

    columns.push({
      hourKey,
      hourNumber,
      label: `${padded}h · Início às ${padded}:00`,
      toleranceLabel: `Tolerância: ${padded}:00 às ${padded}:15`,
      turno,
      isCurrentHour,
      isPastHour,
      isFutureHour,
      columnStageLabel,
      students: sortedStudents,
      total: list.length,
      totalAgendamentos: list.length,
      totalAlunosUnicos: uniqueColContracts.size,
      evasaoCount: evasaoColContracts.size,
      npsAtivosCount,
      presencaCount,
      faltaCount,
      naoIniciadoCount,
      pendentesProcessamentoCount,
      emToleranciaCount,
      mediaFrequencia,
      hasFrequencyData: hasFrequencyDataFlag,
      finalizados: list.filter((r) => r.status === 'FINALIZADO').length,
      iniciados: list.filter((r) => r.status === 'INICIADO').length,
      naoIniciados: list.filter((r) => r.status === 'NÃO INICIADO').length,
      presencial: list.filter((r) => r.modalidade === 'Presencial').length,
      online: list.filter((r) => r.modalidade === 'Online').length,
      mediaNota,
      schedulesIncluded,
    });
  }

  // Ordenação cronológica natural (08h -> 09h -> 10h ... -> 20h) para que horários da tarde nunca interfiram nos horários da manhã
  return columns.sort((a, b) => a.hourNumber - b.hourNumber);
}

export interface NpsSummaryKPIs {
  totalConvites: number;
  totalConvitesAtivos: number;
  portalDoAlunoCount: number;
  emailCount: number;
  emailEnviadoCount: number;
  emailEntregueCount: number;
  emailAbertoCount: number;
  emailNaoEntregueCount: number;
  multiplasPesquisasCount: number;
  jornada30Count: number;
  jornada50Count: number;
  destinatarioAlunoCount: number;
  destinatarioResponsavelCount: number;
  familiasIrmaosCount: number;
  totalAgendamentosVinculados: number;
}

export function computeNpsSummaryKPIs(
  items: Array<SynchronizedNpsStudentCard | ActiveNpsInvitation | EvaluatedStudentRecord>
): NpsSummaryKPIs {
  const activeItems = items.filter((item) => {
    if ('latestActiveInvitation' in item) {
      return isInvitationStrictlyActive(item.latestActiveInvitation);
    }
    if ('controlId' in item && 'createdAt' in item) {
      return isInvitationStrictlyActive(item as ActiveNpsInvitation);
    }
    if ('npsInvitation' in item && item.npsInvitation) {
      return isInvitationStrictlyActive(item.npsInvitation);
    }
    return false;
  });

  const totalConvites = activeItems.length;

  const getInv = (
    item: SynchronizedNpsStudentCard | ActiveNpsInvitation | EvaluatedStudentRecord
  ): ActiveNpsInvitation | null => {
    if ('latestActiveInvitation' in item) return item.latestActiveInvitation;
    if ('controlId' in item && 'createdAt' in item) return item as ActiveNpsInvitation;
    if ('npsInvitation' in item) return item.npsInvitation;
    return null;
  };

  const invitations = activeItems
    .map(getInv)
    .filter((i): i is ActiveNpsInvitation => i !== null);

  const portalDoAlunoCount = invitations.filter(
    (inv) => inv.origem === 'Portal do Aluno'
  ).length;
  const emailInvitations = invitations.filter((inv) => inv.origem === 'E-mail');
  const emailCount = emailInvitations.length;

  let emailEnviadoCount = 0;
  let emailEntregueCount = 0;
  let emailAbertoCount = 0;
  let emailNaoEntregueCount = 0;

  for (const inv of emailInvitations) {
    const { emailDeliveryStatus } = resolveRealNpsDeliveryTracking(inv);
    if (emailDeliveryStatus === 'Aberto') emailAbertoCount++;
    else if (emailDeliveryStatus === 'Entregue') emailEntregueCount++;
    else if (emailDeliveryStatus === 'Não entregue') emailNaoEntregueCount++;
    else emailEnviadoCount++;
  }

  const multiplasPesquisasCount = activeItems.filter((item) => {
    if ('totalHistoryCount' in item) return item.totalHistoryCount > 1;
    const inv = getInv(item);
    return (inv?.totalStudentInvitations ?? 1) > 1;
  }).length;

  const jornada30Count = invitations.filter((inv) =>
    (inv.pontoJornada || '').toLowerCase().includes('30')
  ).length;
  const jornada50Count = invitations.filter((inv) => {
    const p = (inv.pontoJornada || '').toLowerCase();
    return p.includes('50') || p.includes('70') || (!p.includes('30') && p.length > 0);
  }).length;

  const destinatarioResponsavelCount = invitations.filter(
    (inv) => inv.npsDestinatario === 'RESPONSAVEL'
  ).length;
  const destinatarioAlunoCount = invitations.length - destinatarioResponsavelCount;
  const familiasIrmaosCount = invitations.filter(
    (inv) => inv.isVinculoFamiliarAmbiguo
  ).length;

  return {
    totalConvites,
    totalConvitesAtivos: totalConvites,
    portalDoAlunoCount,
    emailCount,
    emailEnviadoCount,
    emailEntregueCount,
    emailAbertoCount,
    emailNaoEntregueCount,
    multiplasPesquisasCount,
    jornada30Count,
    jornada50Count,
    destinatarioAlunoCount,
    destinatarioResponsavelCount,
    familiasIrmaosCount,
    totalAgendamentosVinculados: totalConvites,
  };
}

export interface NpsFilterCriteria {
  search: string;
  origem: 'TODAS' | NpsOrigemType;
  pontoJornada: string;
  horario: string;
  diaSemana?: string;
  sala?: string;
  statusConvite?: 'TODOS' | NpsInvitationStatusType;
  deliveryStatus?: NpsDeliveryFilterType;
  emailDeliveryStatus?: NpsDeliveryFilterType;
  destinatarioFilter?: 'TODOS' | NpsDestinatarioType;
}

export const ALL_NPS_CYCLES = [
  'Novo contrato',
  '30 dias',
  '50 dias',
  '70 dias',
  'Concluído',
] as const;

function matchesNpsCycleFilter(pontoJornadaRaw: string | undefined, pontoFilter: string): boolean {
  if (!pontoFilter || pontoFilter === 'TODOS' || pontoFilter === 'TODAS') {
    return true;
  }
  const p = (pontoJornadaRaw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const f = pontoFilter
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (f === '50+ dias') {
    return p.includes('50') || p.includes('70') || p.includes('conclu');
  }
  if (f.includes('novo')) {
    return p.includes('novo') || p.includes('boas') || p.includes('0') || p.includes('inicio');
  }
  if (f.includes('conclu')) {
    return p.includes('conclu') || p.includes('final') || p.includes('formatura');
  }
  const target = f.replace(' dias', '').trim();
  return p.includes(target);
}

/**
 * Filtra os cards sincronizados de alunos elegíveis no NPS:
 * - Exclusivamente convites ativos e não respondidos
 * - Exclusivamente alunos com vínculo válido no Kanban de Alunos
 * - 1 card por aluno exibindo apenas a pesquisa mais recente ainda não respondida
 */
export function filterSynchronizedNpsCards(
  cards: SynchronizedNpsStudentCard[],
  criteria: NpsFilterCriteria
): SynchronizedNpsStudentCard[] {
  const q = (criteria.search || '').trim().toLowerCase();
  const origemFilter = criteria.origem || 'TODAS';
  const pontoFilter = criteria.pontoJornada || 'TODOS';
  const horarioFilter = criteria.horario || 'TODOS';
  const diaFilter = criteria.diaSemana || 'TODOS';
  const salaFilter = criteria.sala || 'TODAS';
  const deliveryFilter =
    criteria.emailDeliveryStatus || criteria.deliveryStatus || 'TODOS';
  const destinatarioFilter = criteria.destinatarioFilter || 'TODOS';

  return cards.filter((card) => {
    if (!isInvitationStrictlyActive(card.latestActiveInvitation)) {
      return false;
    }
    if (origemFilter !== 'TODAS' && card.origem !== origemFilter) {
      return false;
    }
    if (destinatarioFilter !== 'TODOS') {
      const cardDest = card.npsDestinatario || 'ALUNO';
      if (cardDest !== destinatarioFilter) {
        return false;
      }
    }
    if (deliveryFilter !== 'TODOS') {
      const { emailDeliveryStatus } = resolveRealNpsDeliveryTracking(
        card.latestActiveInvitation
      );
      if (emailDeliveryStatus !== deliveryFilter) {
        return false;
      }
    }
    if (diaFilter !== 'TODOS' && diaFilter !== 'TODAS') {
      const matchesLinkedDay = card.linkedDiaSemana === diaFilter;
      const matchesAnySchedule = (card.agendamentosHorarios || []).some((ah) =>
        ah.includes(diaFilter)
      );
      if (!matchesLinkedDay && !matchesAnySchedule) {
        return false;
      }
    }
    if (
      salaFilter !== 'TODAS' &&
      salaFilter !== 'TODOS' &&
      card.linkedSala !== salaFilter
    ) {
      return false;
    }
    if (!matchesNpsCycleFilter(card.pontoJornada, pontoFilter)) {
      return false;
    }
    if (
      horarioFilter !== 'TODOS' &&
      horarioFilter !== 'TODAS' &&
      card.linkedHourKey !== horarioFilter &&
      card.linkedHorario !== horarioFilter
    ) {
      return false;
    }
    if (q) {
      const haystack = [
        card.linkedStudentName,
        card.linkedContrato,
        card.linkedResponsavelName || '',
        card.respondenteNome || '',
        card.respondenteVinculoLabel || '',
        ...(card.alunosVinculadosFamilia || []),
        card.linkedSala,
        card.linkedCurso,
        card.linkedHorario,
        card.linkedHourKey,
        card.linkedDiaSemana,
        card.linkedAttendanceStatus,
        card.linkedScheduleStageLabel,
        card.controlId,
        card.id,
        card.email,
        card.phone,
        card.origem,
        card.pontoJornada,
        card.actionName,
        formatBrasiliaDateTime(card.createdAt),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function filterNpsInvitations(
  invitations: ActiveNpsInvitation[],
  criteria: NpsFilterCriteria,
  targetYear: number = getCurrentBrasiliaYear(),
  evaluatedStudentRecords?: EvaluatedStudentRecord[]
): ActiveNpsInvitation[] {
  if (evaluatedStudentRecords && evaluatedStudentRecords.length > 0) {
    const synced = buildSynchronizedNpsStudentCards(
      invitations,
      evaluatedStudentRecords,
      targetYear,
      criteria.diaSemana
    );
    return filterSynchronizedNpsCards(synced, criteria);
  }

  const annualDeduplicated = filterAndDeduplicateAnnualNpsInvitations(
    invitations,
    targetYear
  );

  // Regra 5: Exibir exclusivamente convites ativos e não respondidos
  const activeOnly = annualDeduplicated.filter((inv) =>
    isInvitationStrictlyActive(inv)
  );

  // Regra 6: Apenas a pesquisa mais recente não respondida por aluno
  const latestPerStudent = new Map<string, ActiveNpsInvitation>();
  for (const inv of activeOnly) {
    const key =
      (inv.contrato || '').trim() ||
      normalizeStudentName(inv.studentName) ||
      inv.id;
    if (!latestPerStudent.has(key)) {
      latestPerStudent.set(key, inv);
    }
  }

  const q = (criteria.search || '').trim().toLowerCase();
  const origemFilter = criteria.origem || 'TODAS';
  const pontoFilter = criteria.pontoJornada || 'TODOS';
  const horarioFilter = criteria.horario || 'TODOS';

  return Array.from(latestPerStudent.values()).filter((inv) => {
    if (origemFilter !== 'TODAS' && inv.origem !== origemFilter) {
      return false;
    }
    if (!matchesNpsCycleFilter(inv.pontoJornada, pontoFilter)) {
      return false;
    }
    if (horarioFilter !== 'TODOS' && horarioFilter !== 'TODAS') {
      const h = extractInvitationCreationHourBrasilia(inv.createdAt);
      const hKey = `${String(h).padStart(2, '0')}h`;
      if (hKey !== horarioFilter) return false;
    }
    if (q) {
      const haystack = [
        inv.studentName,
        inv.contrato,
        inv.codigoPessoa,
        inv.controlId,
        inv.id,
        inv.email,
        inv.phone,
        inv.origem,
        inv.pontoJornada,
        inv.actionName,
        formatBrasiliaDateTime(inv.createdAt),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function filterNpsRecords(
  records: EvaluatedStudentRecord[],
  criteria: NpsFilterCriteria
): EvaluatedStudentRecord[] {
  const npsOnly = records.filter(
    (r) =>
      r.hasActiveNps &&
      r.npsInvitation !== null &&
      isInvitationStrictlyActive(r.npsInvitation)
  );
  const q = (criteria.search || '').trim().toLowerCase();
  const origemFilter = criteria.origem || 'TODAS';
  const pontoFilter = criteria.pontoJornada || 'TODOS';
  const horarioFilter = criteria.horario || 'TODOS';
  const diaFilter = criteria.diaSemana || 'TODOS';

  return npsOnly.filter((r) => {
    if (origemFilter !== 'TODAS' && r.npsOrigemFormatada !== origemFilter) {
      return false;
    }
    if (!matchesNpsCycleFilter(r.npsInvitation?.pontoJornada, pontoFilter)) {
      return false;
    }
    if (
      horarioFilter !== 'TODOS' &&
      horarioFilter !== 'TODAS' &&
      r.horario !== horarioFilter &&
      r.hourKey !== horarioFilter
    ) {
      return false;
    }
    if (
      diaFilter !== 'TODOS' &&
      diaFilter !== 'TODAS' &&
      r.diaSemana !== diaFilter
    ) {
      return false;
    }
    if (q) {
      const haystack = [
        r.contrato,
        r.nomeCompleto,
        r.npsOrigemFormatada || '',
        r.npsInvitation?.pontoJornada || '',
        r.npsInvitation?.controlId || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export interface NpsHourKanbanColumn {
  hourKey: string;
  hourNumber: number;
  label: string;
  turno: ShiftType;
  isCurrentHour: boolean;
  isPastHour: boolean;
  isFutureHour: boolean;
  columnStageLabel: string;
  invitations: SynchronizedNpsStudentCard[];
  students: EvaluatedStudentRecord[];
  totalConvites: number;
  totalAgendamentos: number;
  totalConvitesUnicos: number;
  portalCount: number;
  emailCount: number;
  jornada30Count: number;
  jornada50Count: number;
}

/**
 * Agrupa os cards sincronizados de alunos do NPS utilizando EXATAMENTE a mesma lógica de horários
 * (`linkedHourNumber` / `linkedHourKey` do Kanban de Alunos e `resolveColumnHourState` em America/Sao_Paulo)
 * utilizada no painel principal do aluno (Regra 7.3 e 7.4).
 */
export function groupByNpsHourKanban(
  items: Array<SynchronizedNpsStudentCard | ActiveNpsInvitation | EvaluatedStudentRecord>,
  currentTimeMinutes: number = getBrasiliaCurrentMinutes(),
  dayRelation: DayRelation = 'CURRENT_DAY'
): NpsHourKanbanColumn[] {
  const map = new Map<number, SynchronizedNpsStudentCard[]>();

  for (const item of items) {
    if ('linkedHourNumber' in item && 'latestActiveInvitation' in item) {
      if (!isInvitationStrictlyActive(item.latestActiveInvitation)) continue;
      const h = item.linkedHourNumber;
      const list = map.get(h) ?? [];
      list.push(item);
      map.set(h, list);
    } else if ('hourKey' in item && 'npsInvitation' in item && item.npsInvitation) {
      if (!isInvitationStrictlyActive(item.npsInvitation)) continue;
      const h = extractRecordStartHour(item, 'AGENDADO') ?? 8;
      const padded = String(h).padStart(2, '0');
      const card: SynchronizedNpsStudentCard = {
        ...item.npsInvitation,
        latestActiveInvitation: item.npsInvitation,
        studentSurveyHistory: item.studentNpsHistory || [item.npsInvitation],
        activeUnansweredCount: 1,
        totalHistoryCount: item.studentNpsHistory?.length || 1,
        matchedInKanban: true,
        linkedStudentId: item.id,
        linkedContrato: item.contrato,
        linkedStudentName: item.nomeCompleto,
        linkedResponsavelName: item.nomeResponsavel,
        linkedTelefoneAluno: item.telefoneAluno,
        linkedTelefoneResponsavel: item.telefoneResponsavel,
        linkedHourKey: `${padded}h`,
        linkedHourNumber: h,
        linkedHorario: item.horario,
        linkedDiaSemana: item.diaSemana,
        linkedSala: item.sala,
        linkedCurso: item.moduloAtual || item.curso,
        linkedModalidade: item.modalidade,
        linkedAttendanceStatus: item.attendanceStatus,
        linkedScheduleStage: item.scheduleStage,
        linkedScheduleStageLabel: item.scheduleStageLabel,
        agendamentosHorarios: [`${item.diaSemana} · ${item.hourKey}`],
        whatsappNpsUrl: item.whatsappNpsUrl,
      };
      const list = map.get(h) ?? [];
      list.push(card);
      map.set(h, list);
    }
  }

  const columns: NpsHourKanbanColumn[] = [];
  for (const [hourNumber, list] of map.entries()) {
    const padded = String(hourNumber).padStart(2, '0');
    const hourKey = `${padded}h`;
    const turno: ShiftType =
      hourNumber < 12 ? 'Manhã' : hourNumber < 18 ? 'Tarde' : 'Noite';

    const sortedCards = [...list].sort((a, b) =>
      a.linkedStudentName.localeCompare(b.linkedStudentName, 'pt-BR')
    );

    const { isCurrentHour, isPastHour, isFutureHour, columnStageLabel } =
      resolveColumnHourState(hourNumber, currentTimeMinutes, dayRelation);

    const portalCount = sortedCards.filter(
      (i) => i.origem === 'Portal do Aluno'
    ).length;
    const emailCount = sortedCards.filter((i) => i.origem === 'E-mail').length;
    const jornada30Count = sortedCards.filter((i) =>
      (i.pontoJornada || '').includes('30')
    ).length;
    const jornada50Count = sortedCards.filter((i) => {
      const p = i.pontoJornada || '';
      return p.includes('50') || p.includes('70');
    }).length;

    columns.push({
      hourKey,
      hourNumber,
      label: `${padded}h · Horário do Aluno ${padded}:00`,
      turno,
      isCurrentHour,
      isPastHour,
      isFutureHour,
      columnStageLabel,
      invitations: sortedCards,
      students: [],
      totalConvites: sortedCards.length,
      totalAgendamentos: sortedCards.length,
      totalConvitesUnicos: sortedCards.length,
      portalCount,
      emailCount,
      jornada30Count,
      jornada50Count,
    });
  }

  // Mesma ordenação cronológica natural do Kanban de Alunos (08h -> 20h)
  return columns.sort((a, b) => a.hourNumber - b.hourNumber);
}

function escapeCsvCell(
  value: string | number | null | undefined,
  delimiter: string
): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsvContent(
  records: StudentPerformanceRecord[],
  selectedColumns: ExportColumnKey[],
  notesByContract: Record<string, string> = {},
  delimiter: ';' | ',' = ';',
  currentTimeMinutes: number = getBrasiliaCurrentMinutes(),
  manualAttendanceOverrides: Record<number, AttendanceStatus> = {},
  referenceWeekday?: string
): string {
  const evaluated = evaluateAllStudentsAttendance(
    records,
    currentTimeMinutes,
    manualAttendanceOverrides,
    INITIAL_ACTIVE_NPS_INVITATIONS,
    referenceWeekday
  );
  const activeCols = EXPORT_COLUMNS.filter((c) =>
    selectedColumns.includes(c.key)
  );
  const headerRow = activeCols
    .map((c) => escapeCsvCell(c.label, delimiter))
    .join(delimiter);

  const dataRows = evaluated.map((r) => {
    return activeCols
      .map((col) => {
        switch (col.key) {
          case 'nota':
            return escapeCsvCell(
              r.nota !== null
                ? r.nota.toFixed(2).replace('.', ',')
                : 'Sem nota',
              delimiter
            );
          case 'attendanceStatus':
            return escapeCsvCell(
              `${r.attendanceStatus} (${r.scheduleStageLabel})`,
              delimiter
            );
          case 'inadimplente':
            return escapeCsvCell(
              r.inadimplente ? 'Inadimplente' : 'Regular',
              delimiter
            );
          case 'observacao':
            return escapeCsvCell(notesByContract[r.contrato] || '', delimiter);
          default:
            return escapeCsvCell(r[col.key], delimiter);
        }
      })
      .join(delimiter);
  });

  return [headerRow, ...dataRows].join('\r\n');
}

export function generateWhatsAppSummary(
  records: StudentPerformanceRecord[],
  unidade = 'ESCOLA PRESIDENTE PRUDENTE',
  dataRef = '30/10/2026',
  currentTimeMinutes: number = getBrasiliaCurrentMinutes(),
  manualAttendanceOverrides: Record<number, AttendanceStatus> = {},
  referenceWeekday?: string
): string {
  const kpis = computePerformanceKPIs(
    records,
    currentTimeMinutes,
    manualAttendanceOverrides,
    INITIAL_ACTIVE_NPS_INVITATIONS,
    referenceWeekday
  );
  const bySchedule = groupBySchedule(records);
  const topCourses = groupByCourse(records).slice(0, 5);

  const lines: string[] = [
    `*RELATÓRIO DE DESEMPENHO ACADÊMICO E FREQUÊNCIA — MICROLINS*`,
    `Unidade: ${unidade}`,
    `Data: ${dataRef} | Horário Ref.: ${formatMinutesToHHMM(
      currentTimeMinutes
    )} | Total de agendamentos: ${kpis.totalAgendamentos}`,
    ``,
    `*1. CONTROLE DE PRESENÇA E FREQUÊNCIA (TOLERÂNCIA 15 MIN)*`,
    `- Presença confirmada: ${kpis.presencaCount} (${kpis.taxaPresencaAtiva}%)`,
    `- Falta (processada no dia seguinte): ${kpis.faltaCount}`,
    `- Falta pendente de processamento (dia atual): ${kpis.faltasPendentesDiaSeguinteCount}`,
    `- Não iniciado / horário futuro: ${kpis.aguardandoCount}`,
    `- Frequência: ${
      kpis.hasFrequencyData ? `${kpis.mediaFrequencia.toFixed(1)}%` : 'Sem dados'
    }`,
    `- Presencial: ${kpis.presencialCount} | Online: ${kpis.onlineCount}`,
    ``,
    `*2. INDICADORES DE NOTAS E APROVEITAMENTO*`,
    `- Agendamentos com nota registrada: ${kpis.comNotaCount}/${kpis.totalAgendamentos}`,
    `- Média geral da turma: ${kpis.mediaGeralNotas.toFixed(2)}`,
    `- Nota 10: ${kpis.alunosNota10}`,
    `- Alerta de nota (< 7.0): ${kpis.alunosAbaixo7}`,
    ``,
    `*3. DISTRIBUIÇÃO POR HORÁRIO*`,
    ...bySchedule.map(
      (s) =>
        `- ${s.horario}: ${s.total} agendamentos (${s.finalizados} fin. / ${s.iniciados} inic. / ${s.naoIniciados} pend.)`
    ),
    ``,
    `*4. PRINCIPAIS MÓDULOS DO DIA*`,
    ...topCourses.map(
      (c) =>
        `- ${c.curso}: ${c.totalAlunos} agendamentos | Média: ${
          c.mediaNota !== null ? c.mediaNota.toFixed(2) : 'S/N'
        }`
    ),
  ];

  return lines.join('\n');
}

/**
 * ============================================================================
 * DASHBOARD GERENCIAL SEMANAL (Itens 6, 7 e 8)
 * Consolida todos os alunos da semana sem duplicidade, aplicando a regra
 * estrita de classificação ('INGLÊS' vs 'PROFISSIONALIZANTE') e filtros avançados.
 * ============================================================================
 */
export type DashboardWeeklyAttendanceFilterType =
  | 'TODOS'
  | 'COM_PRESENCA'
  | 'COM_FALTA'
  | 'PRESENCA_E_FALTA';

export type DashboardCardSelectionType =
  | 'TOTAL_ALUNOS'
  | 'ALUNOS_ATIVOS_UNICOS'
  | 'POSSIVEIS_DESISTENCIAS'
  | 'CATEGORIA_INGLES'
  | 'CATEGORIA_PROFISSIONALIZANTE'
  | 'APOSTILA_ENTREGUE'
  | 'APOSTILA_PENDENTE'
  | 'APOSTILA_TODOS'
  | 'DESAFIO_APOSTILA_PEDAGOGICO'
  | 'DESAFIO_APOSTILA_FINANCEIRO'
  | 'DESAFIO_APOSTILA_TODOS'
  | 'FREQUENCIA_PRESENCA'
  | 'FREQUENCIA_FALTA'
  | 'FREQUENCIA_TODOS'
  | 'FINANCEIRO_EM_DIA'
  | 'FINANCEIRO_EM_ATRASO'
  | 'FINANCEIRO_TODOS'
  | 'EVASAO'
  | 'AULA_4_SEM_APOSTILA_FIN_EM_DIA'
  | 'PRESENCA_SEM_RESPOSTA_NPS';

/**
 * Regra centralizada de Possíveis Desistências (Seção 4.1 e Premissas Seção 8):
/**
 * Regra centralizada de Possíveis Desistências:
 * O aluno deve atender rigorosamente aos 3 critérios simultâneos:
 * 1. Financeiro em atraso (`inadimplente === true`)
 * 2. Sem apostila entregue (`possuiApostila === false`)
 * 3. 0% de frequência COM pelo menos 1 aula contabilizada
 *
 * REGRA ESTRITA: Só avalie o aluno depois de ter pelo menos uma aula contabilizada.
 * Alunos sem nenhuma aula realizada/contabilizada (0 presenças e 0 faltas / frequência null)
 * NÃO atendem aos critérios e são desconsiderados.
 */
export function isPossivelDesistencia(student: {
  inadimplente: boolean;
  possuiApostila: boolean;
  frequenciaSemanalPercent?: number | null;
  presencaCount?: number;
  faltaCount?: number;
  totalAulasContabilizadas?: number;
}): boolean {
  if (!student.inadimplente) return false;
  if (student.possuiApostila) return false;

  const totalAulas =
    typeof student.totalAulasContabilizadas === 'number'
      ? student.totalAulasContabilizadas
      : (student.presencaCount ?? 0) + (student.faltaCount ?? 0);

  // REGRA ESTRITA: Só avalie o aluno depois de ter pelo menos uma aula contabilizada.
  // Alunos sem nenhuma aula realizada/contabilizada (frequencia null e 0 aulas) não podem ser considerados desistências.
  const hasAccountedClasses =
    totalAulas >= 1 ||
    (student.frequenciaSemanalPercent !== null &&
      student.frequenciaSemanalPercent !== undefined);

  if (!hasAccountedClasses) {
    return false;
  }

  const presencas = student.presencaCount ?? 0;
  if (presencas > 0) {
    return false;
  }

  const isZeroFreq =
    student.frequenciaSemanalPercent !== null &&
    student.frequenciaSemanalPercent !== undefined
      ? student.frequenciaSemanalPercent === 0
      : presencas === 0;

  return isZeroFreq;
}

export type ConsolidatedSortField =
  | 'nomeCompleto'
  | 'contrato'
  | 'formacao'
  | 'educador'
  | 'capacitacao'
  | 'cadNome'
  | 'unidade'
  | 'municipio'
  | 'modalidade'
  | 'turno'
  | 'diaSemana'
  | 'horario'
  | 'sala'
  | 'modulo'
  | 'aulaAtual'
  | 'presencas'
  | 'faltas'
  | 'frequencia'
  | 'agendamentos'
  | 'categoria'
  | 'apostila'
  | 'financeiro'
  | 'alertas';

export interface DashboardFilterCriteria {
  aulaMin: number | null;
  aulaMax: number | null;
  situacaoFinanceira: FinancialFilterType;
  entregaApostila: 'TODOS' | 'ENTREGUE' | 'NAO_ENTREGUE';
  frequenciaSemanal: DashboardWeeklyAttendanceFilterType;
  diasSemana: string[]; // vazio ou com todos = todos os dias
  categoriaCurso: CourseCategoryFilterType;
  modalidade?: 'AMBAS' | ModalityType;
  horarios: string[]; // vazio ou com todos = todos os horários (ex: ['08h', '14h'])
  // Filtros adicionais das colunas da tabela consolidada e barra de pesquisa
  search?: string;
  nomeFilter?: string;
  contratoFilter?: string;
  formacao?: string;
  educador?: string;
  capacitacao?: string;
  cadNome?: string;
  unidade?: string;
  municipio?: string;
  turno?: string;
  sala?: string;
  modulo?: string;
  presencasFilter?: 'TODOS' | 'COM_PRESENCA' | 'SEM_PRESENCA';
  faltasFilter?: 'TODOS' | 'COM_FALTA' | 'SEM_FALTA';
  agendamentosFilter?: 'TODOS' | '1' | '2' | '3+';
  alertaFilter?:
    | 'TODOS'
    | 'EVASAO'
    | 'NPS_ATIVO'
    | 'AULA_4_SEM_APOSTILA'
    | 'PRESENCA_SEM_NPS'
    | 'REGULAR';
  multiColumnFilters?: Partial<Record<ConsolidatedColumnId, string[]>>;
  sortBy?: ConsolidatedSortField;
  sortDir?: 'asc' | 'desc';
}

export function formatCapacitacaoDisplay(raw?: string): string {
  return formatFormacaoDisplay(raw);
}

export function formatModalityLabel(mod: ModalityType): 'On-line' | 'Presencial' {
  return mod === 'Online' ? 'On-line' : 'Presencial';
}

export interface ConsolidatedDashboardStudent {
  studentKey: string;
  primaryRecordId: number;
  nomeCompleto: string;
  contrato: string;
  contratos: string[];
  categoriaCurso: CourseCategoryType;
  formacao: string;
  formacaoRaw: string;
  educador: string;
  educadores: string[];
  capacitacao: string;
  capacitacoes: string[];
  contratosComCapacitacao: string[];
  contratosComFormacao: string[];
  cadId: string;
  cadIds: string[];
  cadNome: string;
  cadNomes: string[];
  unidade: string;
  unidades: string[];
  municipio: string;
  municipios: string[];
  turno: string;
  turnos: ShiftType[];
  telefoneAluno: string;
  nomeResponsavel: string;
  alertaStatusLabel: string;
  cursos: string[];
  formacoes: string[];
  salas: string[];
  modalidades: ModalityType[];
  modalidadesLabel: string;
  diasSemana: string[];
  horariosKeys: string[];
  horariosLabels: string[];
  aulaMinAluno: number;
  aulaMaxAluno: number;
  aulaAtualPrincipal: number;
  possuiApostila: boolean;
  inadimplente: boolean;
  situacaoFinanceiraLabel: 'Em dia' | 'Em atraso';
  presencaCount: number;
  faltaCount: number;
  naoIniciadaCount: number;
  agendamentosCount: number;
  frequenciaSemanalPercent: number | null;
  isEvasao: boolean;
  evasaoSummaries: string[];
  hasActiveNps: boolean;
  npsInvitation: ActiveNpsInvitation | null;
  isAula4SemApostilaFinEmDia: boolean;
  isDesafioApostilaPedagogico: boolean;
  isDesafioApostilaFinanceiro: boolean;
  isPossivelDesistencia: boolean;
  isPresencaSemRespostaNps: boolean;
  schedules: EvaluatedStudentRecord[];
  ultimaNota: number | null;
  ultimaNotaObtida: number | null;
  notaModuloAtual: number | null;
  notaModuloAnterior: number | null;
  evolucaoAcademicaLabel: string;
  parcelasAtrasadasMax: number;
}

export interface DashboardSummaryMetrics {
  totalAlunos: number;
  formacoesAtivasCount: number;
  alunosAtivosUnicosCount: number;
  totalAgendamentosFiltrados: number;
  apostilaEntregueCount: number;
  apostilaNaoEntregueCount: number;
  apostilaPercentualEntrega: number;
  desafioApostilaTotalCount: number;
  desafioApostilaPedagogicoCount: number;
  desafioApostilaFinanceiroCount: number;
  desafioApostilaPedagogicoPercent: number;
  desafioApostilaFinanceiroPercent: number;
  possiveisDesistenciasCount: number;
  possiveisDesistenciasPercent: number;
  presencaRegistrosCount: number;
  faltaRegistrosCount: number;
  alunosComPresencaCount: number;
  alunosComFaltaCount: number;
  frequenciaPercentual: number;
  diasContabilizadosFrequenciaCount: number;
  hasFrequencyData: boolean;
  financeiroEmDiaCount: number;
  financeiroEmAtrasoCount: number;
  financeiroEmDiaPercent: number;
  financeiroEmAtrasoPercent: number;
  evadidosCount: number;
  evadidosPercent: number;
  inglesCount: number;
  profissionalizanteCount: number;
  aula4SemApostilaFinEmDiaCount: number;
  presencaSemRespostaNpsCount: number;
}

const WEEKDAY_ORDER_INDEX: Record<string, number> = {
  Domingo: 0,
  'Segunda-feira': 1,
  'Terça-feira': 2,
  'Quarta-feira': 3,
  'Quinta-feira': 4,
  'Sexta-feira': 5,
  Sábado: 6,
};

export function sortConsolidatedStudents(
  students: ConsolidatedDashboardStudent[],
  sortBy: ConsolidatedSortField = 'nomeCompleto',
  sortDir: 'asc' | 'desc' = 'asc'
): ConsolidatedDashboardStudent[] {
  const dir = sortDir === 'desc' ? -1 : 1;
  return [...students].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'nomeCompleto':
        cmp = a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR');
        break;
      case 'contrato':
        cmp = a.contrato.localeCompare(b.contrato, 'pt-BR', { numeric: true });
        break;
      case 'formacao':
      case 'capacitacao':
        cmp = (a.formacao || a.capacitacao).localeCompare(
          b.formacao || b.capacitacao,
          'pt-BR'
        );
        break;
      case 'educador':
        cmp = (a.educador || 'Sem vínculo válido').localeCompare(
          b.educador || 'Sem vínculo válido',
          'pt-BR'
        );
        break;
      case 'cadNome':
        cmp = (a.cadNome || '').localeCompare(b.cadNome || '', 'pt-BR');
        break;
      case 'unidade':
        cmp = (a.unidade || '').localeCompare(b.unidade || '', 'pt-BR');
        break;
      case 'municipio':
        cmp = (a.municipio || '').localeCompare(b.municipio || '', 'pt-BR');
        break;
      case 'modalidade':
        cmp = a.modalidadesLabel.localeCompare(b.modalidadesLabel, 'pt-BR');
        break;
      case 'turno':
        cmp = (a.turno || '').localeCompare(b.turno || '', 'pt-BR');
        break;
      case 'diaSemana': {
        const dayA = WEEKDAY_ORDER_INDEX[a.diasSemana[0] || ''] ?? 99;
        const dayB = WEEKDAY_ORDER_INDEX[b.diasSemana[0] || ''] ?? 99;
        cmp =
          dayA - dayB ||
          a.diasSemana
            .join(', ')
            .localeCompare(b.diasSemana.join(', '), 'pt-BR');
        break;
      }
      case 'horario':
        cmp = (a.horariosKeys[0] || '').localeCompare(
          b.horariosKeys[0] || '',
          'pt-BR'
        );
        break;
      case 'sala':
        cmp = a.salas
          .join(', ')
          .localeCompare(b.salas.join(', '), 'pt-BR', { numeric: true });
        break;
      case 'modulo':
        cmp = a.cursos
          .join(' · ')
          .localeCompare(b.cursos.join(' · '), 'pt-BR');
        break;
      case 'aulaAtual':
        cmp = a.aulaAtualPrincipal - b.aulaAtualPrincipal;
        break;
      case 'presencas':
        cmp = a.presencaCount - b.presencaCount;
        break;
      case 'faltas':
        cmp = a.faltaCount - b.faltaCount;
        break;
      case 'frequencia': {
        const fA = a.frequenciaSemanalPercent ?? -1;
        const fB = b.frequenciaSemanalPercent ?? -1;
        cmp = fA - fB;
        break;
      }
      case 'agendamentos':
        cmp = a.agendamentosCount - b.agendamentosCount;
        break;
      case 'categoria':
        cmp = a.categoriaCurso.localeCompare(b.categoriaCurso, 'pt-BR');
        break;
      case 'apostila':
        cmp = Number(b.possuiApostila) - Number(a.possuiApostila);
        break;
      case 'financeiro':
        cmp = Number(a.inadimplente) - Number(b.inadimplente);
        break;
      case 'alertas': {
        const scoreA =
          (a.isEvasao ? 4 : 0) +
          (a.isAula4SemApostilaFinEmDia ? 2 : 0) +
          (a.hasActiveNps ? 1 : 0);
        const scoreB =
          (b.isEvasao ? 4 : 0) +
          (b.isAula4SemApostilaFinEmDia ? 2 : 0) +
          (b.hasActiveNps ? 1 : 0);
        cmp = scoreB - scoreA;
        break;
      }
      default:
        cmp = a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR');
    }
    if (cmp !== 0) return cmp * dir;
    const nameCmp = a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR');
    if (nameCmp !== 0) return nameCmp;
    return (a.formacao || '').localeCompare(b.formacao || '', 'pt-BR');
  });
}

export interface FormacaoStudentGroup {
  formacao: string;
  capacitacao: string;
  categoriaPredominante: CourseCategoryType;
  students: ConsolidatedDashboardStudent[];
}

export type CapacitacaoStudentGroup = FormacaoStudentGroup;

export function groupConsolidatedStudentsByFormacao(
  students: ConsolidatedDashboardStudent[]
): FormacaoStudentGroup[] {
  const groupMap = new Map<string, ConsolidatedDashboardStudent[]>();
  for (const st of students) {
    const primaryFormacao =
      st.formacao || st.capacitacao || 'Formação Profissional';
    const list = groupMap.get(primaryFormacao) ?? [];
    list.push(st);
    groupMap.set(primaryFormacao, list);
  }

  return Array.from(groupMap.entries())
    .map(([formacao, groupStudents]) => {
      const hasIngles = groupStudents.some(
        (s) => s.categoriaCurso === 'INGLÊS'
      );
      return {
        formacao,
        capacitacao: formacao,
        categoriaPredominante: (hasIngles
          ? 'INGLÊS'
          : 'PROFISSIONALIZANTE') as CourseCategoryType,
        students: groupStudents,
      };
    })
    .sort((a, b) => {
      if (b.students.length !== a.students.length) {
        return b.students.length - a.students.length;
      }
      return a.formacao.localeCompare(b.formacao, 'pt-BR');
    });
}

export function groupConsolidatedStudentsByCapacitacao(
  students: ConsolidatedDashboardStudent[]
): CapacitacaoStudentGroup[] {
  return groupConsolidatedStudentsByFormacao(students);
}

export function computeDashboardAnalytics(
  allEvaluatedRecords: EvaluatedStudentRecord[],
  filters: DashboardFilterCriteria,
  _activeNpsInvitations?: ActiveNpsInvitation[]
): {
  metrics: DashboardSummaryMetrics;
  filteredStudents: ConsolidatedDashboardStudent[];
  filteredSchedules: EvaluatedStudentRecord[];
} {
  const diasSet =
    filters.diasSemana.length > 0 ? new Set(filters.diasSemana) : null;
  const horariosSet =
    filters.horarios.length > 0 ? new Set(filters.horarios) : null;
  const salaFilter =
    filters.sala && filters.sala !== 'TODAS' ? filters.sala : null;
  const moduloFilter =
    filters.modulo && filters.modulo !== 'TODOS' ? filters.modulo : null;

  // Passo 1: Identificar a categoria por registro consolidado (Contrato + Formação do Aluno).
  // Regra Obrigatória 1: A FORMAÇÃO DO ALUNO é o critério principal de identificação e separação.
  // Alunos vinculados ao mesmo contrato com formações diferentes permanecem separados em registros distintos.
  const formationRecordCategoryMap = new Map<string, CourseCategoryType>();
  for (const r of allEvaluatedRecords) {
    const key = buildStudentFormationConsolidationKey(r);
    const currentCat = formationRecordCategoryMap.get(key);
    if (currentCat === 'INGLÊS') continue;
    if (isEnglishCourseRecord(r)) {
      formationRecordCategoryMap.set(key, 'INGLÊS');
    } else if (!currentCat) {
      formationRecordCategoryMap.set(key, 'PROFISSIONALIZANTE');
    }
  }

  // Passo 2: Filtrar os agendamentos que atendem aos critérios de agendamento
  const matchingSchedules = allEvaluatedRecords.filter((r) => {
    const key = buildStudentFormationConsolidationKey(r);
    const formationCategory =
      formationRecordCategoryMap.get(key) ||
      (isEnglishCourseRecord(r) ? 'INGLÊS' : 'PROFISSIONALIZANTE');

    if (
      filters.categoriaCurso !== 'TODOS' &&
      formationCategory !== filters.categoriaCurso
    ) {
      return false;
    }

    if (diasSet && !diasSet.has(r.diaSemana)) {
      return false;
    }

    if (horariosSet && !horariosSet.has(r.hourKey)) {
      return false;
    }

    if (
      filters.modalidade &&
      filters.modalidade !== 'AMBAS' &&
      r.modalidade !== filters.modalidade
    ) {
      return false;
    }

    if (salaFilter && r.sala !== salaFilter) {
      return false;
    }

    if (moduloFilter) {
      const modFormatted = formatModuleDisplay(r.moduloAtual || r.curso);
      if (modFormatted !== moduloFilter) {
        return false;
      }
    }

    const aulaNum = r.aulaNumero || 1;
    if (filters.aulaMin !== null && aulaNum < filters.aulaMin) {
      return false;
    }
    if (filters.aulaMax !== null && aulaNum > filters.aulaMax) {
      return false;
    }

    return true;
  });

  // Passo 3: Consolidar por (Contrato + Formação do Aluno):
  // - Alunos com mesmo contrato e formações diferentes geram registros distintos.
  // - Registros com a mesma formação e o mesmo contrato são consolidados juntos.
  const groupedByStudentFormation = new Map<string, EvaluatedStudentRecord[]>();
  for (const r of matchingSchedules) {
    const key = buildStudentFormationConsolidationKey(r);
    const list = groupedByStudentFormation.get(key) ?? [];
    list.push(r);
    groupedByStudentFormation.set(key, list);
  }

  const consolidatedCandidates: ConsolidatedDashboardStudent[] = [];

  for (const [studentKey, schedules] of groupedByStudentFormation.entries()) {
    const primary = schedules[0];
    const categoriaCurso =
      formationRecordCategoryMap.get(studentKey) ||
      (schedules.some((s) => isEnglishCourseRecord(s))
        ? 'INGLÊS'
        : 'PROFISSIONALIZANTE');

    const contratos = Array.from(new Set(schedules.map((s) => s.contrato)));
    const cursos = Array.from(
      new Set(
        schedules.map((s) => formatModuleDisplay(s.moduloAtual || s.curso))
      )
    );
    const formacoes = Array.from(
      new Set(schedules.map((s) => s.formacao).filter(Boolean))
    );
    const formattedFormacoes = Array.from(
      new Set(
        schedules.map((s) => formatFormacaoDisplay(s.formacao)).filter(Boolean)
      )
    );
    const formacao =
      formattedFormacoes[0] ||
      (categoriaCurso === 'INGLÊS' ? 'Inglês' : 'Formação Profissional');
    const capacitacao = formacao;
    const capacitacoes = formattedFormacoes.length > 0 ? formattedFormacoes : [formacao];

    const contratosComFormacao = contratos.map((c) => `#${c} (${formacao})`);
    const contratosComCapacitacao = contratosComFormacao;

    const rawEducadores = Array.from(
      new Set(
        schedules
          .map((s) => (s.educador || s.professor || '').trim())
          .filter((ed) => ed.length > 0 && ed !== 'A definir' && ed !== 'Não informado')
      )
    );
    const educadores =
      rawEducadores.length > 0 ? rawEducadores : ['Sem vínculo válido'];
    const educador = educadores.join(' · ');

    const cadIds = Array.from(
      new Set(schedules.map((s) => s.cadId || 'CAD-PP-01'))
    );
    const cadNomes = Array.from(
      new Set(
        schedules.map((s) => s.cadNome || 'CAD 01 - Presidente Prudente')
      )
    );
    const unidades = Array.from(
      new Set(schedules.map((s) => s.unidade || PORTAL_METADATA.unidade))
    );
    const municipios = Array.from(
      new Set(schedules.map((s) => s.municipio || 'Presidente Prudente - SP'))
    );
    const turnos = Array.from(
      new Set(schedules.map((s) => s.turno || 'Manhã'))
    ) as ShiftType[];

    const salas = Array.from(new Set(schedules.map((s) => s.sala)));
    const modalidades = Array.from(new Set(schedules.map((s) => s.modalidade)));
    const modalidadesLabel = modalidades
      .map((m) => formatModalityLabel(m))
      .join(' / ');

    const diasSemana = Array.from(new Set(schedules.map((s) => s.diaSemana)));
    const horariosKeys = Array.from(
      new Set(schedules.map((s) => s.hourKey))
    ).sort();
    const horariosLabels = Array.from(
      new Set(
        schedules.map((s) => `${s.diaSemana.split('-')[0]} ${s.hourKey}`)
      )
    );

    const aulas = schedules.map((s) => s.aulaNumero || 1);
    const aulaMinAluno = Math.min(...aulas);
    const aulaMaxAluno = Math.max(...aulas);
    const aulaAtualPrincipal = aulaMaxAluno;

    const possuiApostila = schedules.every((s) => s.possuiApostila);
    const inadimplente = schedules.some((s) => s.inadimplente);

    let presencaCount = 0;
    let faltaCount = 0;
    let naoIniciadaCount = 0;
    const evasaoSummariesSet = new Set<string>();
    let isEvasao = false;

    for (const s of schedules) {
      if (s.attendanceStatus === 'Presença') presencaCount++;
      else if (s.attendanceStatus === 'Falta') faltaCount++;
      else naoIniciadaCount++;

      if (s.isEvasao) {
        isEvasao = true;
        if (s.evasaoSummary) evasaoSummariesSet.add(s.evasaoSummary);
      }
    }

    const baseFreq = presencaCount + faltaCount;
    const frequenciaSemanalPercent =
      baseFreq > 0 ? Number(((presencaCount / baseFreq) * 100).toFixed(1)) : null;

    const npsSchedule = schedules.find(
      (s) => s.hasActiveNps && s.npsInvitation
    );
    const hasActiveNps = Boolean(npsSchedule);

    // Regra: Alunos a partir de 3 aulas pra frente (aula >= 3) sem apostila entregue e com financeiro em dia
    const hasThreeOrMoreClasses =
      aulaAtualPrincipal >= 3 ||
      schedules.some((s) => (s.aulaNumero || 1) >= 3);
    const isAula4SemApostilaFinEmDia =
      hasThreeOrMoreClasses && !possuiApostila && !inadimplente;

    // Desafio na entrega de apostila:
    // - Causa pedagógica: Financeiro em dia, mas não foi entregue a apostila
    // - Causa financeira: Parcela em atraso, mas não teve a apostila entregue
    const isDesafioApostilaPedagogico = !possuiApostila && !inadimplente;
    const isDesafioApostilaFinanceiro = !possuiApostila && inadimplente;

    const isPresencaSemRespostaNps = presencaCount > 0 && hasActiveNps;

    const alertTags: string[] = [];
    if (isEvasao) alertTags.push('Evasão');
    if (hasActiveNps) alertTags.push('NPS Ativo');
    if (isAula4SemApostilaFinEmDia) alertTags.push('3+ Aulas s/ Apostila');
    const alertaStatusLabel =
      alertTags.length > 0 ? alertTags.join(' · ') : 'Regular';

    const gradesList = schedules
      .map((s) => s.nota)
      .filter((n): n is number => n !== null && n !== undefined && !Number.isNaN(n));
    const ultimaNota =
      gradesList.length > 0 ? gradesList[gradesList.length - 1] : null;
    const parcelasAtrasadasMax = Math.max(
      0,
      ...schedules.map((s) => s.parcelasAtrasadas || (s.inadimplente ? 1 : 0))
    );
    const isPossivelDesistenciaFlag = isPossivelDesistencia({
      inadimplente,
      possuiApostila,
      frequenciaSemanalPercent,
      presencaCount,
      faltaCount,
      totalAulasContabilizadas: baseFreq,
    });

    const currentModGrades = schedules
      .filter((s) => !s.isNotaModuloAnterior && s.nota !== null && s.nota !== undefined)
      .map((s) => Number(s.nota));
    const prevModGrades = schedules
      .filter((s) => s.isNotaModuloAnterior && s.nota !== null && s.nota !== undefined)
      .map((s) => Number(s.nota));

    const notaModuloAtual =
      currentModGrades.length > 0
        ? currentModGrades[currentModGrades.length - 1]
        : ultimaNota;
    const notaModuloAnterior =
      prevModGrades.length > 0 ? prevModGrades[prevModGrades.length - 1] : null;

    let evolucaoAcademicaLabel = 'Sem histórico comparativo entre módulos';
    if (notaModuloAtual !== null && notaModuloAnterior !== null) {
      if (notaModuloAtual > notaModuloAnterior) {
        evolucaoAcademicaLabel = `Evolução positiva (${notaModuloAnterior} → ${notaModuloAtual})`;
      } else if (notaModuloAtual < notaModuloAnterior) {
        evolucaoAcademicaLabel = `Oscilação/queda (${notaModuloAnterior} → ${notaModuloAtual})`;
      } else {
        evolucaoAcademicaLabel = `Estabilidade (${notaModuloAtual})`;
      }
    } else if (ultimaNota !== null) {
      evolucaoAcademicaLabel = `Nota registrada: ${ultimaNota}`;
    }

    consolidatedCandidates.push({
      studentKey,
      primaryRecordId: primary.id,
      nomeCompleto: primary.nomeCompleto,
      contrato: primary.contrato,
      contratos,
      categoriaCurso,
      formacao,
      formacaoRaw: primary.formacao || formacao,
      educador,
      educadores,
      capacitacao,
      capacitacoes,
      contratosComCapacitacao,
      contratosComFormacao,
      cadId: cadIds[0] || 'CAD-PP-01',
      cadIds,
      cadNome: cadNomes.join(' / ') || 'CAD 01 - Presidente Prudente',
      cadNomes,
      unidade: unidades.join(' / ') || PORTAL_METADATA.unidade,
      unidades,
      municipio: municipios.join(' / ') || 'Presidente Prudente - SP',
      municipios,
      turno: turnos.join(' / ') || 'Manhã',
      turnos,
      telefoneAluno: primary.telefoneAluno || '',
      nomeResponsavel: primary.nomeResponsavel || '',
      alertaStatusLabel,
      cursos,
      formacoes,
      salas,
      modalidades,
      modalidadesLabel,
      diasSemana,
      horariosKeys,
      horariosLabels,
      aulaMinAluno,
      aulaMaxAluno,
      aulaAtualPrincipal,
      possuiApostila,
      inadimplente,
      situacaoFinanceiraLabel: inadimplente ? 'Em atraso' : 'Em dia',
      presencaCount,
      faltaCount,
      naoIniciadaCount,
      agendamentosCount: schedules.length,
      frequenciaSemanalPercent,
      isEvasao,
      evasaoSummaries: Array.from(evasaoSummariesSet),
      hasActiveNps,
      npsInvitation: npsSchedule?.npsInvitation || null,
      isAula4SemApostilaFinEmDia,
      isDesafioApostilaPedagogico,
      isDesafioApostilaFinanceiro,
      isPossivelDesistencia: isPossivelDesistenciaFlag,
      isPresencaSemRespostaNps,
      schedules,
      ultimaNota,
      ultimaNotaObtida: ultimaNota,
      notaModuloAtual,
      notaModuloAnterior,
      evolucaoAcademicaLabel,
      parcelasAtrasadasMax,
    });
  }

  const searchNorm = (filters.search || '').trim().toLowerCase();
  const nomeFilterNorm = (filters.nomeFilter || '').trim().toLowerCase();
  const contratoFilterNorm = (filters.contratoFilter || '').trim().toLowerCase();
  const formacaoFilter =
    filters.formacao && filters.formacao !== 'TODAS'
      ? filters.formacao
      : filters.capacitacao && filters.capacitacao !== 'TODAS'
      ? filters.capacitacao
      : null;
  const educadorFilter =
    filters.educador && filters.educador !== 'TODOS' && filters.educador !== 'TODAS'
      ? filters.educador
      : null;
  const cadNomeFilter =
    filters.cadNome && filters.cadNome !== 'TODOS' && filters.cadNome !== 'TODAS'
      ? filters.cadNome
      : null;
  const unidadeFilter =
    filters.unidade && filters.unidade !== 'TODAS' && filters.unidade !== 'TODOS'
      ? filters.unidade
      : null;
  const municipioFilter =
    filters.municipio &&
    filters.municipio !== 'TODOS' &&
    filters.municipio !== 'TODAS'
      ? filters.municipio
      : null;
  const turnoFilter =
    filters.turno && filters.turno !== 'TODOS' && filters.turno !== 'TODAS'
      ? filters.turno
      : null;

  // Passo 4: Aplicar filtros em nível de registro consolidado (incluindo filtros multi-valor estilo Power BI)
  const filteredUnsorted = consolidatedCandidates.filter((st) => {
    if (searchNorm) {
      const matchesName =
        st.nomeCompleto.toLowerCase().includes(searchNorm) ||
        normalizeStudentName(st.nomeCompleto).toLowerCase().includes(searchNorm);
      const matchesContract = st.contratos.some((c) =>
        c.toLowerCase().includes(searchNorm.replace(/^#/, ''))
      );
      const matchesFormacao = st.formacao.toLowerCase().includes(searchNorm);
      const matchesEducador = st.educador.toLowerCase().includes(searchNorm);
      if (!matchesName && !matchesContract && !matchesFormacao && !matchesEducador) {
        return false;
      }
    }

    if (nomeFilterNorm) {
      const matchesName =
        st.nomeCompleto.toLowerCase().includes(nomeFilterNorm) ||
        normalizeStudentName(st.nomeCompleto)
          .toLowerCase()
          .includes(nomeFilterNorm);
      if (!matchesName) return false;
    }

    if (contratoFilterNorm) {
      const cleanQ = contratoFilterNorm.replace(/^#/, '');
      if (!st.contratos.some((c) => c.toLowerCase().includes(cleanQ))) {
        return false;
      }
    }

    if (formacaoFilter) {
      if (
        st.formacao !== formacaoFilter &&
        st.capacitacao !== formacaoFilter &&
        !st.capacitacoes.includes(formacaoFilter)
      ) {
        return false;
      }
    }

    if (educadorFilter) {
      if (st.educador !== educadorFilter && !st.educadores.includes(educadorFilter)) {
        return false;
      }
    }

    if (cadNomeFilter && !st.cadNomes.includes(cadNomeFilter) && st.cadNome !== cadNomeFilter) {
      return false;
    }

    if (unidadeFilter && !st.unidades.includes(unidadeFilter) && st.unidade !== unidadeFilter) {
      return false;
    }

    if (
      municipioFilter &&
      !st.municipios.includes(municipioFilter) &&
      st.municipio !== municipioFilter
    ) {
      return false;
    }

    if (
      turnoFilter &&
      !st.turnos.includes(turnoFilter as ShiftType) &&
      st.turno !== turnoFilter
    ) {
      return false;
    }

    if (filters.situacaoFinanceira === 'EM_DIA' && st.inadimplente) {
      return false;
    }
    if (filters.situacaoFinanceira === 'EM_ATRASO' && !st.inadimplente) {
      return false;
    }

    if (filters.entregaApostila === 'ENTREGUE' && !st.possuiApostila) {
      return false;
    }
    if (filters.entregaApostila === 'NAO_ENTREGUE' && st.possuiApostila) {
      return false;
    }

    if (filters.frequenciaSemanal === 'COM_PRESENCA') {
      if (st.presencaCount === 0) return false;
    } else if (filters.frequenciaSemanal === 'COM_FALTA') {
      if (st.faltaCount === 0) return false;
    } else if (filters.frequenciaSemanal === 'PRESENCA_E_FALTA') {
      if (st.presencaCount === 0 || st.faltaCount === 0) return false;
    }

    if (filters.presencasFilter === 'COM_PRESENCA' && st.presencaCount === 0) {
      return false;
    }
    if (filters.presencasFilter === 'SEM_PRESENCA' && st.presencaCount > 0) {
      return false;
    }

    if (filters.faltasFilter === 'COM_FALTA' && st.faltaCount === 0) {
      return false;
    }
    if (filters.faltasFilter === 'SEM_FALTA' && st.faltaCount > 0) {
      return false;
    }

    if (filters.agendamentosFilter && filters.agendamentosFilter !== 'TODOS') {
      if (filters.agendamentosFilter === '1' && st.agendamentosCount !== 1) {
        return false;
      }
      if (filters.agendamentosFilter === '2' && st.agendamentosCount !== 2) {
        return false;
      }
      if (filters.agendamentosFilter === '3+' && st.agendamentosCount < 3) {
        return false;
      }
    }

    if (filters.alertaFilter && filters.alertaFilter !== 'TODOS') {
      if (filters.alertaFilter === 'EVASAO' && !st.isEvasao) return false;
      if (filters.alertaFilter === 'NPS_ATIVO' && !st.hasActiveNps) return false;
      if (
        filters.alertaFilter === 'AULA_4_SEM_APOSTILA' &&
        !st.isAula4SemApostilaFinEmDia
      ) {
        return false;
      }
      if (
        filters.alertaFilter === 'PRESENCA_SEM_NPS' &&
        !st.isPresencaSemRespostaNps
      ) {
        return false;
      }
      if (
        filters.alertaFilter === 'REGULAR' &&
        (st.isEvasao || st.hasActiveNps)
      ) {
        return false;
      }
    }

    if (!matchesMultiValueColumnFilters(st, filters.multiColumnFilters)) {
      return false;
    }

    return true;
  });

  const filteredStudents = sortConsolidatedStudents(
    filteredUnsorted,
    filters.sortBy || 'nomeCompleto',
    filters.sortDir || 'asc'
  );

  // Passo 5: Calcular indicadores sobre a mesma base filtrada
  const filteredSchedules: EvaluatedStudentRecord[] = [];
  for (const st of filteredStudents) {
    filteredSchedules.push(...st.schedules);
  }
  const metrics = computeDashboardSummaryMetricsFromStudents(filteredStudents);

  return {
    metrics,
    filteredStudents,
    filteredSchedules,
  };
}

export function computeDashboardSummaryMetricsFromStudents(
  students: ConsolidatedDashboardStudent[]
): DashboardSummaryMetrics {
  const totalAlunos = students.length;
  const formacoesAtivasCount = totalAlunos;
  let totalAgendamentosFiltrados = 0;
  let apostilaEntregueCount = 0;
  let apostilaNaoEntregueCount = 0;
  let desafioApostilaPedagogicoCount = 0;
  let desafioApostilaFinanceiroCount = 0;
  let possiveisDesistenciasCount = 0;
  let presencaRegistrosCount = 0;
  let faltaRegistrosCount = 0;
  let alunosComPresencaCount = 0;
  let alunosComFaltaCount = 0;
  let financeiroEmDiaCount = 0;
  let financeiroEmAtrasoCount = 0;
  let evadidosCount = 0;
  let inglesCount = 0;
  let profissionalizanteCount = 0;
  let aula4SemApostilaFinEmDiaCount = 0;
  let presencaSemRespostaNpsCount = 0;

  // Unificação de alunos ativos únicos (quem tem mais de um contrato ou mais de uma formação conta uma única vez — Seção 4.2)
  const uniqueActiveStudentsSet = new Set<string>();

  const dailyAttendanceByWeekday = new Map<
    string,
    { presencas: number; faltas: number }
  >();

  for (const st of students) {
    totalAgendamentosFiltrados += st.schedules.length;

    const unifiedStudentIdentity =
      normalizeStudentName(st.nomeCompleto) || st.contrato || st.studentKey;
    if (unifiedStudentIdentity) {
      uniqueActiveStudentsSet.add(unifiedStudentIdentity);
    }

    if (st.possuiApostila) {
      apostilaEntregueCount++;
    } else {
      apostilaNaoEntregueCount++;
      if (st.inadimplente) {
        desafioApostilaFinanceiroCount++;
      } else {
        desafioApostilaPedagogicoCount++;
      }
    }

    if (isPossivelDesistencia(st)) {
      possiveisDesistenciasCount++;
    }

    presencaRegistrosCount += st.presencaCount;
    faltaRegistrosCount += st.faltaCount;
    if (st.presencaCount > 0) alunosComPresencaCount++;
    if (st.faltaCount > 0) alunosComFaltaCount++;

    for (const s of st.schedules) {
      const dayKey = s.diaSemana || 'Segunda-feira';
      const dayEntry = dailyAttendanceByWeekday.get(dayKey) || {
        presencas: 0,
        faltas: 0,
      };
      if (s.attendanceStatus === 'Presença') {
        dayEntry.presencas++;
      } else if (s.attendanceStatus === 'Falta') {
        dayEntry.faltas++;
      }
      dailyAttendanceByWeekday.set(dayKey, dayEntry);
    }

    if (st.inadimplente) financeiroEmAtrasoCount++;
    else financeiroEmDiaCount++;

    if (st.isEvasao) evadidosCount++;

    if (st.categoriaCurso === 'INGLÊS') inglesCount++;
    else profissionalizanteCount++;

    if (st.isAula4SemApostilaFinEmDia) aula4SemApostilaFinEmDiaCount++;
    if (st.isPresencaSemRespostaNps) presencaSemRespostaNpsCount++;
  }

  const alunosAtivosUnicosCount = uniqueActiveStudentsSet.size;

  const apostilaPercentualEntrega =
    totalAlunos > 0
      ? Number(((apostilaEntregueCount / totalAlunos) * 100).toFixed(1))
      : 0;

  const desafioApostilaTotalCount = apostilaNaoEntregueCount;
  const desafioApostilaPedagogicoPercent =
    desafioApostilaTotalCount > 0
      ? Number(
          (
            (desafioApostilaPedagogicoCount / desafioApostilaTotalCount) *
            100
          ).toFixed(1)
        )
      : 0;
  const desafioApostilaFinanceiroPercent =
    desafioApostilaTotalCount > 0
      ? Number(
          (
            (desafioApostilaFinanceiroCount / desafioApostilaTotalCount) *
            100
          ).toFixed(1)
        )
      : 0;

  const possiveisDesistenciasPercent =
    totalAlunos > 0
      ? Number(((possiveisDesistenciasCount / totalAlunos) * 100).toFixed(1))
      : 0;

  let diasContabilizadosFrequenciaCount = 0;
  for (const { presencas, faltas } of dailyAttendanceByWeekday.values()) {
    if (presencas + faltas > 0) {
      diasContabilizadosFrequenciaCount++;
    }
  }

  // Fonte única de cálculo de frequência para todo o sistema: Presenças / (Presenças + Faltas) (Seção 5.3)
  const totalBaseFrequencia = presencaRegistrosCount + faltaRegistrosCount;
  const hasFrequencyDataFlag = totalBaseFrequencia > 0;
  const frequenciaPercentual = hasFrequencyDataFlag
    ? Number(((presencaRegistrosCount / totalBaseFrequencia) * 100).toFixed(1))
    : 0;

  const financeiroEmDiaPercent =
    totalAlunos > 0
      ? Number(((financeiroEmDiaCount / totalAlunos) * 100).toFixed(1))
      : 0;
  const financeiroEmAtrasoPercent =
    totalAlunos > 0
      ? Number(((financeiroEmAtrasoCount / totalAlunos) * 100).toFixed(1))
      : 0;

  const evadidosPercent =
    totalAlunos > 0
      ? Number(((evadidosCount / totalAlunos) * 100).toFixed(1))
      : 0;

  return {
    totalAlunos,
    formacoesAtivasCount,
    alunosAtivosUnicosCount,
    totalAgendamentosFiltrados,
    apostilaEntregueCount,
    apostilaNaoEntregueCount,
    apostilaPercentualEntrega,
    desafioApostilaTotalCount,
    desafioApostilaPedagogicoCount,
    desafioApostilaFinanceiroCount,
    desafioApostilaPedagogicoPercent,
    desafioApostilaFinanceiroPercent,
    possiveisDesistenciasCount,
    possiveisDesistenciasPercent,
    presencaRegistrosCount,
    faltaRegistrosCount,
    alunosComPresencaCount,
    alunosComFaltaCount,
    frequenciaPercentual,
    diasContabilizadosFrequenciaCount,
    hasFrequencyData: hasFrequencyDataFlag,
    financeiroEmDiaCount,
    financeiroEmAtrasoCount,
    financeiroEmDiaPercent,
    financeiroEmAtrasoPercent,
    evadidosCount,
    evadidosPercent,
    inglesCount,
    profissionalizanteCount,
    aula4SemApostilaFinEmDiaCount,
    presencaSemRespostaNpsCount,
  };
}

const APOSTILA_GROUP_CARDS: DashboardCardSelectionType[] = [
  'APOSTILA_ENTREGUE',
  'APOSTILA_PENDENTE',
  'APOSTILA_TODOS',
];

const DESAFIO_APOSTILA_GROUP_CARDS: DashboardCardSelectionType[] = [
  'DESAFIO_APOSTILA_PEDAGOGICO',
  'DESAFIO_APOSTILA_FINANCEIRO',
  'DESAFIO_APOSTILA_TODOS',
  'POSSIVEIS_DESISTENCIAS',
];

const FREQUENCIA_GROUP_CARDS: DashboardCardSelectionType[] = [
  'FREQUENCIA_PRESENCA',
  'FREQUENCIA_FALTA',
  'FREQUENCIA_TODOS',
];

const FINANCEIRO_GROUP_CARDS: DashboardCardSelectionType[] = [
  'FINANCEIRO_EM_DIA',
  'FINANCEIRO_EM_ATRASO',
  'FINANCEIRO_TODOS',
];

const CATEGORIA_GROUP_CARDS: DashboardCardSelectionType[] = [
  'CATEGORIA_INGLES',
  'CATEGORIA_PROFISSIONALIZANTE',
];

export function toggleDashboardCardSelection(
  currentSelections: DashboardCardSelectionType[],
  clicked: DashboardCardSelectionType
): DashboardCardSelectionType[] {
  if (clicked === 'TOTAL_ALUNOS') {
    return [];
  }

  const clean = currentSelections.filter((s) => s !== 'TOTAL_ALUNOS');

  if (clean.includes(clicked)) {
    return clean.filter((s) => s !== clicked);
  }

  let next = [...clean];
  if (APOSTILA_GROUP_CARDS.includes(clicked)) {
    next = next.filter((s) => !APOSTILA_GROUP_CARDS.includes(s));
  } else if (DESAFIO_APOSTILA_GROUP_CARDS.includes(clicked)) {
    next = next.filter((s) => !DESAFIO_APOSTILA_GROUP_CARDS.includes(s));
  } else if (FREQUENCIA_GROUP_CARDS.includes(clicked)) {
    next = next.filter((s) => !FREQUENCIA_GROUP_CARDS.includes(s));
  } else if (FINANCEIRO_GROUP_CARDS.includes(clicked)) {
    next = next.filter((s) => !FINANCEIRO_GROUP_CARDS.includes(s));
  } else if (CATEGORIA_GROUP_CARDS.includes(clicked)) {
    next = next.filter((s) => !CATEGORIA_GROUP_CARDS.includes(s));
  }

  next.push(clicked);
  return next;
}

export function getCardSelectionLabel(sel: DashboardCardSelectionType): string {
  switch (sel) {
    case 'APOSTILA_ENTREGUE':
      return 'Apostila Entregue';
    case 'APOSTILA_PENDENTE':
      return 'Sem Apostila';
    case 'APOSTILA_TODOS':
      return 'Apostila';
    case 'POSSIVEIS_DESISTENCIAS':
      return 'Possíveis Desistências';
    case 'DESAFIO_APOSTILA_PEDAGOGICO':
      return 'Sem Apostila (Fin. em Dia)';
    case 'DESAFIO_APOSTILA_FINANCEIRO':
      return 'Sem Apostila (Fin. em Atraso)';
    case 'DESAFIO_APOSTILA_TODOS':
      return 'Sem Apostila';
    case 'FREQUENCIA_PRESENCA':
      return 'Com Presença';
    case 'FREQUENCIA_FALTA':
      return 'Com Falta';
    case 'FREQUENCIA_TODOS':
      return 'Frequência';
    case 'FINANCEIRO_EM_DIA':
      return 'Financeiro em Dia';
    case 'FINANCEIRO_EM_ATRASO':
      return 'Financeiro em Atraso';
    case 'FINANCEIRO_TODOS':
      return 'Financeiro';
    case 'CATEGORIA_INGLES':
      return 'Inglês';
    case 'CATEGORIA_PROFISSIONALIZANTE':
      return 'Profissionalizante';
    case 'EVASAO':
      return 'Evasão';
    case 'AULA_4_SEM_APOSTILA_FIN_EM_DIA':
      return '3+ Aulas s/ Apostila';
    case 'PRESENCA_SEM_RESPOSTA_NPS':
      return 'Presença s/ NPS';
    case 'ALUNOS_ATIVOS_UNICOS':
      return 'Alunos Ativos';
    case 'TOTAL_ALUNOS':
    default:
      return 'Formações Ativas';
  }
}

export function filterDashboardStudentsByCardSelections(
  students: ConsolidatedDashboardStudent[],
  selections: DashboardCardSelectionType[]
): ConsolidatedDashboardStudent[] {
  const unifyUniqueStudents = selections.includes('ALUNOS_ATIVOS_UNICOS');
  const active = selections.filter(
    (s) => s !== 'TOTAL_ALUNOS' && s !== 'ALUNOS_ATIVOS_UNICOS'
  );
  if (active.length === 0 && !unifyUniqueStudents) {
    return students;
  }

  const activeSet = new Set(active);

  const hasApostilaEntregue = activeSet.has('APOSTILA_ENTREGUE');
  const hasApostilaPendente = activeSet.has('APOSTILA_PENDENTE');

  const hasPossiveisDesistencias = activeSet.has('POSSIVEIS_DESISTENCIAS');
  const hasDesafioPedagogico = activeSet.has('DESAFIO_APOSTILA_PEDAGOGICO');
  const hasDesafioFinanceiro = activeSet.has('DESAFIO_APOSTILA_FINANCEIRO');
  const hasDesafioTodos = activeSet.has('DESAFIO_APOSTILA_TODOS');

  const hasFreqPresenca = activeSet.has('FREQUENCIA_PRESENCA');
  const hasFreqFalta = activeSet.has('FREQUENCIA_FALTA');
  const hasFreqTodos = activeSet.has('FREQUENCIA_TODOS');

  const hasFinEmDia = activeSet.has('FINANCEIRO_EM_DIA');
  const hasFinEmAtraso = activeSet.has('FINANCEIRO_EM_ATRASO');

  const hasCatIngles = activeSet.has('CATEGORIA_INGLES');
  const hasCatProf = activeSet.has('CATEGORIA_PROFISSIONALIZANTE');

  const hasEvasao = activeSet.has('EVASAO');
  const hasAula4 = activeSet.has('AULA_4_SEM_APOSTILA_FIN_EM_DIA');
  const hasPresencaSemNps = activeSet.has('PRESENCA_SEM_RESPOSTA_NPS');
  const hasAnySpecialAlertCard = hasEvasao || hasAula4 || hasPresencaSemNps;

  const filteredList = students.filter((s) => {
    if (hasApostilaEntregue && !s.possuiApostila) return false;
    if (hasApostilaPendente && s.possuiApostila) return false;

    if (hasPossiveisDesistencias && !isPossivelDesistencia(s)) return false;
    if (hasDesafioPedagogico && !s.isDesafioApostilaPedagogico) return false;
    if (hasDesafioFinanceiro && !s.isDesafioApostilaFinanceiro) return false;
    if (hasDesafioTodos && s.possuiApostila) return false;

    if (hasFreqPresenca && s.presencaCount === 0) return false;
    if (hasFreqFalta && s.faltaCount === 0) return false;
    if (hasFreqTodos && s.presencaCount + s.faltaCount === 0) return false;

    if (hasFinEmDia && s.inadimplente) return false;
    if (hasFinEmAtraso && !s.inadimplente) return false;

    if (hasCatIngles && s.categoriaCurso !== 'INGLÊS') return false;
    if (hasCatProf && s.categoriaCurso !== 'PROFISSIONALIZANTE') return false;

    if (hasAnySpecialAlertCard) {
      const matchesSpecial =
        (hasEvasao && s.isEvasao) ||
        (hasAula4 && s.isAula4SemApostilaFinEmDia) ||
        (hasPresencaSemNps && s.isPresencaSemRespostaNps);
      if (!matchesSpecial) return false;
    }

    return true;
  });

  if (!unifyUniqueStudents) {
    return filteredList;
  }

  const seenStudentIdentities = new Set<string>();
  const deduplicated: ConsolidatedDashboardStudent[] = [];
  for (const st of filteredList) {
    const unifiedStudentIdentity =
      normalizeStudentName(st.nomeCompleto || '') ||
      (st.contratos[0] || st.contrato || '').trim();
    if (!unifiedStudentIdentity || seenStudentIdentities.has(unifiedStudentIdentity)) {
      continue;
    }
    seenStudentIdentities.add(unifiedStudentIdentity);
    deduplicated.push(st);
  }
  return deduplicated;
}

export function filterDashboardStudentsByCardSelection(
  students: ConsolidatedDashboardStudent[],
  selection: DashboardCardSelectionType | DashboardCardSelectionType[]
): ConsolidatedDashboardStudent[] {
  if (Array.isArray(selection)) {
    return filterDashboardStudentsByCardSelections(students, selection);
  }
  return filterDashboardStudentsByCardSelections(students, [selection]);
}

// ============================================================================
// MÓDULO 1.3 — PRIORIZAÇÃO DA PESQUISA NO PORTAL DO ALUNO
// ============================================================================

export interface PortalNpsPriorityCheckResult {
  shouldDisplay: boolean;
  shouldShowModal: boolean;
  shouldDisplayModal: boolean;
  greetingMessage: string;
  targetInvitation: ActiveNpsInvitation | null;
  invitation: ActiveNpsInvitation | null;
  reason?: string;
}

/**
 * Avalia estritamente as 5 condições da seção 1.3 para apresentar o modal
 * prioritário de avaliação NPS durante o acesso do aluno ao Portal do Aluno:
 * 1. Exista pesquisa NPS pendente vinculada ao aluno;
 * 2. A pesquisa pertença a um ciclo válido;
 * 3. A prioridade tenha sido habilitada para esse ciclo (priorizarNpsNoLogin === true);
 * 4. A pesquisa ainda não tenha sido respondida;
 * 5. Não exista outra pesquisa prioritária aberta na mesma sessão.
 */
export function evaluatePortalNpsPriorityOnLogin(
  paramsOrContrato:
    | {
        studentName: string;
        contrato: string;
        invitations: ActiveNpsInvitation[];
        isAnotherPriorityModalOpenInSession?: boolean;
        hasAnotherPriorityModalOpenInSession?: boolean;
        answeredInviteIdsInSession?: Set<string> | string[];
      }
    | string,
  studentNameArg?: string,
  invitationsArg?: ActiveNpsInvitation[],
  isAnotherPriorityModalOpenArg?: boolean
): PortalNpsPriorityCheckResult {
  const normalizedParams =
    typeof paramsOrContrato === 'string'
      ? {
          contrato: paramsOrContrato,
          studentName: studentNameArg || '',
          invitations: invitationsArg || [],
          isAnotherPriorityModalOpenInSession: Boolean(
            isAnotherPriorityModalOpenArg
          ),
          answeredInviteIdsInSession: [] as string[],
        }
      : {
          contrato: paramsOrContrato.contrato,
          studentName: paramsOrContrato.studentName,
          invitations: paramsOrContrato.invitations,
          isAnotherPriorityModalOpenInSession: Boolean(
            paramsOrContrato.isAnotherPriorityModalOpenInSession ??
              paramsOrContrato.hasAnotherPriorityModalOpenInSession
          ),
          answeredInviteIdsInSession:
            paramsOrContrato.answeredInviteIdsInSession || [],
        };

  const {
    studentName,
    contrato,
    invitations,
    isAnotherPriorityModalOpenInSession,
    answeredInviteIdsInSession,
  } = normalizedParams;

  const cleanName = (studentName || '').trim() || 'Aluno';
  const greetingMessage = `Olá, ${cleanName}! Sua opinião é fundamental para a Microlins. Avalie sua experiência em apenas 15 segundos.`;

  if (isAnotherPriorityModalOpenInSession) {
    return {
      shouldDisplay: false,
      shouldShowModal: false,
      shouldDisplayModal: false,
      greetingMessage,
      targetInvitation: null,
      invitation: null,
      reason: 'ANOTHER_PRIORITY_MODAL_OPEN_IN_SESSION',
    };
  }

  const answeredSet =
    answeredInviteIdsInSession instanceof Set
      ? answeredInviteIdsInSession
      : new Set(answeredInviteIdsInSession);

  const normTargetName = normalizeStudentName(cleanName);
  const cleanContrato = (contrato || '').trim();

  // Localiza convites vinculados ao aluno (por contrato ou nome normalizado)
  const studentInvites = (invitations || []).filter((inv) => {
    const matchesContrato =
      cleanContrato && inv.contrato && inv.contrato.trim() === cleanContrato;
    const matchesName =
      normTargetName &&
      normalizeStudentName(inv.studentName || '') === normTargetName;
    return Boolean(matchesContrato || matchesName);
  });

  if (studentInvites.length === 0) {
    return {
      shouldDisplay: false,
      shouldShowModal: false,
      shouldDisplayModal: false,
      greetingMessage,
      targetInvitation: null,
      invitation: null,
      reason: 'NO_SURVEY_FOR_STUDENT',
    };
  }

  // Filtra convites com prioridade habilitada, ciclo válido e ainda não respondidos
  const prioritizedPending = studentInvites.find((inv) => {
    const isAnswered =
      Boolean(inv.answered) ||
      inv.invitationStatus === 'respondido' ||
      answeredSet.has(inv.id);
    if (isAnswered) return false;
    if (inv.invitationStatus !== 'ativo') return false;
    if (!inv.pontoJornada || inv.pontoJornada.trim().length === 0) return false;
    if (!inv.priorizarNpsNoLogin) return false;
    if (
      inv.cicloPriorizado &&
      inv.cicloPriorizado.trim() !== '' &&
      inv.cicloPriorizado.trim().toLowerCase() !==
        inv.pontoJornada.trim().toLowerCase()
    ) {
      return false;
    }
    return true;
  });

  if (!prioritizedPending) {
    return {
      shouldDisplay: false,
      shouldShowModal: false,
      shouldDisplayModal: false,
      greetingMessage,
      targetInvitation: null,
      invitation: null,
      reason: 'NO_PRIORITIZED_PENDING_SURVEY_IN_VALID_CYCLE',
    };
  }

  return {
    shouldDisplay: true,
    shouldShowModal: true,
    shouldDisplayModal: true,
    greetingMessage,
    targetInvitation: prioritizedPending,
    invitation: prioritizedPending,
  };
}

// ============================================================================
// MÓDULO 2 — OBRIGATORIEDADE DO COMENTÁRIO QUALITATIVO & ORIENTAÇÃO CONTEXTUAL
// ============================================================================

export interface QualitativeNpsCommentValidationResult {
  valid: boolean;
  isValid: boolean;
  normalizedText: string;
  validCharsCount: number;
  validCharCount: number;
  faltamCaracteres: number;
  missingChars: number;
  meaningfulWordsCount: number;
  meaningfulWordCount: number;
  missingWords: number;
  isArtificial: boolean;
  isArtificialSequence: boolean;
  errorReason: string | null;
  errorMessage: string | null;
  counterText: string;
  dynamicCounterText: string;
  counterLabel: string;
}

/**
 * Normaliza o texto removendo espaços iniciais, finais e duplicados antes da validação.
 */
export function normalizeQualitativeNpsComment(rawText: string): string {
  return String(rawText || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Orientação contextual (placeholder dinâmico) conforme a faixa da nota (Seção 2.3):
 * - Notas 9 e 10 (Promotores)
 * - Notas 7 e 8 (Neutros)
 * - Notas 0 a 6 (Detratores)
 */
export function getNpsContextualPlaceholder(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return 'Selecione uma nota de 0 a 10 acima e conte-nos detalhadamente sobre sua experiência na unidade.';
  }
  if (score >= 9) {
    return 'Que bom! Conte-nos o que você mais gostou nas aulas, nos professores ou no atendimento da escola.';
  }
  if (score >= 7) {
    return 'O que podemos melhorar para transformar sua experiência em uma nota 10?';
  }
  return 'Sentimos muito pela sua experiência. Conte-nos detalhadamente o que aconteceu para que nossa coordenação possa entender a situação e buscar uma solução.';
}

export function getNpsDynamicCommentPlaceholder(
  score: number | null | undefined
): {
  band: 'PROMOTOR' | 'NEUTRO' | 'DETRATOR' | 'SEM_NOTA';
  placeholder: string;
  label: string;
} {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return {
      band: 'SEM_NOTA',
      placeholder: getNpsContextualPlaceholder(null),
      label: 'Selecione uma nota de 0 a 10',
    };
  }
  if (score >= 9) {
    return {
      band: 'PROMOTOR',
      placeholder:
        'Que excelente! Conte para nós o que você mais gosta nas aulas, no atendimento ou na estrutura da escola.',
      label: 'Promotor (9–10)',
    };
  }
  if (score >= 7) {
    return {
      band: 'NEUTRO',
      placeholder:
        'Obrigado pela avaliação! O que podemos melhorar para que sua experiência seja nota 10?',
      label: 'Neutro (7–8)',
    };
  }
  return {
    band: 'DETRATOR',
    placeholder:
      'Sentimos muito que sua experiência não tenha sido ideal. Conte-nos o que aconteceu para que possamos resolver rapidamente.',
    label: 'Detrator (0–6)',
  };
}

/**
 * Detecta preenchimentos artificiais como caracteres repetidos ("aaaaaaaaaa"),
 * sequências numéricas ou de teclado ("123456", "asdasd", "qwerty") ou repetição
 * excessiva da mesma palavra ("teste teste teste").
 */
export function isArtificialNpsComment(normalizedText: string): {
  artificial: boolean;
  reason: string | null;
} {
  const clean = normalizeQualitativeNpsComment(normalizedText);
  if (!clean) {
    return { artificial: false, reason: null };
  }

  const compactNoSpaces = clean.replace(/\s+/g, '').toLowerCase();

  // 1. Repetição contínua do mesmo caractere (ex.: "aaaaaaaaaa", "kkkkkk", "111111")
  if (/([a-z0-9À-ÿ])\1{4,}/i.test(compactNoSpaces)) {
    return {
      artificial: true,
      reason:
        'Comentário inválido: evite repetir o mesmo caractere consecutivamente (ex.: "aaaaaaaaaa").',
    };
  }

  // Pouca variedade de caracteres em todo o texto (ex.: "ababababab")
  const uniqueChars = new Set(compactNoSpaces.split(''));
  if (compactNoSpaces.length >= 6 && uniqueChars.size <= 2) {
    return {
      artificial: true,
      reason:
        'Comentário inválido: o texto informado possui caracteres repetitivos sem conteúdo significativo.',
    };
  }

  // 2. Sequências numéricas ou de teclado conhecidas ("123456", "asdasd", "qwerty", "abcdef")
  const artificialPatterns = [
    /12345\d*/,
    /01234\d*/,
    /98765\d*/,
    /654321/,
    /(?:asd){2,}/i,
    /(?:qwe){2,}/i,
    /(?:zxc){2,}/i,
    /qwerty/i,
    /asdfgh/i,
    /zxcvbn/i,
    /abcdef/i,
    /^(?:[0-9]+\s*)+$/,
  ];

  for (const regex of artificialPatterns) {
    if (regex.test(clean) || regex.test(compactNoSpaces)) {
      return {
        artificial: true,
        reason:
          'Comentário inválido: sequências numéricas ou de teclado (ex.: "123456", "asdasd") não são permitidas.',
      };
    }
  }

  // 3. Repetição excessiva da mesma palavra (ex.: "teste teste teste", "bom bom bom")
  const words = clean
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 3) {
    const wordCounts = new Map<string, number>();
    for (const w of words) {
      wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    }
    const uniqueWordCount = wordCounts.size;
    const maxSingleWordCount = Math.max(...Array.from(wordCounts.values()));

    if (
      uniqueWordCount === 1 ||
      (words.length <= 6 && maxSingleWordCount >= 3) ||
      uniqueWordCount / words.length < 0.5
    ) {
      return {
        artificial: true,
        reason:
          'Comentário inválido: evite repetir a mesma palavra várias vezes (ex.: "teste teste teste").',
      };
    }
  }

  return { artificial: false, reason: null };
}

/**
 * Valida obrigatoriedade e qualidade do comentário qualitativo (Seções 2.1 e 2.2):
 * - Mínimo de 10 caracteres válidos (desconsiderando espaços iniciais, finais e duplicados);
 * - Mínimo de 3 palavras significativas;
 * - Bloqueio de preenchimento artificial.
 */
export function validateQualitativeNpsComment(
  rawText: string,
  _score?: number | null
): QualitativeNpsCommentValidationResult {
  const normalizedText = normalizeQualitativeNpsComment(rawText);
  const validCharsCount = normalizedText.length;
  const faltamCaracteres = Math.max(0, 10 - validCharsCount);
  const counterText = `Mínimo de 10 caracteres e 3 palavras. Faltam ${faltamCaracteres} caracteres.`;

  // Extrai palavras significativas (tokens com pelo menos 2 caracteres alfanuméricos ou palavras válidas)
  const rawTokens = normalizedText
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const meaningfulWords = rawTokens.filter((token) => {
    const cleanToken = token.trim();
    if (cleanToken.length < 2) return false;
    // Rejeita tokens de um único caractere repetido como "aaa" ou "111"
    if (/^([a-z0-9À-ÿ])\1+$/i.test(cleanToken)) return false;
    return true;
  });

  const meaningfulWordsCount = meaningfulWords.length;
  const missingWords = Math.max(0, 3 - meaningfulWordsCount);
  const artificialCheck = isArtificialNpsComment(normalizedText);

  const buildResult = (
    valid: boolean,
    isArtificial: boolean,
    errorReason: string | null
  ): QualitativeNpsCommentValidationResult => ({
    valid,
    isValid: valid,
    normalizedText,
    validCharsCount,
    validCharCount: validCharsCount,
    faltamCaracteres: valid ? 0 : faltamCaracteres,
    missingChars: valid ? 0 : faltamCaracteres,
    meaningfulWordsCount,
    meaningfulWordCount: meaningfulWordsCount,
    missingWords: valid ? 0 : missingWords,
    isArtificial,
    isArtificialSequence: isArtificial,
    errorReason,
    errorMessage: errorReason,
    counterText,
    dynamicCounterText: counterText,
    counterLabel: counterText,
  });

  if (validCharsCount === 0) {
    return buildResult(
      false,
      false,
      'O comentário qualitativo é obrigatório para o envio da avaliação.'
    );
  }

  if (artificialCheck.artificial) {
    return buildResult(false, true, artificialCheck.reason);
  }

  if (validCharsCount < 10) {
    return buildResult(
      false,
      false,
      `O comentário deve conter no mínimo 10 caracteres válidos (faltam ${faltamCaracteres}).`
    );
  }

  if (meaningfulWordsCount < 3) {
    return buildResult(
      false,
      false,
      `O comentário deve conter no mínimo 3 palavras significativas (atual: ${meaningfulWordsCount}).`
    );
  }

  return buildResult(true, false, null);
}

export const validateNpsQualitativeComment = validateQualitativeNpsComment;





