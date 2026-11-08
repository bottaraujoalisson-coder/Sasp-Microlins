import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
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
  ClipboardList,
  Camera,
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
  buildFichaAcompanhamentoForModule,
  buildStudentFichaIndividual,
  buildUniqueStudentDirectory,
  CRITERIO_APROVACAO_FREQUENCIA_PERCENT,
  CRITERIO_APROVACAO_MEDIA_100,
  FichaAcompanhamentoModuleData,
  FichaIndividualAcademicaData,
  FichaIndividualSectionTab,
  ModuleLessonTrackingItem,
  searchStudentsForFichaIndividual,
  StudentSearchDirectoryItem,
} from '../utils/fichaIndividualAcademic';
import {
  SmartAvatar,
  StudentDocumentPhoto,
  useStudentPhoto,
  useToast,
} from './uiSystem';

interface PortalAlunoHubViewProps {
  allStudents: EvaluatedStudentRecord[];
  selectedStudentId?: number | null;
  onSelectStudentId?: (id: number | null) => void;
  initialSubTab?: FichaIndividualSectionTab;
  onSubTabChange?: (subTab: FichaIndividualSectionTab) => void;
  unidadeAtual?: string;
  activeNpsInvitations?: ActiveNpsInvitation[];
  onNpsInvitationUpdated?: (
    inviteId: string,
    patch: Partial<ActiveNpsInvitation>
  ) => void;
  externalSearchQuery?: string;
  onExternalSearchChange?: (query: string) => void;
  onFocusHeaderSearch?: () => void;
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
  onSubTabChange,
  unidadeAtual = PORTAL_METADATA.unidade,
  activeNpsInvitations = [],
  onNpsInvitationUpdated,
  externalSearchQuery = '',
  onExternalSearchChange,
  onFocusHeaderSearch,
}) => {
  // Diretório consolidado sem duplicidades (priorizando o número do contrato)
  const studentDirectory = useMemo(
    () => buildUniqueStudentDirectory(allStudents, unidadeAtual),
    [allStudents, unidadeAtual]
  );

  // Estado da pesquisa de alunos sincronizado com a barra de pesquisa única do cabeçalho
  const [searchQuery, setSearchQuery] = useState<string>(externalSearchQuery);
  useEffect(() => {
    setSearchQuery(externalSearchQuery);
  }, [externalSearchQuery]);

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

  // Aba ativa dentro da Ficha Individual (BOLETIM, ACOMPANHAMENTO, CARTEIRINHA, DECLARACAO)
  const [activeDocTab, setActiveDocTab] = useState<FichaIndividualSectionTab>(
    initialSubTab
  );

  useEffect(() => {
    if (initialSubTab) {
      setActiveDocTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleChangeDocTab = (nextTab: FichaIndividualSectionTab) => {
    setActiveDocTab(nextTab);
    if (onSubTabChange) {
      onSubTabChange(nextTab);
    }
  };

  // Dados complementares opcionais preenchíveis pela secretaria antes de emitir documentos (Foto sincronizada, CPF autorizado, Data de Nascimento)
  const [customStudentPhotoUrl, setCustomStudentPhotoUrl] = useState<string>('');
  const [registeredStudentPhoto, updateRegisteredStudentPhoto] = useStudentPhoto(
    selectedContrato,
    customStudentPhotoUrl
  );
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

  // Estado específico da aba Ficha de Acompanhamento
  const [selectedAcompanhamentoModuleName, setSelectedAcompanhamentoModuleName] =
    useState<string>('');
  const [isAcompanhamentoBlankMode, setIsAcompanhamentoBlankMode] =
    useState<boolean>(false);
  const [observacoesGeraisTexto, setObservacoesGeraisTexto] =
    useState<string>('');
  const toast = useToast();

  useEffect(() => {
    if (selectedStudentItem) {
      setSelectedAcompanhamentoModuleName(selectedStudentItem.moduloAtual || '');
      setObservacoesGeraisTexto('');
    }
  }, [selectedStudentItem?.contrato]);

  const acompanhamentoData = useMemo<FichaAcompanhamentoModuleData | null>(() => {
    if (!selectedStudentItem) return null;
    return buildFichaAcompanhamentoForModule(
      selectedStudentItem,
      selectedAcompanhamentoModuleName || undefined
    );
  }, [selectedStudentItem, selectedAcompanhamentoModuleName]);

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
    if (onFocusHeaderSearch) {
      onFocusHeaderSearch();
    }
  };

  // Pré-carrega o logotipo oficial da Microlins invertido em branco (PNG DataURL) para fidelidade 100% nos PDFs exportados
  const [whiteMicrolinsLogoData, setWhiteMicrolinsLogoData] = useState<{
    dataUrl: string;
    aspect: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!active) return;
      try {
        const w = img.naturalWidth || 320;
        const h = img.naturalHeight || 90;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 10) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        setWhiteMicrolinsLogoData({
          dataUrl: canvas.toDataURL('image/png'),
          aspect: w / Math.max(1, h),
        });
      } catch {
        // Fallback silencioso caso canvas falhe
      }
    };
    img.src = '/assets/aistudio/logo-microlins_6400203f.png';
    return () => {
      active = false;
    };
  }, []);

  const drawWhiteMicrolinsLogoInPdf = (
    doc: jsPDF,
    x: number,
    y: number,
    targetHeightMm: number
  ): number => {
    if (whiteMicrolinsLogoData?.dataUrl) {
      try {
        const logoW = targetHeightMm * (whiteMicrolinsLogoData.aspect || 3.4);
        doc.addImage(
          whiteMicrolinsLogoData.dataUrl,
          'PNG',
          x,
          y,
          logoW,
          targetHeightMm
        );
        return logoW;
      } catch {
        // Fallback abaixo
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(targetHeightMm * 1.6);
    doc.text('MICROLINS', x, y + targetHeightMm * 0.8);
    return targetHeightMm * 3.2;
  };

  const drawStudentPhotoBoxInPdf = (
    doc: jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    studentName: string,
    contrato: string,
    photoUrl?: string | null
  ) => {
    const footerStripH = Math.max(3.2, h * 0.14);
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(147, 197, 253);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, y, w, h, 1.8, 1.8, 'FD');

    let photoRendered = false;
    if (photoUrl) {
      try {
        const format = photoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(
          photoUrl,
          format,
          x + 0.4,
          y + 0.4,
          w - 0.8,
          h - footerStripH - 0.4
        );
        photoRendered = true;
      } catch {
        photoRendered = false;
      }
    }

    if (!photoRendered) {
      const centerX = x + w / 2;
      const circleY = y + (h - footerStripH) * 0.42;
      const radius = Math.min(w, h - footerStripH) * 0.27;
      doc.setFillColor(0, 74, 141);
      doc.circle(centerX, circleY, radius, 'F');

      const initials = studentName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase();
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(Math.max(6.5, radius * 1.45));
      doc.text(initials, centerX, circleY + radius * 0.32, { align: 'center' });

      doc.setTextColor(0, 74, 141);
      doc.setFontSize(Math.max(5, w * 0.28));
      doc.text(`#${contrato}`, centerX, y + (h - footerStripH) * 0.84, {
        align: 'center',
      });
    }

    // Faixa inferior "FOTO OFICIAL" idêntica ao componente StudentDocumentPhoto
    doc.setFillColor(0, 40, 85);
    doc.rect(x + 0.2, y + h - footerStripH, w - 0.4, footerStripH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(4.5, footerStripH * 1.25));
    doc.text(
      'FOTO OFICIAL',
      x + w / 2,
      y + h - footerStripH * 0.28,
      { align: 'center' }
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomStudentPhotoUrl(reader.result);
        updateRegisteredStudentPhoto(reader.result);
        if (selectedStudentItem) {
          toast.success(
            'Foto do aluno sincronizada',
            `A foto de ${selectedStudentItem.nomeCompleto} (#${selectedStudentItem.contrato}) foi vinculada ao cadastro e atualizada em todos os documentos e no Kanban.`
          );
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePrintDocument = () => {
    window.print();
  };

  // Geração de PDF Oficial da Carteirinha Estudantil (100% idêntico à pré-visualização ID-1: 85.60mm x 53.98mm)
  const handleDownloadCarteirinhaPdf = () => {
    if (!fichaAcademica) return;
    const { student } = fichaAcademica;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Cabeçalho Institucional da Folha de Emissão
    doc.setFillColor(0, 74, 141);
    doc.rect(0, 0, 210, 24, 'F');
    doc.setFillColor(0, 40, 85);
    doc.rect(0, 22.5, 210, 1.5, 'F');

    const headerLogoW = drawWhiteMicrolinsLogoInPdf(doc, 14, 6.5, 6.2);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.25);
    doc.line(14 + headerLogoW + 3, 6.5, 14 + headerLogoW + 3, 17.5);

    const headerTextX = 14 + headerLogoW + 6;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(
      'CARTEIRINHA ESTUDANTIL OFICIAL (PADRÃO ISO/IEC 7810 ID-1)',
      headerTextX,
      11
    );
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(186, 230, 253);
    doc.setFontSize(8);
    doc.text(
      `Unidade: ${student.unidadeEnsino} (#${student.codigoUnidade}) · Matrícula #${student.contrato} · Proporção Oficial 85,60 × 53,98 mm`,
      headerTextX,
      16.2
    );

    // FRENTE DA CARTEIRINHA (Padrão ID-1 exato: 85.60mm x 53.98mm)
    const cardX = 16;
    const frontY = 34;
    const cardW = 85.6;
    const cardH = 53.98;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.roundedRect(cardX, frontY, cardW, cardH, 3.2, 3.2, 'FD');

    // Topo Institucional da Frente (#004A8D -> #00386B)
    doc.setFillColor(0, 74, 141);
    doc.roundedRect(cardX, frontY, cardW, 11.5, 3.2, 3.2, 'F');
    doc.rect(cardX, frontY + 8.3, cardW, 3.2, 'F');

    const frontLogoW = drawWhiteMicrolinsLogoInPdf(
      doc,
      cardX + 3.5,
      frontY + 3.1,
      4.5
    );
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.2);
    doc.line(
      cardX + 3.5 + frontLogoW + 2,
      frontY + 3,
      cardX + 3.5 + frontLogoW + 2,
      frontY + 8.5
    );

    const frontTitleX = cardX + 3.5 + frontLogoW + 4;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('CARTEIRA ESTUDANTIL', frontTitleX, frontY + 5.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(186, 230, 253);
    doc.setFontSize(5);
    doc.text('Identificação Oficial · Padrão ID-1', frontTitleX, frontY + 8.2);

    // Badge #Contrato à direita do topo
    const badgeW = 16;
    doc.setFillColor(0, 48, 96);
    doc.roundedRect(
      cardX + cardW - badgeW - 3.2,
      frontY + 3.1,
      badgeW,
      5.2,
      1.2,
      1.2,
      'F'
    );
    doc.setTextColor(252, 211, 77);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.text(
      `#${student.contrato}`,
      cardX + cardW - badgeW / 2 - 3.2,
      frontY + 6.6,
      { align: 'center' }
    );

    // Foto 3x4 Sincronizada + Status Matrícula
    drawStudentPhotoBoxInPdf(
      doc,
      cardX + 3.8,
      frontY + 13.8,
      18.5,
      24.2,
      student.nomeCompleto,
      student.contrato,
      registeredStudentPhoto
    );
    doc.setFillColor(16, 185, 129);
    doc.circle(cardX + 6.5, frontY + 40.5, 0.8, 'F');
    doc.setTextColor(4, 120, 87);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.text(
      student.situacaoMatricula.toUpperCase(),
      cardX + 8.2,
      frontY + 41.1
    );

    // Dados Essenciais do Estudante (Idênticos à pré-visualização da Frente)
    const infoX = cardX + 25.2;
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.8);
    doc.text('NOME COMPLETO DO ALUNO', infoX, frontY + 15.8);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(7.2);
    doc.text(student.nomeCompleto.slice(0, 34), infoX, frontY + 19.2);

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(4.8);
    doc.text('CURSO / FORMAÇÃO', infoX, frontY + 23.2);
    doc.setTextColor(0, 74, 141);
    doc.setFontSize(6.5);
    doc.text(student.cursoMatriculado.slice(0, 36), infoX, frontY + 26.4);

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(4.8);
    doc.text('MATRÍCULA / CONTRATO', infoX, frontY + 30.6);
    doc.text('VALIDADE', infoX + 30, frontY + 30.6);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(6.2);
    doc.text(`#${student.contrato}`, infoX, frontY + 33.8);
    doc.text(cardValidThru, infoX + 30, frontY + 33.8);

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(4.8);
    doc.text('INSTITUIÇÃO / UNIDADE', infoX, frontY + 37.8);
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(5.8);
    doc.text(
      `Microlins · ${student.unidadeEnsino}`.slice(0, 38),
      infoX,
      frontY + 41
    );

    // Rodapé da Frente
    doc.setFillColor(248, 250, 252);
    doc.rect(cardX + 0.3, frontY + cardH - 7.5, cardW - 0.6, 7.2, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(cardX, frontY + cardH - 7.5, cardX + cardW, frontY + cardH - 7.5);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.4);
    doc.text(
      'MICROLINS EDUCAÇÃO PROFISSIONAL',
      cardX + 3.8,
      frontY + cardH - 3
    );
    doc.setTextColor(0, 74, 141);
    doc.text(
      `VÁLIDA ATÉ ${cardValidThru}`,
      cardX + cardW - 3.8,
      frontY + cardH - 3,
      { align: 'right' }
    );

    // VERSO DA CARTEIRINHA (Padrão ID-1 exato: 85.60mm x 53.98mm)
    const backX = 108.4;
    const backY = 34;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.roundedRect(backX, backY, cardW, cardH, 3.2, 3.2, 'FD');

    // Topo Institucional do Verso (#002855)
    doc.setFillColor(0, 40, 85);
    doc.roundedRect(backX, backY, cardW, 11.5, 3.2, 3.2, 'F');
    doc.rect(backX, backY + 8.3, cardW, 3.2, 'F');

    const backLogoW = drawWhiteMicrolinsLogoInPdf(
      doc,
      backX + 3.5,
      backY + 3.4,
      4
    );
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.2);
    doc.line(
      backX + 3.5 + backLogoW + 2,
      backY + 3.2,
      backX + 3.5 + backLogoW + 2,
      backY + 8.4
    );

    const backTitleX = backX + 3.5 + backLogoW + 4;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.text('VALIDAÇÃO ACADÊMICA INSTITUCIONAL', backTitleX, backY + 5.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(186, 230, 253);
    doc.setFontSize(5);
    doc.text('Registro Oficial de Matrícula Ativa', backTitleX, backY + 8.2);

    // Corpo do Verso (Texto + QR Code em card branco bordado)
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    const backText1 = doc.splitTextToSize(
      `1. Comprova o vínculo acadêmico ativo de ${student.nomeCompleto} na unidade ${student.unidadeEnsino}.`,
      54
    );
    doc.text(backText1, backX + 3.8, backY + 16.5);

    const backText2 = doc.splitTextToSize(
      '2. Uso pessoal e intransferível, mediante apresentação de documento oficial com foto.',
      54
    );
    doc.text(backText2, backX + 3.8, backY + 27.5);

    doc.setTextColor(0, 74, 141);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.6);
    doc.text(
      `CÓD. VALIDAÇÃO: MIC-${student.codigoUnidade}-${student.contrato}`,
      backX + 3.8,
      backY + 39.5
    );

    // Card QR Code à direita
    const qrBoxW = 22;
    const qrBoxH = 26;
    const qrBoxX = backX + cardW - qrBoxW - 3.8;
    const qrBoxY = backY + 14.5;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(qrBoxX, qrBoxY, qrBoxW, qrBoxH, 2, 2, 'FD');
    if (qrCodeDataUrl) {
      try {
        doc.addImage(
          qrCodeDataUrl,
          'PNG',
          qrBoxX + 2,
          qrBoxY + 1.8,
          18,
          18
        );
      } catch {
        // Ignore QR embed failure
      }
    }
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.3);
    doc.text(
      'VALIDAR MATRÍCULA',
      qrBoxX + qrBoxW / 2,
      qrBoxY + qrBoxH - 2.2,
      { align: 'center' }
    );

    // Rodapé do Verso
    doc.setFillColor(248, 250, 252);
    doc.rect(backX + 0.3, backY + cardH - 7.5, cardW - 0.6, 7.2, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(backX, backY + cardH - 7.5, backX + cardW, backY + cardH - 7.5);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.4);
    doc.text(
      `UNIDADE #${student.codigoUnidade}`,
      backX + 3.8,
      backY + cardH - 3
    );
    doc.text(
      `CONTRATO #${student.contrato}`,
      backX + cardW - 3.8,
      backY + cardH - 3,
      { align: 'right' }
    );

    doc.save(
      `Carteirinha_Microlins_${student.contrato}_${student.nomeCompleto.replace(/\s+/g, '_')}.pdf`
    );
    toast.success(
      'Carteirinha Estudantil exportada',
      `PDF padrão ID-1 gerado com 100% de fidelidade visual para ${student.nomeCompleto} (#${student.contrato}).`
    );
  };

  // Geração de PDF Oficial do Boletim Acadêmico Consolidado (100% idêntico à pré-visualização)
  const handleDownloadBoletimPdf = () => {
    if (!fichaAcademica) return;
    const {
      student,
      modulos,
      avaliacoesHistoricoCompleto,
      indicadoresConsolidados,
    } = fichaAcademica;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const marginX = 12;
    const contentW = 186;

    // 1. Card Institucional Superior do Boletim (idêntico a boletim-institutional-header)
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.35);
    doc.roundedRect(marginX, 10, contentW, 42, 3, 3, 'FD');

    // Faixa Azul Superior (#004A8D)
    doc.setFillColor(0, 74, 141);
    doc.roundedRect(marginX, 10, contentW, 14, 3, 3, 'F');
    doc.rect(marginX, 20, contentW, 4, 'F');

    const logoW = drawWhiteMicrolinsLogoInPdf(doc, marginX + 4, 13.5, 6);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.25);
    doc.line(
      marginX + 4 + logoW + 3,
      13.5,
      marginX + 4 + logoW + 3,
      20.5
    );

    const headerTitleX = marginX + 4 + logoW + 6;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(
      'BOLETIM ACADÊMICO E FICHA INDIVIDUAL DO ALUNO',
      headerTitleX,
      16.2
    );
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(186, 230, 253);
    doc.setFontSize(7.2);
    doc.text(
      `${schoolInfo.nomeUnidade} · Emissão Oficial: ${PORTAL_METADATA.dataReferencia}`,
      headerTitleX,
      20.2
    );

    // Badge Matrícula à direita
    const matBadgeW = 34;
    doc.setFillColor(0, 52, 102);
    doc.roundedRect(
      marginX + contentW - matBadgeW - 4,
      13.5,
      matBadgeW,
      7,
      1.5,
      1.5,
      'F'
    );
    doc.setTextColor(252, 211, 77);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(
      `Matrícula #${student.contrato}`,
      marginX + contentW - matBadgeW / 2 - 4,
      18.1,
      { align: 'center' }
    );

    // Corpo do Card Institucional: Foto 3x4 à esquerda + 3 Cards de Identificação à direita
    drawStudentPhotoBoxInPdf(
      doc,
      marginX + 4,
      26.5,
      17.5,
      23,
      student.nomeCompleto,
      student.contrato,
      registeredStudentPhoto
    );

    const cardsStartX = marginX + 24.5;
    const cardsAreaW = contentW - 28.5;
    const singleCardW = (cardsAreaW - 4) / 3;

    const idCards = [
      {
        label: 'NOME COMPLETO DO ALUNO',
        value: student.nomeCompleto,
        valueColor: [15, 23, 42] as [number, number, number],
      },
      {
        label: 'CURSO / FORMAÇÃO',
        value: student.cursoMatriculado,
        valueColor: [0, 74, 141] as [number, number, number],
      },
      {
        label: 'MÓDULO ATUAL & HORÁRIO',
        value: `${student.moduloAtual} (${student.diasHorariosResumo})`,
        valueColor: [30, 41, 59] as [number, number, number],
      },
    ];

    idCards.forEach((c, idx) => {
      const cx = cardsStartX + idx * (singleCardW + 2);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(cx, 27.5, singleCardW, 21, 2, 2, 'FD');

      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text(c.label, cx + 2.5, 32.5);

      doc.setTextColor(c.valueColor[0], c.valueColor[1], c.valueColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      const wrapped = doc.splitTextToSize(c.value, singleCardW - 5);
      doc.text(wrapped.slice(0, 3), cx + 2.5, 37.5);
    });

    // 2. Grid 2x2 de Indicadores Acadêmicos Consolidados (idêntico a boletim-summary-cards-grid)
    const kpiY = 55;
    const kpiW = (contentW - 3) / 2;
    const kpiH = 11;

    const summaryCards = [
      {
        x: marginX,
        y: kpiY,
        label: 'MÉDIA GERAL DO CURSO (0–100)',
        rightText: `${formatNumericBR(indicadoresConsolidados.mediaGeralCursoEscala100)} pts (${formatNumericBR(indicadoresConsolidados.mediaGeralCursoEscala10)} / 10)`,
        color: [0, 74, 141] as [number, number, number],
      },
      {
        x: marginX + kpiW + 3,
        y: kpiY,
        label: 'FREQUÊNCIA CONSOLIDADA',
        rightText: `${formatNumericBR(indicadoresConsolidados.frequenciaGeralConsolidada)}% (${indicadoresConsolidados.totalAulasConcluidasCurso} aulas)`,
        color: [4, 120, 87] as [number, number, number],
      },
      {
        x: marginX,
        y: kpiY + kpiH + 2,
        label: 'PROGRESSO DE MÓDULOS',
        rightText: `${indicadoresConsolidados.totalModulosCursados} Concluído · ${indicadoresConsolidados.totalModulosEmAndamento} Atual · ${indicadoresConsolidados.totalModulosPendentes} Pend.`,
        color: [30, 41, 59] as [number, number, number],
      },
      {
        x: marginX + kpiW + 3,
        y: kpiY + kpiH + 2,
        label: 'SITUAÇÃO ACADÊMICA GLOBAL',
        rightText: indicadoresConsolidados.situacaoAcademicaGlobal,
        color: [4, 120, 87] as [number, number, number],
      },
    ];

    summaryCards.forEach((sc) => {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(sc.x, sc.y, kpiW, kpiH, 2, 2, 'FD');

      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.3);
      doc.text(sc.label, sc.x + 3, sc.y + 6.7);

      doc.setTextColor(sc.color[0], sc.color[1], sc.color[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(sc.rightText, sc.x + kpiW - 3, sc.y + 6.7, { align: 'right' });
    });

    // 3. Tabela 1: Desempenho Consolidado por Módulo Curricular
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      '1. DESEMPENHO CONSOLIDADO POR MÓDULO CURRICULAR',
      marginX,
      84
    );

    autoTable(doc, {
      startY: 86.5,
      margin: { left: marginX, right: marginX },
      tableWidth: contentW,
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
        m.frequenciaFinal !== null
          ? `${formatNumericBR(m.frequenciaFinal)}%`
          : '—',
        m.ultimaAvaliacaoData || '—',
        m.situacao,
      ]),
      styles: {
        fontSize: 7.2,
        cellPadding: 2,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        textColor: [15, 23, 42],
      },
      headStyles: {
        fillColor: [0, 74, 141],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    const afterFirstTableY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
        ?.finalY || 145;

    // 4. Tabela 2: Histórico Detalhado de Avaliações por Aula
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      '2. HISTÓRICO DETALHADO DE AVALIAÇÕES POR AULA (MÓDULO ATUAL E CONCLUÍDOS)',
      marginX,
      afterFirstTableY + 8
    );

    autoTable(doc, {
      startY: afterFirstTableY + 10.5,
      margin: { left: marginX, right: marginX },
      tableWidth: contentW,
      head: [
        [
          'Módulo',
          'Etapa',
          'Identificação da Aula',
          'Avaliação / Conteúdo Avaliado',
          'Nota (0–100)',
          'Nota (0–10)',
          'Data',
        ],
      ],
      body: avaliacoesHistoricoCompleto.map((ev) => [
        ev.nomeModulo,
        ev.isModuloAtual ? 'Em Curso' : 'Concluído',
        ev.aulaIdentificacao,
        ev.descricaoAvaliacao,
        formatNumericBR(ev.notaEscala100),
        formatNumericBR(ev.notaEscala10),
        ev.dataAvaliacao,
      ]),
      styles: {
        fontSize: 7.2,
        cellPadding: 1.9,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        textColor: [15, 23, 42],
      },
      headStyles: {
        fillColor: [0, 40, 85],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
        ?.finalY || 245;

    if (finalY < 268) {
      doc.setDrawColor(148, 163, 184);
      doc.line(
        55,
        Math.min(274, finalY + 16),
        155,
        Math.min(274, finalY + 16)
      );
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(
        schoolInfo.responsavelAssinaturaNome,
        105,
        Math.min(279, finalY + 21),
        { align: 'center' }
      );
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `${schoolInfo.responsavelAssinaturaCargo} — ${student.unidadeEnsino}`,
        105,
        Math.min(283.5, finalY + 25),
        { align: 'center' }
      );
    }

    doc.save(
      `Boletim_Academico_${student.contrato}_${student.nomeCompleto.replace(/\s+/g, '_')}.pdf`
    );
    toast.success(
      'Boletim Acadêmico exportado',
      `Documento consolidado gerado com o mesmo design da pré-visualização para ${student.nomeCompleto}.`
    );
  };

  // Geração de PDF Oficial da Declaração de Matrícula (100% idêntico à pré-visualização A4)
  const handleDownloadDeclaracaoPdf = () => {
    if (!fichaAcademica) return;
    const { student } = fichaAcademica;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Moldura externa do documento A4 idêntica a declaracao-matricula-document
    const docX = 12;
    const docY = 10;
    const docW = 186;
    const docH = 277;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.roundedRect(docX, docY, docW, docH, 3.5, 3.5, 'FD');

    // Cabeçalho Timbrado Oficial (#004A8D + borda inferior âmbar #FBBF24)
    doc.setFillColor(0, 74, 141);
    doc.roundedRect(docX, docY, docW, 24, 3.5, 3.5, 'F');
    doc.rect(docX, docY + 19, docW, 5, 'F');
    doc.setFillColor(251, 191, 36);
    doc.rect(docX, docY + 23, docW, 1.3, 'F');

    const declLogoW = drawWhiteMicrolinsLogoInPdf(doc, docX + 8, docY + 7.5, 8);
    const unitTitleX = docX + 8 + declLogoW + 4;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(schoolInfo.nomeUnidade, unitTitleX, docY + 11.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(224, 242, 254);
    doc.setFontSize(7.8);
    doc.text(schoolInfo.razaoSocial, unitTitleX, docY + 16.2);

    doc.setTextColor(224, 242, 254);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      `Código da Unidade: #${student.codigoUnidade}`,
      docX + docW - 8,
      docY + 11.2,
      { align: 'right' }
    );
    doc.text(
      `Contrato: #${student.contrato}`,
      docX + docW - 8,
      docY + 16.2,
      { align: 'right' }
    );

    // Título Centralizado da Declaração
    doc.setTextColor(0, 40, 85);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('DECLARAÇÃO DE MATRÍCULA', 105, docY + 42, {
      align: 'center',
    });
    doc.setDrawColor(0, 74, 141);
    doc.setLineWidth(0.5);
    doc.line(82, docY + 45, 128, docY + 45);

    // Corpo Formal da Declaração Escolar Oficial (idêntico à pré-visualização)
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    const currentYear = new Date().getFullYear();
    const cpfText = customAuthorizedCpf.trim()
      ? `, inscrito(a) no CPF sob o nº ${customAuthorizedCpf.trim()}`
      : '';
    const paragraph1 = `Declaramos, para os devidos fins de comprovação escolar, apresentação institucional e acompanhamento pedagógico, que o(a) aluno(a) ${student.nomeCompleto}${cpfText}, encontra-se regularmente matriculado(a) nesta instituição de ensino sob a Matrícula / Contrato nº #${student.contrato}, no ano letivo de ${currentYear}.`;

    const paragraph2 = `O(A) discente frequenta o curso ${student.cursoMatriculado}, com início em ${student.dataMatricula}, na modalidade ${student.modalidade} (Turno: ${student.turno}), cursando atualmente a turma/módulo ${student.moduloAtual} nos horários programados (${student.diasHorariosResumo}), apresentando situação de matrícula ${student.situacaoMatricula}.`;

    const lines1 = doc.splitTextToSize(paragraph1, docW - 24);
    doc.text(lines1, docX + 12, docY + 58);

    const lines2 = doc.splitTextToSize(paragraph2, docW - 24);
    doc.text(lines2, docX + 12, docY + 84);

    // Quadro Institucional de Dados Cadastrais da Declaração com Foto Sincronizada
    const synthX = docX + 12;
    const synthY = docY + 114;
    const synthW = docW - 24;
    const synthH = 52;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.35);
    doc.roundedRect(synthX, synthY, synthW, synthH, 3, 3, 'FD');

    doc.setTextColor(0, 74, 141);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(
      'SÍNTESE OFICIAL DOS DADOS DA MATRÍCULA',
      synthX + 5,
      synthY + 7.5
    );

    // Foto 3x4 do aluno sincronizada à esquerda do quadro
    drawStudentPhotoBoxInPdf(
      doc,
      synthX + 5,
      synthY + 12,
      20,
      27,
      student.nomeCompleto,
      student.contrato,
      registeredStudentPhoto
    );

    // Grid 2x3 de dados à direita da foto
    const gridX = synthX + 30;
    const colWidth = (synthW - 35) / 2;

    const gridFields = [
      {
        col: 0,
        row: 0,
        label: 'Nome Completo do Aluno:',
        value: student.nomeCompleto,
        valueColor: [15, 23, 42] as [number, number, number],
      },
      {
        col: 1,
        row: 0,
        label: 'Matrícula / Código do Aluno:',
        value: `#${student.contrato}`,
        valueColor: [15, 23, 42] as [number, number, number],
      },
      {
        col: 0,
        row: 1,
        label: 'Curso / Série / Turma:',
        value: `${student.cursoMatriculado} · ${student.moduloAtual}`,
        valueColor: [15, 23, 42] as [number, number, number],
      },
      {
        col: 1,
        row: 1,
        label: 'Turno / Horário:',
        value: `${student.turno} (${student.diasHorariosResumo})`,
        valueColor: [30, 41, 59] as [number, number, number],
      },
      {
        col: 0,
        row: 2,
        label: 'Ano Letivo / Data de Início:',
        value: `${currentYear} · Início em ${student.dataMatricula}`,
        valueColor: [30, 41, 59] as [number, number, number],
      },
      {
        col: 1,
        row: 2,
        label: 'Situação Atual da Matrícula:',
        value: student.situacaoMatricula,
        valueColor: [4, 120, 87] as [number, number, number],
      },
    ];

    gridFields.forEach((gf) => {
      const fx = gridX + gf.col * colWidth;
      const fy = synthY + 15 + gf.row * 12;
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.text(gf.label, fx, fy);

      doc.setTextColor(gf.valueColor[0], gf.valueColor[1], gf.valueColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(gf.value.slice(0, 42), fx, fy + 4.2);
    });

    // Data de Emissão e Assinatura
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(
      `${getTodayExtendedDateBR(schoolInfo.cidadeUf)}.`,
      105,
      docY + 186,
      { align: 'center' }
    );

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.35);
    doc.line(58, docY + 216, 152, docY + 216);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(schoolInfo.responsavelAssinaturaNome, 105, docY + 222, {
      align: 'center',
    });

    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(
      `${schoolInfo.responsavelAssinaturaCargo} — ${student.unidadeEnsino}`,
      105,
      docY + 227,
      { align: 'center' }
    );

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7.2);
    doc.text(
      '(Espaço reservado para assinatura e validação institucional)',
      105,
      docY + 232,
      { align: 'center' }
    );

    // Rodapé Institucional (#002855) — SOMENTE o nome da escola
    doc.setFillColor(0, 40, 85);
    doc.roundedRect(docX, docY + docH - 13, docW, 13, 3.5, 3.5, 'F');
    doc.rect(docX, docY + docH - 13, docW, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(
      schoolInfo.nomeUnidade.toUpperCase(),
      105,
      docY + docH - 5.2,
      { align: 'center' }
    );

    doc.save(
      `Declaracao_Matricula_${student.contrato}_${student.nomeCompleto.replace(/\s+/g, '_')}.pdf`
    );
    toast.success(
      'Declaração de Matrícula emitida',
      `PDF oficial gerado com 100% de fidelidade visual para ${student.nomeCompleto} (#${student.contrato}).`
    );
  };

  // Exportação em PDF da FICHA DE ACOMPANHAMENTO E AVALIAÇÃO DO ALUNO (100% idêntico à pré-visualização A4 Paisagem)
  const handleExportAcompanhamentoPDF = () => {
    if (!selectedStudentItem || !acompanhamentoData) return;
    const student = selectedStudentItem;
    const ac = acompanhamentoData;

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    // Dimensões A4 Paisagem: 297mm largura x 210mm altura (Margens: 10mm -> área útil 277mm)
    const marginX = 10;
    const contentWidth = 277;

    // TÍTULO PRINCIPAL DO DOCUMENTO COM LOGO OFICIAL MICROLINS (idêntico à pré-visualização)
    doc.setFillColor(0, 74, 141);
    doc.roundedRect(marginX, 7, contentWidth, 14, 2.5, 2.5, 'F');

    const acLogoW = drawWhiteMicrolinsLogoInPdf(
      doc,
      marginX + 4.5,
      10.2,
      6.8
    );
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.25);
    doc.line(
      marginX + 4.5 + acLogoW + 3,
      10.2,
      marginX + 4.5 + acLogoW + 3,
      17.5
    );

    const acTitleX = marginX + 4.5 + acLogoW + 6;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(
      'FICHA DE ACOMPANHAMENTO E AVALIAÇÃO DO ALUNO',
      acTitleX,
      13.4
    );
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(224, 242, 254);
    doc.setFontSize(7.4);
    doc.text(
      'Documento Institucional Padronizado · Orientação A4 Paisagem · Preenchimento Manual e Digital',
      acTitleX,
      17.6
    );

    // Direita do cabeçalho: Matrícula/Contrato em âmbar + Data de Emissão
    doc.setTextColor(252, 211, 77);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.text(
      `Matrícula / Contrato #${ac.alunoContrato}`,
      marginX + contentWidth - 4.5,
      13.2,
      { align: 'right' }
    );
    doc.setTextColor(224, 242, 254);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      `Emissão: ${PORTAL_METADATA.dataReferencia}`,
      marginX + contentWidth - 4.5,
      17.5,
      { align: 'right' }
    );

    // SEÇÃO 1: IDENTIFICAÇÃO (COM FOTO SINCRONIZADA DO ALUNO + 5 CAMPOS PADRONIZADOS)
    const idBoxY = 23;
    const idBoxH = 24.5;
    doc.setFillColor(245, 247, 251);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, idBoxY, contentWidth, idBoxH, 2.2, 2.2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(37, 99, 235);
    doc.text('1. IDENTIFICAÇÃO', marginX + 3.5, idBoxY + 4.2);

    // Foto 3x4 do aluno sincronizada à esquerda da Seção 1
    drawStudentPhotoBoxInPdf(
      doc,
      marginX + 3.5,
      idBoxY + 5.6,
      14,
      17.5,
      ac.alunoNomeCompleto,
      ac.alunoContrato,
      registeredStudentPhoto
    );

    const fieldsX = marginX + 21;
    const rightColX = marginX + 195;

    // Linha 1: Nome da instituição | Período letivo
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.text('Nome da instituição:', fieldsX, idBoxY + 9.5);
    doc.setTextColor(23, 32, 51);
    doc.text(ac.instituicaoNome, fieldsX + 29, idBoxY + 9.5);

    doc.setTextColor(100, 116, 139);
    doc.text('Período letivo:', rightColX, idBoxY + 9.5);
    doc.setTextColor(23, 32, 51);
    doc.text(ac.periodoLetivo, rightColX + 20.5, idBoxY + 9.5);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(fieldsX, idBoxY + 11.3, marginX + contentWidth - 3.5, idBoxY + 11.3);

    // Linha 2: Nome completo do aluno | Professor(a) responsável
    doc.setTextColor(100, 116, 139);
    doc.text('Nome completo do aluno:', fieldsX, idBoxY + 15.8);
    doc.setTextColor(23, 32, 51);
    doc.text(ac.alunoNomeCompleto, fieldsX + 35, idBoxY + 15.8);

    doc.setTextColor(100, 116, 139);
    doc.text('Professor(a) responsável:', rightColX, idBoxY + 15.8);
    doc.setTextColor(23, 32, 51);
    doc.text(ac.professorResponsavel, rightColX + 36, idBoxY + 15.8);

    doc.line(fieldsX, idBoxY + 17.6, marginX + contentWidth - 3.5, idBoxY + 17.6);

    // Linha 3: Curso/Turma
    doc.setTextColor(100, 116, 139);
    doc.text('Curso/Turma:', fieldsX, idBoxY + 22);
    doc.setTextColor(23, 32, 51);
    doc.text(ac.cursoTurma, fieldsX + 20, idBoxY + 22);

    // SEÇÃO 2: REGISTRO DE CONTEÚDOS E AVALIAÇÕES (5 COLUNAS EXATAS)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(37, 99, 235);
    doc.text('2. REGISTRO DE CONTEÚDOS E AVALIAÇÕES', marginX, 51.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Módulo: ${ac.moduloNome} (${ac.totalAulasPrevistas} aulas programadas)`,
      marginX + contentWidth,
      51.5,
      { align: 'right' }
    );

    const tableBody = ac.aulas.map((a) => {
      const conteudoLabel = `${String(a.aulaNumero).padStart(2, '0')}. ${a.nomeAula}`;
      const dataIni =
        !isAcompanhamentoBlankMode && a.dataInicio
          ? a.dataInicio
          : '____/____/____';
      const dataFim =
        !isAcompanhamentoBlankMode && a.dataTermino
          ? a.dataTermino
          : '____/____/____';
      const notaVal =
        !isAcompanhamentoBlankMode && a.notaFormatada !== '—'
          ? a.notaFormatada
          : '______';
      const assinaturaVal =
        !isAcompanhamentoBlankMode && a.assinaturaVisto
          ? a.assinaturaVisto
          : '____________________';

      return [conteudoLabel, dataIni, dataFim, notaVal, assinaturaVal];
    });

    autoTable(doc, {
      startY: 53,
      margin: { left: marginX, right: marginX },
      tableWidth: contentWidth,
      head: [
        [
          'CONTEÚDO',
          'DATA DE INÍCIO',
          'DATA DE TÉRMINO',
          'NOTA',
          'ASSINATURA',
        ],
      ],
      body: tableBody,
      styles: {
        fontSize: 7,
        cellPadding: 1.15,
        lineColor: [203, 213, 225],
        lineWidth: 0.22,
        textColor: [23, 32, 51],
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.2,
        halign: 'center',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 127, halign: 'left', fontStyle: 'bold' },
        1: { cellWidth: 36, halign: 'center' },
        2: { cellWidth: 36, halign: 'center' },
        3: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 50, halign: 'center' },
      },
    });

    const tableEndY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
        ?.finalY || 148;

    // SEÇÃO 3: OBSERVAÇÕES GERAIS & SEÇÃO 4: RESULTADO FINAL
    const bottomSectionY = Math.min(tableEndY + 3, 154);
    const boxHeight = 23;
    const obsWidth = 183;
    const resX = marginX + obsWidth + 4;
    const resWidth = contentWidth - obsWidth - 4;

    // Bloco 3: OBSERVAÇÕES GERAIS
    doc.setFillColor(245, 247, 251);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(marginX, bottomSectionY, obsWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(37, 99, 235);
    doc.text('3. OBSERVAÇÕES GERAIS', marginX + 3.5, bottomSectionY + 4.6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Reposições de aulas · Aulas extras · Desenvolvimento do aluno · Alterações no cronograma',
      marginX + obsWidth - 3.5,
      bottomSectionY + 4.6,
      { align: 'right' }
    );

    if (observacoesGeraisTexto.trim() && !isAcompanhamentoBlankMode) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(23, 32, 51);
      const obsLines = doc.splitTextToSize(
        observacoesGeraisTexto.trim(),
        obsWidth - 7
      );
      doc.text(obsLines.slice(0, 3), marginX + 3.5, bottomSectionY + 10);
    } else {
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(
        marginX + 3.5,
        bottomSectionY + 10.5,
        marginX + obsWidth - 3.5,
        bottomSectionY + 10.5
      );
      doc.line(
        marginX + 3.5,
        bottomSectionY + 15.5,
        marginX + obsWidth - 3.5,
        bottomSectionY + 15.5
      );
      doc.line(
        marginX + 3.5,
        bottomSectionY + 20.5,
        marginX + obsWidth - 3.5,
        bottomSectionY + 20.5
      );
    }

    // Bloco 4: RESULTADO FINAL
    doc.setFillColor(245, 247, 251);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(resX, bottomSectionY, resWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(37, 99, 235);
    doc.text('4. RESULTADO FINAL', resX + 3.5, bottomSectionY + 4.6);

    doc.setTextColor(23, 32, 51);
    doc.setFontSize(7.6);
    doc.text('Média final do aluno:', resX + 3.5, bottomSectionY + 10);
    const mediaFinalStr =
      !isAcompanhamentoBlankMode && ac.mediaAtualEscala100 !== null
        ? `${formatNumericBR(ac.mediaAtualEscala100)} pts`
        : '__________________';
    doc.setTextColor(37, 99, 235);
    doc.text(mediaFinalStr, resX + resWidth - 3.5, bottomSectionY + 10, {
      align: 'right',
    });

    doc.setDrawColor(226, 232, 240);
    doc.line(
      resX + 3.5,
      bottomSectionY + 11.8,
      resX + resWidth - 3.5,
      bottomSectionY + 11.8
    );

    doc.setTextColor(23, 32, 51);
    doc.setFontSize(7.4);
    const markAprovado =
      !isAcompanhamentoBlankMode && ac.situacaoFinalAprovado ? 'X' : ' ';
    const markReprovado =
      !isAcompanhamentoBlankMode && ac.situacaoFinalReprovado ? 'X' : ' ';
    doc.text(
      `Situação final:   (${markAprovado}) Aprovado     (${markReprovado}) Reprovado`,
      resX + 3.5,
      bottomSectionY + 16.5
    );

    doc.line(
      resX + 3.5,
      bottomSectionY + 18.2,
      resX + resWidth - 3.5,
      bottomSectionY + 18.2
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Frequência: ${ac.frequenciaPercent}%`,
      resX + 3.5,
      bottomSectionY + 21.5
    );
    doc.text(
      `Aulas: ${ac.aulasConcluidas}/${ac.totalAulasPrevistas}`,
      resX + resWidth - 3.5,
      bottomSectionY + 21.5,
      { align: 'right' }
    );

    // SEÇÃO 5: ASSINATURAS E VALIDAÇÃO (Card bordado idêntico à pré-visualização)
    const sigBoxY = bottomSectionY + boxHeight + 2.5;
    const sigBoxH = 20;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(marginX, sigBoxY, contentWidth, sigBoxH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(37, 99, 235);
    doc.text('5. ASSINATURAS E VALIDAÇÃO', marginX + 3.5, sigBoxY + 4.5);

    const sigLineY = sigBoxY + 12;
    const colW = 78;
    const gapW = (contentWidth - 14 - colW * 3) / 2;

    const sig1X = marginX + 7;
    const sig2X = sig1X + colW + gapW;
    const sig3X = sig2X + colW + gapW;

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.line(sig1X, sigLineY, sig1X + colW, sigLineY);
    doc.line(sig2X, sigLineY, sig2X + colW, sigLineY);
    doc.line(sig3X, sigLineY, sig3X + colW, sigLineY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(23, 32, 51);
    doc.text('Professor(a) responsável', sig1X + colW / 2, sigLineY + 3.8, {
      align: 'center',
    });
    doc.text('Coordenação', sig2X + colW / 2, sigLineY + 3.8, {
      align: 'center',
    });
    doc.text('Responsável pelo aluno', sig3X + colW / 2, sigLineY + 3.8, {
      align: 'center',
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(100, 116, 139);
    doc.text(ac.professorResponsavel, sig1X + colW / 2, sigLineY + 7, {
      align: 'center',
    });
    doc.text(
      schoolInfo.responsavelAssinaturaNome,
      sig2X + colW / 2,
      sigLineY + 7,
      { align: 'center' }
    );
    doc.text(
      student.nomeResponsavel || student.nomeCompleto,
      sig3X + colW / 2,
      sigLineY + 7,
      { align: 'center' }
    );

    doc.save(
      `Ficha_Acompanhamento_Avaliacao_${ac.moduloNome.replace(/\s+/g, '_')}_${student.contrato}_${student.nomeCompleto.replace(/\s+/g, '_')}.pdf`
    );
    toast.success(
      'Ficha de Acompanhamento exportada',
      `PDF A4 Paisagem gerado com o mesmo design da pré-visualização para ${student.nomeCompleto} (${ac.moduloNome}).`
    );
  };

  // Compartilhamento digital (WhatsApp / Área de transferência)
  const buildDigitalShareSummary = (): string => {
    if (!fichaAcademica) return '';
    const { student, indicadoresConsolidados } = fichaAcademica;
    if (activeDocTab === 'ACOMPANHAMENTO' && acompanhamentoData) {
      return `*FICHA DE ACOMPANHAMENTO PEDAGÓGICO — MICROLINS (${student.unidadeEnsino})*\n\nAluno(a): *${student.nomeCompleto}* (Contrato *#${student.contrato}*)\nCurso: *${student.cursoMatriculado}*\nMódulo: *${acompanhamentoData.moduloNome}*\nEducador: *${acompanhamentoData.educadorNome}*\nTurma: *${acompanhamentoData.diaSemanaTurma}* (${acompanhamentoData.horarioTurma}) · Sala *${acompanhamentoData.salaNome}*\nAulas Dadas: *${acompanhamentoData.aulasConcluidas}/${acompanhamentoData.totalAulasPrevistas}* | Frequência: *${acompanhamentoData.frequenciaPercent}%*\nMédia no Módulo: *${acompanhamentoData.mediaAtualEscala10 !== null ? acompanhamentoData.mediaAtualEscala10 : 'Em avaliação'}*\nSituação Pedagógica: *${acompanhamentoData.situacaoPedagogica}*`;
    }
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
          {/* Cabeçalho Institucional da Ficha Individual com Logo Oficial Microlins */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00386B] bg-gradient-to-r from-[#004A8D] to-[#002855] px-6 py-4 text-white">
              <div className="flex items-center gap-3">
                <img
                  src="/assets/aistudio/logo-microlins_6400203f.png"
                  alt="Microlins"
                  data-testid="ficha-search-microlins-logo"
                  className="h-7 w-auto object-contain brightness-0 invert"
                />
                <div className="h-5 w-px bg-white/25" />
                <div>
                  <span className="block text-xs font-extrabold tracking-wider uppercase">
                    Secretaria Acadêmica & Documentação Oficial
                  </span>
                  <span className="block text-[11px] text-sky-200">
                    Unidade: {unidadeAtual} · Emissão Padronizada
                  </span>
                </div>
              </div>
              <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-1 font-mono text-xs font-bold text-amber-300 tabular-nums">
                {studentDirectory.length} alunos ativos
              </span>
            </div>

            <div className="p-6 sm:p-8">
              <div className="mx-auto max-w-2xl text-center">
                <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#004A8D]/10 text-[#004A8D] dark:bg-sky-500/15 dark:text-sky-400">
                  <GraduationCap className="h-6 w-6" />
                </div>

                <h1
                  data-testid="ficha-individual-main-title"
                  className="mt-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white"
                >
                  Ficha Individual do Aluno
                </h1>

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Consulte o Boletim Acadêmico, Ficha de Acompanhamento A4, Carteirinha Estudantil ou Declaração de Matrícula com identificação visual sincronizada
                </p>

                {/* Atalho integrado à Barra de Pesquisa Única do Cabeçalho */}
                <div className="mt-5 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    data-testid="ficha-focus-header-search-btn"
                    onClick={() => onFocusHeaderSearch?.()}
                    className="btn-press inline-flex h-10 items-center gap-2.5 rounded-xl bg-[#004A8D] px-5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#00386B]"
                  >
                    <Search className="h-4 w-4 shrink-0 text-sky-200" />
                    <span>
                      {searchQuery.trim()
                        ? `Filtrando por "${searchQuery}" no cabeçalho`
                        : 'Selecionar Aluno na Pesquisa do Cabeçalho'}
                    </span>
                    <kbd className="shrink-0 whitespace-nowrap rounded border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-sky-100">
                      Ctrl + K
                    </kbd>
                  </button>

                  <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Unidade: {unidadeAtual}</span>
                    <span>·</span>
                    <span>
                      Utilize a barra de pesquisa única no cabeçalho superior para localizar o aluno por contrato ou nome
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
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <SmartAvatar
                              name={item.nomeCompleto}
                              contrato={item.contrato}
                              size="md"
                              statusDot="success"
                            />
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
          </div>
        </section>
      ) : (
        /* =====================================================================
           ESTADO 2: FICHA INDIVIDUAL DO ALUNO SELECIONADO
           Padronizada com Logo Oficial da Microlins, Foto do Aluno em Destaque
           (sincronizada com o Kanban e todos os documentos) e Seções Categorizadas
           ===================================================================== */
        <section
          data-testid="ficha-individual-loaded-student"
          className="space-y-4"
        >
          {/* Input global oculto para upload/atualização de foto vinculada ao cadastro do aluno */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />

          {/* FICHA INDIVIDUAL DO ALUNO — CABEÇALHO INSTITUCIONAL E IDENTIFICAÇÃO CATEGORIZADA */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs print:hidden dark:border-slate-800 dark:bg-slate-900">
            {/* Faixa Superior Institucional com Logo Oficial Microlins */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00386B] bg-gradient-to-r from-[#004A8D] via-[#003B70] to-[#002855] px-5 py-3 text-white">
              <div className="flex flex-wrap items-center gap-3">
                <img
                  src="/assets/aistudio/logo-microlins_6400203f.png"
                  alt="Logo Oficial Microlins"
                  data-testid="ficha-individual-microlins-logo"
                  className="h-6 w-auto object-contain brightness-0 invert"
                />
                <div className="hidden h-4 w-px bg-white/25 sm:block" />
                <div>
                  <span className="text-xs font-extrabold tracking-wider uppercase">
                    Ficha Individual do Aluno · Prontuário Acadêmico Oficial
                  </span>
                  <span className="ml-2 hidden rounded bg-white/15 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-100 sm:inline-block">
                    Unidade #{fichaAcademica.student.codigoUnidade} · {fichaAcademica.student.unidadeEnsino}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {studentAnsweredNpsInvite && (
                  <span
                    data-testid="ficha-nps-answered-badge"
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-2.5 text-[11px] font-bold text-emerald-100 whitespace-nowrap"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                    <span>
                      NPS Respondido
                      {typeof studentAnsweredNpsInvite.notaNps === 'number'
                        ? ` (${studentAnsweredNpsInvite.notaNps}/10)`
                        : ''}
                    </span>
                  </span>
                )}

                <button
                  type="button"
                  data-testid="ficha-change-student-btn"
                  onClick={handleClearSelectedStudent}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-bold text-white transition-colors hover:bg-white/20 whitespace-nowrap"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Pesquisar Outro Aluno</span>
                </button>
              </div>
            </div>

            {/* Corpo de Identificação do Aluno: Foto em Posição de Destaque + Categorias Bem Delimitadas */}
            <div className="p-4 sm:p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                {/* Coluna 1: Identificação Visual do Aluno em Destaque (Sincronizada com Cadastro/Kanban) */}
                <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-center">
                  <StudentDocumentPhoto
                    name={fichaAcademica.student.nomeCompleto}
                    contrato={fichaAcademica.student.contrato}
                    photoUrl={customStudentPhotoUrl}
                    size="lg"
                    dataTestId="ficha-individual-student-photo"
                  />
                  <div className="flex flex-col gap-1.5 sm:items-center">
                    <button
                      type="button"
                      data-testid="ficha-upload-photo-btn"
                      onClick={() => photoInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition-colors hover:border-[#004A8D] hover:bg-white hover:text-[#004A8D] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400"
                      title="A foto cadastrada aqui é sincronizada automaticamente no Kanban de Alunos, Boletim, Ficha de Acompanhamento e Carteirinha Estudantil"
                    >
                      <Camera className="h-3.5 w-3.5 text-[#004A8D] dark:text-sky-400" />
                      <span>
                        {registeredStudentPhoto ? 'Trocar Foto' : 'Cadastrar Foto'}
                      </span>
                    </button>
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                      Sincronizada c/ Kanban
                    </span>
                  </div>
                </div>

                {/* Coluna 2: Informações Agrupadas por Categorias Padronizadas */}
                <div className="min-w-0 flex-1 space-y-3.5">
                  {/* Linha Principal: Nome Completo + Matrícula + Status */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-[#004A8D]/10 px-2 py-0.5 font-mono text-xs font-extrabold text-[#004A8D] tabular-nums dark:bg-sky-500/15 dark:text-sky-300">
                          CONTRATO #{fichaAcademica.student.contrato}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {fichaAcademica.student.situacaoMatricula}
                        </span>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Início: {fichaAcademica.student.dataMatricula}
                        </span>
                      </div>
                      <h1
                        data-testid="ficha-selected-student-name"
                        className="mt-1 text-lg font-black tracking-tight text-slate-900 sm:text-xl dark:text-white"
                      >
                        {fichaAcademica.student.nomeCompleto}
                      </h1>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-right dark:border-slate-800 dark:bg-slate-800/60">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Média Geral
                        </span>
                        <span className="font-mono text-sm font-black text-[#004A8D] tabular-nums dark:text-sky-400">
                          {formatNumericBR(
                            fichaAcademica.indicadoresConsolidados.mediaGeralCursoEscala100
                          )}{' '}
                          pts
                        </span>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-right dark:border-slate-800 dark:bg-slate-800/60">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Frequência
                        </span>
                        <span className="font-mono text-sm font-black text-emerald-700 tabular-nums dark:text-emerald-400">
                          {formatNumericBR(
                            fichaAcademica.indicadoresConsolidados.frequenciaGeralConsolidada
                          )}
                          %
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Grid de 4 Categorias de Dados do Aluno */}
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    {/* Categoria 1: Dados Cadastrais */}
                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                      <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[#004A8D] dark:text-sky-400">
                        1. Dados Cadastrais
                      </span>
                      <p className="mt-1 text-xs font-bold text-slate-900 dark:text-white">
                        Matrícula #{fichaAcademica.student.contrato}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                        Resp.:{' '}
                        <span className="font-semibold">
                          {fichaAcademica.student.nomeResponsavel || 'O próprio aluno'}
                        </span>
                      </p>
                    </div>

                    {/* Categoria 2: Curso e Formação */}
                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                      <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[#004A8D] dark:text-sky-400">
                        2. Curso & Formação
                      </span>
                      <p
                        className="mt-1 text-xs font-bold text-slate-900 dark:text-white"
                        title={fichaAcademica.student.cursoMatriculado}
                      >
                        {fichaAcademica.student.cursoMatriculado}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                        Módulo Atual:{' '}
                        <span className="font-semibold">
                          {fichaAcademica.student.moduloAtual}
                        </span>
                      </p>
                    </div>

                    {/* Categoria 3: Turma, Horário e Modalidade */}
                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                      <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[#004A8D] dark:text-sky-400">
                        3. Turma & Horário
                      </span>
                      <p className="mt-1 text-xs font-bold text-slate-900 dark:text-white">
                        {fichaAcademica.student.diasHorariosResumo}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                        Turno: <span className="font-semibold">{fichaAcademica.student.turno}</span> ·{' '}
                        {fichaAcademica.student.modalidade}
                      </p>
                    </div>

                    {/* Categoria 4: Situação Acadêmica Global */}
                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                      <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[#004A8D] dark:text-sky-400">
                        4. Desempenho Global
                      </span>
                      <p className="mt-1 text-xs font-bold text-slate-900 dark:text-white">
                        {fichaAcademica.indicadoresConsolidados.situacaoAcademicaGlobal}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                        {fichaAcademica.indicadoresConsolidados.totalModulosCursados} concluído(s) ·{' '}
                        {fichaAcademica.indicadoresConsolidados.totalAulasConcluidasCurso} aulas
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seletor das 4 Áreas de Documentos da Ficha Individual */}
              <div
                role="tablist"
                aria-label="Funcionalidades da Ficha Individual"
                className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3.5 sm:grid-cols-4 dark:border-slate-800"
              >
                <button
                  type="button"
                  role="tab"
                  data-testid="ficha-tab-boletim"
                  aria-selected={activeDocTab === 'BOLETIM'}
                  onClick={() => handleChangeDocTab('BOLETIM')}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-all ${
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
                        Notas e histórico
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  role="tab"
                  data-testid="ficha-tab-acompanhamento"
                  aria-selected={activeDocTab === 'ACOMPANHAMENTO'}
                  onClick={() => handleChangeDocTab('ACOMPANHAMENTO')}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-all ${
                    activeDocTab === 'ACOMPANHAMENTO'
                      ? 'border-[#004A8D] bg-[#004A8D] text-white shadow-xs'
                      : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ClipboardList
                      className={`h-4 w-4 shrink-0 ${
                        activeDocTab === 'ACOMPANHAMENTO'
                          ? 'text-amber-300'
                          : 'text-purple-600 dark:text-purple-400'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-bold whitespace-nowrap">
                        Ficha de Acompanhamento
                      </div>
                      <div
                        className={`text-[10px] ${
                          activeDocTab === 'ACOMPANHAMENTO'
                            ? 'text-sky-100'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        Aulas e avaliação A4
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  role="tab"
                  data-testid="ficha-tab-carteirinha"
                  aria-selected={activeDocTab === 'CARTEIRINHA'}
                  onClick={() => handleChangeDocTab('CARTEIRINHA')}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-all ${
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
                        Frente e verso ID-1
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  role="tab"
                  data-testid="ficha-tab-declaracao"
                  aria-selected={activeDocTab === 'DECLARACAO'}
                  onClick={() => handleChangeDocTab('DECLARACAO')}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-all ${
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
                        Declaração
                      </div>
                      <div
                        className={`text-[10px] ${
                          activeDocTab === 'DECLARACAO'
                            ? 'text-sky-100'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        Oficial A4 e PDF
                      </div>
                    </div>
                  </div>
                </button>
              </div>
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
                    Carteirinha Estudantil Oficial (Padrão ISO/IEC 7810 ID-1)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Integrada automaticamente com a logo oficial Microlins e a foto cadastrada do aluno
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>
                      {registeredStudentPhoto ? 'Trocar Foto 3x4' : 'Inserir Foto 3x4'}
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
                  {/* Topo Institucional Microlins */}
                  <div className="flex items-center justify-between bg-gradient-to-r from-[#004A8D] to-[#00386B] px-4 py-2.5 text-white">
                    <div className="flex items-center gap-2.5">
                      <img
                        src="/assets/aistudio/logo-microlins_6400203f.png"
                        alt="Microlins"
                        data-testid="carteirinha-microlins-logo"
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

                  {/* Corpo Principal da Frente com Foto Sincronizada do Cadastro */}
                  <div className="flex flex-1 items-center gap-3.5 px-4 py-2.5">
                    {/* Foto 3x4 Sincronizada com o Cadastro / Kanban */}
                    <div className="flex shrink-0 flex-col items-center">
                      <StudentDocumentPhoto
                        name={fichaAcademica.student.nomeCompleto}
                        contrato={fichaAcademica.student.contrato}
                        photoUrl={customStudentPhotoUrl}
                        size="md"
                        dataTestId="carteirinha-student-photo"
                      />
                      <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-extrabold text-emerald-700 uppercase dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {fichaAcademica.student.situacaoMatricula}
                      </span>
                    </div>

                    {/* Dados Essenciais do Estudante (Sem Cortes Indevidos) */}
                    <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                      <div>
                        <span className="block text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                          Nome Completo do Aluno
                        </span>
                        <p
                          data-testid="carteirinha-student-name"
                          className="line-clamp-2 text-xs sm:text-sm font-black text-slate-900 leading-tight dark:text-white"
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
                          className="line-clamp-1 text-xs font-bold text-[#004A8D] leading-snug dark:text-sky-400"
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
                    <div className="flex items-center gap-2">
                      <img
                        src="/assets/aistudio/logo-microlins_6400203f.png"
                        alt="Microlins"
                        className="h-4 w-auto object-contain brightness-0 invert"
                      />
                      <div className="h-3 w-px bg-white/25" />
                      <div>
                        <div className="text-[11px] font-extrabold tracking-wider uppercase leading-tight">
                          Validação Acadêmica Institucional
                        </div>
                        <div className="text-[9px] text-sky-200 leading-tight">
                          Registro Oficial de Matrícula Ativa
                        </div>
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
                    Boletim Acadêmico Consolidado e Ficha Individual
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Histórico oficial de notas, frequência e evolução curricular por módulo
                  </p>
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

              {/* Cabeçalho Institucional do Documento Boletim Acadêmico (Visível na Tela e na Impressão) */}
              <div
                data-testid="boletim-institutional-header"
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#004A8D] px-5 py-3 text-white">
                  <div className="flex items-center gap-3">
                    <img
                      src="/assets/aistudio/logo-microlins_6400203f.png"
                      alt="Logo Oficial Microlins"
                      data-testid="boletim-microlins-logo"
                      className="h-6 w-auto object-contain brightness-0 invert"
                    />
                    <div className="h-4 w-px bg-white/25" />
                    <div>
                      <h3 className="text-xs sm:text-sm font-black tracking-wide uppercase">
                        BOLETIM ACADÊMICO E FICHA INDIVIDUAL DO ALUNO
                      </h3>
                      <p className="text-[11px] text-sky-100">
                        {schoolInfo.nomeUnidade} · Emissão Oficial: {PORTAL_METADATA.dataReferencia}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-md bg-white/15 px-2.5 py-1 font-mono text-xs font-bold text-amber-300 tabular-nums">
                    Matrícula #{fichaAcademica.student.contrato}
                  </span>
                </div>

                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <StudentDocumentPhoto
                    name={fichaAcademica.student.nomeCompleto}
                    contrato={fichaAcademica.student.contrato}
                    photoUrl={customStudentPhotoUrl}
                    size="md"
                    dataTestId="boletim-student-photo"
                  />
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-2.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                      <span className="block text-[10px] font-bold uppercase text-slate-400">
                        Nome Completo do Aluno
                      </span>
                      <span className="mt-0.5 block font-bold text-slate-900 dark:text-white">
                        {fichaAcademica.student.nomeCompleto}
                      </span>
                    </div>
                    <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                      <span className="block text-[10px] font-bold uppercase text-slate-400">
                        Curso / Formação
                      </span>
                      <span className="mt-0.5 block font-bold text-[#004A8D] dark:text-sky-400">
                        {fichaAcademica.student.cursoMatriculado}
                      </span>
                    </div>
                    <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                      <span className="block text-[10px] font-bold uppercase text-slate-400">
                        Módulo Atual & Horário
                      </span>
                      <span className="mt-0.5 block font-semibold text-slate-800 dark:text-slate-200">
                        {fichaAcademica.student.moduloAtual} ({fichaAcademica.student.diasHorariosResumo})
                      </span>
                    </div>
                  </div>
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
              FUNCIONALIDADE 2.3: FICHA DE ACOMPANHAMENTO E AVALIAÇÃO DO ALUNO
             ================================================================= */}
          {activeDocTab === 'ACOMPANHAMENTO' &&
            selectedStudentItem &&
            acompanhamentoData && (
            <div data-testid="ficha-section-acompanhamento" className="space-y-4">
              {/* Barra de Ações da Ficha de Acompanhamento (Oculta na Impressão) */}
              <div className="flex flex-wrap items-center justify-between gap-3 glass-card px-5 py-3.5 print:hidden">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <h2 className="typo-subtitle text-[var(--text-primary)] flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-[var(--color-primary)]" />
                      Ficha de Acompanhamento e Avaliação do Aluno (A4 Paisagem)
                    </h2>
                    <p className="typo-meta text-[var(--text-secondary)]">
                      Módulo:{' '}
                      <span className="font-semibold text-[var(--text-primary)]">
                        {acompanhamentoData.moduloNome}
                      </span>{' '}
                      · Preenchimento digital e manual padronizado
                    </p>
                  </div>

                  {/* Seletor de Módulo da Trilha */}
                  {fichaAcademica && fichaAcademica.modulos.length > 1 && (
                    <div className="flex items-center gap-2 pl-3 border-l border-[var(--border-color)]">
                      <span className="typo-meta font-semibold text-[var(--text-secondary)]">
                        Módulo:
                      </span>
                      <select
                        value={selectedAcompanhamentoModuleName || acompanhamentoData.moduloNome}
                        onChange={(e) => setSelectedAcompanhamentoModuleName(e.target.value)}
                        className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors focus:border-[var(--color-primary)] focus:outline-none"
                      >
                        {fichaAcademica.modulos.map((m) => (
                          <option key={m.id} value={m.nomeModulo}>
                            {m.nomeModulo} {m.isModuloAtual ? '(Atual)' : `(${m.statusModulo})`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Alternador de Modo: Preenchido vs Em Branco */}
                  <button
                    type="button"
                    onClick={() => setIsAcompanhamentoBlankMode((prev) => !prev)}
                    className={`btn-press inline-flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-colors ${
                      isAcompanhamentoBlankMode
                        ? 'border-[var(--color-secondary)] bg-indigo-500/15 text-[var(--color-secondary)]'
                        : 'border-[var(--border-color)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:border-[var(--color-primary)]'
                    }`}
                    title="Alterna entre exibir os dados já lançados no Portal ou uma grade limpa para preenchimento manual em sala"
                  >
                    <span>
                      {isAcompanhamentoBlankMode
                        ? 'Modo: Preenchimento Manual (Em Branco)'
                        : 'Modo: Dados do Portal Pré-Carregados'}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="acompanhamento-print-btn"
                    onClick={() => window.print()}
                    className="btn-press inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--color-primary)]"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Imprimir (A4)</span>
                  </button>

                  <button
                    type="button"
                    data-testid="acompanhamento-download-pdf-btn"
                    onClick={handleExportAcompanhamentoPDF}
                    className="btn-press inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:opacity-95"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Baixar PDF (A4 Paisagem)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyDigitalShare}
                    className="btn-press inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--color-primary)]"
                  >
                    {copiedSummaryNotice ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#16A34A]" />
                        <span className="text-[#16A34A]">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar Resumo</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* =========================================================================
                  DOCUMENTO INSTITUCIONAL PADRONIZADO (A4 PAISAGEM — 5 SEÇÕES OFICIAIS)
                 ========================================================================= */}
              <div
                id="printable-ficha-acompanhamento-doc"
                data-testid="ficha-acompanhamento-standardized-doc"
                className="mx-auto w-full max-w-[1120px] rounded-2xl border border-[var(--border-color)] bg-white p-6 sm:p-8 text-slate-900 shadow-lg print:m-0 print:w-full print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none dark:bg-[#172033] dark:text-slate-100 print:dark:bg-white print:dark:text-slate-900"
              >
                {/* TÍTULO PRINCIPAL DO DOCUMENTO COM LOGO OFICIAL MICROLINS */}
                <div className="mb-5 flex flex-col gap-3 rounded-xl bg-gradient-to-r from-[#004A8D] to-[#002855] px-5 py-3.5 text-white sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <img
                      src="/assets/aistudio/logo-microlins_6400203f.png"
                      alt="Logo Oficial Microlins"
                      data-testid="acompanhamento-microlins-logo"
                      className="h-7 w-auto object-contain brightness-0 invert"
                    />
                    <div className="hidden h-6 w-px bg-white/25 sm:block" />
                    <div>
                      <h3 className="text-base sm:text-lg font-black tracking-tight uppercase">
                        FICHA DE ACOMPANHAMENTO E AVALIAÇÃO DO ALUNO
                      </h3>
                      <p className="text-[11px] font-medium text-sky-100">
                        Documento Institucional Padronizado · Orientação A4 Paisagem · Preenchimento Manual e Digital
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right font-mono text-xs text-sky-100">
                    <div className="font-bold text-amber-300">
                      Matrícula / Contrato #{acompanhamentoData.alunoContrato}
                    </div>
                    <div>Emissão: {PORTAL_METADATA.dataReferencia}</div>
                  </div>
                </div>

                {/* SEÇÃO 1: IDENTIFICAÇÃO (COM FOTO SINCRONIZADA DO ALUNO) */}
                <div
                  data-testid="acompanhamento-section-identificacao"
                  className="mb-5 rounded-xl border border-slate-200 bg-[#F5F7FB] p-4 dark:border-slate-700 dark:bg-slate-800/60 print:bg-slate-50 print:border-slate-300"
                >
                  <div className="text-xs font-bold uppercase tracking-wider text-[#2563EB] dark:text-blue-400 mb-3">
                    1. IDENTIFICAÇÃO
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    {/* Foto do Aluno vinculada automaticamente ao cadastro */}
                    <div className="flex shrink-0 flex-col items-center">
                      <StudentDocumentPhoto
                        name={acompanhamentoData.alunoNomeCompleto}
                        contrato={acompanhamentoData.alunoContrato}
                        photoUrl={customStudentPhotoUrl}
                        size="md"
                        dataTestId="acompanhamento-student-photo"
                      />
                    </div>

                    {/* 5 Campos Padronizados de Identificação */}
                    <div className="min-w-0 flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5 text-sm">
                      <div className="lg:col-span-2 flex flex-wrap items-baseline gap-1.5 border-b border-slate-200/80 dark:border-slate-700 pb-1.5">
                        <span className="font-semibold text-[#64748B] dark:text-slate-400 shrink-0">
                          Nome da instituição:
                        </span>
                        <span className="font-bold text-[#172033] dark:text-white">
                          {acompanhamentoData.instituicaoNome}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-baseline gap-1.5 border-b border-slate-200/80 dark:border-slate-700 pb-1.5">
                        <span className="font-semibold text-[#64748B] dark:text-slate-400 shrink-0">
                          Período letivo:
                        </span>
                        <span className="font-bold font-mono text-[#172033] dark:text-white">
                          {acompanhamentoData.periodoLetivo}
                        </span>
                      </div>

                      <div className="lg:col-span-2 flex flex-wrap items-baseline gap-1.5 border-b border-slate-200/80 dark:border-slate-700 pb-1.5">
                        <span className="font-semibold text-[#64748B] dark:text-slate-400 shrink-0">
                          Nome completo do aluno:
                        </span>
                        <span className="font-bold text-[#172033] dark:text-white">
                          {acompanhamentoData.alunoNomeCompleto}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-baseline gap-1.5 border-b border-slate-200/80 dark:border-slate-700 pb-1.5">
                        <span className="font-semibold text-[#64748B] dark:text-slate-400 shrink-0">
                          Professor(a) responsável:
                        </span>
                        <span className="font-bold text-[#172033] dark:text-white">
                          {acompanhamentoData.professorResponsavel}
                        </span>
                      </div>

                      <div className="lg:col-span-3 flex flex-wrap items-baseline gap-1.5 pt-0.5">
                        <span className="font-semibold text-[#64748B] dark:text-slate-400 shrink-0">
                          Curso/Turma:
                        </span>
                        <span className="font-bold text-[#172033] dark:text-white">
                          {acompanhamentoData.cursoTurma}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SEÇÃO 2: REGISTRO DE CONTEÚDOS E AVALIAÇÕES (5 COLUNAS EXATAS) */}
                <div
                  data-testid="acompanhamento-section-conteudos"
                  className="mb-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#2563EB] dark:text-blue-400">
                      2. REGISTRO DE CONTEÚDOS E AVALIAÇÕES
                    </span>
                    <span className="text-xs text-[#64748B] dark:text-slate-400 font-mono">
                      Módulo: {acompanhamentoData.moduloNome} ({acompanhamentoData.totalAulasPrevistas} aulas programadas)
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-300 dark:border-slate-700">
                    <table
                      data-testid="acompanhamento-5col-table"
                      className="w-full text-left text-sm border-collapse"
                    >
                      <thead>
                        <tr className="bg-[#2563EB] text-white text-xs uppercase font-bold tracking-wide">
                          <th className="py-2.5 px-3.5 border-r border-white/20 w-[46%]">
                            Conteúdo
                          </th>
                          <th className="py-2.5 px-3 text-center border-r border-white/20 w-[13%]">
                            Data de início
                          </th>
                          <th className="py-2.5 px-3 text-center border-r border-white/20 w-[13%]">
                            Data de término
                          </th>
                          <th className="py-2.5 px-3 text-center border-r border-white/20 w-[10%]">
                            Nota
                          </th>
                          <th className="py-2.5 px-3 text-center w-[18%]">
                            Assinatura
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700/80 text-[13px]">
                        {acompanhamentoData.aulas.map((a) => {
                          const showPrefilled = !isAcompanhamentoBlankMode;
                          return (
                            <tr
                              key={a.aulaNumero}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              {/* 1. Conteúdo */}
                              <td className="py-2 px-3.5 font-medium text-[#172033] dark:text-slate-100 border-r border-slate-200 dark:border-slate-700/80">
                                <span className="font-mono font-bold text-[#64748B] dark:text-slate-400 mr-2">
                                  {String(a.aulaNumero).padStart(2, '0')}.
                                </span>
                                <span className="font-semibold">
                                  {a.nomeAula}
                                </span>
                              </td>

                              {/* 2. Data de início */}
                              <td className="py-2 px-3 text-center font-mono text-xs text-[#172033] dark:text-slate-200 border-r border-slate-200 dark:border-slate-700/80 tabular-nums">
                                {showPrefilled && a.dataInicio ? (
                                  <span>{a.dataInicio}</span>
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600 select-none">
                                    ____/____/____
                                  </span>
                                )}
                              </td>

                              {/* 3. Data de término */}
                              <td className="py-2 px-3 text-center font-mono text-xs text-[#172033] dark:text-slate-200 border-r border-slate-200 dark:border-slate-700/80 tabular-nums">
                                {showPrefilled && a.dataTermino ? (
                                  <span>{a.dataTermino}</span>
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600 select-none">
                                    ____/____/____
                                  </span>
                                )}
                              </td>

                              {/* 4. Nota */}
                              <td className="py-2 px-3 text-center font-mono font-bold text-[#172033] dark:text-amber-300 border-r border-slate-200 dark:border-slate-700/80 tabular-nums">
                                {showPrefilled && a.notaFormatada !== '—' ? (
                                  <span>{a.notaFormatada}</span>
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600 select-none">
                                    ______
                                  </span>
                                )}
                              </td>

                              {/* 5. Assinatura */}
                              <td className="py-2 px-3 text-center font-mono text-xs text-[#172033] dark:text-slate-200">
                                {showPrefilled && a.assinaturaVisto ? (
                                  <span className="inline-flex items-center gap-1 font-semibold text-[#16A34A] dark:text-emerald-400">
                                    <Check className="w-3.5 h-3.5" />
                                    {a.assinaturaVisto}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600 select-none">
                                    ____________________
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* SEÇÃO 3: OBSERVAÇÕES GERAIS & SEÇÃO 4: RESULTADO FINAL */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
                  {/* 3. OBSERVAÇÕES GERAIS */}
                  <div
                    data-testid="acompanhamento-section-observacoes"
                    className="lg:col-span-2 rounded-xl border border-slate-300 bg-[#F5F7FB]/70 p-4 dark:border-slate-700 dark:bg-slate-800/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#2563EB] dark:text-blue-400">
                        3. OBSERVAÇÕES GERAIS
                      </span>
                      <span className="text-[11px] text-[#64748B] dark:text-slate-400">
                        Reposições de aulas · Aulas extras · Desenvolvimento do aluno · Alterações no cronograma
                      </span>
                    </div>

                    <textarea
                      data-testid="acompanhamento-observacoes-textarea"
                      rows={3}
                      value={observacoesGeraisTexto}
                      onChange={(e) => setObservacoesGeraisTexto(e.target.value)}
                      placeholder="Espaço destinado ao registro de reposições de aulas, aulas extras, observações sobre o desenvolvimento do aluno, alterações no cronograma ou outras informações relevantes..."
                      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-[#172033] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white print:hidden"
                    />

                    {/* Visualização pautada para impressão ou quando em branco */}
                    <div className="hidden print:block space-y-4 pt-2">
                      {observacoesGeraisTexto.trim() ? (
                        <p className="text-xs text-slate-900 whitespace-pre-wrap">
                          {observacoesGeraisTexto}
                        </p>
                      ) : (
                        <>
                          <div className="border-b border-slate-300 h-5" />
                          <div className="border-b border-slate-300 h-5" />
                          <div className="border-b border-slate-300 h-5" />
                        </>
                      )}
                    </div>
                  </div>

                  {/* 4. RESULTADO FINAL */}
                  <div
                    data-testid="acompanhamento-section-resultado-final"
                    className="rounded-xl border border-slate-300 bg-[#F5F7FB] p-4 flex flex-col justify-between dark:border-slate-700 dark:bg-slate-800/60"
                  >
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#2563EB] dark:text-blue-400 block mb-3">
                        4. RESULTADO FINAL
                      </span>

                      <div className="space-y-3 text-sm">
                        <div className="flex items-baseline justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                          <span className="font-semibold text-[#172033] dark:text-slate-200">
                            Média final do aluno:
                          </span>
                          <span className="font-mono font-bold text-base text-[#2563EB] dark:text-blue-400 tabular-nums">
                            {!isAcompanhamentoBlankMode &&
                            acompanhamentoData.mediaAtualEscala100 !== null
                              ? `${formatNumericBR(acompanhamentoData.mediaAtualEscala100)} pts`
                              : '__________________'}
                          </span>
                        </div>

                        <div className="pt-1">
                          <span className="font-semibold text-[#172033] dark:text-slate-200 block mb-2">
                            Situação final:
                          </span>
                          <div className="flex items-center gap-6 font-mono text-sm font-bold">
                            <span
                              className={
                                !isAcompanhamentoBlankMode &&
                                acompanhamentoData.situacaoFinalAprovado
                                  ? 'text-[#16A34A] dark:text-emerald-400'
                                  : 'text-[#172033] dark:text-slate-300'
                              }
                            >
                              ({' '}
                              {!isAcompanhamentoBlankMode &&
                              acompanhamentoData.situacaoFinalAprovado
                                ? 'X'
                                : ' '}
                              ) Aprovado
                            </span>
                            <span
                              className={
                                !isAcompanhamentoBlankMode &&
                                acompanhamentoData.situacaoFinalReprovado
                                  ? 'text-[#DC2626] dark:text-red-400'
                                  : 'text-[#172033] dark:text-slate-300'
                              }
                            >
                              ({' '}
                              {!isAcompanhamentoBlankMode &&
                              acompanhamentoData.situacaoFinalReprovado
                                ? 'X'
                                : ' '}
                              ) Reprovado
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-200/80 dark:border-slate-700 text-[11px] font-mono text-[#64748B] dark:text-slate-400 flex items-center justify-between">
                      <span>Frequência: {acompanhamentoData.frequenciaPercent}%</span>
                      <span>
                        Aulas: {acompanhamentoData.aulasConcluidas}/
                        {acompanhamentoData.totalAulasPrevistas}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SEÇÃO 5: ASSINATURAS E VALIDAÇÃO */}
                <div
                  data-testid="acompanhamento-section-assinaturas"
                  className="rounded-xl border border-slate-300 p-5 dark:border-slate-700"
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-[#2563EB] dark:text-blue-400 block mb-8">
                    5. ASSINATURAS E VALIDAÇÃO
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 pt-2 text-center">
                    <div>
                      <div className="border-t border-slate-400 dark:border-slate-500 pt-2 font-bold text-sm text-[#172033] dark:text-white">
                        Professor(a) responsável
                      </div>
                      <div className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                        {acompanhamentoData.professorResponsavel}
                      </div>
                    </div>

                    <div>
                      <div className="border-t border-slate-400 dark:border-slate-500 pt-2 font-bold text-sm text-[#172033] dark:text-white">
                        Coordenação
                      </div>
                      <div className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                        {schoolInfo.responsavelAssinaturaNome}
                      </div>
                    </div>

                    <div>
                      <div className="border-t border-slate-400 dark:border-slate-500 pt-2 font-bold text-sm text-[#172033] dark:text-white">
                        Responsável pelo aluno
                      </div>
                      <div className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                        {selectedStudentItem.nomeResponsavel ||
                          selectedStudentItem.nomeCompleto}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              FUNCIONALIDADE 2.4: DECLARAÇÃO OFICIAL DE MATRÍCULA
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

                  {/* Quadro Institucional de Dados Cadastrais da Declaração com Foto Sincronizada */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-xs dark:border-slate-800 dark:bg-slate-800/60">
                    <h4 className="font-black text-[#004A8D] uppercase dark:text-sky-400">
                      Síntese Oficial dos Dados da Matrícula
                    </h4>

                    <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
                      <StudentDocumentPhoto
                        name={fichaAcademica.student.nomeCompleto}
                        contrato={fichaAcademica.student.contrato}
                        photoUrl={customStudentPhotoUrl}
                        size="sm"
                        dataTestId="declaracao-student-photo"
                      />

                      <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 tabular-nums">
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
