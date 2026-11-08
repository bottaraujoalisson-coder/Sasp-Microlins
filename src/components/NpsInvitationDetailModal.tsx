import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Globe,
  Hash,
  History,
  Link2,
  Loader2,
  Lock,
  Mail,
  MessageSquareQuote,
  Phone,
  Sparkles,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { ActiveNpsInvitation } from '../data/microlinsData';
import {
  formatBrasiliaDateTime,
  formatFullSalaName,
  SynchronizedNpsStudentCard,
} from '../utils/performanceAnalytics';
import { prioritizeNpsInPortalSupabase } from '../utils/supabaseClient';
import { NpsResendEmailModal } from './NpsResendEmailModal';
import { SmartAvatar, useToast } from './uiSystem';

interface NpsInvitationDetailModalProps {
  studentCard: SynchronizedNpsStudentCard | null;
  currentYear: number;
  operatorLogin?: string;
  operatorRole?: string;
  isAuthorizedForRecovery?: boolean;
  onInvitationUpdated?: (
    inviteId: string,
    patch: Partial<ActiveNpsInvitation>,
    updatedContractEmail?: { contrato: string; email: string }
  ) => void;
  onClose: () => void;
}

export const NpsInvitationDetailModal: React.FC<
  NpsInvitationDetailModalProps
