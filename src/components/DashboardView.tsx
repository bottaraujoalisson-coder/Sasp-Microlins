import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  BookX,
  Check,
  ChevronDown,
  ChevronRight,
  Columns3,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderKanban,
  GraduationCap,
  KeyRound,
  Layers,
  MessageCircle,
  Percent,
  Pin,
  PinOff,
  RotateCcw,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import {
  ActiveNpsInvitation,
} from '../data/microlinsData';
import {
  buildMultiLevelGroups,
  collectAllGroupKeys,
  computeDashboardAnalytics,
  computeDashboardSummaryMetricsFromStudents,
  computeGroupSubtotals,
  CONSOLIDATED_TABLE_COLUMNS,
  ConsolidatedColumnId,
  ConsolidatedDashboardStudent,
  ConsolidatedSortField,
  CourseCategoryFilterType,
  DashboardCardSelectionType,
  DashboardFilterCriteria,
  DashboardWeeklyAttendanceFilterType,
  DEFAULT_COLUMN_ORDER,
  DEFAULT_VISIBLE_COLUMN_IDS,
  EvaluatedStudentRecord,
  exportConsolidatedToPdf,
  exportConsolidatedToXlsx,
  extractColumnDistinctValues,
  filterDashboardStudentsByCardSelections,
  FinancialFilterType,
  formatFormacaoDisplay,
  formatModuleDisplay,
  getStudentColumnDisplayValue,
  GroupByField,
  MultiLevelGroupNode,
  ResolvedTableColumn,
  resolveEffectiveTableColumns,
  toggleColumnPinState,
  toggleDashboardCardSelection,
} from '../utils/performanceAnalytics';

import { IndicatorHelpPopover } from './IndicatorHelpPopover';

interface DashboardViewProps {
  allEvaluatedRecords: EvaluatedStudentRecord[];
  onSelectStudentRecord: (recordId: number) => void;
  activeNpsInvitations?: ActiveNpsInvitation[];
  onMaterialCauseUpdated?: (contrato: string, causa: string) => void;
}

const DASHBOARD_WEEKDAYS = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

const DEFAULT_DASHBOARD_FILTERS: DashboardFilterCriteria = {
  aulaMin: null,
  aulaMax: null,
  situacaoFinanceira: 'TODOS',
  entregaApostila: 'TODOS',
  frequenciaSemanal: 'TODOS',
  diasSemana: [],
  categoriaCurso: 'TODOS',
  modalidade: 'AMBAS',
  horarios: [],
  search: '',
  nomeFilter: '',
  contratoFilter: '',
  formacao: 'TODAS',
  educador: 'TODOS',
  capacitacao: 'TODAS',
  turno: 'TODOS',
  sala: 'TODAS',
  modulo: 'TODOS',
  presencasFilter: 'TODOS',
  faltasFilter: 'TODOS',
  agendamentosFilter: 'TODOS',
  alertaFilter: 'TODOS',
  multiColumnFilters: {},
  sortBy: 'nomeCompleto',
  sortDir: 'asc',
};

const COLUMN_TEST_ID_SUFFIX: Record<ConsolidatedColumnId, string> = {
  nomeCompleto: 'nome-aluno',
  contrato: 'contrato',
  formacao: 'capacitacao',
  educador: 'educador',
  cadNome: 'cad',
  unidade: 'unidade',
  municipio: 'municipio',
  modalidade: 'modalidade',
  turno: 'turno',
  diaSemana: 'dia-aula',
  horario: 'horario-aula',
  sala: 'sala-aula',
  modulo: 'modulo',
  aulaAtual: 'aula-atual',
  presencas: 'presencas',
  faltas: 'faltas',
  frequencia: 'frequencia',
  agendamentos: 'agendamentos',
  categoria: 'categoria',
  apostila: 'apostila',
  financeiro: 'financeiro',
  alertas: 'alertas',
  telefoneAluno: 'telefone',
  nomeResponsavel: 'responsavel',
  acoes: 'acoes',
};

