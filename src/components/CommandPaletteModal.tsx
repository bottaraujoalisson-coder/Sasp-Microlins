import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  UserCheck,
  GraduationCap,
  Sparkles,
  Calendar,
  Clock,
  DollarSign,
  Kanban,
  LayoutDashboard,
  ShieldCheck,
  Sun,
  Moon,
  RotateCcw,
  ArrowRight,
  X,
  Building2,
  FileText,
} from 'lucide-react';
import {
  EvaluatedStudentRecord,
  FinancialFilterType,
  QuickCardFilter,
  SynchronizedNpsStudentCard,
} from '../utils/performanceAnalytics';
import { FichaIndividualSectionTab } from '../utils/fichaIndividualAcademic';
import { SmartAvatar } from './uiSystem';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: EvaluatedStudentRecord[];
  npsCards: SynchronizedNpsStudentCard[];
  educators: string[];
  salas: string[];
  horarios: string[];
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNavigateTab: (tab: 'KANBAN_ALUNOS' | 'KANBAN_NPS' | 'DASHBOARD' | 'PORTAL_ALUNO') => void;
  onOpenStudentModal: (studentId: number) => void;
  onOpenStudentFicha: (studentId: number, subTab?: FichaIndividualSectionTab) => void;
  onOpenNpsModal: (card: SynchronizedNpsStudentCard) => void;
  onApplyEducatorFilter: (educator: string) => void;
  onApplySalaFilter: (sala: string) => void;
  onApplyHorarioFilter: (horario: string) => void;
  onApplyFinancialFilter: (status: FinancialFilterType) => void;
  onApplyQuickStatusFilter: (status: QuickCardFilter) => void;
  onSyncNow: () => void;
  onOpenPrivacy: () => void;
}

