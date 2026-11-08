import React from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';

interface ProductionErrorBoundaryProps {
  children: React.ReactNode;
}

interface ProductionErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ProductionErrorBoundary extends React.Component<
  ProductionErrorBoundaryProps,
  ProductionErrorBoundaryState
> {
  declare state: ProductionErrorBoundaryState;
  declare props: Readonly<ProductionErrorBoundaryProps>;

  constructor(props: ProductionErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): ProductionErrorBoundaryState {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro inesperado durante a renderização da interface.';
    return {
      hasError: true,
      errorMessage: message,
    };
  }

  componentDidCatch(_error: unknown, _errorInfo: React.ErrorInfo): void {
    // Isolamento seguro de falha de renderização em produção sem derrubar toda a aplicação
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleResetAndReload = (): void => {
    try {
      sessionStorage.clear();
    } catch {
      // Ignora caso o navegador bloqueie acesso ao storage
    }
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          data-testid="production-error-boundary"
          className="flex min-h-screen w-full items-center justify-center bg-[#0B1120] p-4 text-slate-100"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white">
                  Proteção de Estabilidade Ativada
                </h1>
                <p className="text-xs text-slate-400">
                  Microlins · Plataforma de Gestão e Monitoramento Acadêmico
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-slate-300">
              Detectamos uma exceção inesperada ao renderizar este componente. Seus dados
              acadêmicos e registros permanecem íntegros e protegidos.
            </p>

            {this.state.errorMessage && (
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3 font-mono text-[11px] text-slate-400 break-words">
                {this.state.errorMessage}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-500"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Recarregar Painel</span>
              </button>
              <button
                type="button"
                onClick={this.handleResetAndReload}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Restaurar Sessão</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
