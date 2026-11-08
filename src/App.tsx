import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe,
  GraduationCap,
  IdCard,
  Kanban,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Percent,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import {
  ActiveNpsInvitation,
  ALL_WEEK_STUDENT_RECORDS,
  INITIAL_ACTIVE_NPS_INVITATIONS,
  ModalityType,
  NpsEmailDeliveryStatusType,
  NpsOrigemType,
  PORTAL_METADATA,
  PORTAL_WEEKDAY_LABEL_TO_CODE,
  StudentPerformanceRecord,
} from './data/microlinsData';
import {
  supabase,
  fetchStudentRecords,
  fetchNpsInvitations,
  fetchSchoolsFromSupabase,
  getActiveSupabaseAuthSession,
  signOutFromSupabaseAuth,
  subscribeToSupabaseAuthChanges,
} from './utils/supabaseClient';
import {
  ALL_NPS_CYCLES,
  ApostilaFilterType,
  buildSynchronizedNpsStudentCards,
  compareWeekdayWithCurrent,
  computeNpsSummaryKPIs,
  computePerformanceKPIs,
  CourseCategoryFilterType,
  evaluateAllStudentsAttendance,
  extractRecordStartHour,
  filterAndDeduplicateAnnualNpsInvitations,
  filterAndSortRecords,
  filterSynchronizedNpsCards,
  FinancialFilterType,
  formatMinutesToHHMM,
  getBrasiliaCurrentMinutes,
  getCurrentBrasiliaWeekdayLabel,
  getCurrentBrasiliaYear,
  groupByHourKanban,
  groupByNpsHourKanban,
  hasFrequencyData,
  isNotStartedAttendanceStatus,
  NpsFilterCriteria,
  QuickCardFilter,
  StudentNpsFilterType,
  SynchronizedNpsStudentCard,
} from './utils/performanceAnalytics';
import {
  AuthSession,
  createDefaultSchoolsRegistry,
  DEFAULT_ADMIN_CREDENTIALS,
  isGenericPlaceholderUserName,
  RegisteredSchool,
} from './utils/authRegistry';
import { StudentDetailModal } from './components/StudentDetailModal';
import { NpsInvitationDetailModal } from './components/NpsInvitationDetailModal';
import { HourKanbanBoard } from './components/HourKanbanBoard';
import { NpsHourKanbanBoard } from './components/NpsHourKanbanBoard';
import { DashboardView } from './components/DashboardView';
import { LoginView } from './components/LoginView';
import { AdminPanelView } from './components/AdminPanelView';
import { PortalAlunoHubView } from './components/PortalAlunoHubView';
import { PrivacyProtectionView } from './components/PrivacyProtectionView';
import { IndicatorHelpPopover } from './components/IndicatorHelpPopover';
import {
  ToastProvider,
  CountUpNumber,
  SmartAvatar,
  KanbanBoardSkeleton,
  SlideOverDrawer,
  emitGlobalToast,
  readInitialThemePreference,
  saveThemePreference,
} from './components/uiSystem';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { ExportStudioModal } from './components/ExportStudioModal';

const AUTO_SYNC_INTERVAL_MS = 60_000;
const FILTER_LOADING_DELAY_MS = 110;

export type ThemeMode = 'light' | 'dark';

const WEEKDAY_FILTER_OPTIONS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

const SYNC_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function computeRecordsSignature(list: StudentPerformanceRecord[]): string {
  if (list.length === 0) return '0';
  let sig = `${list.length}:`;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    sig += `${r.id}:${r.contrato}:${r.diaSemana}:${r.horaInicio}:${r.status}:${r.presencaOuFalta || ''}:${r.inicio || ''}:${r.fim || ''}:${r.infoAula || ''}:${r.nota ?? ''}:${r.aulaNumero ?? ''}:${r.possuiApostila ? 1 : 0}:${r.educador || ''}:${r.email || ''}:${r.causaFaltaMaterialExplicita || ''}|`;
  }
  return sig;
}

function computeNpsSignature(list: ActiveNpsInvitation[]): string {
  if (list.length === 0) return '0';
  let sig = `${list.length}:`;
  for (let i = 0; i < list.length; i++) {
    const inv = list[i];
    sig += `${inv.id}:${inv.invitationStatus}:${inv.answered ? 1 : 0}:${inv.email || ''}:${inv.priorizarNpsNoLogin ? 1 : 0}:${inv.notaNps ?? ''}:${inv.comentarioNps || ''}:${inv.attemptsCount || 0}|`;
  }
  return sig;
}

function getInitialTheme(): ThemeMode {
  return readInitialThemePreference();
}

function formatCurrentBrasiliaSyncTimestamp(): string {
  try {
    const parts = SYNC_TIMESTAMP_FORMATTER.formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
  } catch {
    return `${PORTAL_METADATA.dataReferencia} ${PORTAL_METADATA.horaExtracao.slice(0, 5)}`;
  }
}

function getSimulatedTimeOverrideFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    const h = params.get('hora') || params.get('simulatedTime');
    if (h && /^\d{1,2}:\d{2}/.test(h.trim())) {
      return h.trim();
    }
  } catch {
    // Ignore URL parse errors
  }
  return undefined;
}

function getSimulatedWeekdayOverrideFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    const d = params.get('dia') || params.get('weekday');
    if (d && d.trim()) {
      return d.trim();
    }
  } catch {
    // Ignore URL parse errors
  }
  return undefined;
}

function resolveDefaultWeekdayFilter(): string {
  const urlDay = getSimulatedWeekdayOverrideFromUrl();
  if (urlDay) return urlDay;
  const currentDay = getCurrentBrasiliaWeekdayLabel();
  return currentDay === 'Domingo' ? 'Sexta-feira' : currentDay;
}

