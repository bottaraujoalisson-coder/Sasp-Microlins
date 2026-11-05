import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  Mail,
  Pin,
  Sparkles,
} from 'lucide-react';
import { ActiveNpsInvitation } from '../data/microlinsData';
import {
  formatFullSalaName,
  NpsHourKanbanColumn,
  SynchronizedNpsStudentCard,
} from '../utils/performanceAnalytics';
import { prioritizeNpsInPortalSupabase } from '../utils/supabaseClient';
import { NpsResendEmailModal } from './NpsResendEmailModal';

interface NpsHourKanbanBoardProps {
  columns: NpsHourKanbanColumn[];
  onSelectStudentCard: (studentCard: SynchronizedNpsStudentCard) => void;
  currentTimeStr: string;
  operatorLogin?: string;
  operatorRole?: string;
  isAuthorizedForRecovery?: boolean;
  onInvitationUpdated?: (
    inviteId: string,
    patch: Partial<ActiveNpsInvitation>,
    updatedContractEmail?: { contrato: string; email: string }
  ) => void;
}

export const NpsHourKanbanBoard: React.FC<NpsHourKanbanBoardProps> = React.memo(
  ({
    columns,
    onSelectStudentCard,
    operatorLogin = 'coordenacao',
    operatorRole = 'COORDENACAO',
    isAuthorizedForRecovery = true,
    onInvitationUpdated,
  }) => {
    const [resendTargetCard, setResendTargetCard] =
      useState<SynchronizedNpsStudentCard | null>(null);
    const [prioritizingId, setPrioritizingId] = useState<string | null>(null);

    const { pinnedCurrentColumn, scrollableOtherColumns } = useMemo(() => {
      const current = columns.find((col) => col.isCurrentHour) || null;
      const others = columns.filter((col) => !col.isCurrentHour);
      return {
        pinnedCurrentColumn: current,
        scrollableOtherColumns: others,
      };
    }, [columns]);

    const handleCardPrioritizePortal = async (
      card: SynchronizedNpsStudentCard
    ) => {
      const latest = card.latestActiveInvitation;
      if (prioritizingId || latest.answered || !isAuthorizedForRecovery) return;
      setPrioritizingId(latest.id);
      const nextPriorizar = !Boolean(latest.priorizarNpsNoLogin);
      const ciclo = latest.pontoJornada || '30 dias';

      try {
        let timestamp = new Date().toISOString();
        try {
          const res = await fetch('/api/nps/prioritize-portal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              inviteId: latest.id,
              contrato: card.linkedContrato,
              studentName: card.linkedStudentName,
              pontoJornada: ciclo,
              priorizar: nextPriorizar,
              operatorLogin,
              operatorRole,
            }),
          });
          const data = await res.json();
          if (res.ok && data.ok) {
            timestamp = data.timestamp || timestamp;
          } else {
            throw new Error(data?.error || 'Fallback');
          }
        } catch {
          const supaRes = await prioritizeNpsInPortalSupabase({
            inviteId: latest.id,
            contrato: card.linkedContrato,
            studentName: card.linkedStudentName,
            pontoJornada: ciclo,
            priorizar: nextPriorizar,
            operatorLogin,
            operatorRole,
          });
          timestamp = supaRes.timestamp;
        }

        onInvitationUpdated?.(latest.id, {
          priorizarNpsNoLogin: nextPriorizar,
          cicloPriorizado: ciclo,
          priorizadoPor: operatorLogin,
          priorizadoEm: timestamp,
        });
      } catch {
        // Silently handled
      } finally {
        setPrioritizingId(null);
      }
    };

    if (columns.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <h3 className="typo-title-section mt-3 text-slate-900 dark:text-slate-100">
            Nenhum aluno com pesquisa NPS ativa para os filtros selecionados
          </h3>
        </div>
      );
    }

    const renderColumn = (col: NpsHourKanbanColumn) => {
      const columnContainerClasses = col.isCurrentHour
        ? 'border-2 border-[#004A8D] bg-sky-50/70 shadow-md ring-2 ring-[#004A8D]/15 dark:border-sky-500 dark:bg-sky-950/35 dark:ring-sky-500/20'
        : col.isPastHour
        ? 'border border-emerald-300/90 bg-emerald-50/30 dark:border-emerald-800/70 dark:bg-emerald-950/20'
        : 'border border-slate-200/90 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/60';

      const columnHeaderClasses = col.isCurrentHour
        ? 'border-b border-[#003A70] bg-[#004A8D] text-white dark:border-sky-800 dark:bg-[#004A8D]'
        : col.isPastHour
        ? 'border-b border-emerald-200/90 bg-emerald-100/75 text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-100'
        : 'border-b border-slate-200/90 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100';

      return (
        <section
          key={col.hourKey}
          aria-label={`Alunos no horário ${col.hourKey}`}
          data-nps-hour-key={col.hourKey}
          data-column-state={
            col.isCurrentHour ? 'current' : col.isPastHour ? 'past' : 'future'
          }
          className={`flex h-full w-[335px] shrink-0 flex-col overflow-hidden rounded-xl transition-colors sm:w-[350px] ${columnContainerClasses}`}
        >
          {/* Cabeçalho da Coluna */}
          <div className={`shrink-0 px-3 py-2 ${columnHeaderClasses}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="typo-title-section tabular-nums">
                  {col.hourKey}
                </span>

                {col.isCurrentHour && (
                  <span className="typo-badge inline-flex items-center gap-1 rounded border border-white/30 bg-white/15 px-1.5 py-0.5 text-white">
                    <Pin className="h-2.5 w-2.5 text-sky-200" />
                    <span>Em andamento</span>
                  </span>
                )}

                {col.isPastHour && (
                  <span className="typo-badge inline-flex items-center gap-1 rounded border border-emerald-300 bg-white/90 px-1.5 py-0.5 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-200">
                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Concluído</span>
                  </span>
                )}

                {col.isFutureHour && (
                  <span className="typo-badge inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <Clock className="h-2.5 w-2.5 text-slate-500 dark:text-slate-400" />
                    <span>Futuro</span>
                  </span>
                )}
              </div>

              <span
                className={`typo-meta font-semibold tabular-nums ${
                  col.isCurrentHour
                    ? 'text-sky-100'
                    : col.isPastHour
                    ? 'text-emerald-800 dark:text-emerald-200'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {col.totalConvites}{' '}
                {col.totalConvites === 1 ? 'aluno' : 'alunos'}
              </span>
            </div>
          </div>

          {/* Cards padronizados de NPS (mesmas dimensões e alinhamento do Kanban de Alunos) */}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5">
            {col.invitations.map((card) => {
              const latest = card.latestActiveInvitation;
              const isPortal = latest.origem === 'Portal do Aluno';
              const isResponsavel = card.npsDestinatario === 'RESPONSAVEL';
              const isPrioritizedOnPortal = Boolean(
                latest.priorizarNpsNoLogin && !latest.answered
              );
              const cicloFormatado = (
                latest.pontoJornada || 'Ciclo Regular'
              ).replace(/\b(Novo contrato|Conclu[ií]do)\s+dias\b/i, '$1');
              const deliveryStatus =
                latest.emailDeliveryStatus ||
                (isPortal ? 'Entregue' : 'Enviado');
              const deliveryBadgeStyle =
                deliveryStatus === 'Aberto'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : deliveryStatus === 'Entregue'
                  ? 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-300'
                  : deliveryStatus === 'Não entregue'
                  ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300'
                  : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300';
              const salaClean = formatFullSalaName(card.linkedSala);
              const cursoClean = card.linkedCurso || 'Módulo Regular';

              return (
                <article
                  key={`${card.linkedContrato}-${latest.id}`}
                  onClick={() => onSelectStudentCard(card)}
                  data-testid="nps-student-card"
                  data-nps-student-contrato={card.linkedContrato}
                  data-nps-control-id={latest.controlId}
                  data-nps-origem={latest.origem}
                  data-nps-destinatario={card.npsDestinatario}
                  data-nps-delivery-status={deliveryStatus}
                  data-nps-portal-prioritized={
                    isPrioritizedOnPortal ? 'true' : 'false'
                  }
                  className={`group flex flex-col justify-between cursor-pointer rounded-lg border bg-white p-3 transition-all duration-150 hover:shadow-xs dark:bg-slate-900 ${
                    isResponsavel
                      ? 'border-fuchsia-200/90 hover:border-fuchsia-400 dark:border-fuchsia-900/70 dark:hover:border-fuchsia-600'
                      : 'border-slate-200/90 hover:border-purple-400 dark:border-slate-800 dark:hover:border-purple-600'
                  }`}
                >
                  {/* Cabeçalho do Card: Nome do aluno + Canal */}
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      title={card.linkedStudentName}
                      className="min-w-0 flex-1 truncate text-xs font-bold whitespace-nowrap text-slate-900 group-hover:text-[#004A8D] dark:text-slate-100 dark:group-hover:text-sky-400"
                    >
                      {card.linkedStudentName}
                    </h3>

                    <span
                      className={`typo-badge inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 whitespace-nowrap ${
                        isPortal
                          ? 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-300'
                          : 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800/70 dark:bg-indigo-950/60 dark:text-indigo-300'
                      }`}
                    >
                      {isPortal ? (
                        <Globe className="h-2.5 w-2.5 text-sky-600 dark:text-sky-400" />
                      ) : (
                        <Mail className="h-2.5 w-2.5 text-indigo-600 dark:text-indigo-400" />
                      )}
                      <span>{latest.origem}</span>
                    </span>
                  </div>

                  {/* Bloco Vertical Padronizado em 3 Linhas: 1ª Sala | 2ª Matéria | 3ª Ciclo & Status */}
                  <div className="mt-2 flex flex-col gap-1 rounded-md border border-slate-100 bg-slate-50/70 px-2.5 py-1.5 text-[11px] leading-snug dark:border-slate-800/80 dark:bg-slate-800/40">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                        Sala:
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate font-bold text-slate-800 dark:text-slate-200"
                        title={salaClean}
                      >
                        {salaClean}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                        Matéria:
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-300"
                        title={cursoClean}
                      >
                        {cursoClean}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 min-w-0 pt-0.5">
                      <span
                        data-testid="nps-card-recipient-badge"
                        className={`typo-badge inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-semibold whitespace-nowrap ${
                          isResponsavel
                            ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-800/80 dark:bg-fuchsia-950/65 dark:text-fuchsia-200'
                            : 'border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-800/80 dark:bg-purple-950/65 dark:text-purple-200'
                        }`}
                      >
                        <span>
                          {isResponsavel ? 'Resp.' : 'Aluno'} · {cicloFormatado}
                        </span>
                      </span>

                      <span
                        className={`typo-badge inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-semibold whitespace-nowrap ${deliveryBadgeStyle}`}
                      >
                        <span>{deliveryStatus}</span>
                      </span>
                    </div>
                  </div>

                  {/* Rodapé do Card: Ações rápidas (Reenviar E-mail e Priorizar Portal) */}
                  {isAuthorizedForRecovery && (
                    <div
                      className="mt-2 grid grid-cols-2 gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setResendTargetCard(card)}
                        data-testid="nps-card-resend-email-btn"
                        className="typo-btn inline-flex h-6 items-center justify-center gap-1 rounded border border-indigo-300 bg-indigo-50/90 px-2 text-[11px] text-indigo-900 transition-colors hover:bg-indigo-600 hover:text-white dark:border-indigo-800/70 dark:bg-indigo-950/60 dark:text-indigo-200 dark:hover:bg-indigo-600 dark:hover:text-white cursor-pointer"
                      >
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">Reenviar E-mail</span>
                      </button>

                      <button
                        type="button"
                        disabled={prioritizingId === latest.id}
                        onClick={() => handleCardPrioritizePortal(card)}
                        data-testid="nps-card-prioritize-portal-btn"
                        className={`typo-btn inline-flex h-6 items-center justify-center gap-1 rounded border px-2 text-[11px] transition-colors cursor-pointer ${
                          isPrioritizedOnPortal
                            ? 'border-amber-400 bg-amber-500 text-white hover:bg-amber-600'
                            : 'border-sky-300 bg-sky-50/90 text-sky-900 hover:bg-sky-700 hover:text-white dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-200'
                        }`}
                      >
                        {prioritizingId === latest.id ? (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                        ) : (
                          <Globe className="h-3 w-3 shrink-0" />
                        )}
                        <span className="truncate">
                          {isPrioritizedOnPortal
                            ? 'Priorizado'
                            : 'Priorizar Portal'}
                        </span>
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      );
    };

    return (
      <div
        data-testid="nps-kanban-container"
        className="flex h-full w-full items-stretch gap-3 overflow-hidden"
      >
        {pinnedCurrentColumn && (
          <div
            data-testid="nps-pinned-current-hour-wrapper"
            className="flex h-full shrink-0 items-stretch border-r border-slate-300/80 pr-2 dark:border-slate-800"
          >
            {renderColumn(pinnedCurrentColumn)}
          </div>
        )}

        <div
          data-testid="nps-scrollable-hours-wrapper"
          className="flex h-full min-w-0 flex-1 items-stretch gap-3 overflow-x-auto pb-1"
        >
          {scrollableOtherColumns.map((col) => renderColumn(col))}
        </div>

        {resendTargetCard && (
          <NpsResendEmailModal
            invitation={resendTargetCard.latestActiveInvitation}
            studentDisplayName={resendTargetCard.linkedStudentName}
            studentContract={resendTargetCard.linkedContrato}
            currentEmail={resendTargetCard.latestActiveInvitation.email}
            operatorLogin={operatorLogin}
            operatorRole={operatorRole}
            onClose={() => setResendTargetCard(null)}
            onSuccess={(res) => {
              onInvitationUpdated?.(
                res.inviteId,
                {
                  email: res.newEmail,
                  ...(res.emailUpdated &&
                  resendTargetCard.latestActiveInvitation.email
                    ? {
                        emailAnterior:
                          resendTargetCard.latestActiveInvitation.email,
                      }
                    : {}),
                  ultimoReenvioEmailEm: res.timestamp,
                  ultimoReenvioEmailPor: operatorLogin,
                  emailDeliveryStatus: 'Enviado',
                },
                res.emailUpdated && res.contrato
                  ? { contrato: res.contrato, email: res.newEmail }
                  : undefined
              );
              setResendTargetCard(null);
            }}
          />
        )}
      </div>
    );
  }
);
