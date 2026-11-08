import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, BarChart3, Clock, Download } from 'lucide-react';
import {
  CourseSummary,
  ScheduleSummary,
} from '../utils/performanceAnalytics';
import { useToast } from './uiSystem';

interface CourseAnalyticsViewProps {
  courses: CourseSummary[];
  onSelectCourse: (curso: string) => void;
  onExportCourseCsv: (curso: string) => void;
}

export const CourseAnalyticsView: React.FC<CourseAnalyticsViewProps> = ({
  courses,
  onSelectCourse,
  onExportCourseCsv,
}) => {
  const { toast } = useToast();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[var(--color-primary)] dark:bg-blue-950/60">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="typo-title-section text-[var(--text-primary)]">
              Desempenho Consolidado por Curso ({courses.length} disciplinas ativas)
            </h2>
            <p className="typo-meta text-[var(--text-secondary)]">
              Média de notas, volume de alunos agendados e taxa de conclusão por módulo na unidade Presidente Prudente
            </p>
          </div>
        </div>
      </div>

      <div className="surface-solid overflow-hidden rounded-2xl border border-[var(--border-color)] shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/80 text-[var(--text-secondary)]">
                <th className="py-3 pl-4 pr-3 font-semibold">Curso / Disciplina</th>
                <th className="px-3 py-3 font-semibold">Formação</th>
                <th className="px-3 py-3 text-right font-semibold">Total Alunos</th>
                <th className="px-3 py-3 text-right font-semibold">Finalizados</th>
                <th className="px-3 py-3 text-right font-semibold">Em Aula</th>
                <th className="px-3 py-3 text-right font-semibold">Não Iniciados</th>
                <th className="px-3 py-3 text-right font-semibold">Taxa Conclusão</th>
                <th className="px-3 py-3 text-right font-semibold">Média Nota</th>
                <th className="py-3 pl-3 pr-4 text-right font-semibold">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {courses.map((c, idx) => (
                <tr
                  key={c.curso}
                  className="transition-colors hover:bg-blue-50/40 dark:hover:bg-slate-800/60"
                >
                  <td className="py-3 pl-4 pr-3 font-semibold text-[var(--text-primary)]">
                    {c.curso}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">{c.formacao}</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                    {c.totalAlunos}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {c.finalizados}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[var(--color-primary)] tabular-nums">
                    {c.iniciados}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-amber-700 dark:text-amber-400 tabular-nums">
                    {c.naoIniciados}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[var(--text-primary)] tabular-nums">
                    <div className="inline-flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, Math.max(0, c.taxaConclusao))}%` }}
                          transition={{ duration: 0.5, delay: Math.min(idx * 0.03, 0.3) }}
                          className="h-full rounded-full bg-emerald-500"
                        />
                      </div>
                      <span>{c.taxaConclusao.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[var(--text-primary)] tabular-nums">
                    {c.mediaNota !== null ? c.mediaNota.toFixed(2) : '—'}
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onExportCourseCsv(c.curso);
                          toast({
                            type: 'success',
                            title: 'CSV do Curso Exportado',
                            message: `Dados da disciplina ${c.curso} baixados.`,
                          });
                        }}
                        aria-label={`Exportar CSV do curso ${c.curso}`}
                        className="btn-press inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Download className="h-3 w-3" />
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectCourse(c.curso)}
                        className="btn-press inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Ver Alunos
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};

interface ScheduleAnalyticsViewProps {
  schedules: ScheduleSummary[];
  onSelectSchedule: (horario: string) => void;
  onExportScheduleCsv: (horario: string) => void;
}

export const ScheduleAnalyticsView: React.FC<ScheduleAnalyticsViewProps> = ({
  schedules,
  onSelectSchedule,
  onExportScheduleCsv,
}) => {
  const { toast } = useToast();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-[var(--color-secondary)] dark:bg-indigo-950/60">
          <Clock className="h-5 w-5" />
        </div>
        <div>
          <h2 className="typo-title-section text-[var(--text-primary)]">
            Ocupação e Desempenho por Horário e Turno ({schedules.length} faixas horárias)
          </h2>
          <p className="typo-meta text-[var(--text-secondary)]">
            Acompanhamento de presença presencial vs. online e média de notas em cada faixa de agendamento
          </p>
        </div>
      </div>

      <div className="surface-solid overflow-hidden rounded-2xl border border-[var(--border-color)] shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/80 text-[var(--text-secondary)]">
                <th className="py-3 pl-4 pr-3 font-semibold">Faixa de Horário</th>
                <th className="px-3 py-3 font-semibold">Turno</th>
                <th className="px-3 py-3 text-right font-semibold">Total Agendados</th>
                <th className="px-3 py-3 text-right font-semibold">Presencial / Online</th>
                <th className="px-3 py-3 text-right font-semibold">Finalizados</th>
                <th className="px-3 py-3 text-right font-semibold">Em Aula</th>
                <th className="px-3 py-3 text-right font-semibold">Não Iniciados</th>
                <th className="px-3 py-3 text-right font-semibold">Média Nota</th>
                <th className="py-3 pl-3 pr-4 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {schedules.map((s) => (
                <tr
                  key={s.horario}
                  className="transition-colors hover:bg-blue-50/40 dark:hover:bg-slate-800/60"
                >
                  <td className="py-3 pl-4 pr-3 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                    {s.horario}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">{s.turno}</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                    {s.total}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[var(--text-secondary)] tabular-nums">
                    {s.presencial} pres. · {s.online} onl.
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {s.finalizados}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-[var(--color-primary)] tabular-nums">
                    {s.iniciados}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                    {s.naoIniciados}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[var(--text-primary)] tabular-nums">
                    {s.mediaNota !== null ? s.mediaNota.toFixed(2) : '—'}
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onExportScheduleCsv(s.horario);
                          toast({
                            type: 'success',
                            title: 'CSV de Horário Exportado',
                            message: `Faixa ${s.horario} exportada com sucesso.`,
                          });
                        }}
                        aria-label={`Exportar CSV do horário ${s.horario}`}
                        className="btn-press inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Download className="h-3 w-3" />
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectSchedule(s.horario)}
                        className="btn-press inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Filtrar Horário
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};
