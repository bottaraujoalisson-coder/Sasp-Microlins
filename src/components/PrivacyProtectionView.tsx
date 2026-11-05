import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import {
  PRIVACY_KNOWLEDGE_BASE,
  searchPrivacyKnowledgeBase,
} from '../utils/privacyKnowledgeBase';
import { AuthSession } from '../utils/authRegistry';

interface PrivacyProtectionViewProps {
  authSession?: AuthSession | null;
  onBack?: () => void;
  theme?: string;
  onToggleTheme?: () => void;
  activeSchoolName?: string;
  activeUserName?: string;
  activeUserRole?: string;
}

export const PrivacyProtectionView: React.FC<PrivacyProtectionViewProps> = ({
  authSession = null,
  onBack,
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
    <div
      className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6"
      data-testid="privacy-protection-view"
    >
      {/* Cabeçalho Técnico Objetivo */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-600/10 dark:bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Privacidade, Governança e Proteção de Dados (LGPD)
                </h1>
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  Lei nº 13.709/2018
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                Arquitetura técnica de controle de acesso (RBAC), isolamento multi-escola, proteção criptográfica e retenção de dados operacionais.
              </p>
            </div>
          </div>

          {authSession && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs">
              <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Escopo: {authSession.role === 'ADMIN' ? 'Administração Global' : authSession.schoolName || 'Unidade Escolar'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Perfil {authSession.role} • Acesso autenticado
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pilares Técnicos da Arquitetura de Segurança */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold text-xs uppercase tracking-wider">
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
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar tópico técnico..."
                data-testid="privacy-search-input"
                className="w-full sm:w-64 pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

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
  );
};
export default PrivacyProtectionView;
