import React, { useMemo, useState } from 'react';
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
    setTimeout(() => setDownloadedLabel(null), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-studio-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="export-studio-title" className="text-lg font-bold text-slate-900">
              Central de Exportação Rápida e Organizada
            </h2>
            <p className="text-xs text-slate-500">
              {PORTAL_METADATA.unidade} · Login {PORTAL_METADATA.usuarioLogin} · Dados estruturados prontos para Excel, Google Sheets, PDF e WhatsApp
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar central de exportação"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 divide-y divide-slate-200 overflow-y-auto lg:grid-cols-12 lg:divide-x lg:divide-y-0">
          {/* Left Configuration Column */}
          <div className="space-y-6 p-6 lg:col-span-5">
            {/* Step 1: Recorte de Dados */}
            <div>
              <label className="block text-xs font-semibold text-slate-900">
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
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                      scope === opt.id
                        ? 'border-blue-600 bg-blue-50/70 text-blue-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    <span className="font-mono font-semibold text-slate-600 tabular-nums">
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
                  className="block text-xs font-semibold text-slate-900"
                >
                  02. Ordenar Linhas Por
                </label>
                <select
                  id="export-sort-select"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
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
                  className="block text-xs font-semibold text-slate-900"
                >
                  Separador CSV
                </label>
                <select
                  id="export-delimiter-select"
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value as ';' | ',')}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
                >
                  <option value=";">Ponto e vírgula (;) — Excel BR</option>
                  <option value=",">Vírgula (,) — Padrão Global</option>
                </select>
              </div>
            </div>

            {/* Step 3: Seleção de Colunas */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-900">
                  03. Colunas Incluídas ({selectedColumns.length}/{EXPORT_COLUMNS.length})
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedColumns(EXPORT_COLUMNS.map((c) => c.key))}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    Todas
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedColumns(
                        EXPORT_COLUMNS.filter((c) => c.defaultEnabled).map((c) => c.key)
                      )
                    }
                    className="font-medium text-slate-600 hover:underline"
                  >
                    Essenciais
                  </button>
                </div>
              </div>

              <div className="mt-2 grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                {EXPORT_COLUMNS.map((col) => {
                  const checked = selectedColumns.includes(col.key);
                  return (
                    <label
                      key={col.key}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-700 select-none hover:bg-white"
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
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('CSV')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      activeTab === 'CSV'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Planilha Excel / CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('WHATSAPP')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      activeTab === 'WHATSAPP'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Resumo WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('JSON')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      activeTab === 'JSON'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    JSON Estruturado
                  </button>
                </div>

                <div className="text-xs text-slate-500 font-mono tabular-nums">
                  {targetRecords.length} registros · Média {kpis.mediaGeralNotas.toFixed(2)}
                </div>
              </div>

              {/* Preview Box */}
              <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100">
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
                    className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300"
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
              <div className="grid grid-cols-4 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <div>
                  <span className="text-slate-500">Total Selecionado</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
                    {kpis.total} alunos
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Finalizados</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-emerald-700 tabular-nums">
                    {kpis.finalizados} ({kpis.taxaConclusao}%)
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Não Iniciados</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-amber-700 tabular-nums">
                    {kpis.naoIniciados}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Média de Notas</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-blue-700 tabular-nums">
                    {kpis.mediaGeralNotas.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Primary Export Action Buttons */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setTimeout(() => onTriggerPrint(), 100);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Printer className="h-4 w-4 text-slate-600" />
                  Imprimir / Salvar PDF
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(whatsappSummary, 'Resumo WhatsApp copiado!')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <FileText className="h-4 w-4 text-slate-600" />
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
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
                >
                  <Download className="h-4 w-4" />
                  {downloadedLabel || 'Baixar Planilha Excel (.CSV)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