export const DashboardView: React.FC<DashboardViewProps> = React.memo(
  ({
    allEvaluatedRecords,
    onSelectStudentRecord,
    activeNpsInvitations = [],
    onMaterialCauseUpdated,
  }) => {
    const [filters, setFilters] = useState<DashboardFilterCriteria>(
      DEFAULT_DASHBOARD_FILTERS
    );

    // =========================================================================
    // 1. SELEÇÃO MÚLTIPLA DE CARDS DO DASHBOARD (MULTI-CARD SELECTION)
    // =========================================================================
    const [selectedCardViews, setSelectedCardViews] = useState<
      DashboardCardSelectionType[]
    >([]);

    const handleToggleCard = (cardSelection: DashboardCardSelectionType) => {
      setSelectedCardViews((prev) =>
        toggleDashboardCardSelection(prev, cardSelection)
      );
    };

    const isCardSelected = (cardSelection: DashboardCardSelectionType) =>
      selectedCardViews.includes(cardSelection);

    // =========================================================================
    // 2. SELEÇÃO E FIXAÇÃO DE COLUNAS NO PAINEL ESQUERDO (ATÉ 2 COLUNAS FIXAS)
    // =========================================================================
    const [columnOrder] = useState<ConsolidatedColumnId[]>(DEFAULT_COLUMN_ORDER);
    const [visibleColumnIds, setVisibleColumnIds] = useState<
      ConsolidatedColumnId[]
    >(DEFAULT_VISIBLE_COLUMN_IDS);
    const [frozenCol1, setFrozenCol1] = useState<ConsolidatedColumnId | null>(
      'nomeCompleto'
    );
    const [frozenCol2, setFrozenCol2] = useState<ConsolidatedColumnId | null>(
      'contrato'
    );
    const [showLeftColumnPanel, setShowLeftColumnPanel] =
      useState<boolean>(true);

    // =========================================================================
    // 3. AGRUPAMENTO RELEVANTE (MÁXIMO DE 3 OPÇÕES: FORMAÇÃO, MÓDULO, FINANCEIRO)
    // =========================================================================
    const [groupingEnabled, setGroupingEnabled] = useState<boolean>(false);
    const [groupByFields, setGroupByFields] = useState<GroupByField[]>([
      'formacao',
    ]);
    const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
      new Set()
    );

    // =========================================================================
    // 4. FILTRO MULTI-VALOR POR COLUNA E EXPORTAÇÃO (.XLSX / .PDF)
    // =========================================================================
    const [activeMultiFilterCol, setActiveMultiFilterCol] =
      useState<ConsolidatedColumnId | null>(null);
    const [multiFilterSearch, setMultiFilterSearch] = useState<string>('');
    const [exportScope, setExportScope] = useState<'FILTERED' | 'ALL'>(
      'FILTERED'
    );
    const [lastExportNotification, setLastExportNotification] = useState<
      string | null
    >(null);

    // Opções dinâmicas para os filtros no cabeçalho da tabela consolidada
    const filterOptions = useMemo(() => {
      const hoursSet = new Set<string>();
      const salasSet = new Set<string>();
      const modulosSet = new Set<string>();
      const formacoesSet = new Set<string>();
      const educadoresSet = new Set<string>();
      const turnosSet = new Set<string>();

      for (const r of allEvaluatedRecords) {
        if (r.hourKey) hoursSet.add(r.hourKey);
        if (r.sala) salasSet.add(r.sala);
        const mod = formatModuleDisplay(r.moduloAtual || r.curso);
        if (mod) modulosSet.add(mod);
        const form = formatFormacaoDisplay(r.formacao);
        if (form) formacoesSet.add(form);
        const ed = (r.educador || r.professor || '').trim();
        if (ed && ed !== 'A definir' && ed !== 'Não informado') {
          educadoresSet.add(ed);
        }
        if (r.turno) turnosSet.add(r.turno);
      }

      return {
        hours: Array.from(hoursSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        salas: Array.from(salasSet).sort((a, b) =>
          a.localeCompare(b, 'pt-BR', { numeric: true })
        ),
        modulos: Array.from(modulosSet).sort((a, b) =>
          a.localeCompare(b, 'pt-BR')
        ),
        formacoes: Array.from(formacoesSet).sort((a, b) =>
          a.localeCompare(b, 'pt-BR')
        ),
        educadores: Array.from(educadoresSet).sort((a, b) =>
          a.localeCompare(b, 'pt-BR')
        ),
        turnos: Array.from(turnosSet),
      };
    }, [allEvaluatedRecords]);

    // Consolidação completa (sem filtros) para permitir exportação de todos os dados
    const allUnfilteredAnalytics = useMemo(
      () =>
        computeDashboardAnalytics(
          allEvaluatedRecords,
          {
            ...DEFAULT_DASHBOARD_FILTERS,
            sortBy: filters.sortBy,
            sortDir: filters.sortDir,
          },
          activeNpsInvitations
        ),
      [
        allEvaluatedRecords,
        filters.sortBy,
        filters.sortDir,
        activeNpsInvitations,
      ]
    );

    // Consolidação semanal com separação exclusiva por Formação do Aluno + filtros de cabeçalho
    const { filteredStudents } = useMemo(
      () =>
        computeDashboardAnalytics(
          allEvaluatedRecords,
          filters,
          activeNpsInvitations
        ),
      [allEvaluatedRecords, filters, activeNpsInvitations]
    );

    // Lista de registros correspondente à seleção de Cards e filtros
    const displayedStudents = useMemo(() => {
      return filterDashboardStudentsByCardSelections(
        filteredStudents,
        selectedCardViews
      );
    }, [filteredStudents, selectedCardViews]);

    // Quantidades e percentuais dos cards atualizados dinamicamente conforme os filtros e cards selecionados
    const metrics = useMemo(
      () => computeDashboardSummaryMetricsFromStudents(displayedStudents),
      [displayedStudents]
    );

    // Colunas visíveis, ordenadas e com fixação de até 2 colunas
    const effectiveColumns = useMemo(
      () =>
        resolveEffectiveTableColumns(
          columnOrder,
          visibleColumnIds,
          frozenCol1,
          frozenCol2
        ),
      [columnOrder, visibleColumnIds, frozenCol1, frozenCol2]
    );

    // Árvore de agrupamento e Total Geral
    const activeGroupByFields = useMemo(
      () => (groupingEnabled ? groupByFields : []),
      [groupingEnabled, groupByFields]
    );

    const multiLevelGroupTree = useMemo(
      () => buildMultiLevelGroups(displayedStudents, activeGroupByFields),
      [displayedStudents, activeGroupByFields]
    );

    const allGroupKeys = useMemo(
      () => collectAllGroupKeys(multiLevelGroupTree),
      [multiLevelGroupTree]
    );

    const grandTotals = useMemo(
      () => computeGroupSubtotals(displayedStudents),
      [displayedStudents]
    );

    const hasActiveMultiColFilters = useMemo(() => {
      if (!filters.multiColumnFilters) return false;
      return Object.values(filters.multiColumnFilters).some(
        (arr) => Array.isArray(arr) && arr.length > 0
      );
    }, [filters.multiColumnFilters]);

    const hasActiveFilters = Boolean(
      filters.aulaMin !== null ||
        filters.aulaMax !== null ||
        filters.situacaoFinanceira !== 'TODOS' ||
        filters.entregaApostila !== 'TODOS' ||
        filters.frequenciaSemanal !== 'TODOS' ||
        filters.diasSemana.length > 0 ||
        filters.categoriaCurso !== 'TODOS' ||
        filters.horarios.length > 0 ||
        (filters.search && filters.search.trim() !== '') ||
        (filters.nomeFilter && filters.nomeFilter.trim() !== '') ||
        (filters.contratoFilter && filters.contratoFilter.trim() !== '') ||
        (filters.formacao && filters.formacao !== 'TODAS') ||
        (filters.educador && filters.educador !== 'TODOS') ||
        (filters.capacitacao && filters.capacitacao !== 'TODAS') ||
        (filters.turno && filters.turno !== 'TODOS') ||
        (filters.sala && filters.sala !== 'TODAS') ||
        (filters.modulo && filters.modulo !== 'TODOS') ||
        (filters.agendamentosFilter &&
          filters.agendamentosFilter !== 'TODOS') ||
        (filters.alertaFilter && filters.alertaFilter !== 'TODOS') ||
        hasActiveMultiColFilters ||
        selectedCardViews.length > 0
    );

    const handleResetAll = () => {
      setFilters(DEFAULT_DASHBOARD_FILTERS);
      setSelectedCardViews([]);
      setActiveMultiFilterCol(null);
    };

    const handleSortColumn = (field: ConsolidatedSortField) => {
      setFilters((prev) => {
        const isSameField = prev.sortBy === field;
        const nextDir: 'asc' | 'desc' =
          isSameField && prev.sortDir === 'asc' ? 'desc' : 'asc';
        return {
          ...prev,
          sortBy: field,
          sortDir: nextDir,
        };
      });
    };

    const renderSortIcon = (field: ConsolidatedSortField) => {
      if (filters.sortBy !== field) {
        return <ArrowUpDown className="h-3 w-3 shrink-0 opacity-45" />;
      }
      return filters.sortDir === 'asc' ? (
        <ArrowUp className="h-3 w-3 shrink-0 text-[#004A8D] dark:text-sky-400" />
      ) : (
        <ArrowDown className="h-3 w-3 shrink-0 text-[#004A8D] dark:text-sky-400" />
      );
    };

    // Handlers de seleção e fixação de colunas no painel esquerdo
    const handleToggleColumnVisibility = (colId: ConsolidatedColumnId) => {
      setVisibleColumnIds((prev) => {
        if (prev.includes(colId)) {
          if (prev.length <= 1) return prev; // Manter ao menos 1 coluna visível
          const next = prev.filter((id) => id !== colId);
          if (frozenCol1 === colId) {
            setFrozenCol1(frozenCol2);
            setFrozenCol2(null);
          } else if (frozenCol2 === colId) {
            setFrozenCol2(null);
          }
          return next;
        }
        return [...prev, colId];
      });
    };

    const handlePinColumn = (colId: ConsolidatedColumnId) => {
      // Se a coluna estava desmarcada e o usuário clicou em fixar, torná-la visível automaticamente
      if (!visibleColumnIds.includes(colId)) {
        setVisibleColumnIds((prev) => [...prev, colId]);
      }
      const nextPins = toggleColumnPinState(colId, frozenCol1, frozenCol2);
      setFrozenCol1(nextPins.frozenCol1);
      setFrozenCol2(nextPins.frozenCol2);
    };

    const handleRestoreDefaultColumns = () => {
      setVisibleColumnIds(DEFAULT_VISIBLE_COLUMN_IDS);
      setFrozenCol1('nomeCompleto');
      setFrozenCol2('contrato');
    };

    const handleSelectAllColumns = () => {
      setVisibleColumnIds(CONSOLIDATED_TABLE_COLUMNS.map((c) => c.id));
    };

    // Handler para alternar agrupamento pelo ícone na lista lateral esquerda (Formação, Módulo, Dia da Aula, Horário, Sala, Modalidade, Categoria)
    const handleToggleGroupOption = (field: GroupByField) => {
      setCollapsedGroupKeys(new Set());
      if (!groupingEnabled) {
        setGroupingEnabled(true);
        setGroupByFields([field]);
        return;
      }
      setGroupByFields((prev) => {
        if (prev.includes(field)) {
          const next = prev.filter((f) => f !== field);
          if (next.length === 0) {
            setGroupingEnabled(false);
            return ['formacao'];
          }
          return next;
        }
        if (prev.length >= 3) {
          return [...prev.slice(1), field];
        }
        return [...prev, field];
      });
    };

    const toggleGroupCollapse = (groupKey: string) => {
      setCollapsedGroupKeys((prev) => {
        const next = new Set(prev);
        if (next.has(groupKey)) next.delete(groupKey);
        else next.add(groupKey);
        return next;
      });
    };

    const handleExpandAllGroups = () => {
      setCollapsedGroupKeys(new Set());
    };

    const handleCollapseAllGroups = () => {
      setCollapsedGroupKeys(new Set(allGroupKeys));
    };

    // Handlers de filtro multi-valor por coluna
    const handleToggleMultiFilterValue = (
      colId: ConsolidatedColumnId,
      val: string
    ) => {
      setFilters((prev) => {
        const currentMap = prev.multiColumnFilters || {};
        const currentList = currentMap[colId] || [];
        const exists = currentList.includes(val);
        const nextList = exists
          ? currentList.filter((item) => item !== val)
          : [...currentList, val];
        return {
          ...prev,
          multiColumnFilters: {
            ...currentMap,
            [colId]: nextList,
          },
        };
      });
    };

    const handleClearMultiFilterColumn = (colId: ConsolidatedColumnId) => {
      setFilters((prev) => {
        const currentMap = { ...(prev.multiColumnFilters || {}) };
        delete currentMap[colId];
        return {
          ...prev,
          multiColumnFilters: currentMap,
        };
      });
    };

    // Handlers de exportação estruturada (.xlsx e .pdf) posicionados no topo direito da tabela
    const handleExportData = (format: 'XLSX' | 'PDF') => {
      const targetStudents =
        exportScope === 'ALL'
          ? allUnfilteredAnalytics.filteredStudents
          : displayedStudents;
      const scopeLabel =
        exportScope === 'ALL' ? 'tabela-completa' : 'dados-filtrados';

      const filename =
        format === 'XLSX'
          ? exportConsolidatedToXlsx({
              students: targetStudents,
              effectiveColumns,
              groupByFields: activeGroupByFields,
              includeGroups: groupingEnabled,
              scopeLabel,
            })
          : exportConsolidatedToPdf({
              students: targetStudents,
              effectiveColumns,
              groupByFields: activeGroupByFields,
              includeGroups: groupingEnabled,
              scopeLabel,
            });

      setLastExportNotification(
        `Exportado: ${filename} (${targetStudents.length} registros)`
      );
      window.setTimeout(() => setLastExportNotification(null), 4000);
    };

    const isApostilaCardActive =
      isCardSelected('APOSTILA_TODOS') ||
      isCardSelected('APOSTILA_ENTREGUE') ||
      isCardSelected('APOSTILA_PENDENTE');

    const isPossiveisDesistenciasActive =
      isCardSelected('POSSIVEIS_DESISTENCIAS');

    const isAlunosAtivosUnicosActive =
      isCardSelected('ALUNOS_ATIVOS_UNICOS');

    const isFrequenciaCardActive =
      isCardSelected('FREQUENCIA_TODOS') ||
      isCardSelected('FREQUENCIA_PRESENCA') ||
      isCardSelected('FREQUENCIA_FALTA');

    const isFinanceiroCardActive =
      isCardSelected('FINANCEIRO_TODOS') ||
      isCardSelected('FINANCEIRO_EM_DIA') ||
      isCardSelected('FINANCEIRO_EM_ATRASO');

    const isTotalCardActive =
      selectedCardViews.length === 0 ||
      isCardSelected('TOTAL_ALUNOS') ||
      isCardSelected('CATEGORIA_INGLES') ||
      isCardSelected('CATEGORIA_PROFISSIONALIZANTE');

    // =========================================================================
    // RENDERIZAÇÃO 100% PADRONIZADA DAS CÉLULAS DA TABELA CONSOLIDADA
    // Padronização Tipográfica Estrita:
    // - Mesma fonte em toda a tabela: font-sans (Plus Jakarta Sans)
    // - Mesmo tamanho e altura de linha: text-xs leading-4 (12px)
    // - Mesmo peso visual: font-normal text-slate-700 dark:text-slate-200
    // =========================================================================
    const renderCellContent = (
      st: ConsolidatedDashboardStudent,
      col: ResolvedTableColumn
    ) => {
      const primarySchedule = st.schedules[0];
      const isIngles = st.categoriaCurso === 'INGLÊS';
      const contratoDisplay = `#${st.contratos.join(', #')}`;

      switch (col.id) {
        case 'nomeCompleto':
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-800 dark:text-slate-100">
              {st.nomeCompleto}
            </span>
          );

        case 'contrato':
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 tabular-nums dark:text-slate-200">
              {contratoDisplay}
            </span>
          );

        case 'formacao':
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 dark:text-slate-200">
              {st.formacao}
            </span>
          );

        case 'modulo':
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 dark:text-slate-200">
              {st.cursos.join(' · ')}
            </span>
          );

        case 'educador':
          return st.educador && st.educador !== 'Sem vínculo válido' ? (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 dark:text-slate-200">
              {st.educador}
            </span>
          ) : (
            <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 font-sans text-xs leading-4 font-normal text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              Sem vínculo válido
            </span>
          );

        case 'aulaAtual':
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 tabular-nums dark:text-slate-200">
              {st.aulaMinAluno === st.aulaMaxAluno
                ? `Aula ${st.aulaAtualPrincipal}`
                : `Aulas ${st.aulaMinAluno} a ${st.aulaMaxAluno}`}
            </span>
          );

        case 'frequencia':
          return st.frequenciaSemanalPercent !== null ? (
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 font-sans text-xs leading-4 font-normal tabular-nums ${
                st.frequenciaSemanalPercent >= 85
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300'
              }`}
            >
              {st.frequenciaSemanalPercent.toFixed(0)}%
            </span>
          ) : (
            <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-sans text-xs leading-4 font-normal text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              S/D
            </span>
          );

        case 'diaSemana':
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 dark:text-slate-200">
              {st.diasSemana.join(', ')}
            </span>
          );

        case 'horario':
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 tabular-nums dark:text-slate-200">
              {st.horariosKeys.join(', ')}
            </span>
          );

        case 'sala':
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 dark:text-slate-200">
              {st.salas.join(', ')}
            </span>
          );

        case 'categoria':
          return (
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 font-sans text-xs leading-4 font-normal ${
                isIngles
                  ? 'border-sky-200 bg-sky-50 text-[#004A8D] dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-300'
                  : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {isIngles ? 'Inglês' : 'Profissionalizante'}
            </span>
          );

        case 'apostila':
          return st.possuiApostila ? (
            <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-sans text-xs leading-4 font-normal text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300">
              <BookOpen className="h-3 w-3 shrink-0" />
              Entregue
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-0.5 font-sans text-xs leading-4 font-normal text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300">
              <BookX className="h-3 w-3 shrink-0" />
              Não entregue
            </span>
          );

        case 'financeiro':
          return (
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 font-sans text-xs leading-4 font-normal ${
                st.inadimplente
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300'
              }`}
            >
              {st.situacaoFinanceiraLabel}
            </span>
          );

        case 'alertas':
          return (
            <div className="inline-flex items-center gap-1 font-sans text-xs leading-4 font-normal whitespace-nowrap">
              {st.isEvasao && (
                <span className="inline-flex items-center gap-0.5 rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 font-sans text-xs leading-4 font-normal text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Evasão
                </span>
              )}
              {st.hasActiveNps && (
                <span className="inline-flex items-center gap-0.5 rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 font-sans text-xs leading-4 font-normal text-purple-800 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                  <Sparkles className="h-3 w-3 shrink-0" />
                  NPS Ativo
                </span>
              )}
              {st.isAula4SemApostilaFinEmDia && (
                <span className="inline-flex items-center gap-0.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-sans text-xs leading-4 font-normal text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  <BookX className="h-3 w-3 shrink-0" />
                  3+ Aulas s/ Apostila
                </span>
              )}
              {!st.isEvasao &&
                !st.hasActiveNps &&
                !st.isAula4SemApostilaFinEmDia && (
                  <span className="font-sans text-xs leading-4 font-normal text-slate-500 dark:text-slate-400">
                    Regular
                  </span>
                )}
            </div>
          );

        case 'agendamentos':
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 tabular-nums dark:text-slate-200">
              {st.agendamentosCount}
            </span>
          );

        case 'turno':
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 dark:text-slate-200">
              {st.turno}
            </span>
          );

        case 'telefoneAluno':
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 tabular-nums dark:text-slate-200">
              {st.telefoneAluno || 'Não informado'}
            </span>
          );

        case 'nomeResponsavel':
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 dark:text-slate-200">
              {st.nomeResponsavel || 'Próprio aluno'}
            </span>
          );

        case 'acoes':
          return (
            <div
              className="inline-flex items-center justify-end gap-1 font-sans text-xs leading-4 font-normal whitespace-nowrap"
              onClick={(e) => e.stopPropagation()}
            >
              {primarySchedule && (
                <>
                  <a
                    href={primarySchedule.linkAcessoDireto}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Acessar aula individual do aluno no Portal do Aluno"
                    className="inline-flex h-6 items-center gap-1 rounded border border-[#004A8D]/30 bg-sky-50/70 px-2 font-sans text-xs leading-4 font-normal text-[#004A8D] transition-colors hover:bg-[#004A8D] hover:text-white dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                  >
                    <KeyRound className="h-3 w-3 shrink-0" />
                    <span>Aula</span>
                    <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" />
                  </a>
                  <a
                    href={primarySchedule.whatsappResponsavelContactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Contatar aluno/responsável pelo WhatsApp"
                    className="inline-flex h-6 items-center gap-1 rounded border border-emerald-200 bg-emerald-50/70 px-2 font-sans text-xs leading-4 font-normal text-emerald-800 transition-colors hover:bg-emerald-600 hover:text-white dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  >
                    <MessageCircle className="h-3 w-3 shrink-0" />
                  </a>
                </>
              )}
              <button
                type="button"
                onClick={() => onSelectStudentRecord(st.primaryRecordId)}
                title="Abrir ficha completa do aluno"
                className="inline-flex h-6 items-center gap-1 rounded border border-slate-200 bg-white px-2 font-sans text-xs leading-4 font-normal text-slate-700 transition-colors hover:border-[#004A8D] hover:text-[#004A8D] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Eye className="h-3 w-3 shrink-0" />
                <span>Ficha</span>
              </button>
            </div>
          );

        default:
          return (
            <span className="font-sans text-xs leading-4 font-normal text-slate-700 dark:text-slate-200">
              {getStudentColumnDisplayValue(st, col.id)}
            </span>
          );
      }
    };

    const renderStudentRow = (
      st: ConsolidatedDashboardStudent,
      rowIndex: number
    ) => {
      const isEven = rowIndex % 2 === 0;
      const rowBgClass = isEven
        ? 'bg-white dark:bg-slate-900'
        : 'bg-slate-50/90 dark:bg-slate-800/50';
      const stickyCellBgClass = isEven
        ? 'bg-white group-hover:bg-sky-50 dark:bg-slate-900 dark:group-hover:bg-slate-800'
        : 'bg-slate-50 group-hover:bg-sky-50 dark:bg-slate-800 dark:group-hover:bg-slate-800';

      return (
        <tr
          key={st.studentKey}
          data-testid="dashboard-student-row"
          data-student-key={st.studentKey}
          data-student-contrato={st.contrato}
          data-student-formacao={st.formacao}
          data-student-category={st.categoriaCurso}
          data-student-capacitacao={st.capacitacao}
          onClick={() => onSelectStudentRecord(st.primaryRecordId)}
          className={`group cursor-pointer font-sans text-xs leading-4 font-normal transition-colors hover:bg-sky-50/75 dark:hover:bg-slate-800/80 [&>td]:border-b [&>td]:border-slate-200/80 dark:[&>td]:border-slate-800 ${rowBgClass}`}
        >
          {effectiveColumns.map((col) => {
            const alignClass =
              col.align === 'center'
                ? 'text-center'
                : col.align === 'right'
                ? 'text-right'
                : 'text-left';

            const stickyStyle: React.CSSProperties | undefined = col.isFrozen
              ? {
                  left: `${col.stickyLeftPx ?? 0}px`,
                  width: `${col.widthPx}px`,
                  minWidth: `${col.widthPx}px`,
                  maxWidth: `${col.widthPx}px`,
                }
              : {
                  minWidth: `${col.widthPx}px`,
                };

            return (
              <td
                key={col.id}
                data-testid={`cell-${COLUMN_TEST_ID_SUFFIX[col.id]}`}
                data-col-id={col.id}
                data-frozen-slot={col.frozenSlot ?? undefined}
                style={stickyStyle}
                className={`px-3 py-2 font-sans text-xs leading-4 font-normal whitespace-nowrap transition-colors ${alignClass} ${
                  col.isFrozen
                    ? `sticky z-20 border-r border-slate-200/90 dark:border-slate-700 ${stickyCellBgClass} ${
                        col.isLastFrozen
                          ? 'border-r-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] dark:border-r-slate-700'
                          : ''
                      }`
                    : ''
                }`}
              >
                {renderCellContent(st, col)}
              </td>
            );
          })}
        </tr>
      );
    };

    // Renderização de grupos com subtotais enxutos (apenas Frequência, Apostila e Financeiro)
    let runningRowIndex = 0;
    const renderGroupNodes = (nodes: MultiLevelGroupNode[]): React.ReactNode => {
      return nodes.map((node) => {
        const isCollapsed = collapsedGroupKeys.has(node.groupKey);
        const indentPx = node.level * 16;
        const freqBadge =
          node.subtotals.frequenciaPercent !== null
            ? `${node.subtotals.frequenciaPercent.toFixed(1)}%`
            : 'S/D';

        return (
          <React.Fragment key={node.groupKey}>
            <tr
              data-testid={
                node.level === 0
                  ? 'dashboard-capacitacao-group-row'
                  : 'dashboard-subgroup-row'
              }
              data-group-level={node.level}
              data-group-field={node.field}
              onClick={() => toggleGroupCollapse(node.groupKey)}
              className={`cursor-pointer font-sans text-xs leading-4 transition-colors [&>td]:border-b ${
                node.level === 0
                  ? 'bg-sky-50/90 hover:bg-sky-100/80 dark:bg-sky-950/60 dark:hover:bg-sky-950/80 [&>td]:border-sky-200/90 dark:[&>td]:border-sky-900/70'
                  : 'bg-slate-100/90 hover:bg-slate-200/70 dark:bg-slate-800/80 dark:hover:bg-slate-800 [&>td]:border-slate-300/80 dark:[&>td]:border-slate-700'
              }`}
            >
              <td
                colSpan={effectiveColumns.length}
                className="px-3 py-1.5 font-sans text-xs leading-4 whitespace-nowrap"
              >
                <div
                  className="flex flex-wrap items-center justify-between gap-2"
                  style={{ paddingLeft: `${indentPx}px` }}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#004A8D] dark:text-sky-400" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#004A8D] dark:text-sky-400" />
                    )}
                    <FolderKanban className="h-3.5 w-3.5 shrink-0 text-[#004A8D] dark:text-sky-400" />
                    <span className="font-sans text-xs font-semibold text-[#004A8D] dark:text-sky-300">
                      {node.fieldLabel}: {node.value}
                    </span>
                    <span className="inline-flex items-center rounded border border-sky-300 bg-white px-2 py-0.5 font-sans text-xs font-medium text-[#004A8D] tabular-nums dark:border-sky-700 dark:bg-slate-900 dark:text-sky-300">
                      {node.subtotals.studentCount}{' '}
                      {node.subtotals.studentCount === 1
                        ? 'registro'
                        : 'registros'}
                    </span>
                  </div>

                  {/* Subtotais do grupo (Somente Frequência, Apostila e Financeiro) */}
                  <div
                    data-testid="group-subtotal-badges"
                    className="flex flex-wrap items-center gap-2 font-sans text-xs text-slate-700 tabular-nums dark:text-slate-300"
                  >
                    <span className="rounded border border-sky-200 bg-white/90 px-2 py-0.5 font-normal text-[#004A8D] dark:border-sky-800 dark:bg-slate-900 dark:text-sky-300">
                      Frequência: <strong>{freqBadge}</strong>
                    </span>
                    <span className="rounded border border-slate-200 bg-white/90 px-2 py-0.5 font-normal dark:border-slate-700 dark:bg-slate-900">
                      Apostila: <strong>{node.subtotals.apostilaPercent}%</strong>
                    </span>
                    <span className="rounded border border-slate-200 bg-white/90 px-2 py-0.5 font-normal dark:border-slate-700 dark:bg-slate-900">
                      Fin. em Dia:{' '}
                      <strong>{node.subtotals.financeiroEmDiaPercent}%</strong>
                    </span>
                  </div>
                </div>
              </td>
            </tr>

            {!isCollapsed &&
              (node.children.length > 0
                ? renderGroupNodes(node.children)
                : node.students.map((st) =>
                    renderStudentRow(st, runningRowIndex++)
                  ))}
          </React.Fragment>
        );
      });
    };

    // Controles de filtro individuais por coluna no cabeçalho da tabela
    const renderHeaderFilterControl = (col: ResolvedTableColumn) => {
      const selectedMulti = filters.multiColumnFilters?.[col.id] || [];
      const hasMultiSelected = selectedMulti.length > 0;

      const renderMultiValuePopoverTrigger = () => {
        if (col.id === 'acoes') return null;
        return (
          <button
            type="button"
            data-testid={`multifilter-btn-${col.id}`}
            title={`Filtro múltiplo para ${col.label}`}
            onClick={(e) => {
              e.stopPropagation();
              setMultiFilterSearch('');
              setActiveMultiFilterCol((prev) =>
                prev === col.id ? null : col.id
              );
            }}
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border font-sans text-xs transition-colors ${
              hasMultiSelected
                ? 'border-[#004A8D] bg-[#004A8D] text-white dark:border-sky-400 dark:bg-sky-500'
                : 'border-slate-300 bg-white text-slate-500 hover:border-[#004A8D] hover:text-[#004A8D] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <Filter className="h-3 w-3" />
          </button>
        );
      };

      let primaryControl: React.ReactNode = null;

      switch (col.id) {
        case 'nomeCompleto':
          primaryControl = (
            <input
              type="text"
              aria-label="Filtrar por Nome do Aluno"
              data-testid="col-filter-nome"
              placeholder="Filtrar nome..."
              value={filters.nomeFilter || ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  nomeFilter: e.target.value,
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 font-sans text-xs font-normal text-slate-800 placeholder:text-slate-400 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          );
          break;

        case 'contrato':
          primaryControl = (
            <input
              type="text"
              aria-label="Filtrar por Número do Contrato"
              data-testid="col-filter-contrato"
              placeholder="Nº contrato..."
              value={filters.contratoFilter || ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  contratoFilter: e.target.value,
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 font-sans text-xs font-normal text-slate-800 placeholder:text-slate-400 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          );
          break;

        case 'formacao':
          primaryControl = (
            <select
              aria-label="Filtrar por Formação"
              data-testid="col-filter-capacitacao"
              value={filters.formacao || filters.capacitacao || 'TODAS'}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  formacao: e.target.value,
                  capacitacao: e.target.value,
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODAS">Todas ({filterOptions.formacoes.length})</option>
              {filterOptions.formacoes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          );
          break;

        case 'turno':
          primaryControl = (
            <select
              aria-label="Filtrar por Período"
              data-testid="col-filter-turno"
              value={filters.turno || 'TODOS'}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  turno: e.target.value,
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Todos</option>
              {filterOptions.turnos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          );
          break;

        case 'diaSemana':
          primaryControl = (
            <select
              aria-label="Filtrar por Dia da Aula"
              data-testid="col-filter-dia-aula"
              value={
                filters.diasSemana.length === 1 ? filters.diasSemana[0] : 'TODOS'
              }
              onChange={(e) => {
                const val = e.target.value;
                setFilters((prev) => ({
                  ...prev,
                  diasSemana: val === 'TODOS' ? [] : [val],
                }));
              }}
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Todos os dias</option>
              {DASHBOARD_WEEKDAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          );
          break;

        case 'horario':
          primaryControl = (
            <select
              aria-label="Filtrar por Horário da Aula"
              data-testid="col-filter-horario-aula"
              value={
                filters.horarios.length === 1 ? filters.horarios[0] : 'TODOS'
              }
              onChange={(e) => {
                const val = e.target.value;
                setFilters((prev) => ({
                  ...prev,
                  horarios: val === 'TODOS' ? [] : [val],
                }));
              }}
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Todos</option>
              {filterOptions.hours.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          );
          break;

        case 'sala':
          primaryControl = (
            <select
              aria-label="Filtrar por Sala de Aula"
              data-testid="col-filter-sala"
              value={filters.sala || 'TODAS'}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  sala: e.target.value,
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODAS">Todas</option>
              {filterOptions.salas.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          );
          break;

        case 'modulo':
          primaryControl = (
            <select
              aria-label="Filtrar por Módulo"
              data-testid="col-filter-modulo"
              value={filters.modulo || 'TODOS'}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  modulo: e.target.value,
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Todos ({filterOptions.modulos.length})</option>
              {filterOptions.modulos.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          );
          break;

        case 'educador':
          primaryControl = (
            <select
              aria-label="Filtrar por Educador"
              data-testid="col-filter-educador"
              value={filters.educador || 'TODOS'}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  educador: e.target.value,
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Todos ({filterOptions.educadores.length})</option>
              {filterOptions.educadores.map((ed) => (
                <option key={ed} value={ed}>
                  {ed}
                </option>
              ))}
              <option value="Sem vínculo válido">Sem vínculo válido</option>
            </select>
          );
          break;

        case 'aulaAtual':
          primaryControl = (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <input
                type="number"
                min={1}
                max={60}
                aria-label="Aula mínima"
                data-testid="dash-filter-aula-min"
                placeholder="De"
                value={filters.aulaMin ?? ''}
                onChange={(e) => {
                  const val = e.target.value
                    ? parseInt(e.target.value, 10)
                    : null;
                  setFilters((prev) => ({
                    ...prev,
                    aulaMin: val !== null && !Number.isNaN(val) ? val : null,
                  }));
                }}
                className="h-6 w-11 rounded border border-slate-300 bg-white px-1 text-center font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <input
                type="number"
                min={1}
                max={60}
                aria-label="Aula máxima"
                data-testid="dash-filter-aula-max"
                placeholder="Até"
                value={filters.aulaMax ?? ''}
                onChange={(e) => {
                  const val = e.target.value
                    ? parseInt(e.target.value, 10)
                    : null;
                  setFilters((prev) => ({
                    ...prev,
                    aulaMax: val !== null && !Number.isNaN(val) ? val : null,
                  }));
                }}
                className="h-6 w-11 rounded border border-slate-300 bg-white px-1 text-center font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          );
          break;

        case 'frequencia':
          primaryControl = (
            <select
              aria-label="Filtrar por Frequência Semanal"
              data-testid="dash-filter-frequencia"
              value={filters.frequenciaSemanal}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  frequenciaSemanal: e.target
                    .value as DashboardWeeklyAttendanceFilterType,
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Todas</option>
              <option value="COM_PRESENCA">Com presença</option>
              <option value="COM_FALTA">Com falta</option>
              <option value="PRESENCA_E_FALTA">Presença e falta</option>
            </select>
          );
          break;

        case 'agendamentos':
          primaryControl = (
            <select
              aria-label="Filtrar por Quantidade de Agendamentos"
              data-testid="col-filter-agendamentos"
              value={filters.agendamentosFilter || 'TODOS'}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  agendamentosFilter: e.target.value as
                    | 'TODOS'
                    | '1'
                    | '2'
                    | '3+',
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Todos</option>
              <option value="1">1 agendamento</option>
              <option value="2">2 agendamentos</option>
              <option value="3+">3+ agendamentos</option>
            </select>
          );
          break;

        case 'categoria':
          primaryControl = (
            <select
              aria-label="Filtrar por Categoria do Curso"
              data-testid="dash-filter-categoria"
              value={filters.categoriaCurso}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  categoriaCurso: e.target.value as CourseCategoryFilterType,
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Todas</option>
              <option value="INGLÊS">Inglês</option>
              <option value="PROFISSIONALIZANTE">Profissionalizante</option>
            </select>
          );
          break;

        case 'apostila':
          primaryControl = (
            <select
              aria-label="Filtrar por Entrega de Apostila"
              data-testid="dash-filter-apostila"
              value={filters.entregaApostila}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  entregaApostila: e.target.value as
                    | 'TODOS'
                    | 'ENTREGUE'
                    | 'NAO_ENTREGUE',
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Todas</option>
              <option value="ENTREGUE">Entregue</option>
              <option value="NAO_ENTREGUE">Não entregue</option>
            </select>
          );
          break;

        case 'financeiro':
          primaryControl = (
            <select
              aria-label="Filtrar por Situação Financeira"
              data-testid="dash-filter-financeiro"
              value={filters.situacaoFinanceira}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  situacaoFinanceira: e.target.value as FinancialFilterType,
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Todos</option>
              <option value="EM_DIA">Em dia</option>
              <option value="EM_ATRASO">Em atraso</option>
            </select>
          );
          break;

        case 'alertas':
          primaryControl = (
            <select
              aria-label="Filtrar por Alertas e NPS"
              data-testid="col-filter-alertas"
              value={filters.alertaFilter || 'TODOS'}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  alertaFilter: e.target.value as
                    | 'TODOS'
                    | 'EVASAO'
                    | 'NPS_ATIVO'
                    | 'AULA_4_SEM_APOSTILA'
                    | 'PRESENCA_SEM_NPS'
                    | 'REGULAR',
                }))
              }
              className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="TODOS">Todos</option>
              <option value="EVASAO">Evasões da Semana</option>
              <option value="NPS_ATIVO">NPS Ativo</option>
              <option value="AULA_4_SEM_APOSTILA">3+ Aulas s/ Apostila</option>
              <option value="PRESENCA_SEM_NPS">Presença s/ NPS</option>
              <option value="REGULAR">Regular</option>
            </select>
          );
          break;

        case 'acoes':
          return (
            <button
              type="button"
              onClick={handleResetAll}
              disabled={!hasActiveFilters}
              className={`inline-flex h-6 items-center gap-1 rounded border px-2 font-sans text-xs font-normal whitespace-nowrap transition-colors ${
                hasActiveFilters
                  ? 'border-slate-300 bg-white text-slate-700 hover:border-[#004A8D] hover:text-[#004A8D] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600'
              }`}
            >
              <RotateCcw className="h-3 w-3 shrink-0" />
              <span>Resetar</span>
            </button>
          );

        default:
          primaryControl = (
            <span className="truncate font-sans text-xs font-normal text-slate-500">
              {hasMultiSelected
                ? `${selectedMulti.length} selecionado(s)`
                : 'Todos'}
            </span>
          );
      }

      const isMultiPopoverOpen = activeMultiFilterCol === col.id;
      const distinctValues = isMultiPopoverOpen
        ? extractColumnDistinctValues(
            allUnfilteredAnalytics.filteredStudents,
            col.id
          ).filter((item) =>
            !multiFilterSearch.trim()
              ? true
              : item.value
                  .toLowerCase()
                  .includes(multiFilterSearch.trim().toLowerCase())
          )
        : [];

      return (
        <div className="relative flex items-center gap-1">
          {primaryControl}
          {renderMultiValuePopoverTrigger()}

          {isMultiPopoverOpen && (
            <div
              data-testid={`multifilter-popover-${col.id}`}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-7 left-0 z-50 w-64 rounded-lg border border-slate-300 bg-white p-2.5 font-sans text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="mb-1.5 flex items-center justify-between border-b border-slate-200 pb-1.5 dark:border-slate-800">
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  Filtrar: {col.shortLabel}
                </span>
                <div className="flex items-center gap-1">
                  {hasMultiSelected && (
                    <button
                      type="button"
                      onClick={() => handleClearMultiFilterColumn(col.id)}
                      className="rounded px-1.5 py-0.5 text-[#004A8D] hover:bg-sky-50 dark:text-sky-400"
                    >
                      Limpar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveMultiFilterCol(null)}
                    className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <input
                type="text"
                placeholder="Buscar valores..."
                value={multiFilterSearch}
                onChange={(e) => setMultiFilterSearch(e.target.value)}
                className="mb-2 h-6 w-full rounded border border-slate-300 bg-slate-50 px-2 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />

              <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                {distinctValues.map((opt) => {
                  const checked = selectedMulti.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-sky-50/80 dark:hover:bg-slate-800"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            handleToggleMultiFilterValue(col.id, opt.value)
                          }
                          className="h-3.5 w-3.5 rounded border-slate-300 text-[#004A8D]"
                        />
                        <span className="truncate font-normal text-slate-800 dark:text-slate-200">
                          {opt.value}
                        </span>
                      </span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-slate-500 tabular-nums dark:bg-slate-800 dark:text-slate-400">
                        {opt.count}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    };

    const pinnedCount = (frozenCol1 ? 1 : 0) + (frozenCol2 ? 1 : 0);

    return (
      <div
        data-testid="dashboard-view-container"
        className="flex h-full w-full flex-col gap-1.5 overflow-y-auto pr-0.5 pb-1"
      >
        {/* SEÇÃO 1: CARDS DE RESUMO DO CONSOLIDADO (ORGANIZADOS EM 2 LINHAS DE 3 CARDS) */}
        <section
          aria-label="Indicadores de resumo do Consolidado"
          data-testid="dashboard-kpi-cards-grid"
          className="grid shrink-0 grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {/* LINHA 1, CARD 1: FORMAÇÕES ATIVAS */}
          <div
            data-testid="dash-card-total-alunos"
            onClick={() => handleToggleCard('TOTAL_ALUNOS')}
            className={`flex cursor-pointer flex-col justify-between gap-1 rounded-lg border px-2.5 py-1.5 text-left transition-all ${
              isTotalCardActive
                ? 'border-[#004A8D] bg-sky-50/80 ring-1 ring-[#004A8D]/25 dark:border-sky-500 dark:bg-sky-950/40'
                : 'border-slate-200/90 bg-white hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <div className="flex w-full items-center justify-between gap-2 whitespace-nowrap">
              <span className="flex items-center gap-1 text-xs font-bold text-slate-800 whitespace-nowrap dark:text-slate-100">
                <GraduationCap className="h-3.5 w-3.5 shrink-0 text-[#004A8D] dark:text-sky-400" />
                <span>Formações ativas</span>
                <IndicatorHelpPopover
                  indicatorId="CONSOLIDADO_FORMACOES_ATIVAS"
                  align="left"
                />
              </span>
              <span className="text-sm font-black text-[#004A8D] tabular-nums whitespace-nowrap dark:text-sky-400">
                {metrics.formacoesAtivasCount}
              </span>
            </div>

            <div className="grid w-full grid-cols-2 gap-1 whitespace-nowrap">
              <button
                type="button"
                data-testid="dash-sub-cat-ingles"
                aria-pressed={isCardSelected('CATEGORIA_INGLES')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCard('CATEGORIA_INGLES');
                }}
                className={`flex h-6 items-center justify-between gap-1 rounded border px-2 text-left whitespace-nowrap transition-colors ${
                  isCardSelected('CATEGORIA_INGLES')
                    ? 'border-[#004A8D] bg-sky-100/90 ring-1 ring-[#004A8D]/30 dark:border-sky-400 dark:bg-sky-950/80'
                    : 'border-sky-200/80 bg-sky-50/60 hover:border-sky-400 dark:border-sky-800/60 dark:bg-sky-950/40'
                }`}
              >
                <span className="flex items-center gap-1 text-[11px] font-medium text-sky-900 dark:text-sky-300">
                  {isCardSelected('CATEGORIA_INGLES') && (
                    <Check className="h-2.5 w-2.5 shrink-0 text-[#004A8D] dark:text-sky-300" />
                  )}
                  <span>Inglês</span>
                </span>
                <span className="text-xs font-bold text-[#004A8D] tabular-nums dark:text-sky-300">
                  {metrics.inglesCount}
                </span>
              </button>

              <button
                type="button"
                data-testid="dash-sub-cat-profissionalizante"
                aria-pressed={isCardSelected('CATEGORIA_PROFISSIONALIZANTE')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCard('CATEGORIA_PROFISSIONALIZANTE');
                }}
                className={`flex h-6 items-center justify-between gap-1 rounded border px-2 text-left whitespace-nowrap transition-colors ${
                  isCardSelected('CATEGORIA_PROFISSIONALIZANTE')
                    ? 'border-[#004A8D] bg-sky-100/90 ring-1 ring-[#004A8D]/30 dark:border-sky-400 dark:bg-sky-950/80'
                    : 'border-slate-200/80 bg-slate-50/80 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/60'
                }`}
              >
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {isCardSelected('CATEGORIA_PROFISSIONALIZANTE') && (
                    <Check className="h-2.5 w-2.5 shrink-0 text-[#004A8D] dark:text-sky-300" />
                  )}
                  <span>Profissionalizante</span>
                </span>
                <span className="text-xs font-bold text-slate-800 tabular-nums dark:text-slate-200">
                  {metrics.profissionalizanteCount}
                </span>
              </button>
            </div>
          </div>

          {/* LINHA 1, CARD 2 (UNIFICADO): ALUNOS ATIVOS & POSSÍVEIS DESISTÊNCIAS */}
          <div
            data-testid="dash-card-merged-ativos-desistencias"
            className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200/90 bg-white px-2 py-1.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              type="button"
              data-testid="dash-card-alunos-ativos"
              aria-pressed={isAlunosAtivosUnicosActive}
              onClick={() => handleToggleCard('ALUNOS_ATIVOS_UNICOS')}
              className={`flex flex-col justify-between gap-0.5 rounded border px-2 py-1 text-left transition-all ${
                isAlunosAtivosUnicosActive
                  ? 'border-[#004A8D] bg-sky-50/90 ring-1 ring-[#004A8D]/30 dark:border-sky-500 dark:bg-sky-950/60'
                  : 'border-slate-200/80 bg-slate-50/50 hover:border-sky-300 dark:border-slate-800 dark:bg-slate-800/50'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-1 whitespace-nowrap">
                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-800 dark:text-slate-100">
                  <Users className="h-3 w-3 shrink-0 text-[#004A8D] dark:text-sky-400" />
                  <span>Alunos ativos</span>
                </span>
                <span className="text-xs font-black text-[#004A8D] tabular-nums dark:text-sky-400">
                  {metrics.alunosAtivosUnicosCount}
                </span>
              </div>
              <div className="flex w-full items-center justify-between gap-1 whitespace-nowrap">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Contratos unificados
                </span>
                {isAlunosAtivosUnicosActive && (
                  <Check className="h-2.5 w-2.5 shrink-0 text-[#004A8D] dark:text-sky-400" />
                )}
              </div>
            </button>

            <div
              role="button"
              tabIndex={0}
              data-testid="dash-card-possiveis-desistencias"
              aria-pressed={isPossiveisDesistenciasActive}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggleCard('POSSIVEIS_DESISTENCIAS');
                }
              }}
              onClick={() => handleToggleCard('POSSIVEIS_DESISTENCIAS')}
              className={`flex cursor-pointer flex-col justify-between gap-0.5 rounded border px-2 py-1 text-left transition-all ${
                isPossiveisDesistenciasActive
                  ? 'border-rose-600 bg-rose-50/90 ring-1 ring-rose-500/30 dark:border-rose-500 dark:bg-rose-950/60'
                  : 'border-rose-200/80 bg-rose-50/40 hover:border-rose-400 dark:border-rose-900/60 dark:bg-rose-950/25'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-1 whitespace-nowrap">
                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-800 dark:text-slate-100">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span className="truncate">Possíveis desistências</span>
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black text-rose-700 tabular-nums dark:text-rose-400">
                    {metrics.possiveisDesistenciasCount}
                  </span>
                  <IndicatorHelpPopover
                    indicatorId="CONSOLIDADO_ALUNOS_E_DESISTENCIAS"
                    align="center"
                  />
                </div>
              </div>
              <div className="flex w-full items-center justify-between gap-1 whitespace-nowrap">
                <span className="truncate text-[10px] text-rose-900/90 dark:text-rose-300">
                  Fin. atraso · S/ apostila · 0%
                </span>
                <span className="text-[10px] font-bold text-rose-700 tabular-nums dark:text-rose-400">
                  {metrics.possiveisDesistenciasPercent.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* LINHA 1, CARD 3: APOSTILAS */}
          <div
            data-testid="dash-card-apostila"
            onClick={() => handleToggleCard('APOSTILA_PENDENTE')}
            className={`flex cursor-pointer flex-col justify-between gap-1 rounded-lg border px-2.5 py-1.5 transition-all ${
              isApostilaCardActive
                ? 'border-[#004A8D] bg-sky-50/75 ring-1 ring-[#004A8D]/25 dark:border-sky-500 dark:bg-sky-950/35'
                : 'border-slate-200/90 bg-white hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2 whitespace-nowrap">
              <span className="flex items-center gap-1 text-xs font-bold text-slate-800 whitespace-nowrap dark:text-slate-100">
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#004A8D] dark:text-sky-400" />
                <span>Apostilas</span>
                <IndicatorHelpPopover
                  indicatorId="CONSOLIDADO_APOSTILAS"
                  align="right"
                />
              </span>
              <span className="text-[11px] font-bold text-emerald-700 tabular-nums whitespace-nowrap dark:text-emerald-400">
                {metrics.apostilaPercentualEntrega.toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 whitespace-nowrap">
              <button
                type="button"
                data-testid="dash-sub-apostila-entregue"
                aria-pressed={isCardSelected('APOSTILA_ENTREGUE')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCard('APOSTILA_ENTREGUE');
                }}
                className={`flex h-6 items-center justify-between gap-1 rounded border px-2 text-left whitespace-nowrap transition-colors ${
                  isCardSelected('APOSTILA_ENTREGUE')
                    ? 'border-emerald-600 bg-emerald-100/90 ring-1 ring-emerald-500/30 dark:border-emerald-400 dark:bg-emerald-950/80'
                    : 'border-slate-200/80 bg-slate-50/70 hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-800/60'
                }`}
              >
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {isCardSelected('APOSTILA_ENTREGUE') && (
                    <Check className="h-2.5 w-2.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                  )}
                  <span>Entregue</span>
                </span>
                <span className="text-xs font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                  {metrics.apostilaEntregueCount}
                </span>
              </button>

              <button
                type="button"
                data-testid="dash-sub-apostila-pendente"
                aria-pressed={isCardSelected('APOSTILA_PENDENTE')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCard('APOSTILA_PENDENTE');
                }}
                className={`flex h-6 items-center justify-between gap-1 rounded border px-2 text-left whitespace-nowrap transition-colors ${
                  isCardSelected('APOSTILA_PENDENTE')
                    ? 'border-rose-600 bg-rose-100/90 ring-1 ring-rose-500/30 dark:border-rose-400 dark:bg-rose-950/80'
                    : 'border-slate-200/80 bg-slate-50/70 hover:border-rose-300 dark:border-slate-800 dark:bg-slate-800/60'
                }`}
              >
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {isCardSelected('APOSTILA_PENDENTE') && (
                    <Check className="h-2.5 w-2.5 shrink-0 text-rose-700 dark:text-rose-400" />
                  )}
                  <span>Pendente</span>
                </span>
                <span className="text-xs font-bold text-rose-700 tabular-nums dark:text-rose-400">
                  {metrics.apostilaNaoEntregueCount}
                </span>
              </button>
            </div>
          </div>

          {/* LINHA 2, CARD 4: FINANCEIRO */}
          <div
            data-testid="dash-card-financeiro"
            onClick={() => handleToggleCard('FINANCEIRO_EM_ATRASO')}
            className={`flex cursor-pointer flex-col justify-between gap-1 rounded-lg border px-2.5 py-1.5 transition-all ${
              isFinanceiroCardActive
                ? 'border-[#004A8D] bg-sky-50/75 ring-1 ring-[#004A8D]/25 dark:border-sky-500 dark:bg-sky-950/35'
                : 'border-slate-200/90 bg-white hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2 whitespace-nowrap">
              <span className="flex items-center gap-1 text-xs font-bold text-slate-800 whitespace-nowrap dark:text-slate-100">
                <DollarSign className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Financeiro</span>
                <IndicatorHelpPopover
                  indicatorId="CONSOLIDADO_FINANCEIRO"
                  align="left"
                />
              </span>
              <span className="text-[11px] font-bold text-emerald-700 tabular-nums whitespace-nowrap dark:text-emerald-400">
                {metrics.financeiroEmDiaPercent.toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 whitespace-nowrap">
              <button
                type="button"
                data-testid="dash-sub-fin-em-dia"
                aria-pressed={isCardSelected('FINANCEIRO_EM_DIA')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCard('FINANCEIRO_EM_DIA');
                }}
                className={`flex h-6 items-center justify-between gap-1 rounded border px-2 text-left whitespace-nowrap transition-colors ${
                  isCardSelected('FINANCEIRO_EM_DIA')
                    ? 'border-emerald-600 bg-emerald-100/90 ring-1 ring-emerald-500/30 dark:border-emerald-400 dark:bg-emerald-950/80'
                    : 'border-slate-200/80 bg-slate-50/70 hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-800/60'
                }`}
              >
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {isCardSelected('FINANCEIRO_EM_DIA') && (
                    <Check className="h-2.5 w-2.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                  )}
                  <span>Em dia</span>
                </span>
                <span className="text-xs font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                  {metrics.financeiroEmDiaCount}
                </span>
              </button>

              <button
                type="button"
                data-testid="dash-sub-fin-atraso"
                aria-pressed={isCardSelected('FINANCEIRO_EM_ATRASO')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCard('FINANCEIRO_EM_ATRASO');
                }}
                className={`flex h-6 items-center justify-between gap-1 rounded border px-2 text-left whitespace-nowrap transition-colors ${
                  isCardSelected('FINANCEIRO_EM_ATRASO')
                    ? 'border-amber-600 bg-amber-100/90 ring-1 ring-amber-500/30 dark:border-amber-400 dark:bg-amber-950/80'
                    : 'border-slate-200/80 bg-slate-50/70 hover:border-amber-300 dark:border-slate-800 dark:bg-slate-800/60'
                }`}
              >
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {isCardSelected('FINANCEIRO_EM_ATRASO') && (
                    <Check className="h-2.5 w-2.5 shrink-0 text-amber-700 dark:text-amber-400" />
                  )}
                  <span>Em atraso</span>
                </span>
                <span className="text-xs font-bold text-amber-700 tabular-nums dark:text-amber-400">
                  {metrics.financeiroEmAtrasoCount}
                </span>
              </button>
            </div>
          </div>

          {/* LINHA 2, CARD 5 (UNIFICADO): FREQUÊNCIA & EVASÕES */}
          <div
            data-testid="dash-card-merged-frequencia-evasao"
            className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200/90 bg-white px-2 py-1.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              type="button"
              data-testid="dash-card-frequencia"
              aria-pressed={isFrequenciaCardActive}
              onClick={() => handleToggleCard('FREQUENCIA_TODOS')}
              className={`flex flex-col justify-between gap-0.5 rounded border px-2 py-1 text-left transition-all ${
                isFrequenciaCardActive
                  ? 'border-[#004A8D] bg-sky-50/90 ring-1 ring-[#004A8D]/30 dark:border-sky-500 dark:bg-sky-950/60'
                  : 'border-slate-200/80 bg-slate-50/50 hover:border-sky-300 dark:border-slate-800 dark:bg-slate-800/50'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-1 whitespace-nowrap">
                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-800 dark:text-slate-100">
                  <Percent className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>Frequência</span>
                </span>
                <span
                  data-testid="dash-freq-average-only"
                  className={`text-xs font-black tabular-nums ${
                    !metrics.hasFrequencyData
                      ? 'text-slate-500 dark:text-slate-400'
                      : metrics.frequenciaPercentual >= 85
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {metrics.hasFrequencyData
                    ? `${metrics.frequenciaPercentual.toFixed(1)}%`
                    : '0.0%'}
                </span>
              </div>
              <div className="flex w-full items-center justify-between gap-1 whitespace-nowrap">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Presenças / faltas
                </span>
                <span className="text-[10px] font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                  {metrics.presencaRegistrosCount ?? 0}P ·{' '}
                  {metrics.faltaRegistrosCount ?? 0}F
                </span>
              </div>
            </button>

            <div
              role="button"
              tabIndex={0}
              data-testid="dash-card-evasao"
              aria-pressed={isCardSelected('EVASAO')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggleCard('EVASAO');
                }
              }}
              onClick={() => handleToggleCard('EVASAO')}
              className={`flex cursor-pointer flex-col justify-between gap-0.5 rounded border px-2 py-1 text-left transition-all ${
                isCardSelected('EVASAO')
                  ? 'border-rose-600 bg-rose-50/90 ring-1 ring-rose-500/30 dark:border-rose-500 dark:bg-rose-950/60'
                  : 'border-rose-200/80 bg-rose-50/40 hover:border-rose-400 dark:border-rose-900/60 dark:bg-rose-950/25'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-1 whitespace-nowrap">
                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-800 dark:text-slate-100">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>Evasões</span>
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black text-rose-700 tabular-nums dark:text-rose-400">
                    {metrics.evadidosCount}
                  </span>
                  <IndicatorHelpPopover
                    indicatorId="CONSOLIDADO_FREQUENCIA_E_EVASOES"
                    align="center"
                  />
                </div>
              </div>
              <div className="flex w-full items-center justify-between gap-1 whitespace-nowrap">
                <span className="text-[10px] text-rose-900/90 dark:text-rose-300">
                  Taxa na semana
                </span>
                <span className="text-[10px] font-bold text-rose-700 tabular-nums dark:text-rose-400">
                  {metrics.evadidosPercent.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* LINHA 2, CARD 6 (UNIFICADO): SEM APOSTILA (3+ AULAS) & PRESENÇA S/ NPS */}
          <div
            data-testid="dash-card-resumo-aula4-nps"
            className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200/90 bg-white px-2 py-1.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              type="button"
              data-testid="dash-card-aula4-sem-apostila"
              aria-pressed={isCardSelected('AULA_4_SEM_APOSTILA_FIN_EM_DIA')}
              onClick={() => handleToggleCard('AULA_4_SEM_APOSTILA_FIN_EM_DIA')}
              className={`flex flex-col justify-between gap-0.5 rounded border px-2 py-1 text-left transition-all ${
                isCardSelected('AULA_4_SEM_APOSTILA_FIN_EM_DIA')
                  ? 'border-amber-600 bg-amber-50/90 ring-1 ring-amber-500/30 dark:border-amber-500 dark:bg-amber-950/60'
                  : 'border-amber-200/80 bg-amber-50/40 hover:border-amber-400 dark:border-amber-900/60 dark:bg-amber-950/25'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-1 whitespace-nowrap">
                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-800 dark:text-slate-100">
                  <BookX className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Sem apostila</span>
                </span>
                {isCardSelected('AULA_4_SEM_APOSTILA_FIN_EM_DIA') && (
                  <Check className="h-2.5 w-2.5 shrink-0 text-amber-700 dark:text-amber-400" />
                )}
              </div>
              <div className="flex w-full items-baseline justify-between gap-1 whitespace-nowrap">
                <span className="text-[10px] text-amber-900/90 dark:text-amber-300">
                  3+ aulas
                </span>
                <span className="text-xs font-black text-amber-800 tabular-nums dark:text-amber-400">
                  {metrics.aula4SemApostilaFinEmDiaCount}
                </span>
              </div>
            </button>

            <div
              role="button"
              tabIndex={0}
              data-testid="dash-card-presenca-sem-nps"
              aria-pressed={isCardSelected('PRESENCA_SEM_RESPOSTA_NPS')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggleCard('PRESENCA_SEM_RESPOSTA_NPS');
                }
              }}
              onClick={() => handleToggleCard('PRESENCA_SEM_RESPOSTA_NPS')}
              className={`flex cursor-pointer flex-col justify-between gap-0.5 rounded border px-2 py-1 text-left transition-all ${
                isCardSelected('PRESENCA_SEM_RESPOSTA_NPS')
                  ? 'border-purple-600 bg-purple-50/90 ring-1 ring-purple-500/30 dark:border-purple-500 dark:bg-purple-950/60'
                  : 'border-purple-200/80 bg-purple-50/40 hover:border-purple-400 dark:border-purple-900/60 dark:bg-purple-950/25'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-1 whitespace-nowrap">
                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-800 dark:text-slate-100">
                  <Sparkles className="h-3 w-3 shrink-0 text-purple-600 dark:text-purple-400" />
                  <span>Presença s/ NPS</span>
                </span>
                <div className="flex items-center gap-1">
                  {isCardSelected('PRESENCA_SEM_RESPOSTA_NPS') && (
                    <Check className="h-2.5 w-2.5 shrink-0 text-purple-700 dark:text-purple-400" />
                  )}
                  <IndicatorHelpPopover
                    indicatorId="CONSOLIDADO_SEM_APOSTILA_E_NPS"
                    align="right"
                  />
                </div>
              </div>
              <div className="flex w-full items-baseline justify-between gap-1 whitespace-nowrap">
                <span className="text-[10px] text-purple-900/90 dark:text-purple-300">
                  Pendente
                </span>
                <span className="text-xs font-black text-purple-800 tabular-nums dark:text-purple-400">
                  {metrics.presencaSemRespostaNpsCount}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* SEÇÃO 2: TABELA CONSOLIDADA DE ALUNOS (FLUIDA E LIMPA) */}
        <section
          aria-label="Tabela consolidada de informações dos alunos"
          data-testid="dashboard-students-list-section"
          className="flex min-h-[440px] flex-1 flex-col overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
          {/* BARRA ACIMA DO CABEÇALHO DA TABELA:
              - Esquerda: Botão Colunas + Título + Contador + Pesquisa + Controles de Expandir/Recolher Grupos + Limpar Filtros
              - Direita: Exportação de Dados (Excel .xlsx e PDF .pdf) */}
          <div
            data-testid="table-top-header-bar"
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 px-3 py-1.5 font-sans text-xs dark:border-slate-800 dark:bg-slate-800/70"
          >
            {/* LADO ESQUERDO: PAINEL DE COLUNAS, TÍTULO, PESQUISA, EXPANDIR/RECOLHER GRUPOS E LIMPAR FILTROS */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="btn-toggle-left-columns-panel"
                onClick={() => setShowLeftColumnPanel((prev) => !prev)}
                title="Exibir/ocultar painel lateral esquerdo de colunas, agrupamento e fixação"
                className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 font-sans text-xs font-semibold transition-colors ${
                  showLeftColumnPanel
                    ? 'border-[#004A8D] bg-[#004A8D] text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-[#004A8D] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <Columns3 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Colunas ({visibleColumnIds.length}/
                  {CONSOLIDATED_TABLE_COLUMNS.length})
                </span>
              </button>

              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <GraduationCap className="h-4 w-4 shrink-0 text-[#004A8D] dark:text-sky-400" />
                <h3 className="font-sans text-xs font-bold text-slate-900 dark:text-slate-100">
                  Tabela Consolidada
                </h3>
                <span
                  data-testid="consolidated-table-counter-badge"
                  className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 font-sans text-xs font-semibold text-[#004A8D] tabular-nums dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                >
                  {displayedStudents.length} de{' '}
                  {allUnfilteredAnalytics.filteredStudents.length} registros
                </span>
              </div>

              {/* Barra de Pesquisa (Nome ou Contrato) */}
              <div className="relative min-w-[210px] sm:min-w-[240px]">
                <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  aria-label="Pesquisar aluno por nome ou número do contrato"
                  data-testid="consolidated-table-search"
                  placeholder="Pesquisar nome ou nº do contrato..."
                  value={filters.search || ''}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, search: e.target.value }))
                  }
                  className="h-7 w-full rounded-lg border border-slate-300 bg-white pr-7 pl-8 font-sans text-xs font-normal text-slate-800 placeholder:text-slate-400 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                {filters.search && (
                  <button
                    type="button"
                    aria-label="Limpar pesquisa"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, search: '' }))
                    }
                    className="absolute top-1.5 right-2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Controles de Expandir / Recolher Todos quando houver dados agrupados na tabela */}
              {groupingEnabled && activeGroupByFields.length > 0 && (
                <div
                  data-testid="grouping-expand-collapse-controls"
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50/70 px-1.5 py-0.5 dark:border-sky-800 dark:bg-sky-950/40"
                >
                  <button
                    type="button"
                    data-testid="btn-expand-all-groups"
                    onClick={handleExpandAllGroups}
                    title="Expandir todos os grupos da tabela"
                    className="inline-flex h-6 items-center gap-1 rounded px-2 font-sans text-xs font-medium text-[#004A8D] hover:bg-white dark:text-sky-300 dark:hover:bg-slate-800"
                  >
                    <ChevronDown className="h-3 w-3 shrink-0" />
                    <span>Expandir</span>
                  </button>
                  <button
                    type="button"
                    data-testid="btn-collapse-all-groups"
                    onClick={handleCollapseAllGroups}
                    title="Recolher todos os grupos da tabela"
                    className="inline-flex h-6 items-center gap-1 rounded px-2 font-sans text-xs font-medium text-[#004A8D] hover:bg-white dark:text-sky-300 dark:hover:bg-slate-800"
                  >
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span>Recolher</span>
                  </button>
                  <button
                    type="button"
                    data-testid="btn-disable-grouping"
                    onClick={() => {
                      setGroupingEnabled(false);
                      setCollapsedGroupKeys(new Set());
                    }}
                    title="Desativar agrupamento"
                    className="inline-flex h-6 items-center gap-0.5 rounded px-1.5 font-sans text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Somente o botão Limpar Filtros Aplicados (sem textos verbosos de cards selecionados) */}
              {hasActiveFilters && (
                <button
                  type="button"
                  data-testid="dashboard-reset-filters"
                  onClick={handleResetAll}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 font-sans text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                >
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                  <span>Limpar filtros</span>
                </button>
              )}
            </div>

            {/* LADO DIREITO ACIMA DO CABEÇALHO DA TABELA: EXPORTAÇÃO DE DADOS (.XLSX e .PDF) */}
            <div
              data-testid="export-controls-group"
              className="ml-auto flex flex-wrap items-center justify-end gap-1.5"
            >
              <span className="inline-flex items-center gap-1 font-sans text-xs font-semibold text-slate-600 dark:text-slate-300">
                <Download className="h-3.5 w-3.5 shrink-0 text-[#004A8D] dark:text-sky-400" />
                <span>Exportar:</span>
              </span>

              <select
                aria-label="Escopo da exportação"
                data-testid="select-export-scope"
                value={exportScope}
                onChange={(e) =>
                  setExportScope(e.target.value as 'FILTERED' | 'ALL')
                }
                className="h-7 rounded-lg border border-slate-300 bg-white px-2 font-sans text-xs font-normal text-slate-800 focus:border-[#004A8D] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="FILTERED">
                  Filtrados ({displayedStudents.length})
                </option>
                <option value="ALL">
                  Todos ({allUnfilteredAnalytics.filteredStudents.length})
                </option>
              </select>

              <button
                type="button"
                data-testid="btn-export-xlsx"
                onClick={() => handleExportData('XLSX')}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-600 bg-emerald-600 px-2.5 font-sans text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-emerald-700"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                <span>Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                data-testid="btn-export-pdf"
                onClick={() => handleExportData('PDF')}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#004A8D] bg-[#004A8D] px-2.5 font-sans text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-[#00386B]"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>PDF (.pdf)</span>
              </button>

              {lastExportNotification && (
                <span
                  data-testid="export-success-toast"
                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-sans text-xs font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                >
                  {lastExportNotification}
                </span>
              )}
            </div>
          </div>

          {/* CORPO PRINCIPAL: PAINEL DE COLUNAS COMPACTO À ESQUERDA (CHECKBOX + AGRUPAR + FIXAR) + TABELA À DIREITA */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* PAINEL LATERAL ESQUERDO COMPACTO (w-44) */}
            {showLeftColumnPanel && (
              <aside
                aria-label="Seleção, agrupamento e fixação de colunas da tabela"
                data-testid="left-columns-panel"
                className="flex w-44 shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 font-sans text-[11px] dark:border-slate-800 dark:bg-slate-900/90"
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
                  <span className="font-sans text-[11px] font-bold text-slate-800 dark:text-slate-100">
                    Colunas ({pinnedCount}/2 fixas)
                  </span>
                  {pinnedCount > 0 && (
                    <button
                      type="button"
                      data-testid="btn-unfreeze-all"
                      title="Desafixar todas as colunas"
                      onClick={() => {
                        setFrozenCol1(null);
                        setFrozenCol2(null);
                      }}
                      className="inline-flex h-5 items-center gap-0.5 rounded border border-slate-200 bg-white px-1 font-sans text-[10px] font-medium text-slate-600 hover:border-rose-300 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <PinOff className="h-2.5 w-2.5 shrink-0" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 border-b border-slate-200 px-1.5 py-1 dark:border-slate-800">
                  <button
                    type="button"
                    data-testid="btn-select-all-columns"
                    onClick={handleSelectAllColumns}
                    className="flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-slate-700 hover:border-[#004A8D] hover:text-[#004A8D] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    data-testid="btn-restore-default-columns"
                    onClick={handleRestoreDefaultColumns}
                    className="flex-1 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-sans text-[10px] font-medium text-[#004A8D] hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                  >
                    Padrão
                  </button>
                </div>

                <div className="flex-1 space-y-0.5 overflow-y-auto p-1">
                  {CONSOLIDATED_TABLE_COLUMNS.map((def) => {
                    const isVisible = visibleColumnIds.includes(def.id);
                    const isPin1 = frozenCol1 === def.id;
                    const isPin2 = frozenCol2 === def.id;
                    const isPinned = isPin1 || isPin2;
                    const pinSlot = isPin1 ? 1 : isPin2 ? 2 : null;

                    const groupField = def.groupableField;
                    const isGrouped =
                      Boolean(groupField) &&
                      groupingEnabled &&
                      groupByFields.includes(groupField!);
                    const groupOrder =
                      groupField && isGrouped
                        ? groupByFields.indexOf(groupField) + 1
                        : null;

                    return (
                      <div
                        key={def.id}
                        data-testid={`left-col-item-${def.id}`}
                        className={`flex items-center justify-between gap-1 rounded border px-1.5 py-1 transition-colors ${
                          isPinned || isGrouped
                            ? 'border-[#004A8D]/40 bg-sky-50/90 dark:border-sky-600 dark:bg-sky-950/50'
                            : isVisible
                            ? 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-800/80'
                            : 'border-slate-200/40 bg-slate-100/50 opacity-60 dark:border-slate-800/40 dark:bg-slate-900'
                        }`}
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5">
                          <input
                            type="checkbox"
                            data-testid={`toggle-col-${def.id}`}
                            checked={isVisible}
                            onChange={() =>
                              handleToggleColumnVisibility(def.id)
                            }
                            className="h-3 w-3 shrink-0 rounded border-slate-300 text-[#004A8D]"
                          />
                          <span
                            title={def.label}
                            className="truncate font-sans text-[11px] leading-tight font-normal text-slate-800 dark:text-slate-200"
                          >
                            {def.shortLabel}
                          </span>
                        </label>

                        <div className="flex shrink-0 items-center gap-0.5">
                          {/* Ícone de Agrupar na lista à esquerda (apenas para Formação, Módulo, Dia da Aula, Horário, Sala, Modalidade e Categoria) */}
                          {groupField && (
                            <button
                              type="button"
                              data-testid={`group-col-${def.id}`}
                              aria-pressed={isGrouped}
                              title={
                                isGrouped
                                  ? `Agrupado por ${def.label} (${groupOrder}º nível) — clique para desagrupar`
                                  : `Agrupar tabela por ${def.label}`
                              }
                              onClick={() => handleToggleGroupOption(groupField)}
                              className={`inline-flex h-5 items-center gap-0.5 rounded border px-1 font-sans text-[10px] font-medium transition-colors ${
                                isGrouped
                                  ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-500'
                                  : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              <Layers className="h-2.5 w-2.5 shrink-0" />
                              {groupOrder && <span>{groupOrder}º</span>}
                            </button>
                          )}

                          {/* Ícone de Fixar Coluna (até 2 colunas fixadas) */}
                          <button
                            type="button"
                            data-testid={`pin-col-${def.id}`}
                            aria-pressed={isPinned}
                            title={
                              isPinned
                                ? `Coluna fixada (${pinSlot}ª posição) — clique para desafixar`
                                : 'Fixar esta coluna à esquerda (máx. 2 colunas)'
                            }
                            onClick={() => handlePinColumn(def.id)}
                            className={`inline-flex h-5 items-center gap-0.5 rounded border px-1 font-sans text-[10px] font-medium transition-colors ${
                              isPinned
                                ? 'border-[#004A8D] bg-[#004A8D] text-white dark:border-sky-500 dark:bg-sky-600'
                                : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-[#004A8D] hover:text-[#004A8D] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            <Pin className="h-2.5 w-2.5 shrink-0" />
                            {pinSlot && <span>{pinSlot}ª</span>}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </aside>
            )}

            {/* CONTAINER DE ROLAGEM HORIZONTAL E VERTICAL DA TABELA CONSOLIDADA */}
            <div
              data-testid="consolidated-table-scroll-container"
              className="flex-1 overflow-auto"
            >
              <table
                data-testid="consolidated-students-table"
                className="w-max min-w-full border-separate border-spacing-0 font-sans text-xs leading-4 text-left"
              >
                <thead className="sticky top-0 z-30 bg-slate-100 font-sans text-xs leading-4 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {/* LINHA 1 DO CABEÇALHO: TÍTULOS DAS COLUNAS + CLASSIFICAÇÃO (CRESCENTE / DECRESCENTE) */}
                  <tr className="font-sans text-xs leading-4 font-semibold [&>th]:border-b [&>th]:border-slate-300 dark:[&>th]:border-slate-800">
                    {effectiveColumns.map((col) => {
                      const alignClass =
                        col.align === 'center'
                          ? 'text-center justify-center'
                          : col.align === 'right'
                          ? 'text-right justify-end'
                          : 'text-left justify-between';

                      const stickyStyle: React.CSSProperties | undefined =
                        col.isFrozen
                          ? {
                              left: `${col.stickyLeftPx ?? 0}px`,
                              width: `${col.widthPx}px`,
                              minWidth: `${col.widthPx}px`,
                              maxWidth: `${col.widthPx}px`,
                            }
                          : {
                              minWidth: `${col.widthPx}px`,
                            };

                      return (
                        <th
                          key={col.id}
                          scope="col"
                          data-testid={`th-${COLUMN_TEST_ID_SUFFIX[col.id]}`}
                          data-col-id={col.id}
                          data-frozen-slot={col.frozenSlot ?? undefined}
                          style={stickyStyle}
                          className={`bg-slate-100 px-3 py-2 font-sans text-xs leading-4 font-semibold whitespace-nowrap text-slate-700 dark:bg-slate-900 dark:text-slate-200 ${
                            col.isFrozen
                              ? `sticky z-40 border-r border-slate-300 dark:border-slate-700 ${
                                  col.isLastFrozen
                                    ? 'shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'
                                    : ''
                                }`
                              : ''
                          }`}
                        >
                          {col.sortableField ? (
                            <button
                              type="button"
                              data-testid={`sort-${col.sortableField}`}
                              onClick={() =>
                                handleSortColumn(col.sortableField!)
                              }
                              className={`inline-flex w-full items-center gap-1 font-sans text-xs leading-4 font-semibold text-slate-700 hover:text-[#004A8D] dark:text-slate-200 dark:hover:text-sky-400 ${alignClass}`}
                            >
                              <span className="inline-flex items-center gap-1">
                                {col.isFrozen && (
                                  <Pin className="h-3 w-3 shrink-0 text-[#004A8D] dark:text-sky-400" />
                                )}
                                <span>{col.label}</span>
                              </span>
                              {renderSortIcon(col.sortableField)}
                            </button>
                          ) : (
                            <div
                              className={`inline-flex w-full items-center gap-1 font-sans text-xs leading-4 font-semibold text-slate-700 dark:text-slate-200 ${alignClass}`}
                            >
                              <span>{col.label}</span>
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>

                  {/* LINHA 2 DO CABEÇALHO: FILTROS DIRETAMENTE EM CADA COLUNA */}
                  <tr
                    data-testid="thead-column-filters-row"
                    className="bg-slate-50 font-sans text-xs leading-4 font-normal dark:bg-slate-900 [&>th]:border-b [&>th]:border-slate-200 dark:[&>th]:border-slate-800"
                  >
                    {effectiveColumns.map((col) => {
                      const stickyStyle: React.CSSProperties | undefined =
                        col.isFrozen
                          ? {
                              left: `${col.stickyLeftPx ?? 0}px`,
                              width: `${col.widthPx}px`,
                              minWidth: `${col.widthPx}px`,
                              maxWidth: `${col.widthPx}px`,
                            }
                          : {
                              minWidth: `${col.widthPx}px`,
                            };

                      return (
                        <th
                          key={col.id}
                          style={stickyStyle}
                          className={`bg-slate-50 px-2.5 py-1.5 font-sans text-xs leading-4 font-normal whitespace-nowrap dark:bg-slate-900 ${
                            col.isFrozen
                              ? `sticky z-40 border-r border-slate-300 dark:border-slate-700 ${
                                  col.isLastFrozen
                                    ? 'shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'
                                    : ''
                                }`
                              : ''
                          }`}
                        >
                          {renderHeaderFilterControl(col)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="font-sans text-xs leading-4 font-normal">
                  {displayedStudents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={effectiveColumns.length}
                        className="py-12 text-center font-sans text-xs leading-4 font-normal text-slate-500 whitespace-nowrap dark:text-slate-400"
                      >
                        Nenhum registro encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : groupingEnabled && activeGroupByFields.length > 0 ? (
                    renderGroupNodes(multiLevelGroupTree)
                  ) : (
                    displayedStudents.map((st, idx) =>
                      renderStudentRow(st, idx)
                    )
                  )}
                </tbody>

                {/* RODAPÉ DA TABELA CONSOLIDADA: TOTAL GERAL (SEM PRESENÇA E FALTA, APENAS FREQUÊNCIA) */}
                <tfoot
                  data-testid="consolidated-table-grand-total"
                  className="sticky bottom-0 z-30 bg-slate-100/95 font-sans text-xs leading-4 font-semibold text-slate-800 shadow-[0_-1px_4px_rgba(0,0,0,0.06)] dark:bg-slate-800 dark:text-slate-100"
                >
                  <tr className="[&>td]:border-t [&>td]:border-slate-300 dark:[&>td]:border-slate-700">
                    {effectiveColumns.map((col, idx) => {
                      const stickyStyle: React.CSSProperties | undefined =
                        col.isFrozen
                          ? {
                              left: `${col.stickyLeftPx ?? 0}px`,
                              width: `${col.widthPx}px`,
                              minWidth: `${col.widthPx}px`,
                              maxWidth: `${col.widthPx}px`,
                            }
                          : {
                              minWidth: `${col.widthPx}px`,
                            };

                      let content: React.ReactNode = '';
                      if (idx === 0) {
                        content = (
                          <span className="font-sans text-xs leading-4 font-semibold text-[#004A8D] dark:text-sky-300">
                            TOTAL GERAL: {grandTotals.studentCount} registros
                          </span>
                        );
                      } else if (col.id === 'frequencia') {
                        content = (
                          <span className="font-sans text-xs leading-4 font-semibold text-[#004A8D] tabular-nums dark:text-sky-300">
                            {grandTotals.frequenciaPercent !== null
                              ? `${grandTotals.frequenciaPercent.toFixed(1)}%`
                              : 'S/D'}
                          </span>
                        );
                      } else if (col.id === 'agendamentos') {
                        content = (
                          <span className="font-sans text-xs leading-4 font-semibold tabular-nums">
                            {grandTotals.agendamentosCount}
                          </span>
                        );
                      } else if (col.id === 'apostila') {
                        content = (
                          <span className="font-sans text-xs leading-4 font-semibold text-emerald-800 tabular-nums dark:text-emerald-300">
                            {grandTotals.apostilaEntregueCount} (
                            {grandTotals.apostilaPercent}%)
                          </span>
                        );
                      } else if (col.id === 'financeiro') {
                        content = (
                          <span className="font-sans text-xs leading-4 font-semibold text-emerald-800 tabular-nums dark:text-emerald-300">
                            {grandTotals.financeiroEmDiaCount} em dia (
                            {grandTotals.financeiroEmDiaPercent}%)
                          </span>
                        );
                      }

                      const alignClass =
                        col.align === 'center'
                          ? 'text-center'
                          : col.align === 'right'
                          ? 'text-right'
                          : 'text-left';

                      return (
                        <td
                          key={col.id}
                          style={stickyStyle}
                          className={`bg-slate-100 px-3 py-2 font-sans text-xs leading-4 font-semibold whitespace-nowrap dark:bg-slate-800 ${alignClass} ${
                            col.isFrozen
                              ? `sticky z-40 border-r border-slate-300 dark:border-slate-700 ${
                                  col.isLastFrozen
                                    ? 'shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'
                                    : ''
                                }`
                              : ''
                          }`}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>
      </div>
    );
  }
);