export default function App() {
  // Tema Visual Global sincronizado com atributo data-theme e preferência do SO
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      saveThemePreference(next);
      emitGlobalToast({
        variant: 'info',
        title: next === 'dark' ? 'Tema Escuro ativado' : 'Tema Claro ativado',
        description:
          next === 'dark'
            ? 'Interface ajustada para alto contraste noturno.'
            : 'Interface ajustada para visualização clara institucional.',
        durationMs: 2600,
      });
      return next;
    });
  }, []);

  // Estados de navegação avançada (Sidebar colapsável, Busca Global no Cabeçalho, Command Palette Ctrl+K, Export Studio e Drawer de Filtros)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isAcademicSubmenuOpen, setIsAcademicSubmenuOpen] = useState<boolean>(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isExportStudioOpen, setIsExportStudioOpen] = useState<boolean>(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState<boolean>(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [isHeaderSearchDropdownOpen, setIsHeaderSearchDropdownOpen] =
    useState<boolean>(false);
  const headerSearchInputRef = useRef<HTMLInputElement | null>(null);
  const headerSearchContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (e.shiftKey) {
          setIsCommandPaletteOpen((prev) => !prev);
        } else if (headerSearchInputRef.current) {
          headerSearchInputRef.current.focus();
          headerSearchInputRef.current.select();
          setIsHeaderSearchDropdownOpen(true);
        } else {
          setIsCommandPaletteOpen((prev) => !prev);
        }
      } else if (e.key === 'Escape') {
        setIsMobileSidebarOpen(false);
        setIsHeaderSearchDropdownOpen(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        headerSearchContainerRef.current &&
        !headerSearchContainerRef.current.contains(e.target as Node)
      ) {
        setIsHeaderSearchDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [records, setRecords] = useState<StudentPerformanceRecord[]>(
    () => ALL_WEEK_STUDENT_RECORDS
  );
  const [activeNpsInvitations, setActiveNpsInvitations] = useState<
    ActiveNpsInvitation[]
  >(() =>
    filterAndDeduplicateAnnualNpsInvitations(
      INITIAL_ACTIVE_NPS_INVITATIONS,
      getCurrentBrasiliaYear()
    )
  );
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [portalMeta, setPortalMeta] = useState(PORTAL_METADATA);
  const [npsReferenceYear, setNpsReferenceYear] = useState<number>(() =>
    getCurrentBrasiliaYear()
  );

  // Cadastro de escolas, credenciais NPS e usuários do Portal do Aluno (gerenciados pelo Perfil Administrador)
  const [schoolsRegistry, setSchoolsRegistry] = useState<RegisteredSchool[]>(
    () => createDefaultSchoolsRegistry()
  );
  const [enteredSchoolFromAdmin, setEnteredSchoolFromAdmin] =
    useState<boolean>(false);

  // Carregamento assíncrono e atualização em segundo plano via Supabase quando em ambiente Serverless/SPA (ex.: Netlify)
  useEffect(() => {
    let isMounted = true;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    async function loadSupabaseDataIfNeeded() {
      try {
        // Verifica primeiro se o servidor Node/Express (/api/*) está ativo.
        // Quando o backend Node está ativo, ele próprio gerencia SQLite + Portal + Supabase sem ruído de rede no navegador.
        const apiCheck = await fetch('/api/microlins/status', {
          headers: { Accept: 'application/json' },
        }).catch(() => null);
        const contentType = apiCheck?.headers.get('content-type') || '';
        const hasNodeBackend = Boolean(
          apiCheck && apiCheck.ok && contentType.includes('application/json')
        );

        if (hasNodeBackend) {
          if (isMounted) setIsLoadingData(false);
          return;
        }

        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 4000)
        );
        const fetchPromise = Promise.all([
          fetchStudentRecords().catch(() => []),
          fetchNpsInvitations().catch(() => []),
          fetchSchoolsFromSupabase().catch(() => []),
        ]);
        const result = await Promise.race([fetchPromise, timeoutPromise]);
        if (!result) return;
        const [remoteRecords, remoteNps, remoteSchools] = result;
        if (isMounted) {
          if (remoteRecords && remoteRecords.length > 0) {
            setRecords(remoteRecords);
          }
          if (remoteNps && remoteNps.length > 0) {
            setActiveNpsInvitations(
              filterAndDeduplicateAnnualNpsInvitations(
                remoteNps,
                getCurrentBrasiliaYear()
              )
            );
          }
          if (remoteSchools && remoteSchools.length > 0) {
            setSchoolsRegistry(remoteSchools);
          }
        }

        if (isMounted) {
          realtimeChannel = supabase
            .channel('microlins-realtime-sync')
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'student_records' },
              async () => {
                const updatedRecords = await fetchStudentRecords();
                if (updatedRecords && updatedRecords.length > 0) {
                  setRecords(updatedRecords);
                }
              }
            )
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'nps_records' },
              async () => {
                const updatedNps = await fetchNpsInvitations();
                if (updatedNps && updatedNps.length > 0) {
                  setActiveNpsInvitations(
                    filterAndDeduplicateAnnualNpsInvitations(
                      updatedNps,
                      getCurrentBrasiliaYear()
                    )
                  );
                }
              }
            )
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'schools' },
              async () => {
                const updatedSchools = await fetchSchoolsFromSupabase();
                if (updatedSchools && updatedSchools.length > 0) {
                  setSchoolsRegistry(updatedSchools);
                }
              }
            )
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'users' },
              async () => {
                const updatedSchools = await fetchSchoolsFromSupabase();
                if (updatedSchools && updatedSchools.length > 0) {
                  setSchoolsRegistry(updatedSchools);
                }
              }
            )
            .subscribe();
        }
      } catch (err) {
        console.error('Error loading data from Supabase:', err);
      } finally {
        if (isMounted) {
          setIsLoadingData(false);
        }
      }
    }

    loadSupabaseDataIfNeeded();
    return () => {
      isMounted = false;
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  // Página dedicada de Privacidade e Proteção de Dados (LGPD — Lei nº 13.709/2018)
  const [showPrivacyPage, setShowPrivacyPage] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      return (
        params.get('pagina') === 'privacidade' ||
        params.get('privacidade') === '1'
      );
    } catch {
      return false;
    }
  });

  // Sessão autenticada (Perfil Administrador ou Perfil da Escola — gerenciada via Supabase Auth e Cookie HttpOnly)
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const params = new URLSearchParams(window.location.search);
      const autostart = params.get('autostart');
      const perfil = (params.get('perfil') || '').toLowerCase();
      if (perfil === 'admin') {
        return {
          role: 'ADMIN',
          login: DEFAULT_ADMIN_CREDENTIALS.login,
          nomeCompleto: DEFAULT_ADMIN_CREDENTIALS.nomeCompleto,
          cargo: DEFAULT_ADMIN_CREDENTIALS.cargo,
        };
      }
      if (autostart === '1' || perfil === 'escola') {
        const defaultSchool = createDefaultSchoolsRegistry()[0];
        const defaultUser = defaultSchool.users[0];
        return {
          role: 'ESCOLA',
          login: defaultUser.login,
          nomeCompleto: defaultUser.nomeCompleto,
          cargo: defaultUser.cargo,
          schoolId: defaultSchool.id,
          schoolName: defaultSchool.nome,
          codigoPortal: defaultSchool.codigoPortal,
        };
      }
    } catch {
      // Ignore URL parse errors
    }
    return null;
  });

  // Valida e sincroniza sessão ativa com o servidor via Cookie HttpOnly / Bearer e Supabase Auth
  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => r.json())
      .then(async (d) => {
        if (!active) return;
        if (d?.ok && d.session) {
          setAuthSession(d.session);
          return;
        }
        const supaSession = await getActiveSupabaseAuthSession();
        if (active && supaSession) {
          setAuthSession(supaSession);
        }
      })
      .catch(async () => {
        const supaSession = await getActiveSupabaseAuthSession();
        if (active && supaSession) {
          setAuthSession(supaSession);
        }
      });

    const unsubscribe = subscribeToSupabaseAuthChanges((event) => {
      if (event === 'SIGNED_OUT' && active) {
        setAuthSession(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Carrega escolas e usuários cadastrados no servidor ou diretamente do Supabase (ex.: Netlify)
  useEffect(() => {
    let active = true;
    fetch('/api/admin/schools', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('API indisponível em ambiente estático');
        return r.json();
      })
      .then((data) => {
        if (active && data?.ok && Array.isArray(data.schools)) {
          setSchoolsRegistry(data.schools);
        }
      })
      .catch(() => {
        fetchSchoolsFromSupabase()
          .then((remoteSchools) => {
            if (active && remoteSchools && remoteSchools.length > 0) {
              setSchoolsRegistry(remoteSchools);
            }
          })
          .catch(() => {});
      });
    return () => {
      active = false;
    };
  }, [authSession?.login, authSession?.role]);

  const handleLoginSuccess = useCallback(
    (
      session: AuthSession,
      updatedMetadata?: {
        unidade?: string;
        codigoUnidade?: string;
        usuarioLogin?: string;
        usuarioNomeCompleto?: string;
        usuarioCargo?: string;
      }
    ) => {
      setAuthSession(session);
      setEnteredSchoolFromAdmin(false);
      if (session.role === 'ESCOLA') {
        setPortalMeta((prev) => ({
          ...prev,
          unidade:
            session.schoolName || updatedMetadata?.unidade || prev.unidade,
          usuarioLogin:
            session.login || updatedMetadata?.usuarioLogin || prev.usuarioLogin,
          usuarioNomeCompleto:
            session.nomeCompleto ||
            updatedMetadata?.usuarioNomeCompleto ||
            prev.usuarioNomeCompleto,
          usuarioCargo:
            session.cargo || updatedMetadata?.usuarioCargo || prev.usuarioCargo,
        }));
      }
    },
    []
  );

  const handleLogout = useCallback(() => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(
      () => {}
    );
    void signOutFromSupabaseAuth();
    setAuthSession(null);
    setEnteredSchoolFromAdmin(false);
  }, []);

  // Horário e dia da semana atuais reais em Brasília (America/Sao_Paulo)
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState<number>(() =>
    getBrasiliaCurrentMinutes(getSimulatedTimeOverrideFromUrl())
  );
  const [currentBrasiliaWeekday, setCurrentBrasiliaWeekday] = useState<string>(
    () => getSimulatedWeekdayOverrideFromUrl() || getCurrentBrasiliaWeekdayLabel()
  );

  // Data e hora discreta da última sincronização
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<string>(() =>
    formatCurrentBrasiliaSyncTimestamp()
  );

  // Estado de carregamento com desfoque (blur) e bloqueio visual
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>(
    'Carregando e atualizando informações do Kanban...'
  );
  const loadingTimeoutRef = useRef<number | null>(null);

  const triggerWithLoading = useCallback(
    (action: () => void, _customMessage?: string) => {
      action();
    },
    []
  );

  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current !== null) {
        window.clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // Navegação entre as abas (Kanban de Alunos, Kanban NPS, Consolidado e Ficha Individual)
  const [activeTab, setActiveTab] = useState<
    'KANBAN_ALUNOS' | 'KANBAN_NPS' | 'DASHBOARD' | 'PORTAL_ALUNO'
  >('KANBAN_ALUNOS');
  const [portalHubStudentId, setPortalHubStudentId] = useState<number | null>(null);
  const [portalHubInitialSubTab, setPortalHubInitialSubTab] = useState<
    'CARTEIRINHA' | 'BOLETIM' | 'ACOMPANHAMENTO' | 'DECLARACAO'
  >('BOLETIM');

  // === Filtros da aba KANBAN DE ALUNOS (sem barra de pesquisa, conforme Item 2) ===
  const [selectedDiaSemana, setSelectedDiaSemana] = useState<string>(() =>
    resolveDefaultWeekdayFilter()
  );
  const [selectedSala, setSelectedSala] = useState<string>('TODAS');
  const [selectedEducador, setSelectedEducador] = useState<string>('TODOS');
  const [selectedHorario, setSelectedHorario] = useState<string>('TODOS');
  const [selectedModalidade, setSelectedModalidade] = useState<
    'TODAS' | ModalityType
  >('TODAS');
  const [selectedApostila, setSelectedApostila] =
    useState<ApostilaFilterType>('TODAS');
  const [selectedNpsFilter, setSelectedNpsFilter] =
    useState<StudentNpsFilterType>('TODOS');
  const [selectedCourseCategory, setSelectedCourseCategory] =
    useState<CourseCategoryFilterType>('TODOS');
  const [selectedFinancialStatus, setSelectedFinancialStatus] =
    useState<FinancialFilterType>('TODOS');
  const [selectedFinalizacaoAntecipada, setSelectedFinalizacaoAntecipada] =
    useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<QuickCardFilter>('TODOS');

  // === Filtros da aba KANBAN NPS (abre no dia atual de Brasília) ===
  const [npsDiaSemana, setNpsDiaSemana] = useState<string>(() =>
    resolveDefaultWeekdayFilter()
  );
  const [npsOrigem, setNpsOrigem] = useState<'TODAS' | NpsOrigemType>('TODAS');
  const [npsPontoJornada, setNpsPontoJornada] = useState<string>('TODOS');
  const [npsHorario, setNpsHorario] = useState<string>('TODOS');
  const [npsDeliveryStatus, setNpsDeliveryStatus] = useState<
    'TODOS' | NpsEmailDeliveryStatusType
  >('TODOS');
  const [npsDestinatarioFilter, setNpsDestinatarioFilter] = useState<
    'TODOS' | 'ALUNO' | 'RESPONSAVEL'
  >('TODOS');

  // Modal de detalhes do aluno (Kanban de Alunos)
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  // Modal de detalhes do aluno/pesquisa NPS (Kanban NPS -> ao clicar no card do aluno)
  const [selectedNpsStudentCard, setSelectedNpsStudentCard] =
    useState<SynchronizedNpsStudentCard | null>(null);

  const selectedDiaSemanaRef = useRef<string>(selectedDiaSemana);
  useEffect(() => {
    selectedDiaSemanaRef.current = selectedDiaSemana;
  }, [selectedDiaSemana]);

  // Sincronização automática em segundo plano a cada 1 minuto (sem travar a thread principal quando os dados não mudam)
  const syncPortalData = useCallback(async (diaSemanaFilter?: string) => {
    try {
      const targetDay = diaSemanaFilter ?? selectedDiaSemanaRef.current;
      const semanaCode =
        targetDay && targetDay !== 'TODOS'
          ? PORTAL_WEEKDAY_LABEL_TO_CODE[targetDay] || ''
          : '';
      const querySuffix = semanaCode
        ? `?semana=${encodeURIComponent(semanaCode)}`
        : '';
      let res = await fetch(`/api/microlins/sync${querySuffix}`, {
        cache: 'no-store',
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        try {
          const fallbackRes = await fetch(
            `/.netlify/functions/microlins-sync${querySuffix}`,
            { cache: 'no-store' }
          );
          const fallbackContentType =
            fallbackRes.headers.get('content-type') || '';
          if (fallbackRes.ok && fallbackContentType.includes('application/json')) {
            res = fallbackRes;
          }
        } catch {
          // Fallback to Supabase below if Netlify function is unreachable
        }
      }
      const nextWeekday =
        getSimulatedWeekdayOverrideFromUrl() || getCurrentBrasiliaWeekdayLabel();
      setCurrentBrasiliaWeekday((prev) =>
        prev === nextWeekday ? prev : nextWeekday
      );
      const urlTimeOverride = getSimulatedTimeOverrideFromUrl();

      if (
        res.ok &&
        (res.headers.get('content-type') || '').includes('application/json')
      ) {
        const payload = await res.json();
        if (Array.isArray(payload.records) && payload.records.length > 0) {
          const incomingRecords: StudentPerformanceRecord[] = payload.records;
          setRecords((prev) =>
            computeRecordsSignature(prev) ===
            computeRecordsSignature(incomingRecords)
              ? prev
              : incomingRecords
          );
        }
        if (
          Array.isArray(payload.activeNpsInvitations) &&
          payload.activeNpsInvitations.length > 0
        ) {
          const refYear =
            typeof payload.npsReferenceYear === 'number'
              ? payload.npsReferenceYear
              : getCurrentBrasiliaYear();
          setNpsReferenceYear((prev) => (prev === refYear ? prev : refYear));
          const deduplicatedNps = filterAndDeduplicateAnnualNpsInvitations(
            payload.activeNpsInvitations,
            refYear
          );
          setActiveNpsInvitations((prev) =>
            computeNpsSignature(prev) === computeNpsSignature(deduplicatedNps)
              ? prev
              : deduplicatedNps
          );
        }
        if (payload.metadata) {
          setPortalMeta((prev) => {
            if (
              prev.unidade === payload.metadata.unidade &&
              prev.usuarioNomeCompleto ===
                payload.metadata.usuarioNomeCompleto &&
              prev.usuarioCargo === payload.metadata.usuarioCargo &&
              prev.usuarioLogin === payload.metadata.usuarioLogin
            ) {
              return prev;
            }
            return { ...prev, ...payload.metadata };
          });
          setAuthSession((prevSession) => {
            if (!prevSession || prevSession.role !== 'ESCOLA') {
              return prevSession;
            }
            const incomingName = payload.metadata.usuarioNomeCompleto;
            const nextNome = !isGenericPlaceholderUserName(incomingName)
              ? incomingName
              : prevSession.nomeCompleto;
            const nextCargo =
              payload.metadata.usuarioCargo || prevSession.cargo;
            if (
              prevSession.nomeCompleto === nextNome &&
              prevSession.cargo === nextCargo
            ) {
              return prevSession;
            }
            return {
              ...prevSession,
              nomeCompleto: nextNome,
              cargo: nextCargo,
            };
          });
        }
        const nextMinutes = urlTimeOverride
          ? getBrasiliaCurrentMinutes(urlTimeOverride)
          : payload.syncedAt
          ? getBrasiliaCurrentMinutes(payload.syncedAt)
          : getBrasiliaCurrentMinutes();
        setCurrentTimeMinutes((prev) =>
          prev === nextMinutes ? prev : nextMinutes
        );

        const nextSyncStr =
          payload.syncedDate && payload.syncedAt
            ? `${payload.syncedDate} ${payload.syncedAt.slice(0, 5)}`
            : formatCurrentBrasiliaSyncTimestamp();
        setLastSyncTimestamp((prev) =>
          prev === nextSyncStr ? prev : nextSyncStr
        );
      } else {
        const [remoteRecords, remoteNps] = await Promise.all([
          fetchStudentRecords(),
          fetchNpsInvitations(),
        ]);
        if (remoteRecords && remoteRecords.length > 0) {
          setRecords((prev) =>
            computeRecordsSignature(prev) ===
            computeRecordsSignature(remoteRecords)
              ? prev
              : remoteRecords
          );
        }
        if (remoteNps && remoteNps.length > 0) {
          const deduplicatedNps = filterAndDeduplicateAnnualNpsInvitations(
            remoteNps,
            getCurrentBrasiliaYear()
          );
          setActiveNpsInvitations((prev) =>
            computeNpsSignature(prev) === computeNpsSignature(deduplicatedNps)
              ? prev
              : deduplicatedNps
          );
        }
        const nextMinutes = getBrasiliaCurrentMinutes(
          getSimulatedTimeOverrideFromUrl()
        );
        setCurrentTimeMinutes((prev) =>
          prev === nextMinutes ? prev : nextMinutes
        );
        setLastSyncTimestamp(formatCurrentBrasiliaSyncTimestamp());
      }
    } catch {
      try {
        const [remoteRecords, remoteNps] = await Promise.all([
          fetchStudentRecords(),
          fetchNpsInvitations(),
        ]);
        if (remoteRecords && remoteRecords.length > 0) {
          setRecords((prev) =>
            computeRecordsSignature(prev) ===
            computeRecordsSignature(remoteRecords)
              ? prev
              : remoteRecords
          );
        }
        if (remoteNps && remoteNps.length > 0) {
          const deduplicatedNps = filterAndDeduplicateAnnualNpsInvitations(
            remoteNps,
            getCurrentBrasiliaYear()
          );
          setActiveNpsInvitations((prev) =>
            computeNpsSignature(prev) === computeNpsSignature(deduplicatedNps)
              ? prev
              : deduplicatedNps
          );
        }
      } catch {
        // Ignore network errors
      }
      const nextMinutes = getBrasiliaCurrentMinutes(
        getSimulatedTimeOverrideFromUrl()
      );
      setCurrentTimeMinutes((prev) =>
        prev === nextMinutes ? prev : nextMinutes
      );
      const nextWeekday =
        getSimulatedWeekdayOverrideFromUrl() || getCurrentBrasiliaWeekdayLabel();
      setCurrentBrasiliaWeekday((prev) =>
        prev === nextWeekday ? prev : nextWeekday
      );
      setLastSyncTimestamp(formatCurrentBrasiliaSyncTimestamp());
    }
  }, []);

  useEffect(() => {
    syncPortalData();
    const timer = setInterval(() => syncPortalData(), AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [syncPortalData, authSession?.login, authSession?.schoolId]);

  const effectiveEvalWeekday =
    currentBrasiliaWeekday || getCurrentBrasiliaWeekdayLabel();

  // 1. Avaliação global de todos os agendamentos respeitando prioridade absoluta do sistema e regra dos 15 minutos
  const allEvaluatedRecords = useMemo(
    () =>
      evaluateAllStudentsAttendance(
        records,
        currentTimeMinutes,
        {},
        activeNpsInvitations,
        effectiveEvalWeekday
      ),
    [records, currentTimeMinutes, activeNpsInvitations, effectiveEvalWeekday]
  );

  // Registros filtrados pelo Dia da Semana selecionado no Kanban de Alunos
  const dayFilteredRecords = useMemo(() => {
    if (selectedDiaSemana === 'TODOS') {
      return allEvaluatedRecords;
    }
    return allEvaluatedRecords.filter((r) => r.diaSemana === selectedDiaSemana);
  }, [allEvaluatedRecords, selectedDiaSemana]);

  // Opções dinâmicas para filtros do Kanban de Alunos
  const salaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of dayFilteredRecords) {
      if (r.sala) set.add(r.sala);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [dayFilteredRecords]);

  const educadorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of dayFilteredRecords) {
      const prof = (r.professor || '').trim();
      if (prof && prof !== 'Não informado' && prof !== 'S/D') {
        set.add(prof);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [dayFilteredRecords]);

  const horarioOptions = useMemo(() => {
    const hourNumbers = new Set<number>();
    for (const r of dayFilteredRecords) {
      const h = extractRecordStartHour(r, 'AGENDADO');
      if (h !== null) hourNumbers.add(h);
    }
    return Array.from(hourNumbers)
      .sort((a, b) => a - b)
      .map((h) => `${String(h).padStart(2, '0')}h`);
  }, [dayFilteredRecords]);

  // Registros avaliados do Kanban de Alunos conectados à barra de pesquisa única do cabeçalho
  const headerFilteredRecords = useMemo(
    () =>
      filterAndSortRecords(
        allEvaluatedRecords,
        {
          search: globalSearchQuery,
          diaSemana: selectedDiaSemana,
          sala: selectedSala,
          professor: selectedEducador,
          horario: selectedHorario,
          modalidade: selectedModalidade,
          apostilaFilter: selectedApostila,
          npsFilter: selectedNpsFilter,
          courseCategoryFilter: selectedCourseCategory,
          financialFilter: selectedFinancialStatus,
          finalizacaoAntecipada: selectedFinalizacaoAntecipada,
          status: 'TODOS',
          attendanceFilter: 'TODOS',
          turno: 'TODOS',
          curso: 'TODOS',
          notaFilter: 'TODOS',
          apenasInadimplentes: false,
          sortBy: 'id',
          sortDir: 'asc',
        },
        currentTimeMinutes,
        {},
        activeNpsInvitations,
        effectiveEvalWeekday
      ),
    [
      allEvaluatedRecords,
      globalSearchQuery,
      selectedDiaSemana,
      selectedSala,
      selectedEducador,
      selectedHorario,
      selectedModalidade,
      selectedApostila,
      selectedNpsFilter,
      selectedCourseCategory,
      selectedFinancialStatus,
      selectedFinalizacaoAntecipada,
      currentTimeMinutes,
      activeNpsInvitations,
      effectiveEvalWeekday,
    ]
  );

  // KPIs dos 6 cards de resumo de Alunos (organizados em 2 linhas)
  const kpis = useMemo(
    () =>
      computePerformanceKPIs(
        headerFilteredRecords,
        currentTimeMinutes,
        {},
        activeNpsInvitations,
        effectiveEvalWeekday
      ),
    [
      headerFilteredRecords,
      currentTimeMinutes,
      activeNpsInvitations,
      effectiveEvalWeekday,
    ]
  );

  const hasValidStudentFrequency = hasFrequencyData(
    kpis.presencaCount,
    kpis.faltaCount
  );
  const isGlobalFreqSatisfactory = kpis.mediaFrequencia >= 85;

  // Registros finais do Kanban de Alunos
  const activeStudentRecords = useMemo(() => {
    if (statusFilter === 'TODOS') return headerFilteredRecords;
    if (statusFilter === 'EVASAO') {
      return headerFilteredRecords.filter((r) => r.isEvasao);
    }
    if (statusFilter === 'FALTA_PENDENTE') {
      return headerFilteredRecords.filter((r) => r.isPendingNextDayAbsence);
    }
    if (isNotStartedAttendanceStatus(statusFilter)) {
      return headerFilteredRecords.filter((r) =>
        isNotStartedAttendanceStatus(r.attendanceStatus)
      );
    }
    return headerFilteredRecords.filter(
      (r) => r.attendanceStatus === statusFilter
    );
  }, [headerFilteredRecords, statusFilter]);

  // Colunas do Kanban de Alunos por horário
  const studentKanbanColumns = useMemo(
    () =>
      groupByHourKanban(
        activeStudentRecords,
        'AGENDADO',
        currentTimeMinutes,
        {},
        activeNpsInvitations,
        effectiveEvalWeekday
      ),
    [
      activeStudentRecords,
      currentTimeMinutes,
      activeNpsInvitations,
      effectiveEvalWeekday,
    ]
  );

  // === DADOS SINCRONIZADOS DA ABA KANBAN NPS ===
  const synchronizedNpsStudentCards = useMemo(
    () =>
      buildSynchronizedNpsStudentCards(
        activeNpsInvitations,
        allEvaluatedRecords,
        npsReferenceYear,
        npsDiaSemana !== 'TODOS' ? npsDiaSemana : undefined,
        currentTimeMinutes
      ),
    [
      activeNpsInvitations,
      allEvaluatedRecords,
      npsReferenceYear,
      npsDiaSemana,
      currentTimeMinutes,
    ]
  );

  // Cards do dia selecionado (para opções de horário e denominador do card de convites)
  const npsDayFilteredCards = useMemo(() => {
    if (npsDiaSemana === 'TODOS') return synchronizedNpsStudentCards;
    return filterSynchronizedNpsCards(synchronizedNpsStudentCards, {
      search: '',
      origem: 'TODAS',
      pontoJornada: 'TODOS',
      horario: 'TODOS',
      diaSemana: npsDiaSemana,
      emailDeliveryStatus: 'TODOS',
      destinatarioFilter: 'TODOS',
    });
  }, [synchronizedNpsStudentCards, npsDiaSemana]);

  // Opções de horários dos alunos elegíveis no NPS no dia selecionado
  const npsHorarioOptions = useMemo(() => {
    const hours = new Set<number>();
    for (const card of npsDayFilteredCards) {
      hours.add(card.linkedHourNumber);
    }
    return Array.from(hours)
      .sort((a, b) => a - b)
      .map((h) => `${String(h).padStart(2, '0')}h`);
  }, [npsDayFilteredCards]);

  // Cards de alunos NPS filtrados (conectados à barra de pesquisa única do cabeçalho)
  const npsFilteredCards = useMemo(() => {
    const criteria: NpsFilterCriteria = {
      search: globalSearchQuery,
      origem: npsOrigem,
      pontoJornada: npsPontoJornada,
      horario: npsHorario,
      diaSemana: npsDiaSemana,
      emailDeliveryStatus: npsDeliveryStatus,
      destinatarioFilter: npsDestinatarioFilter,
    };
    return filterSynchronizedNpsCards(synchronizedNpsStudentCards, criteria);
  }, [
    synchronizedNpsStudentCards,
    globalSearchQuery,
    npsOrigem,
    npsPontoJornada,
    npsHorario,
    npsDiaSemana,
    npsDeliveryStatus,
    npsDestinatarioFilter,
  ]);

  // Indicadores de resumo da aba NPS com cross-filtering para não zerar cards irmãos ao filtrar
  const npsKPIs = useMemo(() => {
    const baseKPIs = computeNpsSummaryKPIs(npsFilteredCards);
    const byOrigemPool = filterSynchronizedNpsCards(synchronizedNpsStudentCards, {
      search: globalSearchQuery,
      origem: 'TODAS',
      pontoJornada: npsPontoJornada,
      horario: npsHorario,
      diaSemana: npsDiaSemana,
      emailDeliveryStatus: npsDeliveryStatus,
      destinatarioFilter: npsDestinatarioFilter,
    });
    const origemKPIs = computeNpsSummaryKPIs(byOrigemPool);

    const byDestinatarioPool = filterSynchronizedNpsCards(
      synchronizedNpsStudentCards,
      {
        search: globalSearchQuery,
        origem: npsOrigem,
        pontoJornada: npsPontoJornada,
        horario: npsHorario,
        diaSemana: npsDiaSemana,
        emailDeliveryStatus: npsDeliveryStatus,
        destinatarioFilter: 'TODOS',
      }
    );
    const destinatarioKPIs = computeNpsSummaryKPIs(byDestinatarioPool);

    const byDeliveryPool = filterSynchronizedNpsCards(
      synchronizedNpsStudentCards,
      {
        search: globalSearchQuery,
        origem: npsOrigem,
        pontoJornada: npsPontoJornada,
        horario: npsHorario,
        diaSemana: npsDiaSemana,
        emailDeliveryStatus: 'TODOS',
        destinatarioFilter: npsDestinatarioFilter,
      }
    );
    const deliveryKPIs = computeNpsSummaryKPIs(byDeliveryPool);

    return {
      ...baseKPIs,
      portalDoAlunoCount: origemKPIs.portalDoAlunoCount,
      emailCount: origemKPIs.emailCount,
      destinatarioAlunoCount: destinatarioKPIs.destinatarioAlunoCount,
      destinatarioResponsavelCount: destinatarioKPIs.destinatarioResponsavelCount,
      emailAbertoCount: deliveryKPIs.emailAbertoCount,
      emailEntregueCount: deliveryKPIs.emailEntregueCount,
      emailEnviadoCount: deliveryKPIs.emailEnviadoCount,
      emailNaoEntregueCount: deliveryKPIs.emailNaoEntregueCount,
    };
  }, [
    npsFilteredCards,
    synchronizedNpsStudentCards,
    globalSearchQuery,
    npsOrigem,
    npsPontoJornada,
    npsHorario,
    npsDiaSemana,
    npsDeliveryStatus,
    npsDestinatarioFilter,
  ]);

  // Relação de dia para as colunas do Kanban NPS (sincronizada com o dia de Brasília)
  const npsDayRelation = useMemo(() => {
    if (npsDiaSemana !== 'TODOS') {
      return compareWeekdayWithCurrent(npsDiaSemana, currentBrasiliaWeekday);
    }
    return 'CURRENT_DAY';
  }, [npsDiaSemana, currentBrasiliaWeekday]);

  // Colunas do Kanban NPS agrupadas pelo horário do aluno no Kanban
  const npsKanbanColumns = useMemo(
    () =>
      groupByNpsHourKanban(
        npsFilteredCards,
        currentTimeMinutes,
        npsDayRelation
      ),
    [npsFilteredCards, currentTimeMinutes, npsDayRelation]
  );

  // Aluno selecionado para o modal de detalhes (Kanban de Alunos)
  const selectedStudent = useMemo(() => {
    if (selectedStudentId === null) return null;
    return allEvaluatedRecords.find((r) => r.id === selectedStudentId) ?? null;
  }, [allEvaluatedRecords, selectedStudentId]);

  const selectedStudentHistory = useMemo(() => {
    if (!selectedStudent) return [];
    return allEvaluatedRecords.filter(
      (r) =>
        r.contrato === selectedStudent.contrato &&
        r.diaSemana === selectedStudent.diaSemana
    );
  }, [allEvaluatedRecords, selectedStudent]);

  // Card de NPS sincronizado em tempo real para o modal aberto
  const resolvedSelectedNpsStudentCard = useMemo(() => {
    if (!selectedNpsStudentCard) return null;
    return (
      synchronizedNpsStudentCards.find(
        (c) =>
          c.id === selectedNpsStudentCard.id ||
          c.controlId === selectedNpsStudentCard.controlId ||
          c.latestActiveInvitation.id ===
            selectedNpsStudentCard.latestActiveInvitation.id ||
          c.linkedContrato === selectedNpsStudentCard.linkedContrato
      ) || selectedNpsStudentCard
    );
  }, [synchronizedNpsStudentCards, selectedNpsStudentCard]);

  // Atualização otimista + sincronização de convite NPS (Reenvio de E-mail, Priorização no Portal ou Resposta no Portal)
  const handleNpsInvitationUpdated = useCallback(
    (
      inviteId: string,
      patch: Partial<ActiveNpsInvitation>,
      updatedContractEmail?: { contrato: string; email: string }
    ) => {
      setActiveNpsInvitations((prev) =>
        prev.map((inv) => {
          const isMatch =
            inv.id === inviteId || inv.controlId === inviteId;
          if (!isMatch) return inv;
          return {
            ...inv,
            ...patch,
          };
        })
      );
      const emailToSync = updatedContractEmail?.email || patch.email;
      const contractToSync = updatedContractEmail?.contrato || patch.contrato;
      if (emailToSync && contractToSync) {
        const cleanContract = String(contractToSync).trim();
        setRecords((prev) =>
          prev.map((r) =>
            String(r.contrato).trim() === cleanContract
              ? { ...r, email: emailToSync }
              : r
          )
        );
      }
      setLastSyncTimestamp(formatCurrentBrasiliaSyncTimestamp());
      syncPortalData();
    },
    [syncPortalData]
  );

  // Atualização explícita de causa de falta de material (Pilar 3)
  const handleMaterialCauseUpdated = useCallback(
    (contrato: string, causa: string) => {
      const cleanContract = String(contrato).trim();
      setRecords((prev) =>
        prev.map((r) =>
          String(r.contrato).trim() === cleanContract
            ? {
                ...r,
                causaFaltaMaterialExplicita: causa,
              }
            : r
        )
      );
      setLastSyncTimestamp(formatCurrentBrasiliaSyncTimestamp());
      syncPortalData();
    },
    [syncPortalData]
  );

  const toggleStatusFilter = (target: QuickCardFilter) => {
    triggerWithLoading(() => {
      setStatusFilter((prev) => (prev === target ? 'TODOS' : target));
    }, 'Filtrando cards por status...');
  };

  const hasActiveStudentFilters =
    Boolean(globalSearchQuery.trim()) ||
    selectedDiaSemana !== resolveDefaultWeekdayFilter() ||
    selectedSala !== 'TODAS' ||
    selectedEducador !== 'TODOS' ||
    selectedHorario !== 'TODOS' ||
    selectedModalidade !== 'TODAS' ||
    selectedApostila !== 'TODAS' ||
    selectedNpsFilter !== 'TODOS' ||
    selectedCourseCategory !== 'TODOS' ||
    selectedFinancialStatus !== 'TODOS' ||
    selectedFinalizacaoAntecipada ||
    statusFilter !== 'TODOS';

  const handleResetStudentFilters = () => {
    triggerWithLoading(() => {
      setGlobalSearchQuery('');
      setSelectedDiaSemana(resolveDefaultWeekdayFilter());
      setSelectedSala('TODAS');
      setSelectedEducador('TODOS');
      setSelectedHorario('TODOS');
      setSelectedModalidade('TODAS');
      setSelectedApostila('TODAS');
      setSelectedNpsFilter('TODOS');
      setSelectedCourseCategory('TODOS');
      setSelectedFinancialStatus('TODOS');
      setSelectedFinalizacaoAntecipada(false);
      setStatusFilter('TODOS');
    }, 'Restaurando filtros padrão do Kanban de Alunos...');
  };

  const hasActiveNpsFilters =
    Boolean(globalSearchQuery.trim()) ||
    npsDiaSemana !== resolveDefaultWeekdayFilter() ||
    npsOrigem !== 'TODAS' ||
    npsPontoJornada !== 'TODOS' ||
    npsHorario !== 'TODOS' ||
    npsDeliveryStatus !== 'TODOS' ||
    npsDestinatarioFilter !== 'TODOS';

  const handleResetNpsFilters = () => {
    triggerWithLoading(() => {
      setGlobalSearchQuery('');
      setNpsDiaSemana(resolveDefaultWeekdayFilter());
      setNpsOrigem('TODAS');
      setNpsPontoJornada('TODOS');
      setNpsHorario('TODOS');
      setNpsDeliveryStatus('TODOS');
      setNpsDestinatarioFilter('TODOS');
    }, 'Restaurando filtros padrão do Kanban NPS...');
  };

  const currentTimeStr = formatMinutesToHHMM(currentTimeMinutes);

  // Resultados rápidos de alunos para o dropdown inteligente da barra de pesquisa única no cabeçalho
  const headerQuickStudentMatches = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const byContract = new Map<string, typeof allEvaluatedRecords[number]>();
    for (const r of allEvaluatedRecords) {
      if (!byContract.has(r.contrato)) {
        byContract.set(r.contrato, r);
      }
    }
    return Array.from(byContract.values())
      .filter(
        (s) =>
          s.nomeCompleto.toLowerCase().includes(q) ||
          s.contrato.toLowerCase().includes(q) ||
          s.curso.toLowerCase().includes(q) ||
          (s.professor || '').toLowerCase().includes(q) ||
          (s.sala || '').toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [allEvaluatedRecords, globalSearchQuery]);

  // Resolução dinâmica e fidedigna do nome completo e cargo do usuário autenticado
  const resolvedUserFromRegistry = useMemo(() => {
    const targetLogin = (
      authSession?.login ||
      portalMeta.usuarioLogin ||
      ''
    ).toLowerCase();
    if (!targetLogin) return undefined;
    for (const school of schoolsRegistry) {
      const found = school.users.find(
        (u) => u.login.toLowerCase() === targetLogin
      );
      if (found) return found;
    }
    return undefined;
  }, [authSession?.login, portalMeta.usuarioLogin, schoolsRegistry]);

  const activeSchoolName = authSession
    ? authSession.role === 'ESCOLA'
      ? authSession.schoolName || portalMeta.unidade
      : 'PAINEL ADMINISTRADOR'
    : 'Gestão Pedagógica e Acadêmica';

  const activeUserFullName = !authSession
    ? portalMeta.usuarioNomeCompleto
    : authSession.role === 'ADMIN'
    ? authSession.nomeCompleto || DEFAULT_ADMIN_CREDENTIALS.nomeCompleto
    : !isGenericPlaceholderUserName(authSession.nomeCompleto)
    ? authSession.nomeCompleto
    : !isGenericPlaceholderUserName(portalMeta.usuarioNomeCompleto)
    ? portalMeta.usuarioNomeCompleto
    : !isGenericPlaceholderUserName(resolvedUserFromRegistry?.nomeCompleto)
    ? resolvedUserFromRegistry!.nomeCompleto
    : authSession.nomeCompleto || portalMeta.usuarioNomeCompleto;

  const activeUserRole = !authSession
    ? portalMeta.usuarioCargo
    : authSession.role === 'ADMIN'
    ? authSession.cargo || DEFAULT_ADMIN_CREDENTIALS.cargo
    : authSession.cargo && authSession.cargo !== 'Coordenação Pedagógica'
    ? authSession.cargo
    : portalMeta.usuarioCargo ||
      resolvedUserFromRegistry?.cargo ||
      authSession.cargo ||
      'Auxiliar Pedagógico';

  const activeUserLogin = authSession?.login || portalMeta.usuarioLogin;

  // Se a página de Privacidade e Proteção de Dados (LGPD) estiver ativa, renderiza a página dedicada
  if (showPrivacyPage) {
    return (
      <ToastProvider>
        <PrivacyProtectionView
          onBack={() => setShowPrivacyPage(false)}
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogout={authSession ? handleLogout : undefined}
          activeSchoolName={activeSchoolName}
          activeUserName={activeUserFullName}
          activeUserRole={activeUserRole}
          activeUserLogin={activeUserLogin}
        />
      </ToastProvider>
    );
  }

  // Se o usuário ainda não estiver autenticado no Painel de Login e Senha, exibe a tela de Login
  if (!authSession) {
    return (
      <ToastProvider>
        <LoginView
          schools={schoolsRegistry}
          onLoginSuccess={handleLoginSuccess}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenPrivacyPage={() => setShowPrivacyPage(true)}
        />
      </ToastProvider>
    );
  }

  if (isLoadingData && records.length === 0) {
    return (
      <ToastProvider>
        <div className="flex h-screen w-screen flex-col gap-4 overflow-hidden bg-[var(--bg-primary)] p-6 text-[var(--text-primary)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
              <span className="typo-subtitle font-bold">
                Sincronizando dados acadêmicos da unidade...
              </span>
            </div>
          </div>
          <KanbanBoardSkeleton />
        </div>
      </ToastProvider>
    );
  }

  const renderSidebarContent = (isCollapsedView: boolean) => (
    <div className="flex h-full flex-col justify-between">
      {/* Topo da Sidebar: Controle de Retração e Categorias com Transições Suaves */}
      <div className="flex flex-col gap-3 overflow-y-auto px-2.5 py-3">
        <div
          className={`flex items-center ${
            isCollapsedView ? 'justify-center' : 'justify-between px-1.5'
          }`}
        >
          {!isCollapsedView && (
            <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--text-secondary)]">
              Menu Principal
            </span>
          )}
          <button
            type="button"
            data-testid="sidebar-collapse-toggle"
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            title={isCollapsedView ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            className="btn-press hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] text-[var(--text-secondary)] transition-all duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] lg:inline-flex"
          >
            {isCollapsedView ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {authSession.role === 'ESCOLA' && (
          <>
            {/* Categoria 1: Monitoramento & Operação */}
            <div className="space-y-1">
              {!isCollapsedView && (
                <p className="px-2 text-[10px] font-bold tracking-wider uppercase text-[var(--text-secondary)]">
                  Monitoramento & Operação
                </p>
              )}
              <motion.button
                whileHover={{ x: isCollapsedView ? 0 : 3 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                type="button"
                data-testid="tab-kanban-alunos"
                aria-current={activeTab === 'KANBAN_ALUNOS' ? 'page' : undefined}
                onClick={() => {
                  triggerWithLoading(
                    () => setActiveTab('KANBAN_ALUNOS'),
                    'Carregando Kanban de Alunos...'
                  );
                  setIsMobileSidebarOpen(false);
                }}
                title={
                  isCollapsedView
                    ? `Kanban de Alunos (${headerFilteredRecords.length})`
                    : undefined
                }
                className={`sidebar-nav-item group relative flex w-full items-center ${
                  isCollapsedView ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2'
                } rounded-xl text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'KANBAN_ALUNOS'
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Kanban className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  {!isCollapsedView && <span className="truncate">Kanban de Alunos</span>}
                </span>
                {!isCollapsedView && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums transition-colors ${
                      activeTab === 'KANBAN_ALUNOS'
                        ? 'bg-white/20 text-white'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {headerFilteredRecords.length}
                  </span>
                )}
              </motion.button>

              <motion.button
                whileHover={{ x: isCollapsedView ? 0 : 3 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                type="button"
                data-testid="tab-kanban-nps"
                aria-current={activeTab === 'KANBAN_NPS' ? 'page' : undefined}
                onClick={() => {
                  triggerWithLoading(
                    () => setActiveTab('KANBAN_NPS'),
                    'Carregando Kanban NPS...'
                  );
                  setIsMobileSidebarOpen(false);
                }}
                title={
                  isCollapsedView
                    ? `Kanban NPS (${npsFilteredCards.length})`
                    : undefined
                }
                className={`sidebar-nav-item group relative flex w-full items-center ${
                  isCollapsedView ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2'
                } rounded-xl text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'KANBAN_NPS'
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Sparkles className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  {!isCollapsedView && <span className="truncate">Kanban NPS</span>}
                </span>
                {!isCollapsedView && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums transition-colors ${
                      activeTab === 'KANBAN_NPS'
                        ? 'bg-white/20 text-white'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {npsFilteredCards.length}
                  </span>
                )}
              </motion.button>

              <motion.button
                whileHover={{ x: isCollapsedView ? 0 : 3 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                type="button"
                data-testid="tab-dashboard"
                aria-current={activeTab === 'DASHBOARD' ? 'page' : undefined}
                onClick={() => {
                  triggerWithLoading(
                    () => setActiveTab('DASHBOARD'),
                    'Carregando Consolidado & Analytics...'
                  );
                  setIsMobileSidebarOpen(false);
                }}
                title={isCollapsedView ? 'Consolidado & Analytics' : undefined}
                className={`sidebar-nav-item group relative flex w-full items-center ${
                  isCollapsedView ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2'
                } rounded-xl text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'DASHBOARD'
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <LayoutDashboard className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  {!isCollapsedView && (
                    <span className="truncate">Consolidado & Analytics</span>
                  )}
                </span>
              </motion.button>
            </div>

            {/* Categoria 2: Acadêmico & Secretaria */}
            <div className="space-y-1 pt-1">
              {!isCollapsedView && (
                <p className="px-2 text-[10px] font-bold tracking-wider uppercase text-[var(--text-secondary)]">
                  Acadêmico & Secretaria
                </p>
              )}
              <div>
                <motion.button
                  whileHover={{ x: isCollapsedView ? 0 : 3 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                  type="button"
                  data-testid="tab-portal-aluno"
                  aria-current={activeTab === 'PORTAL_ALUNO' ? 'page' : undefined}
                  onClick={() => {
                    if (isCollapsedView) {
                      triggerWithLoading(() => {
                        setActiveTab('PORTAL_ALUNO');
                      }, 'Carregando Ficha Individual do Aluno...');
                      setIsMobileSidebarOpen(false);
                    } else {
                      if (activeTab === 'PORTAL_ALUNO') {
                        setIsAcademicSubmenuOpen((prev) => !prev);
                      } else {
                        setIsAcademicSubmenuOpen(true);
                        triggerWithLoading(() => {
                          setActiveTab('PORTAL_ALUNO');
                        }, 'Carregando Ficha Individual do Aluno...');
                      }
                    }
                  }}
                  title={isCollapsedView ? 'Ficha Individual do Aluno' : undefined}
                  className={`sidebar-nav-item group flex w-full items-center ${
                    isCollapsedView ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2'
                  } rounded-xl text-xs font-semibold transition-all duration-200 ${
                    activeTab === 'PORTAL_ALUNO'
                      ? 'bg-[var(--color-primary)] text-white shadow-sm'
                      : 'text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <GraduationCap className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                    {!isCollapsedView && <span className="truncate">Ficha Individual</span>}
                  </span>
                  {!isCollapsedView && (
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                        isAcademicSubmenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  )}
                </motion.button>

                <AnimatePresence initial={false}>
                  {!isCollapsedView && isAcademicSubmenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mt-1 ml-3 space-y-0.5 border-l border-[var(--border-color)] pl-2.5">
                        {(
                          [
                            { id: 'BOLETIM', label: 'Boletim Acadêmico', icon: FileSpreadsheet, testId: 'sidebar-subtab-boletim' },
                            { id: 'ACOMPANHAMENTO', label: 'Ficha de Acompanhamento', icon: BookOpen, testId: 'sidebar-subtab-acompanhamento' },
                            { id: 'CARTEIRINHA', label: 'Carteirinha Estudantil', icon: IdCard, testId: 'sidebar-subtab-carteirinha' },
                            { id: 'DECLARACAO', label: 'Declaração de Matrícula', icon: FileText, testId: 'sidebar-subtab-declaracao' },
                          ] as const
                        ).map((sub) => {
                          const SubIcon = sub.icon;
                          const isSubActive =
                            activeTab === 'PORTAL_ALUNO' && portalHubInitialSubTab === sub.id;
                          return (
                            <motion.button
                              key={sub.id}
                              whileHover={{ x: 3 }}
                              whileTap={{ scale: 0.98 }}
                              transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                              type="button"
                              data-testid={sub.testId}
                              onClick={() => {
                                setPortalHubInitialSubTab(sub.id);
                                setActiveTab('PORTAL_ALUNO');
                                setIsMobileSidebarOpen(false);
                              }}
                              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-200 ${
                                isSubActive
                                  ? 'bg-[var(--color-primary)]/12 font-semibold text-[var(--color-primary)] shadow-2xs'
                                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <SubIcon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{sub.label}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </>
        )}

        {/* Categoria 3: Gestão, Exportação & Governança */}
        <div className="space-y-1 pt-1">
          {!isCollapsedView && (
            <p className="px-2 text-[10px] font-bold tracking-wider uppercase text-[var(--text-secondary)]">
              Gestão & Governança
            </p>
          )}
          <motion.button
            whileHover={{ x: isCollapsedView ? 0 : 3 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            type="button"
            onClick={() => {
              setIsExportStudioOpen(true);
              setIsMobileSidebarOpen(false);
            }}
            title={isCollapsedView ? 'Estúdio de Exportação' : undefined}
            className={`group flex w-full items-center ${
              isCollapsedView ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2'
            } rounded-xl text-xs font-medium text-[var(--text-primary)] transition-all duration-200 hover:bg-[var(--bg-secondary)]`}
          >
            <Download className="h-4 w-4 shrink-0 text-[var(--color-primary)] transition-transform duration-200 group-hover:scale-110" />
            {!isCollapsedView && <span className="truncate">Estúdio de Exportação</span>}
          </motion.button>

          {authSession.role === 'ESCOLA' && (
            <motion.button
              whileHover={{ x: isCollapsedView ? 0 : 3 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              type="button"
              onClick={() => {
                setIsFilterDrawerOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              title={isCollapsedView ? 'Resumo de Filtros Ativos' : undefined}
              className={`group flex w-full items-center ${
                isCollapsedView ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2'
              } rounded-xl text-xs font-medium text-[var(--text-primary)] transition-all duration-200 hover:bg-[var(--bg-secondary)]`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Filter className="h-4 w-4 shrink-0 text-[var(--color-secondary)] transition-transform duration-200 group-hover:scale-110" />
                {!isCollapsedView && <span className="truncate">Painel de Filtros</span>}
              </span>
              {!isCollapsedView &&
                (hasActiveStudentFilters || hasActiveNpsFilters) && (
                  <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                )}
            </motion.button>
          )}

          <motion.button
            whileHover={{ x: isCollapsedView ? 0 : 3 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            type="button"
            onClick={() => {
              setShowPrivacyPage(true);
              setIsMobileSidebarOpen(false);
            }}
            title={isCollapsedView ? 'Privacidade e LGPD' : undefined}
            className={`group flex w-full items-center ${
              isCollapsedView ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2'
            } rounded-xl text-xs font-medium text-[var(--text-primary)] transition-all duration-200 hover:bg-[var(--bg-secondary)]`}
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500 transition-transform duration-200 group-hover:scale-110" />
            {!isCollapsedView && <span className="truncate">Privacidade & LGPD</span>}
          </motion.button>
        </div>
      </div>

      {/* Rodapé da Sidebar: Identificação Institucional do Operador (sem botões duplicados de Tema ou Sair) */}
      <div className="border-t border-[var(--border-color)] p-2.5">
        <div
          className={`flex items-center ${
            isCollapsedView ? 'justify-center' : 'justify-between gap-2'
          } rounded-xl bg-[var(--bg-secondary)]/70 p-2`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <SmartAvatar
              name={activeUserFullName || 'Operador Microlins'}
              status="success"
              size="sm"
            />
            {!isCollapsedView && (
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-[var(--text-primary)]">
                  {activeUserFullName}
                </p>
                <p className="truncate text-[10px] font-medium text-[var(--text-secondary)]">
                  {activeUserRole} · #{activeUserLogin}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <div
        data-theme-mode={theme}
        className="flex h-screen w-full max-w-[100vw] flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors duration-200"
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-[#2563EB] focus:px-4 focus:py-2 focus:text-xs focus:font-bold focus:text-white focus:shadow-lg"
        >
          Pular para o conteúdo principal
        </a>

        {/* REGIÃO 1: CABEÇALHO PADRONIZADO — IDENTIFICAÇÃO, BARRA DE PESQUISA ÚNICA E AÇÕES DO USUÁRIO */}
        <header
          data-testid="main-header"
          className="shrink-0 border-b border-[#00386B] bg-[#004A8D] text-white shadow-2xs dark:border-slate-800 dark:bg-[#0F172A]"
        >
          <div className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 sm:gap-3 sm:px-4 lg:flex-nowrap">
            {/* Esquerda: Botão Mobile Sidebar + Logo Oficial da Microlins + Nome da Escola */}
            <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                aria-label="Abrir menu lateral"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/10 text-white hover:bg-white/20 lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <img
                src="/assets/aistudio/logo-microlins_6400203f.png"
                alt="Microlins"
                className="h-4 sm:h-5 w-auto shrink-0 object-contain brightness-0 invert"
                data-testid="header-microlins-logo"
              />
              <div className="hidden h-4 w-px bg-white/20 sm:block" />
              <div className="flex min-w-0 items-center gap-1 sm:gap-1.5">
                <Building2 className="hidden h-3.5 w-3.5 shrink-0 text-sky-200 min-[380px]:block" />
                <span
                  data-testid="header-school-name"
                  className="max-w-[120px] min-[380px]:max-w-[160px] sm:max-w-[210px] truncate text-[11px] sm:text-xs font-bold tracking-tight text-white xl:max-w-[250px]"
                >
                  {activeSchoolName}
                </span>
              </div>
            </div>

            {/* Centro: Barra de Pesquisa Única e Exclusiva do Sistema */}
            <div
              ref={headerSearchContainerRef}
              className="order-3 relative w-full max-w-full flex-1 lg:order-2 lg:mx-4 lg:max-w-xl"
            >
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-sky-200" />
                <input
                  ref={headerSearchInputRef}
                  id="header-global-search-input"
                  data-testid="header-global-search-input"
                  type="search"
                  value={globalSearchQuery}
                  onFocus={() => setIsHeaderSearchDropdownOpen(true)}
                  onChange={(e) => {
                    setGlobalSearchQuery(e.target.value);
                    setIsHeaderSearchDropdownOpen(true);
                  }}
                  placeholder={
                    authSession.role === 'ADMIN'
                      ? 'Pesquisar escola, código da unidade, cidade ou usuário...'
                      : 'Pesquisar aluno, contrato, curso, educador ou sala... (Ctrl+K)'
                  }
                  aria-label="Pesquisa global do sistema"
                  className="h-8 w-full rounded-lg border border-white/20 bg-[#003669]/90 pl-8 pr-16 text-xs text-white placeholder:text-sky-200/75 focus:border-sky-300 focus:bg-[#002D5A] focus:outline-none dark:border-slate-700 dark:bg-slate-900/90 dark:focus:border-sky-400"
                />
                {globalSearchQuery ? (
                  <button
                    type="button"
                    data-testid="header-global-search-clear"
                    onClick={() => {
                      setGlobalSearchQuery('');
                      headerSearchInputRef.current?.focus();
                    }}
                    title="Limpar pesquisa"
                    className="absolute right-2 inline-flex h-5 w-5 items-center justify-center rounded text-sky-200 hover:bg-white/15 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <kbd className="pointer-events-none absolute right-2 hidden rounded border border-white/15 bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-sky-200 sm:inline-block">
                    Ctrl K
                  </kbd>
                )}
              </div>

              {/* Dropdown de Acesso Rápido a Alunos e Documentos */}
              {authSession.role === 'ESCOLA' &&
                isHeaderSearchDropdownOpen &&
                globalSearchQuery.trim().length > 0 && (
                  <div
                    data-testid="header-search-results-dropdown"
                    className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 px-2 pb-1.5 text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:border-slate-800">
                      <span>
                        Filtro ativo no módulo atual · Acesso Rápido a Alunos ({headerQuickStudentMatches.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsHeaderSearchDropdownOpen(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        Fechar
                      </button>
                    </div>
                    {headerQuickStudentMatches.length === 0 ? (
                      <p className="px-2 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                        Nenhum aluno encontrado pelo termo &ldquo;{globalSearchQuery}&rdquo;.
                      </p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        {headerQuickStudentMatches.map((st) => (
                          <div
                            key={st.contrato}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/80"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (activeTab === 'PORTAL_ALUNO') {
                                  setPortalHubStudentId(st.id);
                                } else {
                                  setSelectedStudentId(st.id);
                                }
                                setIsHeaderSearchDropdownOpen(false);
                              }}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                                {st.nomeCompleto}
                              </p>
                              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                Contrato #{st.contrato} · {st.curso} · {st.diaSemana} ({st.horaInicio})
                              </p>
                            </button>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setPortalHubStudentId(st.id);
                                  setActiveTab('PORTAL_ALUNO');
                                  setIsHeaderSearchDropdownOpen(false);
                                }}
                                className="rounded-md bg-[#004A8D] px-2 py-1 text-[10px] font-bold text-white hover:bg-[#00386B]"
                              >
                                Ficha Individual
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
            </div>

            {/* Direita: Sincronização Compacta + Nome e Cargo Reais do Usuário + Tema + Sair */}
            <div className="order-2 flex shrink-0 items-center gap-1.5 lg:order-3">
              {enteredSchoolFromAdmin && authSession.role !== 'ADMIN' && (
                <button
                  type="button"
                  data-testid="header-back-to-admin-btn"
                  onClick={() =>
                    setAuthSession((prev) => ({
                      role: 'ADMIN',
                      login: DEFAULT_ADMIN_CREDENTIALS.login,
                      nomeCompleto: DEFAULT_ADMIN_CREDENTIALS.nomeCompleto,
                      cargo: DEFAULT_ADMIN_CREDENTIALS.cargo,
                      sessionToken: prev?.sessionToken,
                    }))
                  }
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-300/40 bg-amber-500/20 px-2 text-[11px] font-bold text-amber-100 whitespace-nowrap transition-colors hover:bg-amber-500/30"
                >
                  <KeyRound className="h-3 w-3 text-amber-300" />
                  <span>Painel ADM</span>
                </button>
              )}

              <div
                data-testid="sync-status-badge"
                className="hidden items-center gap-1 text-[11px] font-medium text-emerald-200 xl:inline-flex"
                title="Integração Portal do Aluno e Indecx NPS ativa"
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-300" />
                <span className="sr-only 2xl:not-sr-only">Sincronizado</span>
              </div>

              <div
                data-testid="sync-timestamp-badge"
                className="hidden items-center gap-1 text-[11px] text-sky-200 tabular-nums whitespace-nowrap xl:inline-flex"
                title={`Horário oficial de Brasília: ${lastSyncTimestamp}`}
              >
                <Clock className="h-3 w-3 text-sky-300" />
                <span>{lastSyncTimestamp}</span>
              </div>

              <div className="hidden h-3.5 w-px bg-white/15 xl:block" />

              <div
                data-testid="header-user-session-info"
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/15 bg-[#003669] px-2.5 text-[11px] text-sky-100 whitespace-nowrap"
                title={`${activeUserFullName} · ${activeUserRole} (#${activeUserLogin})`}
              >
                <UserCheck className="h-3 w-3 shrink-0 text-sky-200" />
                <span
                  data-testid="header-user-fullname"
                  className="max-w-[130px] sm:max-w-[190px] truncate font-semibold text-white"
                >
                  {activeUserFullName}
                </span>
                <span
                  data-testid="header-user-role"
                  className="hidden sm:inline-flex items-center gap-1 text-[11px] text-sky-200"
                >
                  <span>· {activeUserRole}</span>
                  <span className="hidden md:inline text-sky-300/80">
                    (#{activeUserLogin})
                  </span>
                </span>
              </div>

              <button
                type="button"
                data-testid="theme-toggle-button"
                onClick={toggleTheme}
                aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
                title={theme === 'light' ? 'Alternar para o Tema Escuro' : 'Alternar para o Tema Claro'}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                {theme === 'light' ? (
                  <Moon className="h-3.5 w-3.5 text-sky-100" />
                ) : (
                  <Sun className="h-3.5 w-3.5 text-amber-300" />
                )}
              </button>

              <button
                type="button"
                data-testid="header-logout-btn"
                onClick={handleLogout}
                title="Sair da plataforma"
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-rose-300/30 bg-rose-500/20 px-2 sm:px-2.5 text-[11px] font-bold text-rose-100 whitespace-nowrap transition-colors hover:bg-rose-500/35"
              >
                <LogOut className="h-3 w-3 text-rose-200" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </header>

      {/* CORPO PRINCIPAL: SIDEBAR INTELIGENTE RETRÁTIL + COLUNA DE CONTEÚDO */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar Desktop Retrátil com Glassmorphism */}
        <aside
          data-testid="smart-sidebar"
          aria-label="Menu Lateral Inteligente"
          className={`glass-sidebar hidden shrink-0 transition-all duration-300 lg:block ${
            isSidebarCollapsed ? 'w-[74px]' : 'w-[268px]'
          }`}
        >
          {renderSidebarContent(isSidebarCollapsed)}
        </aside>

        {/* Sidebar Mobile Drawer */}
        <AnimatePresence>
          {isMobileSidebarOpen && (
            <div className="fixed inset-0 z-50 flex lg:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileSidebarOpen(false)}
                className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
              />
              <motion.aside
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                className="glass-sidebar relative z-10 flex h-full w-[268px] flex-col"
              >
                <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2.5">
                  <span className="typo-subtitle font-bold text-[var(--text-primary)]">
                    Navegação Microlins
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  {renderSidebarContent(false)}
                </div>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        {/* Coluna Direita Principal */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Se o usuário logado estiver no PERFIL ADMINISTRADOR, renderiza o Painel Administrador */}
          {authSession.role === 'ADMIN' ? (
            <main id="main-content" className="min-h-0 flex-1 overflow-y-auto">
              <AdminPanelView
                schools={schoolsRegistry}
                onSchoolsChange={setSchoolsRegistry}
                sessionToken={authSession.sessionToken}
                externalSearchQuery={globalSearchQuery}
                onAccessSchoolAsProfile={(schoolSession) => {
                  setAuthSession({
                    ...schoolSession,
                    sessionToken: authSession.sessionToken,
                  });
                  setEnteredSchoolFromAdmin(true);
                  setPortalMeta((prev) => ({
                    ...prev,
                    unidade: schoolSession.schoolName || prev.unidade,
                    usuarioLogin: schoolSession.login,
                    usuarioNomeCompleto: schoolSession.nomeCompleto,
                    usuarioCargo: schoolSession.cargo,
                  }));
                }}
              />
            </main>
          ) : (
            <>
              {/* REGIÃO 2: ÁREA DE FILTROS PADRONIZADA EM 2 LINHAS */}
              {activeTab !== 'DASHBOARD' && activeTab !== 'PORTAL_ALUNO' && (
                <section
                  aria-label="Filtros do painel ativo"
                  data-testid="filters-section"
                  className="glass-panel shrink-0 border-b border-[var(--border-color)] px-3 py-1.5 transition-colors sm:px-5"
                >
                  {activeTab === 'KANBAN_ALUNOS' ? (
                    /* 9 controles distribuídos em 5 colunas x 2 linhas */
                    <div
                      data-testid="filters-row-1"
                      className="grid grid-cols-2 gap-1.5 sm:grid-cols-5"
                    >
                  {/* Linha 1 - Col 1: Dia da Semana */}
                  <div className="relative">
                    <label htmlFor="filter-dia-semana" className="sr-only">
                      Dia da Semana
                    </label>
                    <Calendar className="pointer-events-none absolute left-2 top-2 h-3 w-3 text-[#004A8D] dark:text-sky-400" />
                    <select
                      id="filter-dia-semana"
                      aria-label="Dia da Semana"
                      value={selectedDiaSemana}
                      onChange={(e) => {
                        const val = e.target.value;
                        triggerWithLoading(
                          () => setSelectedDiaSemana(val),
                          'Atualizando Kanban para o dia selecionado...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 pl-6 pr-2 text-slate-800 transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODOS">Dia: Todos os dias</option>
                      {WEEKDAY_FILTER_OPTIONS.map((dia) => (
                        <option key={dia} value={dia}>
                          Dia: {dia}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Linha 1 - Col 2: Categoria do Curso */}
                  <div className="relative">
                    <label htmlFor="filter-categoria-curso" className="sr-only">
                      Categoria do Curso
                    </label>
                    <GraduationCap className="pointer-events-none absolute left-2 top-2 h-3 w-3 text-[#004A8D] dark:text-sky-400" />
                    <select
                      id="filter-categoria-curso"
                      data-testid="filter-categoria-curso"
                      aria-label="Categoria do Curso"
                      value={selectedCourseCategory}
                      onChange={(e) => {
                        const val = e.target.value as CourseCategoryFilterType;
                        triggerWithLoading(
                          () => setSelectedCourseCategory(val),
                          'Filtrando alunos por categoria de curso...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 pl-6 pr-2 text-slate-800 transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODOS">Categoria: Todas</option>
                      <option value="INGLÊS">Categoria: Inglês</option>
                      <option value="PROFISSIONALIZANTE">
                        Categoria: Profissionalizante
                      </option>
                    </select>
                  </div>

                  {/* Linha 1 - Col 3: Sala */}
                  <div>
                    <label htmlFor="filter-sala" className="sr-only">
                      Sala
                    </label>
                    <select
                      id="filter-sala"
                      aria-label="Sala"
                      value={selectedSala}
                      onChange={(e) => {
                        const val = e.target.value;
                        triggerWithLoading(
                          () => setSelectedSala(val),
                          'Filtrando alunos por sala...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 px-2.5 text-slate-800 transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODAS">
                        Sala: Todas ({salaOptions.length})
                      </option>
                      {salaOptions.map((sala) => (
                        <option key={sala} value={sala}>
                          Sala: {sala}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Linha 1 - Col 4: Educador (Seção 10.1) */}
                  <div className="relative">
                    <label htmlFor="filter-educador" className="sr-only">
                      Educador
                    </label>
                    <UserCheck className="pointer-events-none absolute left-2 top-2 h-3 w-3 text-[#004A8D] dark:text-sky-400" />
                    <select
                      id="filter-educador"
                      data-testid="kanban-educador-filter"
                      aria-label="Educador"
                      value={selectedEducador}
                      onChange={(e) => {
                        const val = e.target.value;
                        triggerWithLoading(
                          () => setSelectedEducador(val),
                          'Filtrando alunos por educador...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 pl-6 pr-2 text-slate-800 transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODOS">
                        Educador: Todos ({educadorOptions.length})
                      </option>
                      {educadorOptions.map((prof) => (
                        <option key={prof} value={prof}>
                          Educador: {prof}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Linha 1 - Col 5: Horário */}
                  <div>
                    <label htmlFor="filter-horario" className="sr-only">
                      Horário
                    </label>
                    <select
                      id="filter-horario"
                      aria-label="Horário"
                      value={selectedHorario}
                      onChange={(e) => {
                        const val = e.target.value;
                        triggerWithLoading(
                          () => setSelectedHorario(val),
                          'Filtrando alunos por horário...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 px-2.5 text-slate-800 tabular-nums transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODOS">
                        Horário: Todos ({horarioOptions.length})
                      </option>
                      {horarioOptions.map((h) => (
                        <option key={h} value={h}>
                          Horário: {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Linha 2 - Col 1: Finalização Antecipada */}
                  <div className="relative">
                    <label
                      htmlFor="filter-finalizacao-antecipada"
                      className="sr-only"
                    >
                      Finalização Antecipada
                    </label>
                    <Clock className="pointer-events-none absolute left-2 top-2 h-3 w-3 text-orange-600 dark:text-orange-400" />
                    <select
                      id="filter-finalizacao-antecipada"
                      data-testid="filter-finalizacao-antecipada"
                      aria-label="Filtro de Finalização Antecipada"
                      value={selectedFinalizacaoAntecipada ? 'ANTECIPADA' : 'TODOS'}
                      onChange={(e) => {
                        const isAntecipada = e.target.value === 'ANTECIPADA';
                        triggerWithLoading(
                          () => setSelectedFinalizacaoAntecipada(isAntecipada),
                          'Filtrando alunos com finalização antecipada...'
                        );
                      }}
                      className={`typo-control h-7 w-full rounded-md border pl-6 pr-2 transition-colors focus:outline-none ${
                        selectedFinalizacaoAntecipada
                          ? 'border-orange-500 bg-orange-50 font-semibold text-orange-900 dark:border-orange-700 dark:bg-orange-950/60 dark:text-orange-200 dark:focus:bg-orange-950/60'
                          : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:border-slate-300 focus:border-[#004A8D] focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800'
                      }`}
                    >
                      <option value="TODOS">Finalização: Todas</option>
                      <option value="ANTECIPADA">Finalização Antecipada</option>
                    </select>
                  </div>

                  {/* Linha 2 - Col 2: Situação Financeira */}
                  <div className="relative">
                    <label
                      htmlFor="filter-situacao-financeira"
                      className="sr-only"
                    >
                      Situação Financeira
                    </label>
                    <DollarSign className="pointer-events-none absolute left-2 top-2 h-3 w-3 text-amber-600 dark:text-amber-400" />
                    <select
                      id="filter-situacao-financeira"
                      aria-label="Situação Financeira"
                      value={selectedFinancialStatus}
                      onChange={(e) => {
                        const val = e.target.value as FinancialFilterType;
                        triggerWithLoading(
                          () => setSelectedFinancialStatus(val),
                          'Filtrando alunos por situação financeira...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 pl-6 pr-2 text-slate-800 transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODOS">Financeiro: Todos</option>
                      <option value="EM_DIA">Financeiro: Em dia</option>
                      <option value="EM_ATRASO">Financeiro: Em atraso</option>
                    </select>
                  </div>

                  {/* Linha 2 - Col 3: Apostila */}
                  <div className="relative">
                    <label htmlFor="filter-apostila" className="sr-only">
                      Filtro de Apostila
                    </label>
                    <BookOpen className="pointer-events-none absolute left-2 top-2 h-3 w-3 text-[#004A8D] dark:text-sky-400" />
                    <select
                      id="filter-apostila"
                      aria-label="Filtro de Apostila"
                      value={selectedApostila}
                      onChange={(e) => {
                        const val = e.target.value as ApostilaFilterType;
                        triggerWithLoading(
                          () => setSelectedApostila(val),
                          'Filtrando alunos por situação de apostila...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 pl-6 pr-2 text-slate-800 transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODAS">Apostila: Todas</option>
                      <option value="COM_APOSTILA">Apostila: Entregue</option>
                      <option value="SEM_APOSTILA">
                        Apostila: Não entregue
                      </option>
                    </select>
                  </div>

                  {/* Linha 2 - Col 4: Convite NPS */}
                  <div className="relative">
                    <label htmlFor="filter-nps-aluno" className="sr-only">
                      Filtro de Convite NPS
                    </label>
                    <Sparkles className="pointer-events-none absolute left-2 top-2 h-3 w-3 text-[#004A8D] dark:text-sky-400" />
                    <select
                      id="filter-nps-aluno"
                      aria-label="Filtro de Convite NPS"
                      value={selectedNpsFilter}
                      onChange={(e) => {
                        const val = e.target.value as StudentNpsFilterType;
                        triggerWithLoading(
                          () => setSelectedNpsFilter(val),
                          'Filtrando alunos por convite de NPS...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 pl-6 pr-2 text-slate-800 transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODOS">NPS: Todos</option>
                      <option value="COM_NPS">NPS: Possui NPS</option>
                      <option value="SEM_NPS">NPS: Sem NPS</option>
                    </select>
                  </div>

                  {/* Linha 2 - Col 5: Limpar Filtros */}
                  <button
                    type="button"
                    data-testid="reset-student-filters"
                    onClick={handleResetStudentFilters}
                    disabled={!hasActiveStudentFilters}
                    title="Restaurar filtros padrão"
                    className={`typo-btn col-span-2 inline-flex h-7 items-center justify-center gap-1.5 rounded-md border px-2.5 transition-colors sm:col-span-1 ${
                      hasActiveStudentFilters
                        ? 'border-slate-300 bg-white text-slate-700 hover:border-[#004A8D] hover:bg-sky-50/60 hover:text-[#004A8D] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                        : 'cursor-not-allowed border-slate-200/70 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600'
                    }`}
                  >
                    <RotateCcw className="h-3 w-3 shrink-0" />
                    <span>Limpar filtros</span>
                  </button>
                </div>
              ) : (
                /* 6 controles do Kanban NPS distribuídos em 3 colunas x 2 linhas */
                <div
                  data-testid="nps-filters-row-1"
                  className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
                >
                  <div className="relative">
                    <label htmlFor="filter-nps-dia" className="sr-only">
                      Dia da Semana no Kanban
                    </label>
                    <Calendar className="pointer-events-none absolute left-2.5 top-2 h-3 w-3 text-[#004A8D] dark:text-sky-400" />
                    <select
                      id="filter-nps-dia"
                      aria-label="Dia da Semana no Kanban"
                      value={npsDiaSemana}
                      onChange={(e) => {
                        const val = e.target.value;
                        triggerWithLoading(
                          () => setNpsDiaSemana(val),
                          'Atualizando Kanban NPS para o dia selecionado...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 pl-7 pr-2 text-slate-800 transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODOS">Dia: Todos os dias</option>
                      {WEEKDAY_FILTER_OPTIONS.map((dia) => (
                        <option key={dia} value={dia}>
                          Dia: {dia}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="filter-nps-horario" className="sr-only">
                      Horário do Aluno no Kanban
                    </label>
                    <select
                      id="filter-nps-horario"
                      aria-label="Horário do Aluno no Kanban"
                      value={npsHorario}
                      onChange={(e) => {
                        const val = e.target.value;
                        triggerWithLoading(
                          () => setNpsHorario(val),
                          'Filtrando convites NPS por horário...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 px-2.5 text-slate-800 tabular-nums transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODOS">
                        Horário: Todos ({npsHorarioOptions.length})
                      </option>
                      {npsHorarioOptions.map((h) => (
                        <option key={h} value={h}>
                          Horário: {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="filter-nps-origem" className="sr-only">
                      Canal de Origem NPS
                    </label>
                    <select
                      id="filter-nps-origem"
                      aria-label="Canal de Origem da pesquisa NPS"
                      value={npsOrigem}
                      onChange={(e) => {
                        const val = e.target.value as 'TODAS' | NpsOrigemType;
                        triggerWithLoading(
                          () => setNpsOrigem(val),
                          'Filtrando convites NPS por canal de origem...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 px-2.5 text-slate-800 transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODAS">Canal: Todos os canais</option>
                      <option value="Portal do Aluno">
                        Canal: Portal do Aluno
                      </option>
                      <option value="E-mail">Canal: E-mail</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="filter-nps-entrega" className="sr-only">
                      Status de Envio do Convite NPS
                    </label>
                    <select
                      id="filter-nps-entrega"
                      aria-label="Status de Envio do Convite NPS"
                      value={npsDeliveryStatus}
                      onChange={(e) => {
                        const val = e.target.value as
                          | 'TODOS'
                          | NpsEmailDeliveryStatusType;
                        triggerWithLoading(
                          () => setNpsDeliveryStatus(val),
                          'Filtrando convites NPS por status de envio...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 px-2.5 text-slate-800 transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODOS">Status de envio: Todos</option>
                      <option value="Enviado">Status de envio: Enviado</option>
                      <option value="Entregue">Status de envio: Entregue</option>
                      <option value="Aberto">Status de envio: Aberto</option>
                      <option value="Não entregue">
                        Status de envio: Não entregue
                      </option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="filter-nps-jornada" className="sr-only">
                      Ciclo da Pesquisa NPS
                    </label>
                    <select
                      id="filter-nps-jornada"
                      data-testid="filter-nps-jornada"
                      aria-label="Ciclo da Pesquisa NPS"
                      value={npsPontoJornada}
                      onChange={(e) => {
                        const val = e.target.value;
                        triggerWithLoading(
                          () => setNpsPontoJornada(val),
                          'Filtrando convites NPS por ciclo de jornada...'
                        );
                      }}
                      className="typo-control h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 px-2.5 text-slate-800 transition-colors hover:border-slate-300 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:bg-slate-800"
                    >
                      <option value="TODOS">Ciclo: Todos os ciclos</option>
                      {ALL_NPS_CYCLES.map((ciclo) => (
                        <option key={ciclo} value={ciclo}>
                          Ciclo: {ciclo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    data-testid="reset-nps-filters"
                    onClick={handleResetNpsFilters}
                    disabled={!hasActiveNpsFilters}
                    title="Restaurar filtros NPS"
                    className={`typo-btn inline-flex h-7 items-center justify-center gap-1.5 rounded-md border px-3 transition-colors ${
                      hasActiveNpsFilters
                        ? 'border-slate-300 bg-white text-slate-700 hover:border-[#004A8D] hover:bg-sky-50/60 hover:text-[#004A8D] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                        : 'cursor-not-allowed border-slate-200/70 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600'
                    }`}
                  >
                    <RotateCcw className="h-3 w-3 shrink-0" />
                    <span>Limpar filtros</span>
                  </button>
                </div>
              )}
            </section>
          )}

          {/* REGIÃO 3: CARDS DE RESUMO PADRONIZADOS */}
          {activeTab !== 'DASHBOARD' && activeTab !== 'PORTAL_ALUNO' && (
            <section
              aria-label={
                activeTab === 'KANBAN_ALUNOS'
                  ? 'Indicadores e filtros de status de Alunos'
                  : 'Indicadores de convites NPS ativos sincronizados'
              }
              data-testid="summary-cards-section"
              className="shrink-0 border-b border-slate-200/80 bg-slate-50/95 px-3 py-1.5 transition-colors sm:px-5 dark:border-slate-800 dark:bg-slate-900/80"
            >
              {activeTab === 'KANBAN_ALUNOS' ? (
                /* 6 Cards organizados em 2 linhas de 3 cards (grid-cols-3) com ícone (?) explicativo */
                <div
                  data-testid="student-summary-cards-grid"
                  className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
                >
                  {/* Linha 1 - Card 1: Presenças */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleStatusFilter('Presença')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleStatusFilter('Presença');
                      }
                    }}
                    aria-pressed={statusFilter === 'Presença'}
                    className={`flex h-8 cursor-pointer items-center justify-between rounded-md border px-2.5 text-left transition-all duration-150 ${
                      statusFilter === 'Presença'
                        ? 'border-emerald-500 bg-emerald-50/90 ring-1 ring-emerald-500/25 dark:border-emerald-500 dark:bg-emerald-950/60'
                        : 'border-slate-200/90 bg-white hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-700'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="typo-subtitle truncate text-slate-700 whitespace-nowrap dark:text-slate-200">
                        Presenças
                      </span>
                      <IndicatorHelpPopover indicatorId="kanban_presencas" />
                    </div>
                    <span className="typo-title-section ml-2 text-emerald-700 tabular-nums dark:text-emerald-400">
                      {kpis.presencaCount}
                    </span>
                  </div>

                  {/* Linha 1 - Card 2: Faltas */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleStatusFilter('Falta')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleStatusFilter('Falta');
                      }
                    }}
                    aria-pressed={statusFilter === 'Falta'}
                    className={`flex h-8 cursor-pointer items-center justify-between rounded-md border px-2.5 text-left transition-all duration-150 ${
                      statusFilter === 'Falta'
                        ? 'border-rose-500 bg-rose-50/90 ring-1 ring-rose-500/25 dark:border-rose-500 dark:bg-rose-950/60'
                        : 'border-slate-200/90 bg-white hover:border-rose-300 hover:bg-rose-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-rose-700'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                      <span className="typo-subtitle truncate text-slate-700 whitespace-nowrap dark:text-slate-200">
                        Faltas
                      </span>
                      <IndicatorHelpPopover indicatorId="kanban_faltas" />
                    </div>
                    <span className="typo-title-section ml-2 text-rose-700 tabular-nums dark:text-rose-400">
                      {kpis.faltaCount}
                    </span>
                  </div>

                  {/* Linha 1 - Card 3: Não iniciada */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleStatusFilter('Não iniciada')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleStatusFilter('Não iniciada');
                      }
                    }}
                    aria-pressed={isNotStartedAttendanceStatus(statusFilter)}
                    className={`flex h-8 cursor-pointer items-center justify-between rounded-md border px-2.5 text-left transition-all duration-150 ${
                      isNotStartedAttendanceStatus(statusFilter)
                        ? 'border-slate-400 bg-slate-100 ring-1 ring-slate-400/25 dark:border-slate-600 dark:bg-slate-800'
                        : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
                      <span className="typo-subtitle truncate text-slate-700 whitespace-nowrap dark:text-slate-200">
                        Não iniciada
                      </span>
                      <IndicatorHelpPopover indicatorId="kanban_nao_iniciada" align="right" />
                    </div>
                    <span className="typo-title-section ml-2 text-slate-700 tabular-nums dark:text-slate-200">
                      {kpis.aguardandoCount}
                    </span>
                  </div>

                  {/* Linha 2 - Card 4: Frequência Geral */}
                  <div
                    data-testid="kpi-frequencia"
                    className={`flex h-8 items-center justify-between rounded-md border px-2.5 transition-colors ${
                      !hasValidStudentFrequency
                        ? 'border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900'
                        : isGlobalFreqSatisfactory
                        ? 'border-emerald-300/90 bg-emerald-50/60 dark:border-emerald-800/80 dark:bg-emerald-950/40'
                        : 'border-rose-300/90 bg-rose-50/60 dark:border-rose-800/80 dark:bg-rose-950/40'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Percent
                        className={`h-3.5 w-3.5 shrink-0 ${
                          !hasValidStudentFrequency
                            ? 'text-slate-400'
                            : isGlobalFreqSatisfactory
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      />
                      <span
                        className={`typo-subtitle truncate whitespace-nowrap ${
                          !hasValidStudentFrequency
                            ? 'text-slate-700 dark:text-slate-200'
                            : isGlobalFreqSatisfactory
                            ? 'text-emerald-900 dark:text-emerald-200'
                            : 'text-rose-900 dark:text-rose-200'
                        }`}
                      >
                        Frequência
                      </span>
                      <IndicatorHelpPopover indicatorId="kanban_frequencia" />
                    </div>
                    <span
                      className={`typo-title-section ml-2 whitespace-nowrap tabular-nums ${
                        !hasValidStudentFrequency
                          ? 'text-slate-500 dark:text-slate-400'
                          : isGlobalFreqSatisfactory
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {hasValidStudentFrequency
                        ? `${kpis.mediaFrequencia.toFixed(1)}%`
                        : 'S/D'}
                    </span>
                  </div>

                  {/* Linha 2 - Card 5: Total de agendamentos */}
                  <div
                    data-testid="kpi-total-agendamentos"
                    className="flex h-8 items-center justify-between rounded-md border border-slate-200/90 bg-white px-2.5 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-[#004A8D] dark:text-sky-400" />
                      <span className="typo-subtitle truncate text-slate-700 whitespace-nowrap dark:text-slate-200">
                        Agendamentos
                      </span>
                      <IndicatorHelpPopover indicatorId="kanban_agendamentos" />
                    </div>
                    <span className="typo-title-section ml-2 text-slate-800 tabular-nums dark:text-slate-100">
                      {kpis.totalAgendamentos}
                    </span>
                  </div>

                  {/* Linha 2 - Card 6: Evasão */}
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid="kpi-evasao"
                    onClick={() => toggleStatusFilter('EVASAO')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleStatusFilter('EVASAO');
                      }
                    }}
                    aria-pressed={statusFilter === 'EVASAO'}
                    className={`flex h-8 cursor-pointer items-center justify-between rounded-md border px-2.5 text-left transition-all duration-150 ${
                      statusFilter === 'EVASAO'
                        ? 'border-rose-500 bg-rose-100/80 ring-1 ring-rose-500/30 dark:border-rose-500 dark:bg-rose-950/60'
                        : kpis.evasaoCount > 0
                        ? 'evasao-alert-pulse border-rose-300/90 bg-rose-50/70 hover:border-rose-400 hover:bg-rose-50/90 dark:border-rose-800 dark:bg-rose-950/40'
                        : 'border-slate-200/90 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <AlertTriangle
                        className={`h-3.5 w-3.5 shrink-0 ${
                          kpis.evasaoCount > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-400'
                        }`}
                      />
                      <span
                        className={`typo-subtitle truncate whitespace-nowrap ${
                          kpis.evasaoCount > 0
                            ? 'text-rose-800 dark:text-rose-300'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        Evasão
                      </span>
                      <IndicatorHelpPopover indicatorId="kanban_evasao" align="right" />
                    </div>
                    <span
                      className={`typo-title-section ml-2 tabular-nums ${
                        kpis.evasaoCount > 0
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {kpis.evasaoCount}
                    </span>
                  </div>
                </div>
              ) : (
                /* 5 Cards do Kanban NPS com ícone (?) explicativo */
                <div
                  data-testid="nps-summary-cards-grid"
                  className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
                >
                  {/* Linha 1 - Card 1: Total de Convites */}
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid="nps-kpi-total-convites"
                    onClick={handleResetNpsFilters}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleResetNpsFilters();
                      }
                    }}
                    className="flex h-8 cursor-pointer items-center justify-between rounded-md border border-[#004A8D]/30 bg-sky-50/75 px-2.5 text-left transition-colors hover:bg-sky-50 dark:border-sky-800 dark:bg-sky-950/50"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#004A8D] dark:text-sky-400" />
                      <span className="typo-subtitle truncate text-slate-900 whitespace-nowrap dark:text-sky-100">
                        {npsDiaSemana !== 'TODOS' ? 'Convites no dia' : 'Total de convites'}
                      </span>
                      <IndicatorHelpPopover indicatorId="nps_total_convites" />
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="typo-title-section text-[#004A8D] tabular-nums dark:text-sky-300">
                        {npsKPIs.totalConvites}
                      </span>
                      {npsDiaSemana !== 'TODOS' && (
                        <span className="text-[10px] text-slate-500 tabular-nums">
                          /{synchronizedNpsStudentCards.length}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Linha 1 - Card 2: Convites pelo Portal */}
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid="nps-kpi-portal"
                    onClick={() =>
                      triggerWithLoading(() => {
                        setNpsOrigem((prev) =>
                          prev === 'Portal do Aluno' ? 'TODAS' : 'Portal do Aluno'
                        );
                      }, 'Filtrando convites pelo Portal do Aluno...')
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setNpsOrigem((prev) =>
                          prev === 'Portal do Aluno' ? 'TODAS' : 'Portal do Aluno'
                        );
                      }
                    }}
                    aria-pressed={npsOrigem === 'Portal do Aluno'}
                    className={`flex h-8 cursor-pointer items-center justify-between rounded-md border px-2.5 text-left transition-colors ${
                      npsOrigem === 'Portal do Aluno'
                        ? 'border-sky-500 bg-sky-50/90 ring-1 ring-sky-500/25 dark:border-sky-500 dark:bg-sky-950/60'
                        : 'border-slate-200/90 bg-white hover:border-sky-300 hover:bg-sky-50/35 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                      <span className="typo-subtitle truncate text-slate-700 whitespace-nowrap dark:text-slate-200">
                        Portal do Aluno
                      </span>
                      <IndicatorHelpPopover indicatorId="nps_portal_aluno" />
                    </div>
                    <span className="typo-title-section ml-2 text-sky-700 tabular-nums dark:text-sky-400">
                      {npsKPIs.portalDoAlunoCount}
                    </span>
                  </div>

                  {/* Linha 1 - Card 3: Convites por E-mail */}
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid="nps-kpi-email"
                    onClick={() =>
                      triggerWithLoading(() => {
                        setNpsOrigem((prev) =>
                          prev === 'E-mail' ? 'TODAS' : 'E-mail'
                        );
                      }, 'Filtrando convites por E-mail...')
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setNpsOrigem((prev) =>
                          prev === 'E-mail' ? 'TODAS' : 'E-mail'
                        );
                      }
                    }}
                    aria-pressed={npsOrigem === 'E-mail'}
                    className={`flex h-8 cursor-pointer items-center justify-between rounded-md border px-2.5 text-left transition-colors ${
                      npsOrigem === 'E-mail'
                        ? 'border-indigo-500 bg-indigo-50/90 ring-1 ring-indigo-500/25 dark:border-indigo-500 dark:bg-indigo-950/60'
                        : 'border-slate-200/90 bg-white hover:border-indigo-300 hover:bg-indigo-50/35 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <span className="typo-subtitle truncate text-slate-700 whitespace-nowrap dark:text-slate-200">
                        Por E-mail
                      </span>
                      <IndicatorHelpPopover indicatorId="nps_por_email" align="right" />
                    </div>
                    <span className="typo-title-section ml-2 text-indigo-700 tabular-nums dark:text-indigo-400">
                      {npsKPIs.emailCount}
                    </span>
                  </div>

                  {/* Linha 2 - Card 4: Destinatário (Aluno vs Responsável) */}
                  <div
                    data-testid="nps-kpi-destinatarios"
                    className="flex h-8 items-center justify-between rounded-md border border-slate-200/90 bg-white px-2.5 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="typo-subtitle truncate text-slate-700 dark:text-slate-200">
                        Destinatário
                      </span>
                      <IndicatorHelpPopover indicatorId="nps_destinatario" />
                    </div>
                    <div className="flex items-center gap-1 tabular-nums">
                      <button
                        type="button"
                        data-testid="nps-kpi-filter-aluno"
                        onClick={() =>
                          triggerWithLoading(() => {
                            setNpsDestinatarioFilter((prev) =>
                              prev === 'ALUNO' ? 'TODOS' : 'ALUNO'
                            );
                          }, 'Filtrando convites enviados diretamente ao Aluno...')
                        }
                        aria-pressed={npsDestinatarioFilter === 'ALUNO'}
                        className={`typo-badge rounded border px-1.5 py-0.5 transition-colors ${
                          npsDestinatarioFilter === 'ALUNO'
                            ? 'border-[#004A8D] bg-[#004A8D] text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        Aluno: {npsKPIs.destinatarioAlunoCount}
                      </button>
                      <button
                        type="button"
                        data-testid="nps-kpi-filter-responsavel"
                        onClick={() =>
                          triggerWithLoading(() => {
                            setNpsDestinatarioFilter((prev) =>
                              prev === 'RESPONSAVEL' ? 'TODOS' : 'RESPONSAVEL'
                            );
                          }, 'Filtrando convites enviados ao Responsável...')
                        }
                        aria-pressed={npsDestinatarioFilter === 'RESPONSAVEL'}
                        className={`typo-badge rounded border px-1.5 py-0.5 transition-colors ${
                          npsDestinatarioFilter === 'RESPONSAVEL'
                            ? 'border-[#004A8D] bg-[#004A8D] text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        Resp.: {npsKPIs.destinatarioResponsavelCount}
                      </button>
                    </div>
                  </div>

                  {/* Linha 2 - Card 5 (2 colunas): Status de envio com visualização clara e interativa */}
                  <div
                    data-testid="nps-kpi-real-delivery"
                    className="col-span-2 flex h-8 items-center justify-between gap-2 rounded-md border border-slate-200/90 bg-white px-2.5 sm:col-span-2 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="typo-subtitle truncate text-slate-700 whitespace-nowrap dark:text-slate-200">
                        Status de envio
                      </span>
                      <IndicatorHelpPopover indicatorId="nps_status_envio" align="right" />
                    </div>
                    <div className="flex flex-wrap items-center gap-1 tabular-nums">
                      <button
                        type="button"
                        onClick={() =>
                          setNpsDeliveryStatus((prev) =>
                            prev === 'Aberto' ? 'TODOS' : 'Aberto'
                          )
                        }
                        aria-pressed={npsDeliveryStatus === 'Aberto'}
                        className={`typo-badge rounded border px-1.5 py-0.5 transition-colors ${
                          npsDeliveryStatus === 'Aberto'
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        }`}
                      >
                        Abertos: {npsKPIs.emailAbertoCount}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNpsDeliveryStatus((prev) =>
                            prev === 'Entregue' ? 'TODOS' : 'Entregue'
                          )
                        }
                        aria-pressed={npsDeliveryStatus === 'Entregue'}
                        className={`typo-badge rounded border px-1.5 py-0.5 transition-colors ${
                          npsDeliveryStatus === 'Entregue'
                            ? 'border-sky-600 bg-sky-600 text-white'
                            : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                        }`}
                      >
                        Entregues: {npsKPIs.emailEntregueCount}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNpsDeliveryStatus((prev) =>
                            prev === 'Enviado' ? 'TODOS' : 'Enviado'
                          )
                        }
                        aria-pressed={npsDeliveryStatus === 'Enviado'}
                        className={`typo-badge rounded border px-1.5 py-0.5 transition-colors ${
                          npsDeliveryStatus === 'Enviado'
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                        }`}
                      >
                        Enviados: {npsKPIs.emailEnviadoCount}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNpsDeliveryStatus((prev) =>
                            prev === 'Não entregue' ? 'TODOS' : 'Não entregue'
                          )
                        }
                        aria-pressed={npsDeliveryStatus === 'Não entregue'}
                        className={`typo-badge rounded border px-1.5 py-0.5 transition-colors ${
                          npsDeliveryStatus === 'Não entregue'
                            ? 'border-rose-600 bg-rose-600 text-white'
                            : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        Não entregues: {npsKPIs.emailNaoEntregueCount}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* REGIÃO 4: ÁREA PRINCIPAL DOS KANBANS, DASHBOARD OU PORTAL DO ALUNO */}
          <main
            id="main-content"
            className={`relative min-h-0 flex-1 px-2.5 py-1.5 sm:px-5 ${
              activeTab === 'PORTAL_ALUNO' || activeTab === 'DASHBOARD'
                ? 'overflow-y-auto'
                : 'overflow-hidden'
            }`}
          >
            <div
              className={`h-full w-full transition-opacity duration-100 ${
                isLoading
                  ? 'pointer-events-none opacity-60 select-none'
                  : 'opacity-100'
              }`}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                  className="h-full w-full"
                >
                  {activeTab === 'KANBAN_ALUNOS' ? (
                    <HourKanbanBoard
                      columns={studentKanbanColumns}
                      onSelectStudent={setSelectedStudentId}
                    />
                  ) : activeTab === 'KANBAN_NPS' ? (
                    <NpsHourKanbanBoard
                      columns={npsKanbanColumns}
                      onSelectStudentCard={setSelectedNpsStudentCard}
                      currentTimeStr={currentTimeStr}
                      onInvitationUpdated={handleNpsInvitationUpdated}
                      operatorLogin={activeUserLogin}
                      operatorRole={authSession?.role || 'COORDENACAO'}
                    />
                  ) : activeTab === 'DASHBOARD' ? (
                    <DashboardView
                      allEvaluatedRecords={allEvaluatedRecords}
                      onSelectStudentRecord={setSelectedStudentId}
                      activeNpsInvitations={activeNpsInvitations}
                      onMaterialCauseUpdated={handleMaterialCauseUpdated}
                      externalSearchQuery={globalSearchQuery}
                      onExternalSearchChange={setGlobalSearchQuery}
                    />
                  ) : (
                    <div className="h-full overflow-y-auto pr-1">
                      <PortalAlunoHubView
                        allStudents={allEvaluatedRecords}
                        selectedStudentId={portalHubStudentId}
                        onSelectStudentId={(id) => setPortalHubStudentId(id)}
                        unidadeAtual={portalMeta.unidade}
                        initialSubTab={portalHubInitialSubTab}
                        onSubTabChange={(sub) => setPortalHubInitialSubTab(sub)}
                        activeNpsInvitations={activeNpsInvitations}
                        onNpsInvitationUpdated={handleNpsInvitationUpdated}
                        externalSearchQuery={globalSearchQuery}
                        onExternalSearchChange={setGlobalSearchQuery}
                        onFocusHeaderSearch={() => {
                          headerSearchInputRef.current?.focus();
                          headerSearchInputRef.current?.select();
                          setIsHeaderSearchDropdownOpen(true);
                        }}
                      />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {isLoading && (
              <div
                data-testid="kanban-loading-overlay"
                role="status"
                aria-live="polite"
                className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/20 backdrop-blur-[1.5px] transition-opacity duration-100"
              >
                <div className="glass-modal flex items-center gap-3 rounded-xl px-5 py-3 shadow-lg">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-primary)]" />
                  <div className="flex flex-col">
                    <span className="typo-subtitle font-bold text-[var(--text-primary)]">
                      Processando atualização...
                    </span>
                    <span className="typo-meta text-[var(--text-secondary)]">
                      {loadingMessage}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </main>
            </>
          )}
        </div>
      </div>

      {/* REGIÃO 5: RODAPÉ MINIMALISTA E COMPACTO DE LINHA ÚNICA (Seção 14) */}
      <footer
        data-testid="system-footer"
        className="shrink-0 border-t border-[#001B3A] bg-[#002855] px-3 py-1.5 text-[11px] text-slate-300 sm:px-5 dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-1.5 sm:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="font-medium text-white">
              © 2026 Grupo Realizar Microlins
            </span>
            <span aria-hidden="true" className="text-white/25">
              ·
            </span>
            <button
              type="button"
              data-testid="footer-privacy-link"
              onClick={() => setShowPrivacyPage(true)}
              className="inline-flex items-center gap-1 font-medium text-sky-200 transition-colors hover:text-white cursor-pointer"
            >
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              <span>Privacidade e LGPD</span>
            </button>
          </div>

          <span className="text-center font-medium text-sky-200/90">
            Desenvolvido por Alisson Araújo Bott
          </span>

          <div className="inline-flex items-center justify-center gap-1.5 text-slate-200">
            <MessageSquare className="h-3 w-3 shrink-0 text-emerald-400" />
            <span>Suporte:</span>
            <a
              data-testid="footer-whatsapp-support-link"
              href={`https://api.whatsapp.com/send?phone=5518997432487&text=${encodeURIComponent(
                `Olá! Preciso de suporte no sistema. Escola: ${activeSchoolName} | Usuário: ${activeUserFullName}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-white underline-offset-2 transition-colors hover:text-emerald-300 hover:underline"
            >
              (18) 99743-2487
            </a>
          </div>
        </div>
      </footer>

      {/* Modal de Detalhes Acadêmicos do Aluno (Kanban de Alunos) */}
      <StudentDetailModal
        student={selectedStudent}
        studentHistory={selectedStudentHistory}
        onClose={() => setSelectedStudentId(null)}
        onOpenPortalHub={(hubSubTab) => {
          if (selectedStudent) {
            setPortalHubStudentId(selectedStudent.id);
          }
          setPortalHubInitialSubTab(hubSubTab || 'BOLETIM');
          setSelectedStudentId(null);
          setActiveTab('PORTAL_ALUNO');
        }}
      />

      {/* Modal de Detalhes e Histórico Cronológico de Pesquisas do Aluno (Kanban NPS) */}
      <NpsInvitationDetailModal
        studentCard={resolvedSelectedNpsStudentCard}
        currentYear={npsReferenceYear}
        onClose={() => setSelectedNpsStudentCard(null)}
        onInvitationUpdated={handleNpsInvitationUpdated}
        operatorLogin={activeUserLogin}
        operatorRole={authSession?.role || 'COORDENACAO'}
      />

      {/* Command Palette Global (Ctrl + K / Cmd + K) */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        students={allEvaluatedRecords}
        npsCards={synchronizedNpsStudentCards}
        educators={educadorOptions}
        salas={salaOptions}
        horarios={horarioOptions}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onOpenStudentModal={(studentId) => setSelectedStudentId(studentId)}
        onOpenStudentFicha={(studentId, subTab) => {
          setPortalHubStudentId(studentId);
          setPortalHubInitialSubTab(subTab || 'BOLETIM');
          setActiveTab('PORTAL_ALUNO');
        }}
        onOpenNpsModal={(card) => setSelectedNpsStudentCard(card)}
        onApplyEducatorFilter={(educator) => {
          setSelectedEducador(educator);
          setActiveTab('KANBAN_ALUNOS');
        }}
        onApplySalaFilter={(sala) => {
          setSelectedSala(sala);
          setActiveTab('KANBAN_ALUNOS');
        }}
        onApplyHorarioFilter={(horario) => {
          setSelectedHorario(horario);
          setActiveTab('KANBAN_ALUNOS');
        }}
        onApplyFinancialFilter={(status) => {
          setSelectedFinancialStatus(status);
          setActiveTab('KANBAN_ALUNOS');
        }}
        onApplyQuickStatusFilter={(status) => {
          setStatusFilter(status);
          setActiveTab('KANBAN_ALUNOS');
        }}
        onSyncNow={() => {
          syncPortalData();
          emitGlobalToast({
            variant: 'success',
            title: 'Sincronização iniciada',
            description: 'Dados do Portal do Aluno e Indecx NPS atualizados.',
          });
        }}
        onOpenPrivacy={() => setShowPrivacyPage(true)}
      />

      {/* Estúdio de Exportação Avançado */}
      <ExportStudioModal
        isOpen={isExportStudioOpen}
        onClose={() => setIsExportStudioOpen(false)}
        allRecords={allEvaluatedRecords}
        filteredRecords={activeStudentRecords}
        notesByContract={{}}
        onTriggerPrint={() => window.print()}
      />

      {/* Drawer Lateral de Diagnóstico Rápido de Filtros */}
      <SlideOverDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        title="Diagnóstico de Filtros & Operação"
        subtitle={`Unidade: ${activeSchoolName} · Horário Brasília: ${currentTimeStr}`}
      >
        <div className="space-y-4">
          <div className="glass-card rounded-xl p-4">
            <h4 className="typo-subtitle font-bold text-[var(--text-primary)]">
              Resumo do Kanban de Alunos
            </h4>
            <p className="typo-meta mt-1 text-[var(--text-secondary)]">
              Exibindo {activeStudentRecords.length} de {allEvaluatedRecords.length} agendamentos totais na semana.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
                <span className="text-[var(--text-secondary)]">Dia:</span>{' '}
                <strong className="text-[var(--text-primary)]">{selectedDiaSemana}</strong>
              </div>
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
                <span className="text-[var(--text-secondary)]">Educador:</span>{' '}
                <strong className="text-[var(--text-primary)]">{selectedEducador}</strong>
              </div>
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
                <span className="text-[var(--text-secondary)]">Sala:</span>{' '}
                <strong className="text-[var(--text-primary)]">{selectedSala}</strong>
              </div>
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
                <span className="text-[var(--text-secondary)]">Financeiro:</span>{' '}
                <strong className="text-[var(--text-primary)]">{selectedFinancialStatus}</strong>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetStudentFilters}
              className="btn-press mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restaurar Filtros de Alunos</span>
            </button>
          </div>

          <div className="glass-card rounded-xl p-4">
            <h4 className="typo-subtitle font-bold text-[var(--text-primary)]">
              Resumo do Kanban NPS
            </h4>
            <p className="typo-meta mt-1 text-[var(--text-secondary)]">
              Exibindo {npsFilteredCards.length} de {synchronizedNpsStudentCards.length} convites NPS sincronizados ({npsReferenceYear}).
            </p>
            <button
              type="button"
              onClick={handleResetNpsFilters}
              className="btn-press mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restaurar Filtros NPS</span>
            </button>
          </div>
        </div>
      </SlideOverDrawer>
      </div>
    </ToastProvider>
  );
}
