import React from 'react';
import { ArrowRight, Download } from 'lucide-react';
import {
  CourseSummary,
  ScheduleSummary,
} from '../utils/performanceAnalytics';

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
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Desempenho Consolidado por Curso ({courses.length} disciplinas ativas)
          </h2>
          <p className="text-xs text-slate-500">
            Média de notas, volume de alunos agendados e taxa de conclusão por módulo na unidade Presidente Prudente
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
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
            <tbody className="divide-y divide-slate-200">
              {courses.map((c) => (
                <tr key={c.curso} className="transition-colors hover:bg-slate-50/80">
                  <td className="py-3 pl-4 pr-3 font-semibold text-slate-900">
                    {c.curso}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{c.formacao}</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {c.totalAlunos}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-700 tabular-nums">
                    {c.finalizados}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-blue-700 tabular-nums">
                    {c.iniciados}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-amber-700 tabular-nums">
                    {c.naoIniciados}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-700 tabular-nums">
                    {c.taxaConclusao.toFixed(1)}%
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                    {c.mediaNota !== null ? c.mediaNota.toFixed(2) : '—'}
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onExportCourseCsv(c.curso)}
                        aria-label={`Exportar CSV do curso ${c.curso}`}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                      >
                        <Download className="h-3 w-3" />
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectCourse(c.curso)}
                        className="inline-flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
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
    </div>
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
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">
          Ocupação e Desempenho por Horário e Turno ({schedules.length} faixas horárias)
        </h2>
        <p className="text-xs text-slate-500">
          Acompanhamento de presença presencial vs. online e média de notas em cada faixa de agendamento
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
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
            <tbody className="divide-y divide-slate-200">
              {schedules.map((s) => (
                <tr key={s.horario} className="transition-colors hover:bg-slate-50/80">
                  <td className="py-3 pl-4 pr-3 font-mono font-semibold text-slate-900 tabular-nums">
                    {s.horario}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{s.turno}</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {s.total}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-600 tabular-nums">
                    {s.presencial} pres. · {s.online} onl.
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                    {s.finalizados}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-blue-700 tabular-nums">
                    {s.iniciados}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-amber-700 tabular-nums">
                    {s.naoIniciados}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                    {s.mediaNota !== null ? s.mediaNota.toFixed(2) : '—'}
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onExportScheduleCsv(s.horario)}
                        aria-label={`Exportar CSV do horário ${s.horario}`}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                      >
                        <Download className="h-3 w-3" />
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectSchedule(s.horario)}
                        className="inline-flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
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
    </div>
  );
};
