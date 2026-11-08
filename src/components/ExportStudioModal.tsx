import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  MessageSquare,
  Printer,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { PORTAL_METADATA, StudentPerformanceRecord } from '../data/microlinsData';
import {
  computePerformanceKPIs,
  evaluateAllStudentsAttendance,
  EXPORT_COLUMNS,
  ExportColumnKey,
  generateCsvContent,
  generateWhatsAppSummary,
} from '../utils/performanceAnalytics';
import { useToast } from './uiSystem';

interface ExportStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  allRecords: StudentPerformanceRecord[];
  filteredRecords: StudentPerformanceRecord[];
  notesByContract: Record<string, string>;
  onTriggerPrint: () => void;
}

type ExportScope = 'FILTERED' | 'ALL' | 'FINALIZADOS' | 'NAO_INICIADOS' | 'COM_NOTA' | 'ATENCAO';
type ExportTab = 'CSV' | 'WHATSAPP' | 'JSON';

export const ExportStudioModal: React.FC<ExportStudioModalProps> = ({
  isOpen,
  onClose,
  allRecords,
  filteredRecords,
  notesByContract,
  onTriggerPrint,
}) => {
  const { toast } = useToast();
  const [scope, setScope] = useState<ExportScope>('FILTERED');
  const [activeTab, setActiveTab] = useState<ExportTab>('CSV');
  const [delimiter, setDelimiter] = useState<';' | ','>(';');
  const [sortOrder, setSortOrder] = useState<'horario' | 'nome' | 'nota_desc' | 'curso'>('horario');
  const [selectedColumns, setSelectedColumns] = useState<ExportColumnKey[]>(() =>
    EXPORT_COLUMNS.filter((c) => c.defaultEnabled).map((c) => c.key)
  );
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [downloadedLabel, setDownloadedLabel] = useState<string | null>(null);

  const targetRecords = useMemo(() => {
    let base: StudentPerformanceRecord[] = [];
    switch (scope) {
      case 'ALL':
        base = [...allRecords];
        break;
      case 'FINALIZADOS':
        base = allRecords.filter((r) => r.status === 'FINALIZADO');
        break;
      case 'NAO_INICIADOS':
        base = allRecords.filter((r) => r.status === 'NÃO INICIADO');
        break;
      case 'COM_NOTA':
        base = allRecords.filter((r) => r.nota !== null);
        break;
      case 'ATENCAO':
        base = allRecords.filter((r) => r.inadimplente || (r.nota !== null && r.nota < 7.5));
        break;
      case 'FILTERED':
      default:
        base = [...filteredRecords];
        break;
    }

    return base.sort((a, b) => {
      if (sortOrder === 'nome') return a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR');
      if (sortOrder === 'curso') return a.curso.localeCompare(b.curso, 'pt-BR');
      if (sortOrder === 'nota_desc') return (b.nota ?? -1) - (a.nota ?? -1);
      return a.horaInicio.localeCompare(b.horaInicio, 'pt-BR') || a.id - b.id;
    });
  }, [allRecords, filteredRecords, scope, sortOrder]);

  const kpis = useMemo(() => computePerformanceKPIs(targetRecords), [targetRecords]);

  const csvContent = useMemo(
    () => generateCsvContent(targetRecords, selectedColumns, notesByContract, delimiter),
    [targetRecords, selectedColumns, notesByContract, delimiter]
  );

  const tsvContent = useMemo(() => {
    const activeCols = EXPORT_COLUMNS.filter((c) => selectedColumns.includes(c.key));
    const evaluated = evaluateAllStudentsAttendance(targetRecords, 14 * 60 + 20);
    const header = activeCols.map((c) => c.label).join('\t');
    const rows = evaluated.map((r) =>
      activeCols
        .map((col) => {
          if (col.key === 'nota') return r.nota !== null ? r.nota.toFixed(2).replace('.', ',') : 'Sem nota';
          if (col.key === 'inadimplente') return r.inadimplente ? 'Inadimplente' : 'Regular';
          if (col.key === 'observacao') return notesByContract[r.contrato] || '';
          return String(r[col.key] ?? '');
        })
        .join('\t')
    );
    return [header, ...rows].join('\n');
  }, [targetRecords, selectedColumns, notesByContract]);

  const whatsappSummary = useMemo(
    () =>
      generateWhatsAppSummary(
        targetRecords,
        PORTAL_METADATA.unidade,
        PORTAL_METADATA.dataReferencia
      ),
    [targetRecords]
  );

  const jsonContent = useMemo(
    () =>
      JSON.stringify(
        {
          unidade: PORTAL_METADATA.unidade,
          login: PORTAL_METADATA.usuarioLogin,
          dataReferencia: PORTAL_METADATA.dataReferencia,
          totalExportado: targetRecords.length,
          indicadores: kpis,
          alunos: targetRecords.map((r) => ({
            ...r,
            observacaoPedagogica: notesByContract[r.contrato] || '',
          })),
        },
        null,
        2
      ),
    [targetRecords, kpis, notesByContract]
  );

  if (!isOpen) return null;

  const toggleColumn = (key: ExportColumnKey) => {
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedLabel(label);
    toast({
      type: 'success',
      title: label,
      message: `${targetRecords.length} registros copiados para a área de transferência.`,
    });
    setTimeout(() => setCopiedLabel(null), 2500);
  };

  const handleDownloadFile = (content: string, filename: string, mimeType: string, label: string) => {
    const bom = mimeType.includes('csv') ? '\uFEFF' : '';
    const blob = new Blob([bom + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedLabel(label);
    toast({
      type: 'success',
      title: label,
      message: `Arquivo ${filename} exportado com sucesso.`,
    });
    setTimeout(() => setDownloadedLabel(null), 2500);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-studio-title"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="glass-modal flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--surface-elevated)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
          <div>
            <h2 id="export-studio-title" className="typo-title-section text-[var(--text-primary)]">
              Central de Exportação Rápida e Organizada
            </h2>
            <p className="typo-meta text-[var(--text-secondary)]">
              {PORTAL_METADATA.unidade} · Login {PORTAL_METADATA.usuarioLogin} · Dados estruturados prontos para Excel, Google Sheets, PDF e WhatsApp
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar central de exportação"
            className="btn-press rounded-xl p-2 text-[var(--text-secondary)] transition-colors hover:bg-slate-100 hover:text-[var(--text-primary)] dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 divide-y divide-[var(--border-color)] overflow-y-auto lg:grid-cols-12 lg:divide-x lg:divide-y-0">
          {/* Left Configuration Column */}
          <div className="space-y-6 p-6 lg:col-span-5">
            {/* Step 1: Recorte de Dados */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)]">
                01. Recorte de Alunos para Exportação
              </label>
              <div className="mt-2 grid grid-cols-1 gap-1.5">
                {[
                  {
                    id: 'FILTERED' as ExportScope,
                    label: 'Filtro Atual da Tela',
                    count: filteredRecords.length,
                  },
                  {
                    id: 'ALL' as ExportScope,
                    label: 'Todos os Alunos Agendados',
                    count: allRecords.length,
                  },
                  {
                    id: 'FINALIZADOS' as ExportScope,
                    label: 'Apenas Aulas Finalizadas',
                    count: allRecords.filter((r) => r.status === 'FINALIZADO').length,
                  },
                  {
                    id: 'NAO_INICIADOS' as ExportScope,
                    label: 'Apenas Não Iniciados (Cobrança de Presença)',
                    count: allRecords.filter((r) => r.status === 'NÃO INICIADO').length,
                  },
                  {
                    id: 'COM_NOTA' as ExportScope,
                    label: 'Boletim de Alunos com Nota Registrada',
                    count: allRecords.filter((r) => r.nota !== null).length,
                  },
                  {
                    id: 'ATENCAO' as ExportScope,
                    label: 'Atenção Pedagógica / Financeira',
                    count: allRecords.filter(
                      (r) => r.inadimplente || (r.nota !== null && r.nota < 7.5)
                    ).length,
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setScope(opt.id)}
                    className={`btn-press flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${
                      scope === opt.id
                        ? 'border-[var(--color-primary)] bg-blue-50/70 text-blue-950 dark:bg-blue-950/50 dark:text-blue-200'
                        : 'border-[var(--border-color)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    <span className="font-mono font-semibold text-[var(--text-secondary)] tabular-nums">
                      {opt.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Ordenação e Formato */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="export-sort-select"
                  className="block text-xs font-semibold text-[var(--text-primary)]"
                >
                  02. Ordenar Linhas Por
                </label>
                <select
                  id="export-sort-select"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                  className="surface-solid mt-1.5 w-full rounded-xl border border-[var(--border-color)] px-2.5 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value="horario">Horário de Aula</option>
                  <option value="nome">Nome do Aluno (A-Z)</option>
                  <option value="nota_desc">Maior Nota Primeiro</option>
                  <option value="curso">Curso (A-Z)</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="export-delimiter-select"
                  className="block text-xs font-semibold text-[var(--text-primary)]"
                >
                  Separador CSV
                </label>
                <select
                  id="export-delimiter-select"
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value as ';' | ',')}
                  className="surface-solid mt-1.5 w-full rounded-xl border border-[var(--border-color)] px-2.5 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value=";">Ponto e vírgula (;) — Excel BR</option>
                  <option value=",">Vírgula (,) — Padrão Global</option>
                </select>
              </div>
            </div>

            {/* Step 3: Seleção de Colunas */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[var(--text-primary)]">
                  03. Colunas Incluídas ({selectedColumns.length}/{EXPORT_COLUMNS.length})
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedColumns(EXPORT_COLUMNS.map((c) => c.key))}
                    className="font-medium text-[var(--color-primary)] hover:underline cursor-pointer"
                  >
                    Todas
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedColumns(
                        EXPORT_COLUMNS.filter((c) => c.defaultEnabled).map((c) => c.key)
                      )
                    }
                    className="font-medium text-[var(--text-secondary)] hover:underline cursor-pointer"
                  >
                    Essenciais
                  </button>
                </div>
              </div>

              <div className="mt-2 grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]/60 p-2.5">
                {EXPORT_COLUMNS.map((col) => {
                  const checked = selectedColumns.includes(col.key);
                  return (
                    <label
                      key={col.key}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-[var(--text-primary)] select-none hover:bg-[var(--surface-card)]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleColumn(col.key)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="truncate">{col.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Preview & Fast Action Column */}
          <div className="flex flex-col justify-between p-6 lg:col-span-7">
            <div className="space-y-4">
              {/* Format Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
                <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-secondary)] p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('CSV')}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      activeTab === 'CSV'
                        ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Planilha Excel / CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('WHATSAPP')}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      activeTab === 'WHATSAPP'
                        ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Resumo WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('JSON')}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      activeTab === 'JSON'
                        ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    JSON Estruturado
                  </button>
                </div>

                <div className="text-xs text-[var(--text-secondary)] font-mono tabular-nums">
                  {targetRecords.length} registros · Média {kpis.mediaGeralNotas.toFixed(2)}
                </div>
              </div>

              {/* Preview Box */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-slate-100">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {activeTab === 'CSV' &&
                      `Prévia do arquivo CSV (${targetRecords.length} linhas, separador "${delimiter}")`}
                    {activeTab === 'WHATSAPP' &&
                      'Prévia do Resumo Executivo para WhatsApp / Coordenação'}
                    {activeTab === 'JSON' && 'Prévia da estrutura JSON para integração'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        activeTab === 'CSV'
                          ? tsvContent
                          : activeTab === 'WHATSAPP'
                          ? whatsappSummary
                          : jsonContent,
                        activeTab === 'CSV' ? 'Tabela copiada' : 'Texto copiado'
                      )
                    }
                    className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 cursor-pointer"
                  >
                    {copiedLabel ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400">{copiedLabel}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>
                          {activeTab === 'CSV'
                            ? 'Copiar para colar no Excel'
                            : 'Copiar conteúdo'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="max-h-64 overflow-auto font-mono text-xs leading-relaxed text-slate-200">
                  {activeTab === 'CSV' && csvContent}
                  {activeTab === 'WHATSAPP' && whatsappSummary}
                  {activeTab === 'JSON' && jsonContent}
                </pre>
              </div>

              {/* Quick Summary Metrics of Export */}
              <div className="grid grid-cols-4 gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]/70 p-3 text-xs">
                <div>
                  <span className="text-[var(--text-secondary)]">Total Selecionado</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
                    {kpis.total} alunos
                  </p>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">Finalizados</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {kpis.finalizados} ({kpis.taxaConclusao}%)
                  </p>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">Não Iniciados</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                    {kpis.naoIniciados}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">Média de Notas</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-[var(--color-primary)] tabular-nums">
                    {kpis.mediaGeralNotas.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Primary Export Action Buttons */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)] pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setTimeout(() => onTriggerPrint(), 100);
                  }}
                  className="btn-press inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Printer className="h-4 w-4 text-[var(--text-secondary)]" />
                  Imprimir / Salvar PDF
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(whatsappSummary, 'Resumo WhatsApp copiado!')}
                  className="btn-press inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Copiar Resumo WhatsApp
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadFile(
                      jsonContent,
                      `microlins-desempenho-${scope.toLowerCase()}-2026-10-30.json`,
                      'application/json;charset=utf-8',
                      'JSON baixado!'
                    )
                  }
                  className="btn-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileText className="h-4 w-4 text-[var(--text-secondary)]" />
                  Baixar JSON
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleDownloadFile(
                      csvContent,
                      `microlins-presidente-prudente-${scope.toLowerCase()}-2026-10-30.csv`,
                      'text/csv;charset=utf-8',
                      'Planilha CSV baixada!'
                    )
                  }
                  className="btn-press inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  {downloadedLabel || 'Baixar Planilha Excel (.CSV)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
