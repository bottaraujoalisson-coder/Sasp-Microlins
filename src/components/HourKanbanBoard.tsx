import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  BookOpen,
  BookX,
  CheckCircle2,
  Clock,
  ExternalLink,
  KeyRound,
  MessageCircle,
  Pin,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import {
  EvaluatedStudentRecord,
  formatFullSalaName,
  formatModuleDisplay,
  hasFrequencyData,
  HourKanbanColumn,
  isNotStartedAttendanceStatus,
} from '../utils/performanceAnalytics';
import { SmartAvatar } from './uiSystem';

interface HourKanbanBoardProps {
  columns: HourKanbanColumn[];
  onSelectStudent: (id: number) => void;
}

export const HourKanbanBoard: React.FC<HourKanbanBoardProps> = React.memo(({
  columns,
  onSelectStudent,
}) => {
  const { pinnedCurrentColumn, scrollableOtherColumns } = useMemo(() => {
    const current = columns.find((col) => col.isCurrentHour) || null;
    const others = columns.filter((col) => !col.isCurrentHour);
    return {
      pinnedCurrentColumn: current,
      scrollableOtherColumns: others,
    };
  }, [columns]);

  if (columns.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="glass-card flex h-full flex-col items-center justify-center rounded-2xl p-8 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <Users className="h-6 w-6" />
        </div>
        <h3 className="typo-title-section mt-3 text-[var(--text-primary)]">
          Nenhum agendamento encontrado para os filtros selecionados
        </h3>
        <p className="typo-meta mt-1 text-[var(--text-secondary)]">
          Ajuste os filtros na barra superior ou limpe a busca para visualizar todas as turmas.
        </p>
      </motion.div>
    );
  }

  const getStudentStageBadge = (student: EvaluatedStudentRecord) => {
    if (student.attendanceStatus === 'Presença') {
      return {
        label: 'Presença',
        title: student.scheduleStageLabel || 'Presença registrada',
        classes:
          'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300',
        icon: <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />,
      };
    }

    if (student.attendanceStatus === 'Falta') {
      return {
        label: 'Falta',
        title: student.scheduleStageLabel || 'Falta identificada',
        classes:
          'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300',
        icon: <XCircle className="h-3 w-3 shrink-0 text-rose-600 dark:text-rose-400" />,
      };
    }

    return {
      label: 'Não iniciada',
      title: student.scheduleStageLabel || 'Não iniciada',
      classes:
        'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
      icon: <Clock className="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400" />,
    };
  };

  const getCardSurfaceClasses = (student: EvaluatedStudentRecord) => {
    if (student.attendanceStatus === 'Presença') {
      return 'border-emerald-200/90 bg-[var(--surface-card)] hover:border-emerald-400 dark:border-emerald-900/70 dark:hover:border-emerald-700';
    }
    if (student.attendanceStatus === 'Falta') {
      return 'border-rose-200/90 bg-[var(--surface-card)] hover:border-rose-400 dark:border-rose-900/70 dark:hover:border-rose-700';
    }
    if (!isNotStartedAttendanceStatus(student.attendanceStatus)) {
      return 'border-[var(--border-color)] bg-[var(--surface-card)] hover:border-slate-400 dark:hover:border-slate-600';
    }
    return 'border-[var(--border-color)] bg-[var(--surface-card)] hover:border-[var(--color-primary)]/60';
  };

  const renderColumn = (col: HourKanbanColumn) => {
    const hasColumnFreqData = hasFrequencyData(
      col.presencaCount,
      col.faltaCount
    );
    const isColumnFreqGreen = col.mediaFrequencia >= 85;

    const columnContainerClasses = col.isCurrentHour
      ? 'border-2 border-[var(--color-primary)] bg-blue-50/60 shadow-lg ring-2 ring-[var(--color-primary)]/15 dark:border-blue-500 dark:bg-blue-950/30 dark:ring-blue-500/20'
      : col.isPastHour
      ? 'border border-emerald-300/90 bg-emerald-50/25 dark:border-emerald-800/70 dark:bg-emerald-950/15'
      : 'border border-[var(--border-color)] bg-[var(--bg-secondary)]/90';

    const columnHeaderClasses = col.isCurrentHour
      ? 'border-b border-blue-700 bg-[var(--color-primary)] text-white dark:border-blue-600 dark:bg-blue-600'
      : col.isPastHour
      ? 'border-b border-emerald-200/90 bg-emerald-100/75 text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-100'
      : 'border-b border-[var(--border-color)] bg-[var(--surface-card)] text-[var(--text-primary)]';

    return (
      <section
        key={col.hourKey}
        aria-label={`Horário ${col.hourKey}`}
        data-hour-key={col.hourKey}
        data-column-state={
          col.isCurrentHour ? 'current' : col.isPastHour ? 'past' : 'future'
        }
        className={`flex h-full w-[338px] shrink-0 flex-col overflow-hidden rounded-2xl transition-colors sm:w-[354px] ${columnContainerClasses}`}
      >
        {/* Cabeçalho da Coluna */}
        <div className={`shrink-0 px-3.5 py-2.5 ${columnHeaderClasses}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="typo-title-section font-mono tabular-nums">
                {col.hourKey}
              </span>

              {col.isCurrentHour && (
                <span className="typo-badge inline-flex items-center gap-1 rounded-md border border-white/30 bg-white/15 px-1.5 py-0.5 text-white">
                  <Pin className="h-2.5 w-2.5 text-blue-100" />
                  <span>Em andamento</span>
                </span>
              )}

              {col.isPastHour && (
                <span className="typo-badge inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white/90 px-1.5 py-0.5 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-200">
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Concluído</span>
                </span>
              )}

              {col.isFutureHour && (
                <span className="typo-badge inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <Clock className="h-2.5 w-2.5 text-slate-500 dark:text-slate-400" />
                  <span>Futuro</span>
                </span>
              )}
            </div>

            <span
              className={`typo-meta font-mono font-semibold tabular-nums ${
                col.isCurrentHour
                  ? 'text-blue-100'
                  : col.isPastHour
                  ? 'text-emerald-800 dark:text-emerald-200'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              {col.totalAgendamentos}{' '}
              {col.totalAgendamentos === 1 ? 'aluno' : 'alunos'}
            </span>
          </div>

          {/* Indicadores compactos da coluna */}
          <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl border border-slate-200/80 bg-white/95 px-2 py-1.5 text-center text-slate-800 tabular-nums dark:border-slate-700/80 dark:bg-slate-900/95 dark:text-slate-200">
            <div>
              <div className="typo-badge text-slate-500 dark:text-slate-400">
                Presenças
              </div>
              <div className="typo-subtitle font-mono font-bold text-emerald-700 dark:text-emerald-400">
                {col.presencaCount}
              </div>
            </div>
            <div className="border-l border-slate-200/70 dark:border-slate-700">
              <div className="typo-badge text-slate-500 dark:text-slate-400">
                Faltas
              </div>
              <div className="typo-subtitle font-mono font-bold text-rose-700 dark:text-rose-400">
                {col.faltaCount}
              </div>
            </div>
            <div className="border-l border-slate-200/70 dark:border-slate-700">
              <div className="typo-badge text-slate-500 dark:text-slate-400">
                Não inic.
              </div>
              <div className="typo-subtitle font-mono font-bold text-slate-700 dark:text-slate-300">
                {col.naoIniciadoCount}
              </div>
            </div>
            <div className="border-l border-slate-200/70 dark:border-slate-700">
              <div className="typo-badge text-slate-500 dark:text-slate-400">
                Freq.
              </div>
              <div
                className={`typo-subtitle font-mono font-bold ${
                  !hasColumnFreqData
                    ? 'text-slate-500 dark:text-slate-400'
                    : isColumnFreqGreen
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {hasColumnFreqData ? `${col.mediaFrequencia.toFixed(0)}%` : 'S/D'}
              </div>
            </div>
          </div>
        </div>

        {/* Cards padronizados com 3 linhas verticais (Sala, Matéria, Professor) */}
        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
          {col.students.map((student, idx) => {
            const stageBadge = getStudentStageBadge(student);
            const cardSurface = getCardSurfaceClasses(student);
            const salaDisplay = formatFullSalaName(student.sala);
            const moduloDisplay = formatModuleDisplay(
              student.moduloAtual || student.curso
            );
            const professorDisplay =
              (student.educador || student.professor || '').trim() ||
              'Não informado';

            const statusDot =
              student.attendanceStatus === 'Presença'
                ? 'success'
                : student.attendanceStatus === 'Falta'
                ? 'error'
                : student.inadimplente
                ? 'warning'
                : 'neutral';

            return (
              <motion.article
                key={student.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.22,
                  delay: Math.min(idx * 0.025, 0.25),
                  ease: [0.2, 0.8, 0.2, 1],
                }}
                onClick={() => onSelectStudent(student.id)}
                data-testid="kanban-student-card"
                data-attendance-status={student.attendanceStatus}
                data-schedule-stage={student.scheduleStage}
                data-evasao={student.isEvasao ? 'true' : 'false'}
                data-nps-ativo={student.hasActiveNps ? 'true' : 'false'}
                data-nps-destinatario={
                  student.npsInvitation?.npsDestinatario || ''
                }
                data-possui-apostila={student.possuiApostila ? 'true' : 'false'}
                data-categoria-curso={student.categoriaCurso}
                data-situacao-financeira={
                  student.inadimplente ? 'EM_ATRASO' : 'EM_DIA'
                }
                className={`hover-elevate group flex flex-col justify-between cursor-pointer rounded-xl border p-3 shadow-xs transition-all duration-200 ${cardSurface}`}
              >
                {/* Cabeçalho do Card: Avatar + Nome do aluno + Status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <SmartAvatar
                      name={student.nomeCompleto}
                      contrato={student.contrato}
                      size="sm"
                      statusDot={statusDot}
                    />
                    <div className="min-w-0 flex-1">
                      <h3
                        title={student.nomeCompleto}
                        className="min-w-0 truncate text-xs font-bold whitespace-nowrap text-[var(--text-primary)] group-hover:text-[var(--color-primary)]"
                      >
                        {student.nomeCompleto}
                      </h3>
                      <span className="block font-mono text-[10px] font-semibold text-[var(--text-secondary)]">
                        #{student.contrato}
                      </span>
                    </div>
                  </div>

                  <span
                    data-testid="student-card-status-badge"
                    title={stageBadge.title}
                    className={`typo-badge inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 whitespace-nowrap ${stageBadge.classes}`}
                  >
                    {stageBadge.icon}
                    <span>{stageBadge.label}</span>
                  </span>
                </div>

                {/* Bloco Vertical em 3 Linhas: 1ª Sala | 2ª Matéria | 3ª Professor */}
                <div className="mt-2.5 flex flex-col gap-1 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-1.5 text-[11px] leading-snug dark:border-slate-800/80 dark:bg-slate-800/40">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0 font-semibold text-[var(--text-secondary)]">
                      Sala:
                    </span>
                    <span
                      data-testid="student-card-sala"
                      className="min-w-0 flex-1 truncate font-bold text-[var(--text-primary)]"
                      title={salaDisplay}
                    >
                      {salaDisplay}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0 font-semibold text-[var(--text-secondary)]">
                      Matéria:
                    </span>
                    <span
                      data-testid="student-card-modulo"
                      title={moduloDisplay}
                      className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-300"
                    >
                      {moduloDisplay}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0 font-semibold text-[var(--text-secondary)]">
                      Professor:
                    </span>
                    <span
                      data-testid="student-card-professor"
                      title={professorDisplay}
                      className="min-w-0 flex-1 truncate font-semibold text-[var(--color-primary)]"
                    >
                      {professorDisplay}
                    </span>
                  </div>
                </div>

                {/* Rodapé do Card: Aula atual, indicadores essenciais e atalhos rápidos */}
                <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                  <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
                    <span className="rounded-md border border-slate-200/80 bg-slate-50 px-1.5 py-0.5 font-mono font-semibold whitespace-nowrap text-slate-700 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {student.aulaAtualLabel}
                    </span>

                    <div
                      data-testid="student-card-apostila-icon"
                      title={
                        student.possuiApostila
                          ? 'Apostila entregue'
                          : 'Sem apostila'
                      }
                      aria-label={
                        student.possuiApostila
                          ? 'Apostila entregue'
                          : 'Apostila não entregue'
                      }
                      className={`flex h-5 w-6 shrink-0 items-center justify-center rounded-md border ${
                        student.possuiApostila
                          ? 'border-emerald-200/90 bg-emerald-50/80 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : 'border-rose-200/90 bg-rose-50/80 text-rose-600 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-400'
                      }`}
                    >
                      {student.possuiApostila ? (
                        <BookOpen className="h-3 w-3 shrink-0" />
                      ) : (
                        <BookX className="h-3 w-3 shrink-0" />
                      )}
                    </div>

                    {student.hasActiveNps && (
                      <span
                        data-testid="student-card-nps-badge"
                        className="typo-badge inline-flex items-center gap-0.5 rounded-md border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-purple-800 whitespace-nowrap dark:border-purple-800/70 dark:bg-purple-950/60 dark:text-purple-300"
                      >
                        <Sparkles className="h-2.5 w-2.5 text-purple-600 dark:text-purple-400" />
                        <span>NPS</span>
                      </span>
                    )}

                    {student.isEvasao && (
                      <span
                        title="Evasão identificada no dia"
                        className="typo-badge inline-flex items-center gap-0.5 rounded-md border border-rose-200/90 bg-rose-50 px-1.5 py-0.5 text-rose-700 whitespace-nowrap dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                      >
                        <AlertTriangle className="h-2.5 w-2.5 text-rose-600 dark:text-rose-400" />
                        <span>Evasão</span>
                      </span>
                    )}
                  </div>

                  {/* Ações rápidas */}
                  <div
                    className="flex shrink-0 items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <a
                      href={student.whatsappResponsavelContactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Contatar responsável de ${student.nomeCompleto}`}
                      className="btn-press inline-flex h-6 items-center gap-1 rounded-md border border-sky-200 bg-sky-50/70 px-1.5 text-[11px] font-medium text-sky-900 transition-colors hover:bg-sky-100 dark:border-sky-800/70 dark:bg-sky-950/50 dark:text-sky-200"
                    >
                      <MessageCircle className="h-3 w-3 shrink-0 text-sky-700 dark:text-sky-400" />
                    </a>

                    <a
                      href={student.linkAcessoDireto}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="student-login-link"
                      title={`Acessar aula de ${student.nomeCompleto}`}
                      className="btn-press inline-flex h-6 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50/70 px-1.5 text-[11px] font-medium text-emerald-900 transition-colors hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-200"
                    >
                      <KeyRound className="h-3 w-3 shrink-0 text-emerald-700 dark:text-emerald-400" />
                      <span>Aula</span>
                      <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" />
                    </a>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div
      data-testid="student-kanban-container"
      className="flex h-full w-full items-stretch gap-3 overflow-hidden"
    >
      {pinnedCurrentColumn && (
        <div
          data-testid="pinned-current-hour-wrapper"
          className="flex h-full shrink-0 items-stretch border-r border-[var(--border-color)] pr-2"
        >
          {renderColumn(pinnedCurrentColumn)}
        </div>
      )}

      <div
        data-testid="scrollable-hours-wrapper"
        className="flex h-full min-w-0 flex-1 items-stretch gap-3 overflow-x-auto pb-1"
      >
        {scrollableOtherColumns.map((col) => renderColumn(col))}
      </div>
    </div>
  );
});
