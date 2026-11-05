import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  GraduationCap,
  IdCard,
  Layers,
  MessageCircle,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import {
  ActiveNpsInvitation,
  PORTAL_METADATA,
} from '../data/microlinsData';
import {
  EvaluatedStudentRecord,
  normalizePersonName,
} from '../utils/performanceAnalytics';
import {
  BoletimModuleRecord,
  buildStudentFichaIndividual,
  buildUniqueStudentDirectory,
  CRITERIO_APROVACAO_FREQUENCIA_PERCENT,
  CRITERIO_APROVACAO_MEDIA_100,
  FichaIndividualAcademicaData,
  FichaIndividualSectionTab,
  searchStudentsForFichaIndividual,
  StudentSearchDirectoryItem,
} from '../utils/fichaIndividualAcademic';

interface PortalAlunoHubViewProps {
  allStudents: EvaluatedStudentRecord[];
  selectedStudentId?: number | null;
  onSelectStudentId?: (id: number | null) => void;
  initialSubTab?: FichaIndividualSectionTab;
  unidadeAtual?: string;
  activeNpsInvitations?: ActiveNpsInvitation[];
  onNpsInvitationUpdated?: (
    inviteId: string,
    patch: Partial<ActiveNpsInvitation>
  ) => void;
}

interface SchoolInstitutionalData {
  razaoSocial: string;
  nomeUnidade: string;
  cnpj: string;
  enderecoCompleto: string;
  cidadeUf: string;
  telefoneSecretaria: string;
  responsavelAssinaturaNome: string;
  responsavelAssinaturaCargo: string;
}

const DEFAULT_SCHOOL_INSTITUTIONAL_DATA: SchoolInstitutionalData = {
  razaoSocial: 'GRUPO REALIZAR ENSINO PROFISSIONALIZANTE LTDA — MICROLINS',
  nomeUnidade: 'MICROLINS — UNIDADE PRESIDENTE PRUDENTE (#1875)',
  cnpj: 'Consulte cadastro oficial da secretaria da unidade',
  enderecoCompleto: 'Unidade Presidente Prudente · Atendimento Presencial na Secretaria Escolar',
  cidadeUf: 'Presidente Prudente - SP',
  telefoneSecretaria: '(18) 99743-2487',
  responsavelAssinaturaNome: 'Coordenação Pedagógica / Secretaria Escolar',
  responsavelAssinaturaCargo: 'Responsável Institucional pela Unidade de Ensino',
};

function formatNumericBR(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '—';
  return Number(val).toFixed(decimals).replace('.', ',');
}

function getTodayExtendedDateBR(cidadeUf = 'Presidente Prudente - SP'): string {
  try {
    const formatted = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
    return `${cidadeUf}, ${formatted}`;
  } catch {
    return `${cidadeUf}, ${PORTAL_METADATA.dataReferencia}`;
  }
}