interface CommandActionItem {
  id: string;
  category:
    | 'Navegação & Sistema'
    | 'Alunos & Contratos'
    | 'Convites NPS'
    | 'Educadores & Salas'
    | 'Filtros Rápidos';
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo';
  avatarName?: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  students,
  npsCards,
  educators,
  salas,
  horarios,
  theme,
  onToggleTheme,
  onNavigateTab,
  onOpenStudentModal,
  onOpenStudentFicha,
  onOpenNpsModal,
  onApplyEducatorFilter,
  onApplySalaFilter,
  onApplyHorarioFilter,
  onApplyFinancialFilter,
  onApplyQuickStatusFilter,
  onSyncNow,
  onOpenPrivacy,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 40);
    }
  }, [isOpen]);

  // Unique students by contract for fast clean search
  const uniqueStudents = useMemo(() => {
    const map = new Map<string, EvaluatedStudentRecord>();
    for (const s of students) {
      const key = String(s.contrato || s.id);
      if (!map.has(key)) {
        map.set(key, s);
      }
    }
    return Array.from(map.values());
  }, [students]);

  const allItems = useMemo<CommandActionItem[]>(() => {
    const q = query.trim().toLowerCase();
    const results: CommandActionItem[] = [];

    // 1. Navigation & System Actions
    const navActions: CommandActionItem[] = [
      {
        id: 'nav-kanban-alunos',
        category: 'Navegação & Sistema',
        title: 'Ir para Kanban de Alunos (Operação Diária)',
        subtitle: 'Visualizar agendamentos, presenças, faltas e alertas por horário',
        badge: `${students.length} registros`,
        badgeTone: 'blue',
        icon: Kanban,
        onSelect: () => {
          onNavigateTab('KANBAN_ALUNOS');
          onClose();
        },
      },
      {
        id: 'nav-kanban-nps',
        category: 'Navegação & Sistema',
        title: 'Ir para Kanban NPS (Pesquisa Indecx)',
        subtitle: 'Monitorar convites ativos, canais de envio e avaliações NPS',
        badge: `${npsCards.length} convites`,
        badgeTone: 'indigo',
        icon: Sparkles,
        onSelect: () => {
          onNavigateTab('KANBAN_NPS');
          onClose();
        },
      },
      {
        id: 'nav-consolidado',
        category: 'Navegação & Sistema',
        title: 'Ir para Painel Consolidado & Export Studio',
        subtitle: 'Análise gerencial, tabelas densas, gráficos e exportação XLSX/CSV/PDF',
        badge: 'BI & Exportação',
        badgeTone: 'emerald',
        icon: LayoutDashboard,
        onSelect: () => {
          onNavigateTab('DASHBOARD');
          onClose();
        },
      },
      {
        id: 'nav-ficha-individual',
        category: 'Navegação & Sistema',
        title: 'Ir para Ficha Individual do Aluno (Secretaria)',
        subtitle: 'Boletim Acadêmico, Carteirinha ID-1, Ficha de Acompanhamento A4 e Declaração',
        badge: 'Acadêmico',
        badgeTone: 'blue',
        icon: GraduationCap,
        onSelect: () => {
          onNavigateTab('PORTAL_ALUNO');
          onClose();
        },
      },
      {
        id: 'sys-sync',
        category: 'Navegação & Sistema',
        title: 'Sincronizar Dados Agora (Portal & Supabase)',
        subtitle: 'Atualizar registros de frequência e convites NPS imediatamente',
        badge: 'Tempo Real',
        badgeTone: 'emerald',
        icon: RotateCcw,
        onSelect: () => {
          onSyncNow();
          onClose();
        },
      },
      {
        id: 'sys-privacy',
        category: 'Navegação & Sistema',
        title: 'Governança, Privacidade e Proteção de Dados (LGPD)',
        subtitle: 'Consultar diretrizes de segurança e conformidade Lei nº 13.709/2018',
        icon: ShieldCheck,
        onSelect: () => {
          onOpenPrivacy();
          onClose();
        },
      },
    ];

    for (const action of navActions) {
      if (
        !q ||
        action.title.toLowerCase().includes(q) ||
        action.subtitle.toLowerCase().includes(q)
      ) {
        results.push(action);
      }
    }

    // 2. Quick Operational Filters
    const quickFilters: CommandActionItem[] = [
      {
        id: 'flt-inadimplentes',
        category: 'Filtros Rápidos',
        title: 'Filtrar Alunos com Parcelas em Atraso (Inadimplentes)',
        subtitle: 'Exibir somente alunos com pendência financeira no Kanban',
        badge: 'Financeiro',
        badgeTone: 'amber',
        icon: DollarSign,
        onSelect: () => {
          onNavigateTab('KANBAN_ALUNOS');
          onApplyFinancialFilter('EM_ATRASO');
          onClose();
        },
      },
      {
        id: 'flt-em-dia',
        category: 'Filtros Rápidos',
        title: 'Filtrar Alunos Financeiramente em Dia (Adimplentes)',
        subtitle: 'Exibir alunos sem parcelas atrasadas no Kanban',
        badge: 'Adimplentes',
        badgeTone: 'emerald',
        icon: DollarSign,
        onSelect: () => {
          onNavigateTab('KANBAN_ALUNOS');
          onApplyFinancialFilter('EM_DIA');
          onClose();
        },
      },
      {
        id: 'flt-evasao',
        category: 'Filtros Rápidos',
        title: 'Filtrar Alertas de Risco de Evasão',
        subtitle: 'Alunos com faltas recorrentes ou baixa frequência crítica',
        badge: 'Alerta Crítico',
        badgeTone: 'rose',
        icon: UserCheck,
        onSelect: () => {
          onNavigateTab('KANBAN_ALUNOS');
          onApplyQuickStatusFilter('EVASAO');
          onClose();
        },
      },
    ];

    for (const flt of quickFilters) {
      if (!q || flt.title.toLowerCase().includes(q) || flt.subtitle.toLowerCase().includes(q)) {
        results.push(flt);
      }
    }

    // 3. Students & Contracts
    const matchedStudents = uniqueStudents
      .filter((s) => {
        if (!q) return true;
        return (
          s.nomeCompleto.toLowerCase().includes(q) ||
          (s.nomeCurto || '').toLowerCase().includes(q) ||
          String(s.contrato).toLowerCase().includes(q) ||
          (s.curso || '').toLowerCase().includes(q) ||
          (s.professor || '').toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q) ||
          (s.sala || '').toLowerCase().includes(q)
        );
      })
      .slice(0, q ? 12 : 5);

    for (const st of matchedStudents) {
      results.push({
        id: `student-detail-${st.id}`,
        category: 'Alunos & Contratos',
        title: `${st.nomeCompleto} (#${st.contrato})`,
        subtitle: `${st.curso} · ${st.diaSemana} (${st.horario}) · Educador: ${st.professor}`,
        badge: st.attendanceStatus,
        badgeTone:
          st.attendanceStatus === 'Presença'
            ? 'emerald'
            : st.attendanceStatus === 'Falta'
              ? 'rose'
              : 'blue',
        avatarName: st.nomeCompleto,
        icon: UserCheck,
        onSelect: () => {
          onOpenStudentModal(st.id);
          onClose();
        },
      });

      if (
        q &&
        (q.includes('ficha') ||
          q.includes('acompanhamento') ||
          q.includes('boletim') ||
          String(st.contrato).includes(q) ||
          st.nomeCompleto.toLowerCase().includes(q))
      ) {
        results.push({
          id: `student-ficha-${st.id}`,
          category: 'Alunos & Contratos',
          title: `Ficha de Acompanhamento: ${st.nomeCompleto}`,
          subtitle: `Abrir Ficha Individual e Acompanhamento A4 · Contrato #${st.contrato}`,
          badge: 'Ficha A4',
          badgeTone: 'indigo',
          icon: FileText,
          onSelect: () => {
            onOpenStudentFicha(st.id, 'ACOMPANHAMENTO');
            onClose();
          },
        });
      }
    }

    // 4. Educators, Rooms & Schedules
    if (q) {
      for (const prof of educators) {
        if (prof.toLowerCase().includes(q)) {
          results.push({
            id: `prof-${prof}`,
            category: 'Educadores & Salas',
            title: `Filtrar por Educador(a): ${prof}`,
            subtitle: 'Aplicar filtro imediato no Kanban de Alunos',
            badge: 'Educador',
            badgeTone: 'blue',
            icon: UserCheck,
            onSelect: () => {
              onNavigateTab('KANBAN_ALUNOS');
              onApplyEducatorFilter(prof);
              onClose();
            },
          });
        }
      }

      for (const sala of salas) {
        if (sala.toLowerCase().includes(q)) {
          results.push({
            id: `sala-${sala}`,
            category: 'Educadores & Salas',
            title: `Filtrar por Sala: ${sala}`,
            subtitle: 'Visualizar ocupação e alunos da sala selecionada',
            badge: 'Sala',
            badgeTone: 'indigo',
            icon: Building2,
            onSelect: () => {
              onNavigateTab('KANBAN_ALUNOS');
              onApplySalaFilter(sala);
              onClose();
            },
          });
        }
      }

      for (const h of horarios) {
        if (h.toLowerCase().includes(q)) {
          results.push({
            id: `hora-${h}`,
            category: 'Educadores & Salas',
            title: `Filtrar por Horário: ${h}`,
            subtitle: 'Focar na coluna de horário selecionada no Kanban',
            badge: h,
            badgeTone: 'blue',
            icon: Clock,
            onSelect: () => {
              onNavigateTab('KANBAN_ALUNOS');
              onApplyHorarioFilter(h);
              onClose();
            },
          });
        }
      }
    }

    // 5. NPS Invitations
    const matchedNps = npsCards
      .filter((c) => {
        if (!q) return false;
        return (
          c.studentName.toLowerCase().includes(q) ||
          String(c.linkedContrato || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 6);

    for (const card of matchedNps) {
      results.push({
        id: `nps-${card.id}`,
        category: 'Convites NPS',
        title: `NPS: ${card.studentName} (#${card.linkedContrato})`,
        subtitle: `Origem: ${card.latestActiveInvitation.origem} · Status: ${card.latestActiveInvitation.emailDeliveryStatus || 'Ativo'}`,
        badge: card.latestActiveInvitation.answered ? 'Respondido' : 'Pendente',
        badgeTone: card.latestActiveInvitation.answered ? 'emerald' : 'amber',
        avatarName: card.studentName,
        icon: Sparkles,
        onSelect: () => {
          onOpenNpsModal(card);
          onClose();
        },
      });
    }

    return results;
  }, [
    query,
    students.length,
    npsCards,
    uniqueStudents,
    educators,
    salas,
    horarios,
    theme,
    onNavigateTab,
    onClose,
    onSyncNow,
    onToggleTheme,
    onOpenPrivacy,
    onApplyFinancialFilter,
    onApplyQuickStatusFilter,
    onOpenStudentModal,
    onOpenStudentFicha,
    onApplyEducatorFilter,
    onApplySalaFilter,
    onApplyHorarioFilter,
    onOpenNpsModal,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (allItems.length > 0 ? (prev + 1) % allItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) =>
          allItems.length > 0 ? (prev - 1 + allItems.length) % allItems.length : 0
        );
      } else if (e.key === 'Enter' && allItems[activeIndex]) {
        e.preventDefault();
        allItems[activeIndex].onSelect();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, allItems, activeIndex, onClose]);

  const badgeColors: Record<NonNullable<CommandActionItem['badgeTone']>, string> = {
    blue: 'bg-blue-500/15 text-[#2563EB] dark:text-blue-400 border-blue-500/30',
    emerald: 'bg-emerald-500/15 text-[#16A34A] dark:text-emerald-400 border-emerald-500/30',
    amber: 'bg-amber-500/15 text-[#F59E0B] dark:text-amber-400 border-amber-500/30',
    rose: 'bg-red-500/15 text-[#DC2626] dark:text-red-400 border-red-500/30',
    indigo: 'bg-indigo-500/15 text-[#6366F1] dark:text-indigo-400 border-indigo-500/30',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Busca Global Inteligente e Paleta de Comandos"
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4 no-print"
          data-testid="command-palette-modal"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-xs"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative z-10 w-full max-w-2xl glass-modal overflow-hidden"
          >
            {/* Search Header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border-color)]">
              <Search className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                aria-label="Pesquisar aluno, contrato, educador, sala ou comando"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar aluno, #contrato, educador, sala, NPS ou comando..."
                className="w-full bg-transparent text-[15px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
                data-testid="command-palette-input"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-semibold text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-md">
                ESC
              </kbd>
            </div>

            {/* Results List */}
            <div className="max-h-[62vh] overflow-y-auto p-2 divide-y divide-[var(--border-color)]/40">
              {allItems.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="typo-subtitle text-[var(--text-primary)]">
                    Nenhum resultado encontrado para &ldquo;{query}&rdquo;
                  </p>
                  <p className="typo-meta text-[var(--text-secondary)] mt-1">
                    Tente pesquisar pelo número do contrato, nome do aluno, educador ou sala.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {allItems.map((item, idx) => {
                    const Icon = item.icon;
                    const isSelected = idx === activeIndex;
                    const showCategoryHeader =
                      idx === 0 || allItems[idx - 1].category !== item.category;

                    return (
                      <React.Fragment key={item.id}>
                        {showCategoryHeader && (
                          <div className="px-3 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                            {item.category}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={item.onSelect}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                            isSelected
                              ? 'bg-[#2563EB]/12 dark:bg-[#60A5FA]/15 text-[var(--text-primary)]'
                              : 'hover:bg-[var(--bg-secondary)]/70 text-[var(--text-primary)]'
                          }`}
                          data-testid={`command-item-${item.id}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {item.avatarName ? (
                              <SmartAvatar name={item.avatarName} size="sm" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
                                <Icon className="w-4 h-4 text-[var(--color-primary)]" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                                {item.title}
                              </p>
                              <p className="text-[12px] text-[var(--text-secondary)] truncate">
                                {item.subtitle}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {item.badge && (
                              <span
                                className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                                  badgeColors[item.badgeTone || 'blue']
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                            <ArrowRight
                              className={`w-4 h-4 transition-transform ${
                                isSelected
                                  ? 'text-[var(--color-primary)] translate-x-0.5'
                                  : 'text-transparent'
                              }`}
                            />
                          </div>
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Hints */}
            <div className="px-4 py-2.5 bg-[var(--bg-secondary)]/80 border-t border-[var(--border-color)] flex items-center justify-between text-[12px] text-[var(--text-secondary)]">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 font-mono text-[11px] bg-[var(--surface-card)] border border-[var(--border-color)] rounded">
                    ↑↓
                  </kbd>{' '}
                  Navegar
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 font-mono text-[11px] bg-[var(--surface-card)] border border-[var(--border-color)] rounded">
                    ↵
                  </kbd>{' '}
                  Executar
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 font-mono text-[11px] bg-[var(--surface-card)] border border-[var(--border-color)] rounded">
                    ESC
                  </kbd>{' '}
                  Fechar
                </span>
              </div>
              <span className="font-mono text-[11px]">
                {allItems.length} opções disponíveis
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
