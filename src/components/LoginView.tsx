import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Building2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  MessageSquare,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import {
  AuthSession,
  RegisteredSchool,
} from '../utils/authRegistry';
import {
  authenticateUserInSupabase,
} from '../utils/supabaseClient';
import { useToast } from './uiSystem';

interface LoginViewProps {
  schools: RegisteredSchool[];
  onLoginSuccess: (
    session: AuthSession,
    updatedMetadata?: {
      unidade?: string;
      codigoUnidade?: string;
      usuarioLogin?: string;
      usuarioNomeCompleto?: string;
      usuarioCargo?: string;
    }
  ) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenPrivacyPage?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  schools,
  onLoginSuccess,
  theme,
  onToggleTheme,
  onOpenPrivacyPage,
}) => {
  const [login, setLogin] = useState<string>('');
  const [senha, setSenha] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberLogin, setRememberLogin] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanLogin = login.trim();
    const cleanSenha = senha.trim();

    if (!cleanLogin || !cleanSenha) {
      const msg = 'Informe seu login e senha para acessar o sistema.';
      setErrorMessage(msg);
      toast.warning('Campos obrigatórios', msg);
      return;
    }

    setIsSubmitting(true);
    try {
      let apiResponse: Response | null = null;
      let data: any = null;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        try {
          apiResponse = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ login: cleanLogin, senha: cleanSenha }),
            signal: controller.signal,
          });
          const contentType = apiResponse.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            data = await apiResponse.json();
          }
        } finally {
          clearTimeout(timeoutId);
        }
      } catch {
        apiResponse = null;
      }

      if (apiResponse && apiResponse.ok && data?.ok && data.session) {
        toast.success(
          'Autenticação realizada com sucesso',
          `Bem-vindo(a), ${data.session.nomeCompleto || data.session.login}!`
        );
        onLoginSuccess(data.session, data.metadata);
        return;
      }

      if (apiResponse && apiResponse.status === 429) {
        const lockMsg =
          data?.error ||
          'Conta temporariamente bloqueada por excesso de tentativas inválidas.';
        setErrorMessage(lockMsg);
        toast.error('Acesso bloqueado temporariamente', lockMsg);
        return;
      }

      const supaResult = await authenticateUserInSupabase(
        cleanLogin,
        cleanSenha
      );
      if (supaResult.ok && supaResult.session) {
        toast.success(
          'Autenticação realizada com sucesso',
          `Bem-vindo(a), ${supaResult.session.nomeCompleto || supaResult.session.login}!`
        );
        onLoginSuccess(supaResult.session, {
          unidade: supaResult.school?.nome || supaResult.session.schoolName,
          codigoUnidade: supaResult.school?.codigoPortal || supaResult.session.codigoPortal,
          usuarioLogin: supaResult.user?.login || supaResult.session.login,
          usuarioNomeCompleto:
            supaResult.user?.nomeCompleto || supaResult.session.nomeCompleto,
          usuarioCargo: supaResult.user?.cargo || supaResult.session.cargo,
        });
        return;
      }

      const invalidMsg =
        data?.error ||
        supaResult.error ||
        'Credenciais inválidas: verifique seu login e senha.';
      setErrorMessage(invalidMsg);
      toast.error('Falha de autenticação', invalidMsg);
    } catch {
      const supaResult = await authenticateUserInSupabase(
        cleanLogin,
        cleanSenha
      );
      if (supaResult.ok && supaResult.session) {
        toast.success(
          'Autenticação realizada com sucesso',
          `Bem-vindo(a), ${supaResult.session.nomeCompleto || supaResult.session.login}!`
        );
        onLoginSuccess(supaResult.session, {
          unidade: supaResult.school?.nome || supaResult.session.schoolName,
          codigoUnidade: supaResult.school?.codigoPortal || supaResult.session.codigoPortal,
          usuarioLogin: supaResult.user?.login || supaResult.session.login,
          usuarioNomeCompleto:
            supaResult.user?.nomeCompleto || supaResult.session.nomeCompleto,
          usuarioCargo: supaResult.user?.cargo || supaResult.session.cargo,
        });
        return;
      }

      const commError =
        supaResult.error ||
        'Falha de comunicação com o servidor ou credenciais incorretas.';
      setErrorMessage(commError);
      toast.error('Erro de conexão', commError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const whatsappSupportText = [
    'Olá! Preciso de suporte técnico.',
    '',
    `Escola: ${schools[0]?.nome || 'Unidade Microlins'}`,
    '',
    `Usuário: ${login.trim() || 'Não autenticado (Tela de Login)'}`,
    '',
    'Gostaria de solicitar atendimento para uma dúvida ou problema no sistema.',
  ].join('\n');
  const whatsappSupportUrl = `https://api.whatsapp.com/send?phone=5518997432487&text=${encodeURIComponent(
    whatsappSupportText
  )}`;

  return (
    <div
      data-testid="login-view"
      className="relative flex min-h-screen w-full max-w-[100vw] flex-col justify-between bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-x-hidden"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-[#2563EB] focus:px-4 focus:py-2 focus:text-xs focus:font-bold focus:text-white focus:shadow-lg"
      >
        Pular para o conteúdo principal
      </a>

      {/* Subtle ambient background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[#2563EB]/12 blur-3xl dark:bg-[#2563EB]/20" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-[#6366F1]/12 blur-3xl dark:bg-[#6366F1]/20" />
      </div>

      {/* CABEÇALHO INSTITUCIONAL GLASS */}
      <header
        data-testid="main-header"
        className="relative z-10 shrink-0 border-b border-[var(--border-color)] glass-panel rounded-none px-3 py-2.5 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563EB] to-[#6366F1] p-1.5 shadow-sm">
              <img
                src="/assets/aistudio/logo-microlins_6400203f.png"
                alt="Microlins"
                className="h-5 w-auto object-contain brightness-0 invert"
                data-testid="header-microlins-logo"
              />
            </div>
            <div className="hidden h-5 w-px bg-[var(--border-color)] sm:block" />
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <Building2 className="hidden h-4 w-4 shrink-0 text-[var(--color-primary)] min-[380px]:block" />
              <span className="typo-subtitle truncate text-xs sm:text-[15px] text-[var(--text-primary)]">
                Microlins · Plataforma de Gestão e Monitoramento Acadêmico
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {onOpenPrivacyPage && (
              <button
                type="button"
                data-testid="header-privacy-link-btn"
                onClick={onOpenPrivacyPage}
                aria-label="Privacidade e LGPD"
                className="btn-press inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-2.5 sm:px-3 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--color-primary)]"
              >
                <Lock className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                <span className="hidden sm:inline">Privacidade e LGPD</span>
              </button>
            )}

            <button
              type="button"
              data-testid="login-theme-toggle-btn"
              onClick={onToggleTheme}
              aria-label={
                theme === 'light'
                  ? 'Alternar para Tema Escuro'
                  : 'Alternar para Tema Claro'
              }
              title={
                theme === 'light'
                  ? 'Alternar para Tema Escuro'
                  : 'Alternar para Tema Claro'
              }
              className="btn-press inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] text-[var(--text-primary)] transition-colors hover:border-[var(--color-primary)]"
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4 text-[var(--color-primary)]" />
              ) : (
                <Sun className="h-4 w-4 text-amber-400" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ÁREA CENTRAL DO CARD DE LOGIN COM ANIMAÇÃO */}
      <main id="main-content" className="relative z-10 flex flex-1 items-center justify-center px-3 sm:px-4 py-6 sm:py-8">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          className="w-full max-w-md overflow-hidden glass-modal"
        >
          {/* Faixa Superior Institucional */}
          <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] via-[#6366F1] to-[#2563EB]" />

          <div className="p-7 sm:p-9">
            <div className="flex flex-col items-center text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#6366F1] p-3 shadow-md">
                <img
                  src="/assets/aistudio/logo-microlins_6400203f.png"
                  alt="Microlins"
                  className="h-8 w-auto object-contain brightness-0 invert"
                  data-testid="login-logo-image"
                />
              </div>
              <h1 className="mt-4 typo-title-section text-[22px] text-[var(--text-primary)]">
                Acesso ao Sistema da Unidade
              </h1>
              <p className="mt-1 typo-meta text-[var(--text-secondary)]">
                Entre com suas credenciais institucionais para acessar o painel
              </p>
            </div>

            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                data-testid="login-error-banner"
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs font-semibold text-[#DC2626] dark:text-red-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#DC2626] dark:text-red-400" />
                <div>
                  <p className="font-bold">Não foi possível acessar</p>
                  <p className="mt-0.5 font-normal leading-relaxed">
                    {errorMessage}
                  </p>
                </div>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="login-input"
                  className="mb-1.5 block text-[13px] font-semibold text-[var(--text-primary)]"
                >
                  Login de Acesso
                </label>
                <input
                  id="login-input"
                  data-testid="login-input"
                  type="text"
                  autoComplete="username"
                  value={login}
                  onChange={(e) => {
                    setLogin(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Digite seu login (ex.: admin ou código)"
                  className="h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[#2563EB]/20 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="password-input"
                  className="mb-1.5 block text-[13px] font-semibold text-[var(--text-primary)]"
                >
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="password-input"
                    data-testid="password-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={senha}
                    onChange={(e) => {
                      setSenha(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Digite sua senha"
                    className="h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] pr-10 pl-3.5 text-[14px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[#2563EB]/20 focus:outline-none"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    data-testid="toggle-password-visibility-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    title={showPassword ? 'Ocultar senha' : 'Visualizar senha'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    data-testid="remember-login-checkbox"
                    checked={rememberLogin}
                    onChange={(e) => setRememberLogin(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border-color)] text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <span className="typo-meta text-[var(--text-secondary)]">
                    Lembrar meu login neste dispositivo
                  </span>
                </label>
              </div>

              <button
                type="submit"
                data-testid="login-submit-button"
                disabled={isSubmitting}
                className="btn-press mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#6366F1] px-4 typo-btn text-white shadow-md transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    <span>Entrar no Sistema</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </motion.div>
      </main>

      {/* RODAPÉ INSTITUCIONAL */}
      <footer
        data-testid="system-footer"
        className="relative z-10 shrink-0 border-t border-[var(--border-color)] glass-panel rounded-none px-4 py-2.5 text-xs text-[var(--text-secondary)] sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 sm:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
            <span className="font-semibold text-[var(--text-primary)]">
              © 2026 Grupo Realizar Microlins
            </span>
            {onOpenPrivacyPage && (
              <button
                type="button"
                data-testid="footer-privacy-link"
                onClick={onOpenPrivacyPage}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-primary)] transition-colors hover:border-[var(--color-primary)]"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A]" />
                <span>Privacidade e LGPD</span>
              </button>
            )}
          </div>

          <div className="text-center font-medium text-[var(--text-secondary)]">
            <span>Desenvolvido por Alisson Araújo Bott</span>
          </div>

          <div className="flex items-center justify-center gap-1.5 sm:justify-end">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
            <span className="font-medium">Suporte Técnico:</span>
            <a
              href={whatsappSupportUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="footer-whatsapp-support-link"
              className="font-bold text-[var(--text-primary)] underline decoration-[#16A34A] underline-offset-2 transition-colors hover:text-[#16A34A]"
              title="Abrir conversa de suporte técnico no WhatsApp"
            >
              (18) 99743-2487
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

