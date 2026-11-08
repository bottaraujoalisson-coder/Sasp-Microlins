import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  Lock,
  Database,
  Users,
  EyeOff,
  Search,
  ChevronDown,
  ChevronUp,
  Server,
  KeyRound,
  Building2,
  Clock,
  FileCheck2,
  ArrowLeft,
  Sun,
  Moon,
  LogOut,
  UserCheck,
  X,
} from 'lucide-react';
import {
  PRIVACY_KNOWLEDGE_BASE,
  searchPrivacyKnowledgeBase,
} from '../utils/privacyKnowledgeBase';
import { AuthSession } from '../utils/authRegistry';

interface PrivacyProtectionViewProps {
  authSession?: AuthSession | null;
  onBack?: () => void;
  onLogout?: () => void;
  theme?: string;
  onToggleTheme?: () => void;
  activeSchoolName?: string;
  activeUserName?: string;
  activeUserRole?: string;
  activeUserLogin?: string;
}

export const PrivacyProtectionView: React.FC<PrivacyProtectionViewProps> = ({
  authSession = null,
  onBack,
  onLogout,
  theme = 'light',
  onToggleTheme,
  activeSchoolName = 'ESCOLA PRESIDENTE PRUDENTE',
  activeUserName,
  activeUserRole,
  activeUserLogin,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');
  const [expandedId, setExpandedId] = useState<string | null>('isolamento-multi-escola');

  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(PRIVACY_KNOWLEDGE_BASE.map((item) => item.category))
    );
    return ['TODAS', ...unique];
  }, []);

  const filteredArticles = useMemo(() => {
    return searchPrivacyKnowledgeBase(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]"
      data-testid="privacy-protection-view"
    >
      {/* CABEÇALHO PADRONIZADO UNIFICADO */}
      <header
        data-testid="main-header"
        className="shrink-0 border-b border-[#00386B] bg-[#004A8D] text-white shadow-2xs dark:border-slate-800 dark:bg-[#0F172A]"
      >
        <div className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 px-3 py-1.5 sm:px-5 lg:flex-nowrap">
          <div className="flex min-w-0 shrink items-center gap-2">
            <img
              src="/assets/aistudio/logo-microlins_6400203f.png"
              alt="Microlins"
              className="h-5 w-auto shrink-0 object-contain brightness-0 invert"
              data-testid="header-microlins-logo"
            />
            <div className="hidden h-4 w-px bg-white/20 sm:block" />
            <div className="flex min-w-0 items-center gap-1.5">
              <Building2 className="hidden h-3.5 w-3.5 shrink-0 text-sky-200 sm:block" />
              <span
                data-testid="header-school-name"
                className="truncate text-xs font-bold tracking-tight text-white"
              >
                {activeSchoolName}
              </span>
            </div>
          </div>

          {/* Barra de Pesquisa Única Exclusivamente no Cabeçalho */}
          <div className="relative order-3 w-full max-w-xl flex-1 lg:order-2 lg:mx-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sky-200" />
            <input
              type="search"
              data-testid="header-global-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar tópico técnico, diretriz LGPD ou controle de segurança..."
              className="h-8 w-full rounded-lg border border-white/20 bg-[#003669]/90 pl-9 pr-8 text-xs font-medium text-white placeholder:text-sky-200/75 focus:border-sky-300 focus:bg-[#002D5A] focus:outline-none dark:border-slate-700 dark:bg-slate-900/90"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpar pesquisa"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-sky-200 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Direita: Identificação do Usuário + Alternância de Tema + Sair */}
          <div className="order-2 flex shrink-0 items-center gap-2 lg:order-3">
            {activeUserName && (
              <div
                data-testid="header-user-session-info"
                className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-[#003669] px-2.5 text-xs text-sky-100 whitespace-nowrap"
              >
                <UserCheck className="h-3.5 w-3.5 shrink-0 text-sky-200" />
                <span
                  data-testid="header-user-fullname"
                  className="font-semibold text-white"
                >
                  {activeUserName}
                </span>
                {activeUserRole && (
                  <span
                    data-testid="header-user-role"
                    className="text-[11px] text-sky-200"
                  >
                    · {activeUserRole}
                    {activeUserLogin ? ` (#${activeUserLogin})` : ''}
                  </span>
                )}
              </div>
            )}

            {onToggleTheme && (
              <button
                type="button"
                data-testid="theme-toggle-button"
                onClick={onToggleTheme}
                aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
                title={theme === 'light' ? 'Alternar para o Tema Escuro' : 'Alternar para o Tema Claro'}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                {theme === 'light' ? (
                  <Moon className="h-4 w-4 text-sky-100" />
                ) : (
                  <Sun className="h-4 w-4 text-amber-300" />
                )}
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                data-testid="header-logout-btn"
                onClick={onLogout}
                title="Sair da plataforma"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-rose-300/30 bg-rose-500/20 px-2.5 text-xs font-bold text-rose-100 whitespace-nowrap transition-colors hover:bg-rose-500/35"
              >
                <LogOut className="h-3.5 w-3.5 text-rose-200" />
                <span>Sair</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Cabeçalho Técnico Objetivo */}
        <div className="glass-card p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-[#2563EB]/12 border border-[#2563EB]/25 flex items-center justify-center text-[var(--color-primary)] shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="typo-title-section text-[20px] text-[var(--text-primary)]">
                    Privacidade, Governança e Proteção de Dados (LGPD)
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-[#16A34A] dark:text-emerald-400 border border-emerald-500/25">
                    Lei nº 13.709/2018
                  </span>
                </div>
                <p className="typo-card-body text-[var(--text-secondary)] mt-1">
                  Arquitetura técnica de controle de acesso (RBAC), isolamento multi-escola, proteção criptográfica e retenção de dados operacionais.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {authSession && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs">
                  <Building2 className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">
                      Escopo: {authSession.role === 'ADMIN' ? 'Administração Global' : authSession.schoolName || 'Unidade Escolar'}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      Perfil {authSession.role} • Acesso autenticado
                    </div>
                  </div>
                </div>
              )}

              {onBack && (
                <button
                  type="button"
                  data-testid="privacy-back-btn"
                  onClick={onBack}
                  className="btn-press inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 text-xs font-semibold text-white shadow-xs hover:opacity-95"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar ao Sistema</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Pilares Técnicos da Arquitetura de Segurança */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card hover-elevate p-4 space-y-2">
            <div className="flex items-center gap-2 text-[var(--color-primary)] font-semibold text-xs uppercase tracking-wider">
            <Building2 className="w-4 h-4 shrink-0" />
            <span>Isolamento Multi-Escola</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Particionamento lógico por unidade (<code className="text-[11px] font-mono">school_id</code> e <code className="text-[11px] font-mono">codigo_portal</code>). Cada usuário visualiza exclusivamente os alunos, professores e convites NPS vinculados à própria escola.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs uppercase tracking-wider">
            <Users className="w-4 h-4 shrink-0" />
            <span>Controle de Acesso (RBAC)</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Segregação estrita entre perfis <code className="text-[11px] font-mono">ESCOLA</code> e <code className="text-[11px] font-mono">ADMIN</code> validada no servidor via tokens de sessão SHA-256, com bloqueio automático após 5 tentativas inválidas.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-xs uppercase tracking-wider">
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>Proteção de Credenciais</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Senhas com hash irreversível Argon2id (RFC 9106) e segredos de infraestrutura isolados em variáveis de ambiente no servidor, nunca expostos no front-end.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-xs uppercase tracking-wider">
            <EyeOff className="w-4 h-4 shrink-0" />
            <span>Minimização e Retenção</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Exibição apenas de indicadores estritamente necessários ao acompanhamento acadêmico (status financeiro binário, sem valores monetários) durante a vigência contratual.
          </p>
        </div>
      </div>

      {/* Especificações Técnicas de Tratamento de Dados */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <FileCheck2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">
            Política Técnica de Tratamento, Proteção e Retenção (LGPD)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-300">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
            <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-blue-500" />
              1. Finalidade e Base Legal (Art. 7º, V da LGPD)
            </div>
            <p className="leading-relaxed">
              O tratamento de dados pessoais limita-se à execução do contrato educacional: controle de presença e faltas, acompanhamento de etapa curricular, entrega de apostila, vinculação do professor responsável e gestão de convites da pesquisa de satisfação (NPS).
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
            <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-emerald-500" />
              2. Isolamento de Segredos e Integrações Servidor-a-Servidor
            </div>
            <p className="leading-relaxed">
              A sincronização com o Portal do Aluno (MoveEdu) e com a plataforma Indecx NPS ocorre em camada de servidor sob HTTPS. Credenciais e chaves de ambiente permanecem em variáveis de ambiente privadas, sem armazenamento de senhas em colunas acessíveis pelo cliente.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
            <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-indigo-500" />
              3. Controle de Acesso e Segregação por Unidade
            </div>
            <p className="leading-relaxed">
              Cada registro contém identificação da escola (<code className="font-mono">school_id</code> / <code className="font-mono">unidade</code>). As consultas aplicam filtro obrigatório pelo perfil autenticado, garantindo que usuários de uma unidade acessem apenas dados da própria escola.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
            <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              4. Retenção, Atualização e Direitos do Titular (Art. 15, 16 e 18)
            </div>
            <p className="leading-relaxed">
              Os dados são mantidos enquanto perdurar o vínculo contratual ativo e pelas exigências legais aplicáveis. Atualizações cadastrais, retificações ou exercícios de direitos do titular são processados diretamente junto à Secretaria/Coordenação da unidade escolar no sistema matriz (CAD/Portal) e refletidos na sincronização.
            </p>
          </div>
        </div>
      </div>

      {/* Base Técnica de Consulta Rápida */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">
            Detalhamento Técnico por Domínio
          </h2>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              data-testid="privacy-category-select"
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'TODAS' ? 'Todas as categorias' : cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredArticles.map((article) => {
            const isExpanded = expandedId === article.id;
            return (
              <div key={article.id} className="py-3 first:pt-0 last:pb-0">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : article.id)
                  }
                  className="w-full flex items-start justify-between gap-3 text-left group"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {article.question}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {article.categoryLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {article.shortAnswer}
                    </p>
                  </div>
                  <span className="text-slate-400 shrink-0 mt-0.5">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </button>

                {isExpanded && (
                  <div className="mt-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 space-y-2 text-xs">
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      {article.detailedExplanation}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        <strong className="text-slate-700 dark:text-slate-300">Base Legal:</strong>{' '}
                        {article.legalBasis}
                      </span>
                      <span>
                        <strong className="text-slate-700 dark:text-slate-300">Implementação:</strong>{' '}
                        {article.technicalProof}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </motion.div>
  );
};
export default PrivacyProtectionView;