> = ({
  studentCard,
  currentYear,
  operatorLogin = 'coordenacao',
  operatorRole = 'COORDENACAO',
  isAuthorizedForRecovery = true,
  onInvitationUpdated,
  onClose,
}) => {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<'id' | null>(null);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [showResendEmailModal, setShowResendEmailModal] = useState(false);
  const [prioritizingPortal, setPrioritizingPortal] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (studentCard) {
      setSelectedSurveyId(studentCard.latestActiveInvitation.id);
      setFeedbackToast(null);
    } else {
      setSelectedSurveyId(null);
      setShowResendEmailModal(false);
    }
  }, [studentCard]);

  useEffect(() => {
    if (!studentCard) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showResendEmailModal) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [studentCard, onClose, showResendEmailModal]);

  if (!studentCard) return null;

  const chronologicalSurveys = [...studentCard.studentSurveyHistory].sort(
    (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
  );

  const activeInvitation: ActiveNpsInvitation =
    chronologicalSurveys.find((s) => s.id === selectedSurveyId) ||
    studentCard.latestActiveInvitation;

  const isLatestActive =
    activeInvitation.id === studentCard.latestActiveInvitation.id;
  const isPortal = activeInvitation.origem === 'Portal do Aluno';
  const isResponsavel = studentCard.npsDestinatario === 'RESPONSAVEL';
  const statusLower = (
    activeInvitation.invitationStatus || 'ativo'
  ).toLowerCase();
  const isAnswered = Boolean(
    activeInvitation.answered || statusLower === 'respondido'
  );
  const isPrioritizedOnPortal = Boolean(
    activeInvitation.priorizarNpsNoLogin && !isAnswered
  );

  const salaDisplay = formatFullSalaName(studentCard.linkedSala);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField('id');
      toast({
        type: 'info',
        title: 'Código Indecx copiado',
        message: `#${text}`,
      });
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  const handleTogglePortalPriority = async () => {
    if (prioritizingPortal || isAnswered || !isAuthorizedForRecovery) return;
    setPrioritizingPortal(true);
    setFeedbackToast(null);
    const nextPriority = !isPrioritizedOnPortal;
    const ciclo = activeInvitation.pontoJornada || '30 dias';

    try {
      let timestamp = new Date().toISOString();
      let msg = '';
      try {
        const res = await fetch('/api/nps/prioritize-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inviteId: activeInvitation.id,
            contrato: studentCard.linkedContrato,
            studentName: studentCard.linkedStudentName,
            pontoJornada: ciclo,
            priorizar: nextPriority,
            operatorLogin,
            operatorRole,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(
            data?.error || 'Erro ao priorizar pesquisa no Portal do Aluno.'
          );
        }
        timestamp = data.timestamp || timestamp;
        msg = data.message;
      } catch (apiErr: any) {
        if (apiErr?.message && apiErr.message.includes('já foi respondida')) {
          throw apiErr;
        }
        const supaRes = await prioritizeNpsInPortalSupabase({
          inviteId: activeInvitation.id,
          contrato: studentCard.linkedContrato,
          studentName: studentCard.linkedStudentName,
          pontoJornada: ciclo,
          priorizar: nextPriority,
          operatorLogin,
          operatorRole,
        });
        timestamp = supaRes.timestamp;
        msg = nextPriority
          ? `Pesquisa NPS (${ciclo}) priorizada no Portal do Aluno!`
          : 'Priorização no Portal do Aluno removida.';
      }

      onInvitationUpdated?.(activeInvitation.id, {
        priorizarNpsNoLogin: nextPriority,
        cicloPriorizado: ciclo,
        priorizadoPor: operatorLogin,
        priorizadoEm: timestamp,
      });

      setFeedbackToast({
        type: 'success',
        message: msg,
      });
      toast({
        type: 'success',
        title: nextPriority ? 'Priorizado no Portal' : 'Priorização Removida',
        message: msg,
      });
    } catch (err: any) {
      const errMsg =
        err?.message ||
        'Não foi possível atualizar a priorização no Portal do Aluno.';
      setFeedbackToast({
        type: 'error',
        message: errMsg,
      });
      toast({
        type: 'error',
        title: 'Erro na Priorização',
        message: errMsg,
      });
    } finally {
      setPrioritizingPortal(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nps-invitation-detail-title"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
        className="glass-modal flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-[var(--border-color)] bg-[var(--surface-elevated)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex shrink-0 items-start justify-between border-b border-blue-800 bg-gradient-to-r from-[#0F172A] via-[#1E3A8A] to-[#2563EB] px-5 py-4 text-white">
          <div className="flex min-w-0 flex-1 items-center gap-3.5 pr-3">
            <SmartAvatar
              name={studentCard.linkedStudentName}
              contrato={studentCard.linkedContrato}
              size="lg"
              statusDot={isAnswered ? 'success' : 'warning'}
            />
            <div className="min-w-0 flex-1">
              <div className="typo-meta flex flex-wrap items-center gap-2 font-mono text-sky-100 tabular-nums">
                <span className="font-semibold text-white">
                  Contrato #{studentCard.linkedContrato}
                </span>
                <span aria-hidden="true">·</span>
                <span>{studentCard.linkedDiaSemana}</span>
                <span aria-hidden="true">·</span>
                <span>{studentCard.linkedHorario}</span>
              </div>
              <h2
                id="nps-invitation-detail-title"
                className="typo-title-section mt-0.5 truncate text-white"
              >
                {studentCard.linkedStudentName}
              </h2>
              <p className="typo-meta mt-0.5 truncate text-sky-100/90">
                Ciclo {currentYear} · {salaDisplay}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes do convite NPS"
            className="btn-press rounded-xl p-1.5 text-sky-100 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Resumo do Convite e Ações */}
          <div
            data-testid="nps-modal-hierarchy-banner"
            className={`space-y-3 rounded-xl border p-3.5 ${
              isResponsavel
                ? 'border-fuchsia-200 bg-fuchsia-50/70 text-fuchsia-950 dark:border-fuchsia-800/70 dark:bg-fuchsia-950/45 dark:text-fuchsia-100'
                : 'border-purple-200 bg-purple-50/70 text-purple-950 dark:border-purple-800/70 dark:bg-purple-950/45 dark:text-purple-100'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`typo-badge inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-bold ${
                  isResponsavel
                    ? 'border-fuchsia-300 bg-white text-fuchsia-900 dark:border-fuchsia-700 dark:bg-fuchsia-900/70 dark:text-fuchsia-200'
                    : 'border-purple-300 bg-white text-purple-900 dark:border-purple-700 dark:bg-purple-900/70 dark:text-purple-200'
                }`}
              >
                {isResponsavel ? (
                  <Users className="h-3 w-3 text-fuchsia-600 dark:text-fuchsia-400" />
                ) : (
                  <Sparkles className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                )}
                <span>
                  Destinatário: {isResponsavel ? 'Responsável' : 'Aluno'} (
                  {activeInvitation.pontoJornada || 'Ciclo Regular'})
                </span>
              </span>
            </div>

            <div className="typo-card-body flex items-start gap-2">
              <UserCheck
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  isResponsavel
                    ? 'text-fuchsia-600 dark:text-fuchsia-400'
                    : 'text-purple-600 dark:text-purple-400'
                }`}
              />
              <p className="font-bold">{studentCard.respondenteVinculoLabel}</p>
            </div>

            {studentCard.isVinculoFamiliarAmbiguo && (
              <div
                data-testid="nps-modal-sibling-alert"
                className="flex items-start gap-2 rounded-lg border border-amber-300/90 bg-amber-50/90 p-2.5 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-100"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="typo-meta">
                  <p className="font-bold">Núcleo Familiar Unificado</p>
                  <p className="mt-0.5">
                    {(studentCard.alunosVinculadosFamilia ?? []).join(' e ')} (Contratos #
                    {(studentCard.contratosVinculadosFamilia ?? []).join(' / #')})
                  </p>
                </div>
              </div>
            )}

            {feedbackToast && (
              <div
                data-testid="nps-modal-recovery-feedback"
                className={`rounded-lg border px-3 py-2 text-xs font-bold flex items-center gap-2 ${
                  feedbackToast.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200'
                }`}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{feedbackToast.message}</span>
              </div>
            )}

            {isAuthorizedForRecovery ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={isAnswered}
                  onClick={() => setShowResendEmailModal(true)}
                  data-testid="nps-modal-resend-email-btn"
                  className="btn-press typo-btn inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-indigo-600 bg-indigo-600 px-3 text-white transition-colors hover:bg-indigo-700 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 cursor-pointer"
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  <span>Reenviar por E-mail</span>
                </button>

                <button
                  type="button"
                  disabled={isAnswered || prioritizingPortal}
                  onClick={handleTogglePortalPriority}
                  data-testid="nps-modal-prioritize-portal-btn"
                  className={`btn-press typo-btn inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 transition-colors cursor-pointer ${
                    isPrioritizedOnPortal
                      ? 'border-amber-600 bg-amber-500 text-white hover:bg-amber-600'
                      : 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white hover:bg-blue-700'
                  } disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500`}
                >
                  {prioritizingPortal ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <Globe className="h-4 w-4 shrink-0" />
                  )}
                  <span>
                    {isPrioritizedOnPortal
                      ? 'Priorizado no Portal'
                      : 'Priorizar no Portal'}
                  </span>
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-600 flex items-center gap-2 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                <span>Reenvio disponível para Coordenação e Secretaria.</span>
              </div>
            )}
          </div>

          {/* Vínculo com o Kanban */}
          <div className="space-y-2">
            <h3 className="typo-title-section flex items-center gap-1.5 text-[var(--text-primary)]">
              <Link2 className="h-4 w-4 text-[var(--color-primary)]" />
              Dados da Aula
            </h3>
            <div className="typo-card-body surface-solid grid grid-cols-2 gap-3 rounded-xl border border-[var(--border-color)] p-3.5 sm:grid-cols-3">
              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Horário
                </span>
                <p className="mt-0.5 font-mono font-bold text-[var(--color-primary)] tabular-nums">
                  {studentCard.linkedHourKey} ({studentCard.linkedHorario})
                </p>
              </div>
              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Sala
                </span>
                <p className="mt-0.5 font-semibold text-[var(--text-primary)]">
                  {salaDisplay}
                </p>
              </div>
              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Status
                </span>
                <p className="mt-0.5 font-semibold text-[var(--text-primary)]">
                  {studentCard.linkedAttendanceStatus}
                </p>
              </div>
              <div className="sm:col-span-3">
                <span className="typo-meta text-[var(--text-secondary)]">
                  Módulo
                </span>
                <p className="mt-0.5 font-semibold text-[var(--text-primary)]">
                  {studentCard.linkedCurso}
                </p>
              </div>
            </div>
          </div>

          {/* Histórico de Pesquisas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="typo-title-section flex items-center gap-1.5 text-[var(--text-primary)]">
                <History className="h-4 w-4 text-[var(--color-primary)]" />
                Histórico de Pesquisas
              </h3>
              <span className="typo-meta font-mono font-semibold text-[var(--text-secondary)] tabular-nums">
                {chronologicalSurveys.length}
              </span>
            </div>

            <div
              data-testid="nps-chronological-history-list"
              className="surface-solid divide-y divide-[var(--border-color)] overflow-hidden rounded-xl border border-[var(--border-color)]"
            >
              {chronologicalSurveys.map((item, index) => {
                const isSelected = item.id === activeInvitation.id;
                const itemStatus = (
                  item.invitationStatus || 'ativo'
                ).toLowerCase();
                const itemAnswered = Boolean(
                  item.answered || itemStatus === 'respondido'
                );
                const itemExpired = itemStatus === 'expirado';

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedSurveyId(item.id)}
                    className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-purple-50/70 dark:bg-purple-950/40'
                        : 'bg-[var(--surface-card)] hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="typo-card-body flex flex-wrap items-center gap-1.5 font-semibold text-[var(--text-primary)] tabular-nums">
                        <span className="typo-badge font-bold text-slate-400">
                          {index + 1}º
                        </span>
                        <span className="font-mono text-purple-800 dark:text-purple-300">
                          #{item.controlId || item.id.slice(-6)}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span>{item.origem}</span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span>{item.pontoJornada || 'Ciclo Regular'}</span>
                      </div>
                      <div className="typo-meta mt-0.5 flex items-center gap-1.5 text-[var(--text-secondary)] tabular-nums">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <span>{formatBrasiliaDateTime(item.createdAt)}</span>
                      </div>
                    </div>

                    <span
                      className={`typo-badge inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 ${
                        itemAnswered
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : itemExpired
                          ? 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          : 'border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                      }`}
                    >
                      {itemAnswered
                        ? typeof item.notaNps === 'number'
                          ? `Nota ${item.notaNps}`
                          : 'Respondida'
                        : itemExpired
                        ? 'Expirada'
                        : 'Ativa'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detalhes da Pesquisa Selecionada */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="typo-title-section flex items-center gap-1.5 text-[var(--text-primary)]">
                <FileText className="h-4 w-4 text-[var(--color-primary)]" />
                Detalhes da Pesquisa
              </h3>
              {isLatestActive && (
                <span className="typo-badge inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-purple-800 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                  Atual
                </span>
              )}
            </div>

            {activeInvitation.comentarioNps && (
              <div
                data-testid="nps-modal-qualitative-comment"
                className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-1 dark:border-emerald-800 dark:bg-emerald-950/40"
              >
                <div className="flex items-center justify-between text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  <span className="flex items-center gap-1.5">
                    <MessageSquareQuote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Comentário
                  </span>
                  {typeof activeInvitation.notaNps === 'number' && (
                    <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-black">
                      Nota {activeInvitation.notaNps}/10
                    </span>
                  )}
                </div>
                <p className="text-xs italic text-slate-800 dark:text-slate-200 pt-1">
                  "{activeInvitation.comentarioNps}"
                </p>
              </div>
            )}

            <div className="typo-card-body surface-solid grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-color)] p-4 sm:grid-cols-2">
              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Código Indecx
                </span>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="inline-flex items-center gap-0.5 font-mono font-bold text-[var(--text-primary)] tabular-nums">
                    <Hash className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                    {activeInvitation.controlId || 'Não informado'}
                  </span>
                  {activeInvitation.controlId && (
                    <button
                      type="button"
                      onClick={() => handleCopy(activeInvitation.controlId)}
                      className="btn-press typo-btn inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-[var(--surface-card)] px-1.5 py-0.5 text-[var(--text-secondary)] transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {copiedField === 'id' ? (
                        <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="h-2.5 w-2.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Ciclo
                </span>
                <p className="mt-0.5 font-semibold text-[var(--text-primary)]">
                  {activeInvitation.pontoJornada || 'Ciclo Regular'}
                </p>
              </div>

              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Envio
                </span>
                <p className="mt-0.5 flex items-center gap-1 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  <span>{formatBrasiliaDateTime(activeInvitation.createdAt)}</span>
                </p>
              </div>

              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Status de envio
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`typo-badge inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold ${
                      activeInvitation.emailDeliveryStatus === 'Aberto'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : activeInvitation.emailDeliveryStatus === 'Entregue'
                        ? 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                        : activeInvitation.emailDeliveryStatus === 'Não entregue'
                        ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}
                  >
                    {activeInvitation.emailDeliveryStatus ||
                      (isPortal ? 'Entregue' : 'Enviado')}
                  </span>
                </div>
              </div>

              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  E-mail
                </span>
                <p
                  className="mt-0.5 break-all font-semibold text-[var(--text-primary)]"
                  data-testid="nps-modal-linked-email"
                >
                  {activeInvitation.email || 'Não informado'}
                </p>
              </div>

              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Telefone
                </span>
                <p className="mt-0.5 flex items-center gap-1 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                  <Phone className="h-3 w-3 text-slate-400" />
                  <span>{activeInvitation.phone || 'Não informado'}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex shrink-0 items-center justify-end border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/80 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-press typo-btn rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-1.5 text-[var(--text-primary)] transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </motion.div>

      {showResendEmailModal && (
        <NpsResendEmailModal
          invitation={activeInvitation}
          studentDisplayName={studentCard.linkedStudentName}
          studentContract={studentCard.linkedContrato}
          currentEmail={activeInvitation.email}
          operatorLogin={operatorLogin}
          operatorRole={operatorRole}
          onClose={() => setShowResendEmailModal(false)}
          onSuccess={(res) => {
            onInvitationUpdated?.(
              res.inviteId,
              {
                email: res.newEmail,
                ...(res.emailUpdated && activeInvitation.email
                  ? { emailAnterior: activeInvitation.email }
                  : {}),
                ultimoReenvioEmailEm: res.timestamp,
                ultimoReenvioEmailPor: operatorLogin,
                emailDeliveryStatus: 'Enviado',
              },
              res.emailUpdated && res.contrato
                ? { contrato: res.contrato, email: res.newEmail }
                : undefined
            );
            setFeedbackToast({
              type: 'success',
              message: res.message,
            });
            toast({
              type: 'success',
              title: 'Convite NPS Reenviado',
              message: res.message,
            });
            setShowResendEmailModal(false);
          }}
        />
      )}
    </motion.div>
  );
};
