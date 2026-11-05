import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageSquareHeart,
  Send,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { ActiveNpsInvitation } from '../data/microlinsData';
import {
  getNpsContextualPlaceholder,
  validateQualitativeNpsComment,
} from '../utils/performanceAnalytics';
import { submitPortalNpsResponseInSupabase } from '../utils/supabaseClient';

interface NpsPortalEvaluationModalProps {
  invitation: ActiveNpsInvitation;
  studentName?: string;
  contrato?: string;
  onCloseWithoutSubmit: () => void;
  onSubmitted: (result: {
    inviteId: string;
    contrato?: string;
    nota: number;
    comentario: string;
    answeredAt: string;
  }) => void;
}

export const NpsPortalEvaluationModal: React.FC<
  NpsPortalEvaluationModalProps
> = ({
  invitation,
  studentName,
  contrato,
  onCloseWithoutSubmit,
  onSubmitted,
}) => {
  const displayStudentName =
    (studentName || invitation.studentName || 'Aluno').trim();
  const displayContract = contrato || invitation.contrato || '';
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [commentText, setCommentText] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const commentValidation = useMemo(
    () => validateQualitativeNpsComment(commentText, selectedScore),
    [commentText, selectedScore]
  );

  const dynamicPlaceholder = useMemo(
    () => getNpsContextualPlaceholder(selectedScore),
    [selectedScore]
  );

  const isSubmitEnabled =
    selectedScore !== null &&
    selectedScore >= 0 &&
    selectedScore <= 10 &&
    commentValidation.valid &&
    !submitting;

  const scoreClassificationLabel = useMemo(() => {
    if (selectedScore === null) return null;
    if (selectedScore >= 9) {
      return {
        label: 'Promotor (Excelente Experiência)',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      };
    }
    if (selectedScore >= 7) {
      return {
        label: 'Neutro (Oportunidade de Evolução)',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      };
    }
    return {
      label: 'Detrator (Atenção Prioritária da Coordenação)',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    };
  }, [selectedScore]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSubmitEnabled || selectedScore === null) return;
    setErrorMsg(null);
    setSubmitting(true);

    try {
      let answeredAt = new Date().toISOString();
      let normalizedComment = commentValidation.normalizedText;

      try {
        const res = await fetch('/api/nps/submit-portal-response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inviteId: invitation.id,
            contrato: displayContract,
            studentName: displayStudentName,
            nota: selectedScore,
            comentario: commentText,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(
            data?.error || 'Não foi possível enviar sua avaliação NPS.'
          );
        }
        answeredAt = data.answeredAt || answeredAt;
        normalizedComment = data.comentario || normalizedComment;
      } catch (apiErr: any) {
        if (
          apiErr?.message &&
          (apiErr.message.includes('comentário') ||
            apiErr.message.includes('caracteres') ||
            apiErr.message.includes('palavras') ||
            apiErr.message.includes('sequência') ||
            apiErr.message.includes('nota'))
        ) {
          throw apiErr;
        }
        // Fallback direto para Supabase
        const supaRes = await submitPortalNpsResponseInSupabase({
          inviteId: invitation.id,
          contrato: displayContract,
          studentName: displayStudentName,
          pontoJornada: invitation.pontoJornada,
          nota: selectedScore,
          comentario: commentText,
        });
        answeredAt = supaRes.answeredAt;
        normalizedComment = supaRes.comentario;
      }

      onSubmitted({
        inviteId: invitation.id,
        contrato: displayContract,
        nota: selectedScore,
        comentario: normalizedComment,
        answeredAt,
      });
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'Erro ao registrar sua avaliação. Tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      data-testid="nps-portal-evaluation-modal-backdrop"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="nps-portal-evaluation-modal"
      >
        {/* Header Portal do Aluno */}
        <div className="bg-gradient-to-r from-indigo-950 via-indigo-900 to-blue-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center">
              <MessageSquareHeart className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/20 text-amber-200 border border-amber-300/30">
                  Pesquisa Prioritária · Portal do Aluno
                </span>
                <span className="text-[10px] font-bold text-indigo-200">
                  Ciclo {invitation.cicloPriorizado || invitation.pontoJornada || '30 dias'}
                </span>
              </div>
              <h3 className="text-base font-black tracking-tight mt-0.5">
                Avaliação Oficial de Experiência Microlins
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseWithoutSubmit}
            disabled={submitting}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-200 transition-colors cursor-pointer"
            title="Fechar sem responder (a pesquisa continuará pendente)"
            data-testid="nps-portal-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Mensagem oficial de apresentação (Seção 1.3) */}
          <div
            className="rounded-xl bg-indigo-50/80 border border-indigo-200/80 p-4 flex items-start gap-3"
            data-testid="nps-portal-greeting-banner"
          >
            <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm font-bold text-indigo-950 leading-relaxed">
              Olá, {displayStudentName}! Sua opinião é fundamental para a
              Microlins. Avalie sua experiência em apenas 15 segundos.
            </p>
          </div>

          {/* Escala NPS 0 a 10 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-500" />
                De 0 a 10, o quanto você recomendaria a Microlins?
              </label>
              {scoreClassificationLabel && (
                <span
                  className={`text-[10px] font-black px-2.5 py-0.5 rounded-md border ${scoreClassificationLabel.badgeClass}`}
                  data-testid="nps-portal-score-classification"
                >
                  {scoreClassificationLabel.label}
                </span>
              )}
            </div>

            <div className="grid grid-cols-11 gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
                const isSelected = selectedScore === score;
                let baseColor =
                  'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200';
                let selectedColor =
                  'bg-rose-600 text-white border-rose-700 ring-2 ring-rose-300';
                if (score >= 9) {
                  baseColor =
                    'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200';
                  selectedColor =
                    'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300';
                } else if (score >= 7) {
                  baseColor =
                    'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200';
                  selectedColor =
                    'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-300';
                }
                return (
                  <button
                    key={score}
                    type="button"
                    onClick={() => setSelectedScore(score)}
                    className={`h-10 rounded-xl font-black text-xs sm:text-sm border transition-all cursor-pointer ${
                      isSelected ? selectedColor : baseColor
                    }`}
                    data-testid={`nps-portal-score-btn-${score}`}
                  >
                    {score}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1 px-1">
              <span>0 · Pouco provável</span>
              <span>10 · Extremamente provável</span>
            </div>
          </div>

          {/* Campo de Comentário Qualitativo Obrigatório (Módulo 2) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="nps-portal-comment-textarea"
                className="text-xs font-black uppercase tracking-wider text-slate-700"
              >
                Comentário Qualitativo Obrigatório *
              </label>
              <span className="text-[10px] font-bold text-slate-500">
                {commentValidation.validCharCount} caracteres ·{' '}
                {commentValidation.meaningfulWordCount} palavras válidas
              </span>
            </div>

            <textarea
              id="nps-portal-comment-textarea"
              rows={3}
              value={commentText}
              onChange={(e) => {
                setCommentText(e.target.value);
                setErrorMsg(null);
              }}
              placeholder={dynamicPlaceholder}
              disabled={submitting}
              className={`w-full p-3 text-xs sm:text-sm font-medium text-slate-900 bg-white border rounded-xl focus:outline-none focus:ring-2 transition-all ${
                commentText.length > 0 && !commentValidation.valid
                  ? 'border-amber-400 focus:ring-amber-400'
                  : commentValidation.valid
                  ? 'border-emerald-400 focus:ring-emerald-500'
                  : 'border-slate-300 focus:ring-indigo-500'
              }`}
              data-testid="nps-portal-comment-textarea"
            />

            {/* Contador dinâmico em tempo real (Seção 2.2) */}
            <div
              className="mt-1.5 flex items-center justify-between gap-2 text-[11px]"
              data-testid="nps-portal-dynamic-counter"
            >
              <span
                className={`font-bold flex items-center gap-1.5 ${
                  commentValidation.valid
                    ? 'text-emerald-700'
                    : 'text-slate-600'
                }`}
              >
                {commentValidation.valid ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                )}
                {commentValidation.dynamicCounterText}
              </span>
              {commentText.trim().length > 0 &&
                !commentValidation.valid &&
                commentValidation.errorMessage && (
                  <span
                    className="text-[11px] font-bold text-rose-600 text-right"
                    data-testid="nps-portal-validation-reason"
                  >
                    {commentValidation.errorMessage}
                  </span>
                )}
            </div>
          </div>

          {errorMsg && (
            <div
              className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 font-semibold flex items-start gap-2"
              data-testid="nps-portal-error-alert"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Rodapé com botão Enviar Avaliação bloqueado até atender critérios */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <span className="text-[11px] text-slate-500">
              Se fechar sem enviar, a pesquisa permanecerá pendente para o próximo acesso.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onCloseWithoutSubmit}
                disabled={submitting}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                data-testid="nps-portal-later-btn"
              >
                Responder Depois
              </button>
              <button
                type="submit"
                disabled={!isSubmitEnabled}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-black shadow-sm transition-colors cursor-pointer"
                data-testid="nps-portal-submit-btn"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Enviar Avaliação
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
