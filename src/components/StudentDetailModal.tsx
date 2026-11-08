import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  BookOpen,
  BookX,
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  GraduationCap,
  History,
  KeyRound,
  MessageCircle,
  Percent,
  Phone,
  Sparkles,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import {
  EvaluatedStudentRecord,
  formatFullSalaName,
  formatModuleDisplay,
  isNotStartedAttendanceStatus,
} from '../utils/performanceAnalytics';
import { saveStudentRegisteredPhoto, SmartAvatar, useToast } from './uiSystem';

interface StudentDetailModalProps {
  student: EvaluatedStudentRecord | null;
  studentHistory: EvaluatedStudentRecord[];
  onClose: () => void;
  onOpenPortalHub?: (
    subTab?: 'CARTEIRINHA' | 'BOLETIM' | 'ACOMPANHAMENTO' | 'DECLARACAO'
  ) => void;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  student,
  studentHistory,
  onClose,
  onOpenPortalHub,
}) => {
  const { toast } = useToast();
  const [copiedLink, setCopiedLink] = useState(false);
  const modalPhotoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!student) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [student, onClose]);

  if (!student) return null;

  const presencasHistorico = studentHistory.filter(
    (h) => h.attendanceStatus === 'Presença'
  ).length;
  const faltasHistorico = studentHistory.filter(
    (h) => h.attendanceStatus === 'Falta'
  ).length;
  const naoIniciadosHistorico = studentHistory.filter((h) =>
    isNotStartedAttendanceStatus(h.attendanceStatus)
  ).length;

  const baseFreq = presencasHistorico + faltasHistorico;
  const frequenciaHistorico =
    baseFreq > 0 ? Number(((presencasHistorico / baseFreq) * 100).toFixed(1)) : null;

  const isFrequenciaGreen =
    frequenciaHistorico !== null && frequenciaHistorico >= 85;

  const handleCopyAuthLink = async () => {
    try {
      await navigator.clipboard.writeText(student.linkAcessoDireto);
      setCopiedLink(true);
      toast({
        type: 'success',
        title: 'Link de acesso copiado',
        message: `Link direto da aula de ${student.nomeCompleto} copiado.`,
      });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback silent
    }
  };

  const salaDisplay = formatFullSalaName(student.sala);

  const moduloDisplay = formatModuleDisplay(
    student.moduloAtual || student.curso
  );

  const professorDisplay =
    (student.professor || student.educador || '').trim() || 'Não atribuído';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-detail-title"
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
            <div className="relative group/avatar shrink-0">
              <SmartAvatar
                name={student.nomeCompleto}
                contrato={student.contrato}
                size="lg"
                statusDot={
                  student.attendanceStatus === 'Presença'
                    ? 'success'
                    : student.attendanceStatus === 'Falta'
                    ? 'error'
                    : 'neutral'
                }
              />
              <input
                ref={modalPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === 'string') {
                      saveStudentRegisteredPhoto(student.contrato, reader.result);
                      toast({
                        type: 'success',
                        title: 'Foto cadastral atualizada',
                        description: `A foto de ${student.nomeCompleto} foi vinculada ao cadastro e sincronizada em todos os documentos.`,
                      });
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <button
                type="button"
                onClick={() => modalPhotoInputRef.current?.click()}
                title="Atualizar foto cadastral do aluno (sincroniza com Ficha Individual, Carteirinha e Acompanhamento)"
                className="absolute -top-1 -left-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/40 bg-slate-900/80 text-white shadow-xs transition-transform hover:scale-105 cursor-pointer"
              >
                <Camera className="h-3 w-3" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="typo-meta flex flex-wrap items-center gap-2 font-mono text-sky-100 tabular-nums">
                <span className="font-semibold text-white">
                  Contrato #{student.contrato}
                </span>
                <span aria-hidden="true">·</span>
                <span>{student.diaSemana}</span>
                <span aria-hidden="true">·</span>
                <span>{student.turno}</span>
              </div>
              <h2
                id="student-detail-title"
                className="typo-title-section mt-0.5 truncate text-white"
              >
                {student.nomeCompleto}
              </h2>
              <p className="typo-meta mt-0.5 truncate text-sky-100/90">
                {student.formacao || 'Formação Profissional Microlins'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes do aluno"
            className="btn-press rounded-xl p-1.5 text-sky-100 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Convite NPS Ativo (sem disparo WhatsApp e sem link direto) */}
          {student.hasActiveNps && student.npsInvitation && (
            <div
              data-testid="student-modal-nps-banner"
              className={`rounded-xl border p-3.5 ${
                student.npsInvitation.npsDestinatario === 'RESPONSAVEL'
                  ? 'border-fuchsia-200/90 bg-fuchsia-50/75 text-fuchsia-950 dark:border-fuchsia-800/70 dark:bg-fuchsia-950/50 dark:text-fuchsia-100'
                  : 'border-purple-200/90 bg-purple-50/75 text-purple-950 dark:border-purple-800/70 dark:bg-purple-950/50 dark:text-purple-100'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles
                    className={`h-5 w-5 shrink-0 ${
                      student.npsInvitation.npsDestinatario === 'RESPONSAVEL'
                        ? 'text-fuchsia-600 dark:text-fuchsia-400'
                        : 'text-purple-600 dark:text-purple-400'
                    }`}
                  />
                  <div>
                    <div
                      className={`typo-subtitle font-bold ${
                        student.npsInvitation.npsDestinatario === 'RESPONSAVEL'
                          ? 'text-fuchsia-900 dark:text-fuchsia-200'
                          : 'text-purple-900 dark:text-purple-200'
                      }`}
                    >
                      Pesquisa NPS ativa ·{' '}
                      {student.npsInvitation.npsDestinatario === 'RESPONSAVEL'
                        ? 'Responsável'
                        : 'Aluno'}{' '}
                      ({student.npsInvitation.pontoJornada})
                    </div>
                    <div className="typo-meta mt-0.5 opacity-90 tabular-nums">
                      {student.npsInvitation.respondenteVinculoLabel ||
                        `Respondente: ${student.nomeCompleto}`}
                    </div>
                  </div>
                </div>
                <span className="typo-badge rounded-md border border-purple-200 bg-white px-2 py-0.5 text-purple-800 dark:border-purple-700 dark:bg-purple-900/70 dark:text-purple-200">
                  {student.npsOrigemFormatada || student.npsInvitation.origem}
                </span>
              </div>
            </div>
          )}

          {/* Alerta de Evasão */}
          {student.isEvasao && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200/90 bg-rose-50/75 p-3.5 text-rose-900 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-200">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
                <div>
                  <div className="typo-subtitle font-bold text-rose-800 dark:text-rose-200">
                    Evasão identificada no dia
                  </div>
                  <div className="typo-meta mt-0.5 text-rose-700 dark:text-rose-300">
                    {student.evasaoSummary || 'Compareceu a um horário e ausentou-se nos demais horários do dia'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Status no Horário e Frequência */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div
              className={`flex items-center justify-between rounded-xl border p-3.5 ${
                student.attendanceStatus === 'Presença'
                  ? 'border-emerald-200/80 bg-emerald-50/60 text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-100'
                  : student.attendanceStatus === 'Falta'
                  ? 'border-rose-200/80 bg-rose-50/60 text-rose-950 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-100'
                  : 'border-[var(--border-color)] bg-[var(--bg-secondary)]/80 text-[var(--text-primary)]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {student.attendanceStatus === 'Presença' && (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
                {student.attendanceStatus === 'Falta' && (
                  <XCircle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
                )}
                {isNotStartedAttendanceStatus(student.attendanceStatus) && (
                  <Clock className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" />
                )}
                <div>
                  <div className="typo-meta opacity-80">
                    Status ({student.horario})
                  </div>
                  <div className="typo-title-section">
                    {student.attendanceStatus}
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`flex items-center justify-between rounded-xl border p-3.5 ${
                frequenciaHistorico === null
                  ? 'border-[var(--border-color)] bg-[var(--bg-secondary)]/80 text-[var(--text-primary)]'
                  : isFrequenciaGreen
                  ? 'border-emerald-200/85 bg-emerald-50/60 text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-100'
                  : 'border-rose-200/85 bg-rose-50/60 text-rose-950 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Percent
                  className={`h-5 w-5 shrink-0 ${
                    frequenciaHistorico === null
                      ? 'text-slate-500 dark:text-slate-400'
                      : isFrequenciaGreen
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                />
                <div>
                  <div className="typo-meta opacity-80">
                    Frequência
                  </div>
                  <div
                    className={`typo-title-section font-mono tabular-nums ${
                      frequenciaHistorico === null
                        ? 'text-slate-700 dark:text-slate-300'
                        : isFrequenciaGreen
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {frequenciaHistorico !== null
                      ? `${frequenciaHistorico.toFixed(1)}%`
                      : 'Sem dados'}
                  </div>
                </div>
              </div>
              <span className="typo-meta font-mono opacity-75 tabular-nums">
                {presencasHistorico}P / {faltasHistorico}F
              </span>
            </div>
          </div>

          {/* Resumo Acadêmico do Aluno */}
          <div className="space-y-2">
            <h3 className="typo-title-section flex items-center gap-1.5 text-[var(--text-primary)]">
              <GraduationCap className="h-4 w-4 text-[var(--color-primary)]" />
              Resumo do Aluno
            </h3>
            <div className="typo-card-body surface-solid grid grid-cols-2 gap-3.5 rounded-xl border border-[var(--border-color)] p-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <span className="typo-meta text-[var(--text-secondary)]">
                  Módulo Atual
                </span>
                <p className="mt-0.5 font-semibold text-[var(--text-primary)]">
                  {moduloDisplay}
                </p>
              </div>
              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Aula Atual
                </span>
                <p className="mt-0.5 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                  {student.aulaInfo || student.aulaAtualLabel}
                </p>
              </div>
              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Professor Responsável
                </span>
                <p
                  data-testid="student-modal-professor"
                  className="mt-0.5 flex items-center gap-1 font-semibold text-[var(--color-primary)]"
                >
                  <UserCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>{professorDisplay}</span>
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
                  Categoria do Curso
                </span>
                <p className="mt-0.5 font-semibold text-[var(--color-primary)]">
                  {student.categoriaCurso === 'INGLÊS'
                    ? 'Inglês'
                    : 'Profissionalizante'}
                </p>
              </div>
              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Apostila
                </span>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {student.possuiApostila ? (
                    <>
                      <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 p-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                        <BookOpen className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Entregue
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center justify-center rounded-full bg-rose-100 p-1 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
                        <BookX className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-semibold text-rose-700 dark:text-rose-400">
                        Não entregue
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Financeiro
                </span>
                <p
                  data-testid="student-modal-financeiro-status"
                  className={`mt-0.5 font-semibold ${
                    student.inadimplente
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {student.inadimplente ? 'Em atraso' : 'Em dia'}
                </p>
              </div>
              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Última Nota
                </span>
                <p
                  data-testid="student-modal-nota-contexto"
                  className="mt-0.5 font-mono font-semibold text-[var(--text-primary)] tabular-nums"
                >
                  {student.notaContextoLabel}
                </p>
              </div>
            </div>
          </div>

          {/* Histórico de Agendamentos do Contrato */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="typo-title-section flex items-center gap-1.5 text-[var(--text-primary)]">
                <History className="h-4 w-4 text-[var(--color-primary)]" />
                Agendamentos (#{student.contrato})
              </h3>
              <div className="typo-meta flex items-center gap-2 font-mono font-semibold tabular-nums">
                <span className="text-emerald-700 dark:text-emerald-400">
                  {presencasHistorico}P
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="text-rose-700 dark:text-rose-400">
                  {faltasHistorico}F
                </span>
                {naoIniciadosHistorico > 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-[var(--text-secondary)]">
                      {naoIniciadosHistorico} Não inic.
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="surface-solid divide-y divide-[var(--border-color)] overflow-hidden rounded-xl border border-[var(--border-color)]">
              {studentHistory.map((item) => {
                const isSelectedClass = item.id === student.id;
                const itemSala = formatFullSalaName(item.sala);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${
                      isSelectedClass
                        ? 'bg-blue-50/50 dark:bg-blue-950/30'
                        : 'bg-[var(--surface-card)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="typo-card-body flex items-center gap-2 font-semibold text-[var(--text-primary)] tabular-nums">
                        <span className="font-mono">{item.horario}</span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="truncate">
                          {formatModuleDisplay(item.moduloAtual || item.curso)}
                        </span>
                      </div>
                      <div className="typo-meta mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[var(--text-secondary)] tabular-nums">
                        <span>{item.aulaInfo}</span>
                        <span>·</span>
                        <span>{itemSala}</span>
                        {item.inicio && (
                          <>
                            <span>·</span>
                            <span>Início: {item.inicio}</span>
                          </>
                        )}
                        {item.fim && (
                          <>
                            <span>·</span>
                            <span>Fim: {item.fim}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <span
                      className={`typo-badge inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 ${
                        item.attendanceStatus === 'Presença'
                          ? 'border-emerald-200/80 bg-emerald-50/90 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : item.attendanceStatus === 'Falta'
                          ? 'border-rose-200/80 bg-rose-50/90 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'border-slate-200 bg-slate-100/80 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {item.attendanceStatus}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Contatos e Acesso à Aula */}
          <div className="space-y-2">
            <h3 className="typo-title-section flex items-center gap-1.5 text-[var(--text-primary)]">
              <Phone className="h-4 w-4 text-[var(--color-primary)]" />
              Contatos e Acesso à Aula
            </h3>
            <div className="typo-card-body surface-solid grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-color)] p-4 sm:grid-cols-2">
              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Telefone do Aluno
                </span>
                <p className="mt-0.5 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                  {student.telefoneAluno || 'Não informado'}
                </p>
              </div>
              <div>
                <span className="typo-meta text-[var(--text-secondary)]">
                  Responsável
                </span>
                <p className="mt-0.5 font-semibold text-[var(--text-primary)] tabular-nums">
                  {student.nomeResponsavel
                    ? `${student.nomeResponsavel}${
                        student.telefoneResponsavel
                          ? ` (${student.telefoneResponsavel})`
                          : ''
                      }`
                    : 'Próprio aluno'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="typo-meta text-[var(--text-secondary)]">
                    Acesso à Aula (Portal do Aluno)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={student.linkAcessoDireto}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-press typo-btn inline-flex items-center gap-1 rounded-lg border border-[var(--color-primary)]/25 bg-[var(--color-primary)]/10 px-2.5 py-1 text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
                    >
                      <KeyRound className="h-3 w-3" />
                      <span>Acessar Aula</span>
                      <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyAuthLink}
                      className="btn-press typo-btn inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2.5 py-1 text-[var(--text-primary)] transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Copiado
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Ficha Individual do Aluno */}
          {onOpenPortalHub && (
            <div className="space-y-2 rounded-xl border border-blue-200/80 bg-blue-50/50 p-3.5 dark:border-blue-800/70 dark:bg-blue-950/35">
              <div className="flex items-center justify-between">
                <span className="typo-subtitle font-bold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                  <GraduationCap className="h-4 w-4 text-[var(--color-primary)]" />
                  Documentos do Aluno
                </span>
                <span className="font-mono text-[10px] font-semibold text-blue-700 uppercase tracking-wider dark:text-blue-300">
                  #{student.contrato}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
                <button
                  type="button"
                  data-testid="student-modal-open-carteirinha"
                  onClick={() => onOpenPortalHub('CARTEIRINHA')}
                  className="btn-press hover-elevate flex flex-col items-center justify-center gap-1 rounded-xl border border-blue-200/80 bg-[var(--surface-card)] p-2.5 text-center text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--color-primary)] dark:border-blue-800/70 cursor-pointer"
                >
                  <CreditCard className="h-4 w-4 text-[var(--color-primary)]" />
                  <span>Carteirinha</span>
                </button>

                <button
                  type="button"
                  data-testid="student-modal-open-boletim"
                  onClick={() => onOpenPortalHub('BOLETIM')}
                  className="btn-press hover-elevate flex flex-col items-center justify-center gap-1 rounded-xl border border-blue-200/80 bg-[var(--surface-card)] p-2.5 text-center text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-emerald-500 dark:border-blue-800/70 cursor-pointer"
                >
                  <GraduationCap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Boletim</span>
                </button>

                <button
                  type="button"
                  data-testid="student-modal-open-acompanhamento"
                  onClick={() => onOpenPortalHub('ACOMPANHAMENTO')}
                  className="btn-press hover-elevate flex flex-col items-center justify-center gap-1 rounded-xl border border-blue-200/80 bg-[var(--surface-card)] p-2.5 text-center text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-purple-500 dark:border-blue-800/70 cursor-pointer"
                >
                  <ClipboardList className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span>Acompanhamento</span>
                </button>

                <button
                  type="button"
                  data-testid="student-modal-open-declaracao"
                  onClick={() => onOpenPortalHub('DECLARACAO')}
                  className="btn-press hover-elevate flex flex-col items-center justify-center gap-1 rounded-xl border border-blue-200/80 bg-[var(--surface-card)] p-2.5 text-center text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-amber-500 dark:border-blue-800/70 cursor-pointer"
                >
                  <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span>Declaração</span>
                </button>
              </div>
            </div>
          )}

          {/* Ações Rápidas */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <a
              href={student.linkAcessoDireto}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press typo-btn inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-3 py-2.5 text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
            >
              <KeyRound className="h-4 w-4 shrink-0" />
              <span>Acessar Aula</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>

            <a
              href={student.whatsappResponsavelContactUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press typo-btn inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2.5 text-sky-900 transition-colors hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-900/60"
            >
              <MessageCircle className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" />
              <span>Contatar Responsável</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>

            <a
              href={student.whatsappAlunoLoginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press typo-btn inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-emerald-900 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
            >
              <MessageCircle className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
              <span>Enviar Aula</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
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
    </motion.div>
  );
};
