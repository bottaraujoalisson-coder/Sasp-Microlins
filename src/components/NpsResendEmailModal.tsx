import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { ActiveNpsInvitation } from '../data/microlinsData';
import {
  resendNpsEmailInSupabase,
  validateEmailAddressFormat,
} from '../utils/supabaseClient';

interface NpsResendEmailModalProps {
  invitation: ActiveNpsInvitation;
  studentDisplayName?: string;
  studentContract?: string;
  currentEmail?: string;
  operatorLogin?: string;
  operatorRole?: string;
  onClose: () => void;
  onSuccess: (updated: {
    inviteId: string;
    contrato?: string;
    newEmail: string;
    emailUpdated: boolean;
    timestamp: string;
    message: string;
  }) => void;
}

export const NpsResendEmailModal: React.FC<NpsResendEmailModalProps> = ({
  invitation,
  studentDisplayName,
  studentContract,
  currentEmail,
  operatorLogin = 'coordenacao',
  operatorRole = 'COORDENACAO',
  onClose,
  onSuccess,
}) => {
  const registeredEmail = (currentEmail ?? invitation.email ?? '').trim().toLowerCase();
  const [contactEmail, setContactEmail] = useState<string>(registeredEmail);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const displayName = studentDisplayName || invitation.studentName || 'Aluno Microlins';
  const displayContract = studentContract || invitation.contrato || '';
  const emailCheck = validateEmailAddressFormat(contactEmail);
  const isChanged =
    emailCheck.valid && emailCheck.normalizedEmail !== registeredEmail;

  const handleConfirmResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (invitation.answered || invitation.invitationStatus === 'respondido') {
      setErrorMsg('Esta pesquisa NPS já foi respondida e não permite novo reenvio.');
      return;
    }

    if (!emailCheck.valid) {
      setErrorMsg(emailCheck.error || 'Informe um endereço de e-mail válido.');
      return;
    }

    setSubmitting(true);
    try {
      let apiHandled = false;
      let resultMessage = '';
      let resultTimestamp = new Date().toISOString();
      let emailUpdatedFlag = isChanged;

      try {
        const res = await fetch('/api/nps/resend-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inviteId: invitation.id,
            contrato: displayContract,
            studentName: displayName,
            previousEmail: registeredEmail,
            contactEmail: emailCheck.normalizedEmail,
            operatorLogin,
            operatorRole,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(
            data?.error || 'Não foi possível reenviar o convite da pesquisa NPS.'
          );
        }
        apiHandled = true;
        resultMessage =
          data.message ||
          `Convite reenviado com sucesso para ${emailCheck.normalizedEmail}!`;
        resultTimestamp = data.timestamp || resultTimestamp;
        emailUpdatedFlag = Boolean(data.emailUpdated);
      } catch (apiErr: any) {
        if (
          apiErr?.message &&
          (apiErr.message.includes('já foi respondida') ||
            apiErr.message.includes('andamento') ||
            apiErr.message.includes('inválido'))
        ) {
          throw apiErr;
        }
        const supaRes = await resendNpsEmailInSupabase({
          inviteId: invitation.id,
          contrato: displayContract,
          studentName: displayName,
          previousEmail: registeredEmail,
          contactEmail: emailCheck.normalizedEmail,
          operatorLogin,
          operatorRole,
          indecxReturnCode: 'SUPABASE_DIRECT_FALLBACK',
          indecxSentLive: false,
        });
        apiHandled = true;
        emailUpdatedFlag = supaRes.emailUpdated;
        resultTimestamp = supaRes.timestamp;
        resultMessage = supaRes.emailUpdated
          ? `E-mail atualizado no cadastro oficial para ${supaRes.normalizedEmail} e reenvio NPS registrado!`
          : `Reenvio do convite NPS registrado para ${supaRes.normalizedEmail}!`;
      }

      if (apiHandled) {
        setSuccessMsg(resultMessage);
        onSuccess({
          inviteId: invitation.id,
          contrato: displayContract,
          newEmail: emailCheck.normalizedEmail,
          emailUpdated: emailUpdatedFlag,
          timestamp: resultTimestamp,
          message: resultMessage,
        });
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'Erro ao processar o reenvio da pesquisa NPS por e-mail.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nps-resend-email-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="nps-resend-email-modal-backdrop"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        className="glass-modal bg-[var(--surface-elevated)] rounded-2xl shadow-2xl border border-[var(--border-color)] w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="nps-resend-email-modal"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0F172A] via-[#1E3A8A] to-[#2563EB] px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
              <Mail className="w-4 h-4 text-sky-300" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300 block">
                Integração Oficial Indecx · E-mail
              </span>
              <h3 id="nps-resend-email-title" className="text-sm font-black tracking-tight">
                Reenviar Pesquisa NPS por E-mail
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-press w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-200 transition-colors cursor-pointer"
            title="Fechar"
            data-testid="nps-resend-email-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirmResend} className="p-5 space-y-4">
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-secondary)]/80 border border-[var(--border-color)] rounded-xl p-3">
            Confirme o endereço de e-mail para o qual deseja enviar novamente o
            convite da pesquisa NPS. Caso necessário, você poderá corrigir o
            endereço antes do envio.
          </p>

          {/* Dados do Aluno e E-mail Atual */}
          <div className="surface-solid rounded-xl border border-[var(--border-color)] p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1">
                <User className="w-3 h-3 text-[var(--color-primary)]" /> Nome do Aluno
              </span>
              {displayContract && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
                  Contrato #{displayContract}
                </span>
              )}
            </div>
            <p
              className="text-xs font-black text-[var(--text-primary)]"
              data-testid="nps-resend-student-name"
            >
              {displayName}
            </p>

            <div className="pt-2 border-t border-[var(--border-color)] flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-[var(--text-secondary)]">
                E-mail atualmente cadastrado:
              </span>
              <span
                className="font-mono font-bold text-[var(--text-primary)] break-all"
                data-testid="nps-resend-current-email"
              >
                {registeredEmail || 'Não cadastrado'}
              </span>
            </div>
          </div>

          {/* Campo editável para correção do endereço */}
          <div>
            <label
              htmlFor="nps-resend-email-input"
              className="block text-[11px] font-black uppercase tracking-wider text-[var(--text-primary)] mb-1.5"
            >
              Endereço de E-mail para Envio / Correção Cadastral
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="nps-resend-email-input"
                type="email"
                value={contactEmail}
                onChange={(e) => {
                  setContactEmail(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="exemplo@dominio.com.br"
                disabled={submitting}
                className="surface-solid w-full pl-9 pr-3 py-2.5 text-xs font-semibold text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] transition-all"
                data-testid="nps-resend-email-input"
                required
              />
            </div>
          </div>

          {/* Aviso de atualização cadastral */}
          <div
            className={`rounded-xl p-3 border text-[11px] flex items-start gap-2 ${
              isChanged
                ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200'
                : 'bg-blue-50/70 border-blue-200/80 text-blue-900 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-200'
            }`}
            data-testid="nps-resend-registration-notice"
          >
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-primary)]" />
            <div>
              <span className="font-bold block">
                Atualização Automática do Cadastro Oficial
              </span>
              <span>
                {isChanged
                  ? `O endereço foi alterado de "${registeredEmail || 'vazio'}" para "${emailCheck.normalizedEmail}". Ao confirmar, o cadastro oficial do aluno será atualizado antes do reenvio via Indecx.`
                  : 'Caso você altere o e-mail acima, a alteração atualizará automaticamente o cadastro oficial do aluno e será auditada.'}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div
              className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 font-semibold flex items-start gap-2 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-200"
              data-testid="nps-resend-error-alert"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 font-semibold flex items-start gap-2 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-200"
              data-testid="nps-resend-success-alert"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Botões */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-press px-3.5 py-2 rounded-xl border border-[var(--border-color)] text-xs font-bold text-[var(--text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !emailCheck.valid}
              className="btn-press inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-black shadow-sm transition-colors cursor-pointer"
              data-testid="nps-resend-confirm-btn"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Enviando convite...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  {isChanged
                    ? 'Atualizar E-mail e Reenviar'
                    : 'Confirmar Reenvio por E-mail'}
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
