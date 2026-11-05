import React, { useEffect, useState } from 'react';
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

const REMEMBERED_LOGIN_STORAGE_KEY = 'microlins_remembered_login';

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

  useEffect(() => {
    try {
      const savedLogin = localStorage.getItem(REMEMBERED_LOGIN_STORAGE_KEY);
      if (savedLogin) {
        setLogin(savedLogin);
        setRememberLogin(true);
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanLogin = login.trim();
    const cleanSenha = senha.trim();

    if (!cleanLogin || !cleanSenha) {
      setErrorMessage('Informe seu login e senha para acessar o sistema.');
      return;
    }

    try {
      if (rememberLogin) {
        localStorage.setItem(REMEMBERED_LOGIN_STORAGE_KEY, cleanLogin);
      } else {
        localStorage.removeItem(REMEMBERED_LOGIN_STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage write errors
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
        // Ambiente serverless/estático (ex.: Netlify SPA) sem rota Node /api/auth/login ativa
        apiResponse = null;
      }

      if (apiResponse && apiResponse.ok && data?.ok && data.session) {
        onLoginSuccess(data.session, data.metadata);
        return;
      }

      if (apiResponse && apiResponse.status === 429) {
        setErrorMessage(
          data?.error ||
            'Conta temporariamente bloqueada por excesso de tentativas inválidas.'
        );
        return;
      }

      // Validação direta na tabela `users` e `schools` do Supabase (produção Netlify / serverless)
      const supaResult = await authenticateUserInSupabase(
        cleanLogin,
        cleanSenha
      );
      if (supaResult.ok && supaResult.session) {
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

      setErrorMessage(
        data?.error ||
          supaResult.error ||
          'Credenciais inválidas: verifique seu login e senha.'
      );
    } catch {
      const supaResult = await authenticateUserInSupabase(
        cleanLogin,
        cleanSenha
      );
      if (supaResult.ok && supaResult.session) {
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

      setErrorMessage(
        supaResult.error ||
          'Falha de comunicação com o servidor ou credenciais incorretas.'
      );
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
      className="flex min-h-screen w-screen flex-col justify-between bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
    >
      {/* CABEÇALHO INSTITUCIONAL MINIMALISTA E COMPACTO */}
      <header
        data-testid="main-header"
        className="shrink-0 border-b border-[#00386B] bg-[#004A8D] text-white shadow-xs dark:border-slate-800 dark:bg-[#003669]"
      >
        <div className="flex min-h-10 w-full items-center justify-between gap-2 px-3 py-1 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src="/assets/aistudio/logo-microlins_6400203f.png"
              alt="Microlins"
              className="h-5 w-auto object-contain brightness-0 invert"
              data-testid="header-microlins-logo"
            />
            <div className="hidden h-4 w-px bg-white/20 sm:block" />
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-sky-200" />
              <span className="text-xs font-extrabold tracking-tight text-white sm:text-sm">
                Gestão Pedagógica e Acadêmica
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenPrivacyPage && (
              <button
                type="button"
                data-testid="header-privacy-link-btn"
                onClick={onOpenPrivacyPage}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
              >
                <Lock className="h-3 w-3 text-sky-200" />
                <span className="hidden sm:inline">Privacidade e LGPD</span>
              </button>
            )}

            <button
              type="button"
              data-testid="login-theme-toggle-btn"
              onClick={onToggleTheme}
              title={
                theme === 'light'
                  ? 'Alternar para Tema Escuro'
                  : 'Alternar para Tema Claro'
              }
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              {theme === 'light' ? (
                <Moon className="h-3.5 w-3.5 text-sky-100" />
              ) : (
                <Sun className="h-3.5 w-3.5 text-amber-300" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ÁREA CENTRAL DO CARD DE LOGIN */}
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          {/* Faixa Superior Institucional */}
          <div className="h-1.5 w-full bg-[#004A8D]" />

          <div className="p-7 sm:p-8">
            <div className="flex flex-col items-center text-center">
              <img
                src="/assets/aistudio/logo-microlins_6400203f.png"
                alt="Microlins"
                className="h-11 w-auto object-contain dark:brightness-0 dark:invert"
                data-testid="login-logo-image"
              />
              <h1 className="mt-4 text-base font-bold tracking-tight text-slate-900 dark:text-white">
                Acesso ao Sistema da Unidade
              </h1>
            </div>

            {errorMessage && (
              <div
                data-testid="login-error-banner"
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <div>
                  <p className="font-bold">Não foi possível acessar</p>
                  <p className="mt-0.5 font-normal leading-relaxed">
                    {errorMessage}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="login-input"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Login
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
                  placeholder="Digite seu login de acesso"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#004A8D] focus:ring-2 focus:ring-[#004A8D]/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="password-input"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
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
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white pr-10 pl-3.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#004A8D] focus:ring-2 focus:ring-[#004A8D]/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    data-testid="toggle-password-visibility-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
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

              <div className="flex items-center pt-0.5">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    data-testid="remember-login-checkbox"
                    checked={rememberLogin}
                    onChange={(e) => setRememberLogin(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#004A8D] focus:ring-[#004A8D]"
                  />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Lembrar meu login neste dispositivo
                  </span>
                </label>
              </div>

              <button
                type="submit"
                data-testid="login-submit-button"
                disabled={isSubmitting}
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#004A8D] px-4 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#003B70] disabled:cursor-not-allowed disabled:opacity-60"
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
        </div>
      </main>

      {/* RODAPÉ INSTITUCIONAL ALINHADO E PROPORCIONAL */}
      <footer
        data-testid="system-footer"
        className="shrink-0 border-t border-[#001B3A] bg-[#002855] px-4 py-1.5 text-[11px] text-slate-200 sm:px-6 dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="mx-auto flex w-full max-w-[1920px] flex-col items-center justify-between gap-1.5 sm:flex-row sm:gap-4">
          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
            <span className="font-semibold tracking-tight text-white">
              © 2026 Grupo Realizar Microlins
            </span>
            {onOpenPrivacyPage && (
              <button
                type="button"
                data-testid="footer-privacy-link"
                onClick={onOpenPrivacyPage}
                className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-sky-200 transition-colors hover:bg-white/20 hover:text-white"
              >
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                <span>Privacidade e LGPD</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-center text-center font-medium text-sky-200">
            <span>Desenvolvido por Alisson Araújo Bott</span>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-slate-200 sm:justify-end">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="font-medium">Suporte Técnico:</span>
            <a
              href={whatsappSupportUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="footer-whatsapp-support-link"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold text-white underline decoration-emerald-400/80 underline-offset-2 transition-colors hover:bg-white/10 hover:text-emerald-300"
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