export const PortalAlunoHubView: React.FC<PortalAlunoHubViewProps> = ({
  allStudents,
  selectedStudentId = null,
  onSelectStudentId,
  initialSubTab = 'BOLETIM',
  unidadeAtual = PORTAL_METADATA.unidade,
  activeNpsInvitations = [],
  onNpsInvitationUpdated,
}) => {
  // Diretório consolidado sem duplicidades (priorizando o número do contrato)
  const studentDirectory = useMemo(
    () => buildUniqueStudentDirectory(allStudents, unidadeAtual),
    [allStudents, unidadeAtual]
  );

  // Estado da pesquisa de alunos (por contrato ou nome completo/parcial)
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Contrato do aluno explicitamente selecionado (INICIA VAZIO por regra fundamental, exceto se aberto diretamente do modal de um aluno específico)
  const [selectedContrato, setSelectedContrato] = useState<string | null>(() => {
    if (selectedStudentId !== null && selectedStudentId !== undefined) {
      const found = allStudents.find((s) => s.id === selectedStudentId);
      return found ? found.contrato : null;
    }
    return null;
  });

  // Sincroniza quando o usuário clica em um atalho de Ficha Individual a partir do modal de detalhes de um aluno
  useEffect(() => {
    if (selectedStudentId !== null && selectedStudentId !== undefined) {
      const found = allStudents.find((s) => s.id === selectedStudentId);
      if (found) {
        setSelectedContrato(found.contrato);
      }
    } else {
      setSelectedContrato(null);
    }
  }, [selectedStudentId, allStudents]);

  // Aba ativa dentro da Ficha Individual (Exclusivamente: CARTEIRINHA, BOLETIM, DECLARACAO)
  const [activeDocTab, setActiveDocTab] = useState<FichaIndividualSectionTab>(
    initialSubTab
  );

  useEffect(() => {
    if (initialSubTab) {
      setActiveDocTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Dados complementares opcionais preenchíveis pela secretaria antes de emitir documentos (Foto, CPF autorizado, Data de Nascimento)
  const [customStudentPhotoUrl, setCustomStudentPhotoUrl] = useState<string>('');
  const [customBirthDate, setCustomBirthDate] = useState<string>('');
  const [customAuthorizedCpf, setCustomAuthorizedCpf] = useState<string>('');
  const [cardValidThru, setCardValidThru] = useState<string>('12/2026');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedSummaryNotice, setCopiedSummaryNotice] = useState<boolean>(false);

  // Dados institucionais da unidade para a Declaração de Matrícula
  const [schoolInfo, setSchoolInfo] = useState<SchoolInstitutionalData>(() => ({
    ...DEFAULT_SCHOOL_INSTITUTIONAL_DATA,
    nomeUnidade: `${unidadeAtual} (#1875)`,
  }));

  // Filtro de visualização de módulos no Boletim Acadêmico
  const [moduleStatusFilter, setModuleStatusFilter] = useState<
    'TODOS' | 'CURSADO' | 'EM_ANDAMENTO' | 'PENDENTE'
  >('TODOS');

  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Resultados da pesquisa de alunos (Vazio se searchQuery estiver em branco!)
  const searchResults = useMemo(
    () => searchStudentsForFichaIndividual(studentDirectory, searchQuery),
    [studentDirectory, searchQuery]
  );

  // Aluno atualmente selecionado
  const selectedStudentItem = useMemo<StudentSearchDirectoryItem | null>(() => {
    if (!selectedContrato) return null;
    return (
      studentDirectory.find((item) => item.contrato === selectedContrato) || null
    );
  }, [studentDirectory, selectedContrato]);

  // Consolidação completa da Ficha Individual e Boletim Acadêmico por módulos
  const fichaAcademica = useMemo<FichaIndividualAcademicaData | null>(() => {
    if (!selectedStudentItem) return null;
    return buildStudentFichaIndividual(selectedStudentItem);
  }, [selectedStudentItem]);

  // Gera QR Code oficial de validação para a Carteirinha Estudantil e Declaração
  useEffect(() => {
    if (!selectedStudentItem) {
      setQrCodeDataUrl('');
      return;
    }
    const validationUrl = `https://portaldoaluno.microlins.com.br/aluno/fichaAcompanhamentoAluno?contrato=${encodeURIComponent(
      selectedStudentItem.contrato
    )}&unidade=${encodeURIComponent(selectedStudentItem.unidadeEnsino)}`;

    QRCode.toDataURL(validationUrl, {
      width: 240,
      margin: 1,
      color: {
        dark: '#002855',
        light: '#FFFFFF',
      },
    })
      .then((url) => setQrCodeDataUrl(url))
      .catch(() => setQrCodeDataUrl(''));
  }, [selectedStudentItem]);

  const studentAnsweredNpsInvite = useMemo<ActiveNpsInvitation | null>(() => {
    if (!selectedStudentItem) return null;
    const normStudent = normalizePersonName(selectedStudentItem.nomeCompleto);
    return (
      activeNpsInvitations.find((inv) => {
        if (!inv.answered && inv.invitationStatus !== 'respondido') return false;
        const matchContrato =
          Boolean(selectedStudentItem.contrato) &&
          inv.contrato === selectedStudentItem.contrato;
        const matchName =
          Boolean(normStudent) &&
          normalizePersonName(inv.studentName) === normStudent;
        return matchContrato || matchName;
      }) || null
    );
  }, [selectedStudentItem, activeNpsInvitations]);

  const handleSelectStudentFromSearch = (item: StudentSearchDirectoryItem) => {
    setSelectedContrato(item.contrato);
    setCustomStudentPhotoUrl('');
    setCustomBirthDate('');
    setCustomAuthorizedCpf('');
    if (onSelectStudentId) {
      onSelectStudentId(item.primaryRecordId);
    }
  };

  const handleClearSelectedStudent = () => {
    setSelectedContrato(null);
    setCustomStudentPhotoUrl('');
    if (onSelectStudentId) {
      onSelectStudentId(null);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomStudentPhotoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePrintDocument = () => {
    window.print();
  };

  // Geração de PDF Oficial da Carteirinha Estudantil (Padrão ID-1: 85.60mm x 53.98mm)
  const handleDownloadCarteirinhaPdf = () => {
    if (!fichaAcademica) return;
    const { student } = fichaAcademica;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Cabeçalho da folha de emissão
    doc.setFillColor(0, 74, 141);
    doc.rect(0, 0, 210, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('MICROLINS — CARTEIRA DE IDENTIFICAÇÃO ESTUDANTIL (PADRÃO ID-1)', 14, 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `Unidade: ${student.unidadeEnsino} · Matrícula #${student.contrato} · Proporção Oficial 85,60 × 53,98 mm`,
      14,
      18
    );

    // FRENTE DA CARTEIRINHA (Padrão ID-1 exato: 85.60mm x 53.98mm)
    const cardX = 16;
    const frontY = 36;
    const cardW = 85.6;
    const cardH = 53.98;

    doc.setDrawColor(0, 74, 141);
    doc.setLineWidth(0.4);
    doc.roundedRect(cardX, frontY, cardW, cardH, 3, 3, 'S');
    doc.setFillColor(0, 74, 141);
    doc.roundedRect(cardX, frontY, cardW, 11.5, 3, 3, 'F');
    doc.rect(cardX, frontY + 8.5, cardW, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('MICROLINS', cardX + 4, frontY + 6.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text('CARTEIRA ESTUDANTIL OFICIAL', cardX + 4, frontY + 9.8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(`#${student.contrato}`, cardX + cardW - 4, frontY + 7.2, {
      align: 'right',
    });

    // Quadro da Foto 3x4 Minimalista
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(cardX + 4, frontY + 14.5, 19, 25, 1.5, 1.5, 'FD');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(6.5);
    doc.text('FOTO 3x4', cardX + 13.5, frontY + 27.5, { align: 'center' });

    // Dados Essenciais da Frente
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(student.nomeCompleto.slice(0, 34), cardX + 26, frontY + 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.3);
    doc.setTextColor(71, 85, 105);
    doc.text(`Curso: ${student.cursoMatriculado.slice(0, 35)}`, cardX + 26, frontY + 23);
    doc.text(
      `Matrícula: #${student.contrato} · ${student.situacaoMatricula}`,
      cardX + 26,
      frontY + 27.5
    );
    doc.text(`Unidade: ${student.unidadeEnsino.slice(0, 34)}`, cardX + 26, frontY + 32);
    doc.text(
      `Nasc.: ${customBirthDate.trim() || 'Conforme cadastro'} · Início: ${student.dataMatricula}`,
      cardX + 26,
      frontY + 36.5
    );

    doc.setFillColor(241, 245, 249);
    doc.rect(cardX + 0.4, frontY + 45.2, cardW - 0.8, 8.3, 'F');
    doc.setTextColor(0, 74, 141);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.3);
    doc.text('IDENTIFICAÇÃO ESTUDANTIL ATIVA', cardX + 4, frontY + 50.5);
    doc.text(`VALIDADE: ${cardValidThru}`, cardX + cardW - 4, frontY + 50.5, {
      align: 'right',
    });

    // VERSO DA CARTEIRINHA (Padrão ID-1 exato: 85.60mm x 53.98mm)
    const backX = 108;
    const backY = 36;
    doc.setDrawColor(0, 40, 85);
    doc.setLineWidth(0.4);
    doc.roundedRect(backX, backY, cardW, cardH, 3, 3, 'S');
    doc.setFillColor(0, 40, 85);
    doc.roundedRect(backX, backY, cardW, 10, 3, 3, 'F');
    doc.rect(backX, backY + 7, cardW, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.text(
      'VALIDAÇÃO ACADÊMICA E REGISTRO INSTITUCIONAL',
      backX + 4,
      backY + 6.5
    );

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.text(
      [
        '1. Esta carteira comprova o vínculo acadêmico ativo do(a) estudante',
        `   na unidade ${student.unidadeEnsino}.`,
        '2. Uso pessoal e intransferível, válido mediante apresentação de',
        '   documento oficial com foto quando solicitado.',
        `3. Matrícula #${student.contrato} · Turno: ${student.turno}.`,
      ],
      backX + 4,
      backY + 15.5
    );

    if (qrCodeDataUrl) {
      try {
        doc.addImage(qrCodeDataUrl, 'PNG', backX + cardW - 23, backY + 24.5, 19, 19);
      } catch {
        // Ignore QR embed failure
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(0, 74, 141);
    doc.text(
      `REGISTRO: MIC-${student.codigoUnidade}-${student.contrato}`,
      backX + 4,
      backY + 49
    );

    doc.save(`Carteirinha_Microlins_${student.contrato}_${student.nomeCompleto.replace(/\s+/g, '_')}.pdf`);
  };

  // Geração de PDF Oficial do Boletim Acadêmico Consolidado por Módulos
  const handleDownloadBoletimPdf = () => {
    if (!fichaAcademica) return;
    const { student, modulos, avaliacoesHistoricoCompleto, indicadoresConsolidados } =
      fichaAcademica;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Cabeçalho Institucional
    doc.setFillColor(0, 74, 141);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('MICROLINS — BOLETIM ACADÊMICO E FICHA DE ACOMPANHAMENTO', 14, 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      `Unidade: ${student.unidadeEnsino} (#${student.codigoUnidade}) · Fonte Oficial: portaldoaluno.microlins.com.br/aluno/fichaAcompanhamentoAluno`,
      14,
      17.5
    );
    doc.text(
      `Emitido em: ${getTodayExtendedDateBR(schoolInfo.cidadeUf)}`,
      14,
      23
    );

    // Quadro de Identificação do Aluno e Indicadores Globais
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 33, 182, 28, 2, 2, 'FD');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Aluno(a): ${student.nomeCompleto}`, 18, 40);
    doc.text(`Contrato: #${student.contrato}`, 150, 40);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Curso Matriculado: ${student.cursoMatriculado}`, 18, 46);
    doc.text(`Data de Matrícula: ${student.dataMatricula}`, 150, 46);
    doc.text(
      `Média Geral do Curso: ${formatNumericBR(indicadoresConsolidados.mediaGeralCursoEscala100)} pts (${formatNumericBR(indicadoresConsolidados.mediaGeralCursoEscala10)} / 10) · Frequência Geral Consolidada: ${formatNumericBR(indicadoresConsolidados.frequenciaGeralConsolidada)}%`,
      18,
      52
    );
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Situação Global: ${indicadoresConsolidados.situacaoAcademicaGlobal} · Módulos: ${indicadoresConsolidados.totalModulosCursados} concluído(s), ${indicadoresConsolidados.totalModulosEmAndamento} em curso, ${indicadoresConsolidados.totalModulosPendentes} pendente(s)`,
      18,
      57.5
    );

    // Tabela 1: Desempenho Consolidado por Módulo
    autoTable(doc, {
      startY: 66,
      head: [
        [
          '#',
          'Módulo Curricular',
          'Etapa',
          'Aulas Concl.',
          'Avaliações',
          'Média Final',
          'Frequência',
          'Últ. Avaliação',
          'Situação',
        ],
      ],
      body: modulos.map((m) => [
        String(m.ordem),
        m.nomeModulo,
        m.statusModulo === 'CURSADO'
          ? 'Cursado'
          : m.statusModulo === 'EM_ANDAMENTO'
          ? 'Em Andamento'
          : 'Pendente',
        `${m.aulasConcluidas}/${m.aulasPrevistas}`,
        String(m.avaliacoesRealizadas),
        m.mediaFinalEscala100 !== null
          ? `${formatNumericBR(m.mediaFinalEscala100)} (${formatNumericBR(m.mediaFinalEscala10)})`
          : '—',
        m.frequenciaFinal !== null ? `${formatNumericBR(m.frequenciaFinal)}%` : '—',
        m.ultimaAvaliacaoData || '—',
        m.situacao,
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.2 },
      headStyles: { fillColor: [0, 74, 141], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    const afterFirstTableY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
        ?.finalY || 135;

    // Tabela 2: Histórico de Avaliações por Aula
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 59, 112);
    doc.text(
      'Histórico Detalhado de Avaliações e Identificação por Aula',
      14,
      afterFirstTableY + 9
    );

    autoTable(doc, {
      startY: afterFirstTableY + 12,
      head: [
        [
          'Módulo',
          'Origem',
          'Aula da Avaliação',
          'Descrição da Avaliação',
          'Nota (0-100)',
          'Nota (0-10)',
          'Data',
        ],
      ],
      body: avaliacoesHistoricoCompleto.map((ev) => [
        ev.nomeModulo,
        ev.isModuloAtual ? 'Módulo Atual' : 'Módulo Concluído',
        ev.aulaIdentificacao,
        ev.descricaoAvaliacao,
        formatNumericBR(ev.notaEscala100),
        formatNumericBR(ev.notaEscala10),
        ev.dataAvaliacao,
      ]),
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [0, 40, 85], textColor: 255, fontStyle: 'bold' },
    });

    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
        ?.finalY || 240;

    if (finalY < 265) {
      doc.setDrawColor(148, 163, 184);
      doc.line(60, Math.min(272, finalY + 20), 150, Math.min(272, finalY + 20));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `${schoolInfo.responsavelAssinaturaNome} — ${student.unidadeEnsino}`,
        105,
        Math.min(277, finalY + 25),
        { align: 'center' }
      );
    }

    doc.save(
      `Boletim_Academico_${student.contrato}_${student.nomeCompleto.replace(/\s+/g, '_')}.pdf`
    );
  };

  // Geração de PDF Oficial da Declaração de Matrícula
  const handleDownloadDeclaracaoPdf = () => {
    if (!fichaAcademica) return;
    const { student, indicadoresConsolidados } = fichaAcademica;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Cabeçalho Institucional Timbrado
    doc.setFillColor(0, 74, 141);
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('MICROLINS — EDUCAÇÃO PROFISSIONAL', 105, 13, { align: 'center' });
    doc.setFontSize(9.5);
    doc.text(schoolInfo.nomeUnidade, 105, 20, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(
      `${schoolInfo.razaoSocial} · ${schoolInfo.cidadeUf}`,
      105,
      26,
      { align: 'center' }
    );

    // Título da Declaração
    doc.setTextColor(0, 40, 85);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('DECLARAÇÃO DE MATRÍCULA', 105, 52, {
      align: 'center',
    });

    doc.setDrawColor(0, 74, 141);
    doc.setLineWidth(0.6);
    doc.line(55, 56, 155, 56);

    // Corpo formal da declaração
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

    const currentYear = new Date().getFullYear();
    const cpfText = customAuthorizedCpf.trim()
      ? `, inscrito(a) no CPF sob o nº ${customAuthorizedCpf.trim()}`
      : '';
    const bodyParagraph1 = `Declaramos, para os devidos fins de comprovação escolar, acompanhamento pedagógico e demais finalidades legítimas, que o(a) aluno(a) ${student.nomeCompleto}${cpfText}, encontra-se regularmente matriculado(a) nesta instituição de ensino sob a Matrícula / Contrato nº #${student.contrato}, no ano letivo de ${currentYear}.`;

    const bodyParagraph2 = `O(A) referido(a) discente cursa a formação "${student.cursoMatriculado}", com início registrado em ${student.dataMatricula}, na modalidade ${student.modalidade} (Turno: ${student.turno}), encontrando-se atualmente com situação cadastral "${student.situacaoMatricula}", cursando o módulo "${student.moduloAtual}" nos horários institucionais (${student.diasHorariosResumo}) e apresentando frequência geral consolidada de ${formatNumericBR(indicadoresConsolidados.frequenciaGeralConsolidada)}%.`;

    const bodyParagraph3 = `Por ser expressão da verdade e estar em conformidade com os registros acadêmicos oficiais da unidade (${schoolInfo.nomeUnidade}), firmamos a presente declaração para que produza seus efeitos legais e institucionais.`;

    const lines1 = doc.splitTextToSize(bodyParagraph1, 170);
    doc.text(lines1, 20, 72);

    const lines2 = doc.splitTextToSize(bodyParagraph2, 170);
    doc.text(lines2, 20, 102);

    const lines3 = doc.splitTextToSize(bodyParagraph3, 170);
    doc.text(lines3, 20, 134);

    // Quadro Resumo Oficial
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(20, 155, 170, 50, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 59, 112);
    doc.text('DADOS OFICIAIS DO VÍNCULO ACADÊMICO', 26, 163);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(`• Nome Completo do Aluno: ${student.nomeCompleto}`, 26, 171);
    doc.text(`• Matrícula / Código do Aluno: #${student.contrato}`, 26, 177);
    doc.text(`• Curso / Turma: ${student.cursoMatriculado} (${student.moduloAtual})`, 26, 183);
    doc.text(`• Turno / Horário: ${student.turno} (${student.diasHorariosResumo})`, 26, 189);
    doc.text(
      `• Ano Letivo: ${currentYear} · Início: ${student.dataMatricula} · Situação: ${student.situacaoMatricula}`,
      26,
      195
    );
    doc.text(
      `• Unidade de Ensino: ${schoolInfo.nomeUnidade}`,
      26,
      201
    );

    // Local e Data de Emissão
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(getTodayExtendedDateBR(schoolInfo.cidadeUf) + '.', 105, 224, {
      align: 'center',
    });

    // Campo legítimo para assinatura física
    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.4);
    doc.line(55, 252, 155, 252);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(schoolInfo.responsavelAssinaturaNome, 105, 258, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(schoolInfo.responsavelAssinaturaCargo, 105, 263, { align: 'center' });
    doc.text(
      '(Espaço reservado para assinatura e validação institucional)',
      105,
      268,
      { align: 'center' }
    );

    // Rodapé Institucional — SOMENTE o nome da escola conforme Seção 13
    doc.setFillColor(0, 40, 85);
    doc.rect(0, 282, 210, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(schoolInfo.nomeUnidade, 105, 291, { align: 'center' });

    doc.save(
      `Declaracao_Matricula_${student.contrato}_${student.nomeCompleto.replace(/\s+/g, '_')}.pdf`
    );
  };

  // Compartilhamento digital (WhatsApp / Área de transferência)
  const buildDigitalShareSummary = (): string => {
    if (!fichaAcademica) return '';
    const { student, indicadoresConsolidados } = fichaAcademica;
    if (activeDocTab === 'DECLARACAO') {
      return `*DECLARAÇÃO DE MATRÍCULA — MICROLINS (${student.unidadeEnsino})*\n\nAluno(a): *${student.nomeCompleto}*\nContrato/Matrícula: *#${student.contrato}*\nCurso: *${student.cursoMatriculado}*\nMódulo Atual: *${student.moduloAtual}*\nInício do Curso: *${student.dataMatricula}*\nSituação da Matrícula: *${student.situacaoMatricula}*\nFrequência Consolidada: *${formatNumericBR(indicadoresConsolidados.frequenciaGeralConsolidada)}%*\nData de Emissão: *${getTodayExtendedDateBR(schoolInfo.cidadeUf)}*`;
    }
    return `*BOLETIM ACADÊMICO CONSOLIDADO — MICROLINS (${student.unidadeEnsino})*\n\nAluno(a): *${student.nomeCompleto}* (Contrato *#${student.contrato}*)\nCurso: *${student.cursoMatriculado}*\nMédia Geral do Curso: *${formatNumericBR(indicadoresConsolidados.mediaGeralCursoEscala100)} pts (${formatNumericBR(indicadoresConsolidados.mediaGeralCursoEscala10)}/10)*\nFrequência Geral Consolidada: *${formatNumericBR(indicadoresConsolidados.frequenciaGeralConsolidada)}%*\nMódulos Concluídos: *${indicadoresConsolidados.totalModulosCursados}* | Em Andamento: *${indicadoresConsolidados.totalModulosEmAndamento}* | Pendentes: *${indicadoresConsolidados.totalModulosPendentes}*\nSituação Acadêmica: *${indicadoresConsolidados.situacaoAcademicaGlobal}*`;
  };

  const handleCopyDigitalShare = async () => {
    const text = buildDigitalShareSummary();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummaryNotice(true);
      setTimeout(() => setCopiedSummaryNotice(false), 2500);
    } catch {
      // Fallback silent
    }
  };

  const filteredBoletimModules = useMemo<BoletimModuleRecord[]>(() => {
    if (!fichaAcademica) return [];
    if (moduleStatusFilter === 'TODOS') return fichaAcademica.modulos;
    return fichaAcademica.modulos.filter(
      (m) => m.statusModulo === moduleStatusFilter
    );
  }, [fichaAcademica, moduleStatusFilter]);

  return (
    <div
      data-testid="ficha-individual-view"
      className="mx-auto max-w-7xl space-y-6 pb-12"
    >
      {/* =====================================================================
          ESTADO 1: TELA INICIAL VAZIA E SISTEMA DE PESQUISA DE ALUNOS
          (Regra Fundamental: Nenhum dado individual de aluno é exibido antes
          de uma pesquisa e seleção explícita)
         ===================================================================== */}
      {!fichaAcademica ? (
        <section
          data-testid="ficha-individual-empty-search-state"
          className="space-y-4"
        >
          {/* Cabeçalho Limpo e Objetivo da Ficha Individual */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#004A8D] text-white shadow-xs">
                <FileText className="h-5 w-5" />
              </div>

              <h1
                data-testid="ficha-individual-main-title"
                className="mt-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white"
              >
                Ficha Individual do Aluno
              </h1>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Consulte a Carteirinha Estudantil, o Boletim Acadêmico ou emita a Declaração de Matrícula
              </p>

              {/* Campo de Pesquisa por Contrato ou Nome */}
              <div className="mt-5">
                <label
                  htmlFor="ficha-student-search-input"
                  className="sr-only"
                >
                  Localizar aluno por contrato ou nome ({unidadeAtual})
                </label>
                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-4 h-4 w-4 text-[#004A8D] dark:text-sky-400" />
                  <input
                    id="ficha-student-search-input"
                    data-testid="ficha-student-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por número de contrato ou nome do aluno..."
                    autoComplete="off"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-slate-50/70 pr-10 pl-11 text-sm font-medium text-slate-900 transition-colors placeholder:font-normal placeholder:text-slate-400 focus:border-[#004A8D] focus:bg-white focus:ring-2 focus:ring-[#004A8D]/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-sky-400"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Limpar pesquisa"
                      className="absolute right-3 rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Unidade: {unidadeAtual}</span>
                  <span className="tabular-nums">
                    {studentDirectory.length} alunos ativos
                  </span>
                </div>
              </div>
            </div>

            {/* Resultados da Pesquisa (Exibidos somente quando o operador digita uma consulta) */}
            {searchQuery.trim().length > 0 && (
              <div
                data-testid="ficha-search-results-container"
                className="mx-auto mt-6 max-w-3xl border-t border-slate-200 pt-4 dark:border-slate-800"
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Resultados ({searchResults.length})
                  </h2>
                </div>

                {searchResults.length === 0 ? (
                  <div
                    data-testid="ficha-search-no-results"
                    className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-slate-800 dark:bg-slate-800/50"
                  >
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Nenhum aluno encontrado para &ldquo;{searchQuery}&rdquo;
                    </p>
                  </div>
                ) : (
                  <div className="max-h-96 divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {searchResults.map((item) => (
                      <div
                        key={item.contrato}
                        data-testid={`ficha-search-result-${item.contrato}`}
                        className="flex flex-col justify-between gap-3 p-3.5 transition-colors hover:bg-sky-50/50 sm:flex-row sm:items-center dark:hover:bg-slate-800/70"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#004A8D] tabular-nums dark:text-sky-400">
                              #{item.contrato}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {item.nomeCompleto}
                            </span>
                          </div>

                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {item.cursoMatriculado}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{item.moduloAtual}</span>
                            <span aria-hidden="true">·</span>
                            <span>{item.diasHorariosResumo}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          data-testid={`ficha-select-student-btn-${item.contrato}`}
                          onClick={() => handleSelectStudentFromSearch(item)}
                          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#004A8D] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#003B70] whitespace-nowrap"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>Selecionar</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </section>
      ) : (
        /* =====================================================================
           ESTADO 2: FICHA INDIVIDUAL DO ALUNO SELECIONADO
           Exibe cabeçalho de identificação e exclusivamente as 3 áreas:
           1. Carteirinha Estudantil | 2. Boletim Acadêmico | 3. Declaração de Matrícula
           ===================================================================== */
        <section
          data-testid="ficha-individual-loaded-student"
          className="space-y-3"
        >
          {/* Cabeçalho Institucional Compacto do Aluno Selecionado + Seletor das 3 Áreas */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs print:hidden dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col justify-between gap-2.5 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                  <span className="font-mono font-bold text-[#004A8D] dark:text-sky-400">
                    Contrato #{fichaAcademica.student.contrato}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Unidade: {fichaAcademica.student.unidadeEnsino}</span>
                  <span aria-hidden="true">·</span>
                  <span>Matrícula em {fichaAcademica.student.dataMatricula}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {fichaAcademica.student.situacaoMatricula}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h1
                    data-testid="ficha-selected-student-name"
                    className="text-base font-black text-slate-900 sm:text-lg dark:text-white"
                  >
                    {fichaAcademica.student.nomeCompleto}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      Curso: {fichaAcademica.student.cursoMatriculado}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Módulo: {fichaAcademica.student.moduloAtual}</span>
                    <span aria-hidden="true">·</span>
                    <span>{fichaAcademica.student.modalidade}</span>
                    {fichaAcademica.student.nomeResponsavel && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          Resp.: {fichaAcademica.student.nomeResponsavel}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {studentAnsweredNpsInvite && (
                  <span
                    data-testid="ficha-nps-answered-badge"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 whitespace-nowrap"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>
                      NPS Concluído
                      {typeof studentAnsweredNpsInvite.notaNps === 'number'
                        ? ` · Nota ${studentAnsweredNpsInvite.notaNps}/10`
                        : ''}
                    </span>
                  </span>
                )}

                <button
                  type="button"
                  data-testid="ficha-change-student-btn"
                  onClick={handleClearSelectedStudent}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition-colors hover:border-[#004A8D] hover:text-[#004A8D] whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Pesquisar Outro Aluno</span>
                </button>
              </div>
            </div>

            {/* Seletor das 3 Áreas Exclusivas da Ficha Individual */}
            <div
              role="tablist"
              aria-label="Funcionalidades da Ficha Individual"
              className="mt-2.5 grid grid-cols-1 gap-2 border-t border-slate-200 pt-2.5 sm:grid-cols-3 dark:border-slate-800"
            >
              <button
                type="button"
                role="tab"
                data-testid="ficha-tab-carteirinha"
                aria-selected={activeDocTab === 'CARTEIRINHA'}
                onClick={() => setActiveDocTab('CARTEIRINHA')}
                className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-left transition-all ${
                  activeDocTab === 'CARTEIRINHA'
                    ? 'border-[#004A8D] bg-[#004A8D] text-white shadow-xs'
                    : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CreditCard
                    className={`h-4 w-4 shrink-0 ${
                      activeDocTab === 'CARTEIRINHA'
                        ? 'text-amber-300'
                        : 'text-[#004A8D] dark:text-sky-400'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold whitespace-nowrap">
                      Carteirinha Estudantil
                    </div>
                    <div
                      className={`text-[10px] ${
                        activeDocTab === 'CARTEIRINHA'
                          ? 'text-sky-100'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Frente e verso oficial
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                role="tab"
                data-testid="ficha-tab-boletim"
                aria-selected={activeDocTab === 'BOLETIM'}
                onClick={() => setActiveDocTab('BOLETIM')}
                className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-left transition-all ${
                  activeDocTab === 'BOLETIM'
                    ? 'border-[#004A8D] bg-[#004A8D] text-white shadow-xs'
                    : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <BarChart3
                    className={`h-4 w-4 shrink-0 ${
                      activeDocTab === 'BOLETIM'
                        ? 'text-amber-300'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold whitespace-nowrap">
                      Boletim Acadêmico
                    </div>
                    <div
                      className={`text-[10px] ${
                        activeDocTab === 'BOLETIM'
                          ? 'text-sky-100'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Notas e frequência por módulo
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                role="tab"
                data-testid="ficha-tab-declaracao"
                aria-selected={activeDocTab === 'DECLARACAO'}
                onClick={() => setActiveDocTab('DECLARACAO')}
                className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-left transition-all ${
                  activeDocTab === 'DECLARACAO'
                    ? 'border-[#004A8D] bg-[#004A8D] text-white shadow-xs'
                    : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileCheck2
                    className={`h-4 w-4 shrink-0 ${
                      activeDocTab === 'DECLARACAO'
                        ? 'text-amber-300'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold whitespace-nowrap">
                      Declaração de Matrícula
                    </div>
                    <div
                      className={`text-[10px] ${
                        activeDocTab === 'DECLARACAO'
                          ? 'text-sky-100'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Documento oficial A4 e PDF
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* =================================================================
              FUNCIONALIDADE 2.1: CARTEIRINHA ESTUDANTIL OFICIAL
             ================================================================= */}
          {activeDocTab === 'CARTEIRINHA' && (
            <div
              data-testid="ficha-section-carteirinha"
              className="space-y-4"
            >
              {/* Barra de Ações da Carteirinha */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 print:hidden dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Carteirinha Estudantil Oficial
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>
                      {customStudentPhotoUrl ? 'Trocar Foto 3x4' : 'Inserir Foto 3x4'}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="carteirinha-download-pdf-btn"
                    onClick={handleDownloadCarteirinhaPdf}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#004A8D] px-3.5 text-xs font-bold text-white transition-colors hover:bg-[#003B70] whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Gerar PDF (Frente e Verso)</span>
                  </button>

                  <button
                    type="button"
                    data-testid="carteirinha-print-btn"
                    onClick={handlePrintDocument}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Imprimir</span>
                  </button>
                </div>
              </div>

              {/* Complementação Cadastral Opcional para Impressão (Data de Nascimento e CPF autorizado) */}
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3 print:hidden dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <label
                    htmlFor="carteirinha-birth-input"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    Data de Nascimento (Conforme Ficha Cadastral):
                  </label>
                  <input
                    id="carteirinha-birth-input"
                    type="text"
                    value={customBirthDate}
                    onChange={(e) => setCustomBirthDate(e.target.value)}
                    placeholder="Ex.: 14/05/2008"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-900 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="carteirinha-cpf-input"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    CPF do Aluno (Quando disponível e autorizado):
                  </label>
                  <input
                    id="carteirinha-cpf-input"
                    type="text"
                    value={customAuthorizedCpf}
                    onChange={(e) => setCustomAuthorizedCpf(e.target.value)}
                    placeholder="Ex.: 000.000.000-00 (Opcional)"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-900 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="carteirinha-validade-input"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    Vigência da Identificação Estudantil:
                  </label>
                  <input
                    id="carteirinha-validade-input"
                    type="text"
                    value={cardValidThru}
                    onChange={(e) => setCardValidThru(e.target.value)}
                    placeholder="Ex.: 12/2026"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-900 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Exibição Lado a Lado: FRENTE e VERSO da Carteirinha Estudantil (Proporção Padrão ID-1: 85.60 × 53.98 mm) */}
              <div className="grid grid-cols-1 place-items-center gap-6 lg:grid-cols-2">
                {/* FRENTE DA CARTEIRINHA (ID-1: 85.60 x 53.98 mm -> aspect-[85.6/53.98]) */}
                <div
                  data-testid="student-id-card-front"
                  data-card-standard="ID-1-85.60x53.98mm"
                  className="flex aspect-[85.6/53.98] w-full max-w-[460px] flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md ring-1 ring-[#004A8D]/15 dark:border-slate-700 dark:bg-slate-900"
                >
                  {/* Topo Minimalista Institucional Microlins */}
                  <div className="flex items-center justify-between bg-gradient-to-r from-[#004A8D] to-[#00386B] px-4 py-2.5 text-white">
                    <div className="flex items-center gap-2.5">
                      <img
                        src="/assets/aistudio/logo-microlins_6400203f.png"
                        alt="Microlins"
                        className="h-5 w-auto object-contain brightness-0 invert"
                      />
                      <div className="h-3.5 w-px bg-white/25" />
                      <div>
                        <div className="text-[11px] font-extrabold tracking-wider uppercase leading-tight">
                          Carteira Estudantil
                        </div>
                        <div className="text-[9px] font-medium text-sky-200 leading-tight">
                          Identificação Oficial · Padrão ID-1
                        </div>
                      </div>
                    </div>

                    <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-[11px] font-black text-amber-300 tabular-nums">
                      #{fichaAcademica.student.contrato}
                    </span>
                  </div>

                  {/* Corpo Principal Minimalista da Frente */}
                  <div className="flex flex-1 items-center gap-3.5 px-4 py-2.5">
                    {/* Foto ou Avatar Padrão 3x4 */}
                    <div className="flex shrink-0 flex-col items-center">
                      <div className="flex h-24 w-[72px] flex-col items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-500 shadow-2xs dark:border-slate-700 dark:bg-slate-800">
                        {customStudentPhotoUrl ? (
                          <img
                            src={customStudentPhotoUrl}
                            alt={`Foto de ${fichaAcademica.student.nomeCompleto}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-1.5 text-center">
                            <User className="h-8 w-8 text-[#004A8D] dark:text-sky-400" />
                            <span className="mt-1 text-[8px] font-bold tracking-wider text-slate-400 uppercase">
                              Foto 3x4
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-extrabold text-emerald-700 uppercase dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {fichaAcademica.student.situacaoMatricula}
                      </span>
                    </div>

                    {/* Dados Essenciais do Estudante */}
                    <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                      <div>
                        <span className="block text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                          Nome do Aluno
                        </span>
                        <p
                          data-testid="carteirinha-student-name"
                          className="truncate text-sm font-black text-slate-900 leading-snug dark:text-white"
                          title={fichaAcademica.student.nomeCompleto}
                        >
                          {fichaAcademica.student.nomeCompleto}
                        </p>
                      </div>

                      <div>
                        <span className="block text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                          Curso / Formação
                        </span>
                        <p
                          data-testid="carteirinha-student-course"
                          className="truncate text-xs font-bold text-[#004A8D] leading-snug dark:text-sky-400"
                          title={fichaAcademica.student.cursoMatriculado}
                        >
                          {fichaAcademica.student.cursoMatriculado}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <div>
                          <span className="block text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                            Matrícula / Contrato
                          </span>
                          <p
                            data-testid="carteirinha-student-matricula"
                            className="font-mono text-[11px] font-bold text-slate-900 tabular-nums dark:text-white"
                          >
                            #{fichaAcademica.student.contrato}
                          </p>
                        </div>

                        <div>
                          <span className="block text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                            Validade
                          </span>
                          <p
                            data-testid="carteirinha-student-validade"
                            className="font-mono text-[11px] font-bold text-slate-900 tabular-nums dark:text-white"
                          >
                            {cardValidThru}
                          </p>
                        </div>
                      </div>

                      <div>
                        <span className="block text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                          Instituição / Unidade
                        </span>
                        <p
                          data-testid="carteirinha-student-institution"
                          className="truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                          title={`${fichaAcademica.student.unidadeEnsino} (#${fichaAcademica.student.codigoUnidade})`}
                        >
                          Microlins · {fichaAcademica.student.unidadeEnsino}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Rodapé Minimalista da Frente */}
                  <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/90 px-4 py-1.5 text-[10px] font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
                    <span>MICROLINS EDUCAÇÃO PROFISSIONAL</span>
                    <span className="font-mono tabular-nums text-[#004A8D] dark:text-sky-400">
                      VÁLIDA ATÉ {cardValidThru}
                    </span>
                  </div>
                </div>

                {/* VERSO DA CARTEIRINHA (ID-1: 85.60 x 53.98 mm -> aspect-[85.6/53.98]) */}
                <div
                  data-testid="student-id-card-back"
                  data-card-standard="ID-1-85.60x53.98mm"
                  className="flex aspect-[85.6/53.98] w-full max-w-[460px] flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md ring-1 ring-[#002855]/15 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between bg-[#002855] px-4 py-2.5 text-white">
                    <div>
                      <div className="text-[11px] font-extrabold tracking-wider uppercase leading-tight">
                        Validação Acadêmica Institucional
                      </div>
                      <div className="text-[9px] text-sky-200 leading-tight">
                        Registro Oficial de Matrícula Ativa
                      </div>
                    </div>
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  </div>

                  <div className="flex flex-1 items-center justify-between gap-3.5 px-4 py-2.5">
                    <div className="flex-1 space-y-1.5 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                      <p>
                        1. Comprova o vínculo acadêmico ativo de{' '}
                        <strong className="text-slate-900 dark:text-white">
                          {fichaAcademica.student.nomeCompleto}
                        </strong>{' '}
                        na unidade{' '}
                        <strong className="text-slate-900 dark:text-white">
                          {fichaAcademica.student.unidadeEnsino}
                        </strong>
                        .
                      </p>
                      <p>
                        2. Uso pessoal e intransferível, mediante apresentação
                        de documento oficial com foto.
                      </p>
                      <div className="pt-1 font-mono text-[10px] font-bold text-[#004A8D] tabular-nums dark:text-sky-400">
                        CÓD. VALIDAÇÃO: MIC-{fichaAcademica.student.codigoUnidade}-
                        {fichaAcademica.student.contrato}
                      </div>
                    </div>

                    {/* QR Code de Validação */}
                    <div className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-center shadow-2xs">
                      {qrCodeDataUrl ? (
                        <img
                          src={qrCodeDataUrl}
                          alt="QR Code de validação da matrícula"
                          className="h-20 w-20 object-contain"
                        />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center text-[9px] text-slate-400">
                          QR Code
                        </div>
                      )}
                      <span className="mt-0.5 font-mono text-[8px] font-bold text-slate-600">
                        VALIDAR MATRÍCULA
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/90 px-4 py-1.5 text-[10px] font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
                    <span>UNIDADE #{fichaAcademica.student.codigoUnidade}</span>
                    <span className="font-mono tabular-nums">
                      CONTRATO #{fichaAcademica.student.contrato}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              FUNCIONALIDADE 2.2: BOLETIM ACADÊMICO CONSOLIDADO POR MÓDULOS
             ================================================================= */}
          {activeDocTab === 'BOLETIM' && (
            <div data-testid="ficha-section-boletim" className="space-y-5">
              {/* Barra de Ações do Boletim Acadêmico */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 print:hidden dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Boletim Acadêmico Consolidado
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="boletim-download-pdf-btn"
                    onClick={handleDownloadBoletimPdf}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#004A8D] px-3.5 text-xs font-bold text-white transition-colors hover:bg-[#003B70] whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Gerar Boletim em PDF</span>
                  </button>

                  <button
                    type="button"
                    data-testid="boletim-print-btn"
                    onClick={handlePrintDocument}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Imprimir Boletim</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyDigitalShare}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {copiedSummaryNotice ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Resumo Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar Resumo p/ Reunião</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Cards de Indicadores Acadêmicos Consolidados em 2 Linhas (2x2) */}
              <div
                data-testid="boletim-summary-cards-grid"
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              >
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Média Geral Consolidada do Curso
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Mínimo para aprovação:{' '}
                      {formatNumericBR(CRITERIO_APROVACAO_MEDIA_100)} pts
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="text-lg font-black text-slate-900 dark:text-white">
                      {formatNumericBR(
                        fichaAcademica.indicadoresConsolidados
                          .mediaGeralCursoEscala100
                      )}
                    </span>
                    <span className="ml-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      / 100 (
                      {formatNumericBR(
                        fichaAcademica.indicadoresConsolidados
                          .mediaGeralCursoEscala10
                      )}
                      /10)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Frequência Geral Consolidada
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Mínimo exigido:{' '}
                      {formatNumericBR(CRITERIO_APROVACAO_FREQUENCIA_PERCENT, 0)}%
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <span
                      className={`text-lg font-black ${
                        fichaAcademica.indicadoresConsolidados
                          .frequenciaGeralConsolidada >=
                        CRITERIO_APROVACAO_FREQUENCIA_PERCENT
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {formatNumericBR(
                        fichaAcademica.indicadoresConsolidados
                          .frequenciaGeralConsolidada
                      )}
                      %
                    </span>
                    <span className="ml-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      ({fichaAcademica.indicadoresConsolidados.totalAulasConcluidasCurso}{' '}
                      aulas)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Progresso de Módulos na Grade
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Avaliações registradas:{' '}
                      {
                        fichaAcademica.indicadoresConsolidados
                          .totalAvaliacoesRealizadasCurso
                      }
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="text-lg font-black text-[#004A8D] dark:text-sky-400">
                      {fichaAcademica.indicadoresConsolidados.totalModulosCursados}
                    </span>
                    <span className="ml-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      cursado(s) ·{' '}
                      {
                        fichaAcademica.indicadoresConsolidados
                          .totalModulosEmAndamento
                      }{' '}
                      em curso ·{' '}
                      {fichaAcademica.indicadoresConsolidados.totalModulosPendentes}{' '}
                      pendente(s)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Situação de Aprovação / Curso
                    </span>
                    <p className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                      Última avaliação:{' '}
                      {fichaAcademica.indicadoresConsolidados
                        .ultimaAvaliacaoRegistradaData || 'Em andamento'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block text-xs font-black ${
                        fichaAcademica.indicadoresConsolidados.situacaoAcademicaGlobal.includes(
                          'ATENÇÃO'
                        )
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {
                        fichaAcademica.indicadoresConsolidados
                          .situacaoAcademicaGlobal
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Alertas Pedagógicos Automáticos (se houver módulo abaixo da média ou frequência insuficiente) */}
              {(fichaAcademica.indicadoresConsolidados.modulosAbaixoDaMediaCount >
                0 ||
                fichaAcademica.indicadoresConsolidados
                  .modulosFrequenciaInsuficienteCount > 0) && (
                <div
                  data-testid="boletim-pedagogical-alerts"
                  className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="space-y-1">
                      <p className="font-bold">
                        Indicadores de Atenção Pedagógica Identificados:
                      </p>
                      {fichaAcademica.indicadoresConsolidados
                        .modulosAbaixoDaMediaCount > 0 && (
                        <p>
                          • Há{' '}
                          <strong>
                            {
                              fichaAcademica.indicadoresConsolidados
                                .modulosAbaixoDaMediaCount
                            }{' '}
                            módulo(s)
                          </strong>{' '}
                          com desempenho abaixo da média institucional exigida (
                          {formatNumericBR(CRITERIO_APROVACAO_MEDIA_100)} pontos).
                        </p>
                      )}
                      {fichaAcademica.indicadoresConsolidados
                        .modulosFrequenciaInsuficienteCount > 0 && (
                        <p>
                          • Há{' '}
                          <strong>
                            {
                              fichaAcademica.indicadoresConsolidados
                                .modulosFrequenciaInsuficienteCount
                            }{' '}
                            módulo(s)
                          </strong>{' '}
                          com frequência abaixo do mínimo exigido (
                          {formatNumericBR(CRITERIO_APROVACAO_FREQUENCIA_PERCENT, 0)}
                          %).
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Gráfico de Evolução Acadêmica e Desempenho por Módulo */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Desempenho e Frequência por Módulo
                    </h3>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-xs bg-[#004A8D]" />
                      <span>Média do Módulo (0–100)</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
                      <span>Frequência (%)</span>
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {fichaAcademica.modulos.map((mod) => {
                    const mediaVal = mod.mediaFinalEscala100 ?? 0;
                    const freqVal = mod.frequenciaFinal ?? 0;
                    return (
                      <div
                        key={mod.id}
                        className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/50"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-400 tabular-nums">
                              0{mod.ordem}.
                            </span>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {mod.nomeModulo}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span
                              className={`font-semibold ${
                                mod.statusModulo === 'CURSADO'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : mod.statusModulo === 'EM_ANDAMENTO'
                                  ? 'text-[#004A8D] dark:text-sky-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {mod.statusModulo === 'CURSADO'
                                ? 'Módulo Concluído (Histórico)'
                                : mod.statusModulo === 'EM_ANDAMENTO'
                                ? 'Módulo em Andamento (Atual)'
                                : 'Módulo Pendente (Não Concluído)'}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                            <span>
                              Média:{' '}
                              <strong>
                                {mod.mediaFinalEscala100 !== null
                                  ? formatNumericBR(mod.mediaFinalEscala100)
                                  : '—'}
                              </strong>
                            </span>
                            <span>
                              Freq.:{' '}
                              <strong>
                                {mod.frequenciaFinal !== null
                                  ? `${formatNumericBR(mod.frequenciaFinal)}%`
                                  : '—'}
                              </strong>
                            </span>
                            <span
                              className={`font-sans font-bold ${
                                mod.situacao === 'Aprovado'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : mod.situacao === 'Em Curso'
                                  ? 'text-[#004A8D] dark:text-sky-400'
                                  : mod.situacao === 'Pendente'
                                  ? 'text-slate-500'
                                  : 'text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {mod.situacao}
                            </span>
                          </div>
                        </div>

                        {mod.statusModulo !== 'PENDENTE' && (
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                <div
                                  className={`h-full rounded-full ${
                                    mod.abaixoDaMediaExigida
                                      ? 'bg-rose-600'
                                      : 'bg-[#004A8D]'
                                  }`}
                                  style={{
                                    width: `${Math.min(100, Math.max(0, mediaVal))}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                <div
                                  className={`h-full rounded-full ${
                                    mod.frequenciaInsuficiente
                                      ? 'bg-amber-600'
                                      : 'bg-emerald-600'
                                  }`}
                                  style={{
                                    width: `${Math.min(100, Math.max(0, freqVal))}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Consolidação Automática por Módulo (Cards + Tabela Oficial) */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Resumo por Módulo Curricular
                    </h3>
                  </div>

                  {/* Filtro interativo de etapas dos módulos */}
                  <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 print:hidden dark:bg-slate-800">
                    {(
                      [
                        { id: 'TODOS', label: 'Todos os Módulos' },
                        { id: 'CURSADO', label: 'Cursados' },
                        { id: 'EM_ANDAMENTO', label: 'Em Andamento' },
                        { id: 'PENDENTE', label: 'Pendentes' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setModuleStatusFilter(tab.id)}
                        className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors whitespace-nowrap ${
                          moduleStatusFilter === tab.id
                            ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-white'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cards de Resumo Individual por Módulo (Formato Indicador | Resultado) */}
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredBoletimModules.map((mod) => (
                    <div
                      key={mod.id}
                      data-testid={`boletim-module-card-${mod.ordem}`}
                      className={`rounded-xl border p-4 ${
                        mod.isModuloAtual
                          ? 'border-[#004A8D] bg-sky-50/30 dark:border-sky-500 dark:bg-sky-950/20'
                          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 dark:border-slate-800">
                        <span className="text-xs font-black text-slate-900 dark:text-white">
                          {mod.ordem}. {mod.nomeModulo}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {mod.statusModulo === 'CURSADO'
                            ? 'Concluído'
                            : mod.statusModulo === 'EM_ANDAMENTO'
                            ? 'Módulo Atual'
                            : 'Não Iniciado'}
                        </span>
                      </div>

                      <dl className="mt-2.5 divide-y divide-slate-100 text-xs tabular-nums dark:divide-slate-800/80">
                        <div className="flex justify-between py-1.5">
                          <dt className="text-slate-500 dark:text-slate-400">
                            Módulo
                          </dt>
                          <dd className="font-bold text-slate-900 dark:text-white">
                            {mod.nomeModulo}
                          </dd>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <dt className="text-slate-500 dark:text-slate-400">
                            Média final
                          </dt>
                          <dd
                            className={`font-bold ${
                              mod.abaixoDaMediaExigida
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {mod.mediaFinalEscala100 !== null
                              ? `${formatNumericBR(mod.mediaFinalEscala100)} (${formatNumericBR(mod.mediaFinalEscala10)}/10)`
                              : 'Sem avaliação'}
                          </dd>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <dt className="text-slate-500 dark:text-slate-400">
                            Frequência final
                          </dt>
                          <dd
                            className={`font-bold ${
                              mod.frequenciaInsuficiente
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {mod.frequenciaFinal !== null
                              ? `${formatNumericBR(mod.frequenciaFinal, 0)}%`
                              : '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <dt className="text-slate-500 dark:text-slate-400">
                            Situação
                          </dt>
                          <dd
                            className={`font-black ${
                              mod.situacao === 'Aprovado'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : mod.situacao === 'Em Curso'
                                ? 'text-[#004A8D] dark:text-sky-400'
                                : mod.situacao === 'Pendente'
                                ? 'text-slate-500'
                                : 'text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            {mod.situacao}
                          </dd>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <dt className="text-slate-500 dark:text-slate-400">
                            Aulas concluídas
                          </dt>
                          <dd className="font-semibold text-slate-800 dark:text-slate-200">
                            {mod.aulasConcluidas} de {mod.aulasPrevistas}
                          </dd>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <dt className="text-slate-500 dark:text-slate-400">
                            Avaliações realizadas
                          </dt>
                          <dd className="font-semibold text-slate-800 dark:text-slate-200">
                            {mod.avaliacoesRealizadas}
                            {mod.ultimaNotaAulaIdentificacao
                              ? ` (Últ.: ${mod.ultimaNotaAulaIdentificacao})`
                              : ''}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabela de Histórico de Avaliações e Identificação da Aula em que cada Nota foi Obtida */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Histórico de Avaliações por Aula
                </h3>

                <div className="mt-4 overflow-x-auto">
                  <table
                    data-testid="boletim-evaluations-history-table"
                    className="w-full border-collapse text-left text-xs"
                  >
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
                        <th className="px-3.5 py-2.5">Módulo</th>
                        <th className="px-3.5 py-2.5">Etapa do Módulo</th>
                        <th className="px-3.5 py-2.5">Aula da Nota</th>
                        <th className="px-3.5 py-2.5">Avaliação</th>
                        <th className="px-3.5 py-2.5 text-right">Nota (0–100)</th>
                        <th className="px-3.5 py-2.5 text-right">Nota (0–10)</th>
                        <th className="px-3.5 py-2.5 text-right">
                          Data da Avaliação
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 tabular-nums dark:divide-slate-800">
                      {fichaAcademica.avaliacoesHistoricoCompleto.map((ev) => (
                        <tr
                          key={ev.id}
                          className={
                            ev.isModuloAtual
                              ? 'bg-sky-50/40 dark:bg-sky-950/25'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                          }
                        >
                          <td className="px-3.5 py-2.5 font-bold text-slate-900 dark:text-white">
                            {ev.nomeModulo}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <span
                              className={`font-semibold ${
                                ev.isModuloAtual
                                  ? 'text-[#004A8D] dark:text-sky-400'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {ev.isModuloAtual
                                ? 'Módulo Atual (Em Andamento)'
                                : 'Módulo Anterior (Concluído)'}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                            {ev.aulaIdentificacao}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-300">
                            {ev.descricaoAvaliacao}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-black text-slate-900 dark:text-white">
                            {formatNumericBR(ev.notaEscala100)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-slate-600 dark:text-slate-300">
                            {formatNumericBR(ev.notaEscala10)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right text-slate-600 dark:text-slate-400">
                            {ev.dataAvaliacao}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              FUNCIONALIDADE 2.3: DECLARAÇÃO OFICIAL DE MATRÍCULA
             ================================================================= */}
          {activeDocTab === 'DECLARACAO' && (
            <div data-testid="ficha-section-declaracao" className="space-y-5">
              {/* Barra de Ações da Declaração de Matrícula */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 print:hidden dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Declaração Oficial de Matrícula
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="declaracao-download-pdf-btn"
                    onClick={handleDownloadDeclaracaoPdf}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#004A8D] px-3.5 text-xs font-bold text-white transition-colors hover:bg-[#003B70] whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Gerar Declaração em PDF</span>
                  </button>

                  <button
                    type="button"
                    data-testid="declaracao-print-btn"
                    onClick={handlePrintDocument}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Imprimir Diretamente</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyDigitalShare}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {copiedSummaryNotice ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Texto Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Compartilhar Digitalmente</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Painel Rápido de Dados Institucionais da Unidade para Emissão */}
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3 print:hidden dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <label
                    htmlFor="declaracao-cnpj-input"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    CNPJ da Unidade (Quando aplicável):
                  </label>
                  <input
                    id="declaracao-cnpj-input"
                    type="text"
                    value={schoolInfo.cnpj}
                    onChange={(e) =>
                      setSchoolInfo((prev) => ({ ...prev, cnpj: e.target.value }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-900 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="declaracao-endereco-input"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    Endereço Oficial da Unidade:
                  </label>
                  <input
                    id="declaracao-endereco-input"
                    type="text"
                    value={schoolInfo.enderecoCompleto}
                    onChange={(e) =>
                      setSchoolInfo((prev) => ({
                        ...prev,
                        enderecoCompleto: e.target.value,
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-900 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="declaracao-responsavel-input"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    Identificação do Responsável para Assinatura:
                  </label>
                  <input
                    id="declaracao-responsavel-input"
                    type="text"
                    value={schoolInfo.responsavelAssinaturaNome}
                    onChange={(e) =>
                      setSchoolInfo((prev) => ({
                        ...prev,
                        responsavelAssinaturaNome: e.target.value,
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-900 focus:border-[#004A8D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* FOLHA A4 INSTITUCIONAL DE VISUALIZAÇÃO E IMPRESSÃO DA DECLARAÇÃO */}
              <article
                data-testid="declaracao-matricula-document"
                className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-300 bg-white text-slate-900 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {/* Cabeçalho Timbrado Oficial */}
                <div className="border-b-4 border-amber-400 bg-[#004A8D] px-8 py-6 text-white">
                  <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                    <div className="flex items-center gap-3">
                      <img
                        src="/assets/aistudio/logo-microlins_6400203f.png"
                        alt="Logotipo Oficial Microlins"
                        className="h-9 w-auto object-contain brightness-0 invert"
                      />
                      <div>
                        <div className="text-sm font-black tracking-wide uppercase">
                          {schoolInfo.nomeUnidade}
                        </div>
                        <div className="text-xs text-sky-100">
                          {schoolInfo.razaoSocial}
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono text-xs text-sky-100 tabular-nums">
                      <div>Código da Unidade: #{fichaAcademica.student.codigoUnidade}</div>
                      <div>Contrato: #{fichaAcademica.student.contrato}</div>
                    </div>
                  </div>
                </div>

                {/* Corpo da Declaração Escolar Oficial */}
                <div className="space-y-6 px-8 py-10 sm:px-12">
                  <div className="text-center">
                    <h3
                      data-testid="declaracao-main-title"
                      className="text-xl font-black tracking-wide text-[#002855] uppercase dark:text-sky-300"
                    >
                      DECLARAÇÃO DE MATRÍCULA
                    </h3>
                    <div className="mx-auto mt-2 h-0.5 w-32 bg-[#004A8D]" />
                  </div>

                  <div className="space-y-4 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                    <p>
                      Declaramos, para os devidos fins de comprovação escolar,
                      apresentação institucional e acompanhamento pedagógico, que
                      o(a) aluno(a){' '}
                      <strong className="font-black text-slate-950 dark:text-white">
                        {fichaAcademica.student.nomeCompleto}
                      </strong>
                      {customAuthorizedCpf.trim()
                        ? `, inscrito(a) no CPF sob o nº ${customAuthorizedCpf.trim()}`
                        : ''}
                      , encontra-se regularmente matriculado(a) nesta instituição
                      de ensino sob a{' '}
                      <strong className="font-mono font-bold">
                        Matrícula / Contrato nº #{fichaAcademica.student.contrato}
                      </strong>
                      , no ano letivo de{' '}
                      <strong>{new Date().getFullYear()}</strong>.
                    </p>

                    <p>
                      O(A) discente frequenta o curso{' '}
                      <strong className="font-bold">
                        {fichaAcademica.student.cursoMatriculado}
                      </strong>
                      , com início em{' '}
                      <strong className="font-bold">
                        {fichaAcademica.student.dataMatricula}
                      </strong>
                      , na modalidade{' '}
                      <strong>{fichaAcademica.student.modalidade}</strong> (Turno:{' '}
                      <strong>{fichaAcademica.student.turno}</strong>), cursando
                      atualmente a turma/módulo{' '}
                      <strong>{fichaAcademica.student.moduloAtual}</strong> nos
                      horários programados (
                      <span className="tabular-nums">
                        {fichaAcademica.student.diasHorariosResumo}
                      </span>
                      ), apresentando situação de matrícula{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        {fichaAcademica.student.situacaoMatricula}
                      </strong>
                      .
                    </p>
                  </div>

                  {/* Quadro Institucional de Dados Cadastrais da Declaração */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-xs dark:border-slate-800 dark:bg-slate-800/60">
                    <h4 className="font-black text-[#004A8D] uppercase dark:text-sky-400">
                      Síntese Oficial dos Dados da Matrícula
                    </h4>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 tabular-nums">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">
                          Nome Completo do Aluno:
                        </span>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {fichaAcademica.student.nomeCompleto}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">
                          Matrícula / Código do Aluno:
                        </span>
                        <p className="font-mono font-bold text-slate-900 dark:text-white">
                          #{fichaAcademica.student.contrato}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">
                          Curso / Série / Turma:
                        </span>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {fichaAcademica.student.cursoMatriculado} ·{' '}
                          {fichaAcademica.student.moduloAtual}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">
                          Turno / Horário:
                        </span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {fichaAcademica.student.turno} (
                          {fichaAcademica.student.diasHorariosResumo})
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">
                          Ano Letivo / Data de Início:
                        </span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {new Date().getFullYear()} · Início em{' '}
                          {fichaAcademica.student.dataMatricula}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">
                          Situação Atual da Matrícula:
                        </span>
                        <p className="font-bold text-emerald-700 dark:text-emerald-400">
                          {fichaAcademica.student.situacaoMatricula}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Data de Emissão e Campo Limpo para Assinatura do Responsável pela Unidade */}
                  <div className="pt-4 text-center">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {getTodayExtendedDateBR(schoolInfo.cidadeUf)}.
                    </p>

                    <div className="mx-auto mt-14 max-w-md border-t border-slate-400 pt-3 dark:border-slate-600">
                      <p className="text-sm font-black text-slate-900 dark:text-white">
                        {schoolInfo.responsavelAssinaturaNome}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {schoolInfo.responsavelAssinaturaCargo} —{' '}
                        {fichaAcademica.student.unidadeEnsino}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        (Espaço reservado para assinatura e validação institucional)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Rodapé Institucional — Mantém SOMENTE o nome da escola conforme Seção 13 */}
                <div
                  data-testid="declaracao-footer-school-only"
                  className="border-t border-slate-200 bg-[#002855] px-8 py-4 text-center text-xs text-white"
                >
                  <p className="font-bold tracking-wide uppercase">
                    {schoolInfo.nomeUnidade}
                  </p>
                </div>
              </article>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export const FichaIndividualView = PortalAlunoHubView;
