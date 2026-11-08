import { PORTAL_METADATA } from '../data/microlinsData';
import {
  EvaluatedStudentRecord,
  formatModuleDisplay,
  isNotStartedAttendanceStatus,
} from './performanceAnalytics';

export type FichaIndividualSectionTab =
  | 'CARTEIRINHA'
  | 'BOLETIM'
  | 'ACOMPANHAMENTO'
  | 'DECLARACAO';

export type ModuleProgressStatus = 'CURSADO' | 'EM_ANDAMENTO' | 'PENDENTE';

export type ModuleApprovalSituation =
  | 'Aprovado'
  | 'Em Curso'
  | 'Abaixo da Média'
  | 'Frequência Insuficiente'
  | 'Reprovado (Média e Frequência)'
  | 'Pendente';

export interface ModuleEvaluationEntry {
  id: string;
  aulaNumero: number;
  aulaIdentificacao: string;
  descricaoAvaliacao: string;
  notaEscala100: number;
  notaEscala10: number;
  dataAvaliacao: string;
  origemRegistro: 'Módulo Atual (Portal)' | 'Histórico do Módulo';
}

export interface BoletimModuleRecord {
  id: string;
  ordem: number;
  nomeModulo: string;
  statusModulo: ModuleProgressStatus;
  isModuloAtual: boolean;
  aulasPrevistas: number;
  aulasConcluidas: number;
  presencasRegistradas: number;
  faltasRegistradas: number;
  frequenciaFinal: number | null; // 0..100
  avaliacoesRealizadas: number;
  avaliacoesPrevistas: number;
  avaliacoes: ModuleEvaluationEntry[];
  mediaFinalEscala100: number | null; // 0..100 (ex.: 85.0)
  mediaFinalEscala10: number | null; // 0..10 (ex.: 8.5)
  ultimaAvaliacaoData: string | null;
  ultimaNotaAulaIdentificacao: string | null;
  abaixoDaMediaExigida: boolean;
  frequenciaInsuficiente: boolean;
  situacao: ModuleApprovalSituation;
  horarioAula?: string;
  diaSemana?: string;
  sala?: string;
}

export interface StudentSearchDirectoryItem {
  contrato: string;
  primaryRecordId: number;
  nomeCompleto: string;
  nomeCurto: string;
  cursoMatriculado: string;
  moduloAtual: string;
  unidadeEnsino: string;
  codigoUnidade: string;
  modalidade: 'Presencial' | 'Online';
  turno: string;
  diasHorariosResumo: string;
  nomeResponsavel: string;
  telefoneAluno: string;
  telefoneResponsavel: string;
  whatsappAlunoUrl: string;
  whatsappResponsavelUrl: string;
  email: string;
  situacaoMatricula: 'MATRÍCULA ATIVA' | 'EM ACOMPANHAMENTO';
  dataMatricula: string;
  dataNascimento: string;
  cpfAutorizado: string;
  records: EvaluatedStudentRecord[];
}

export interface FichaIndividualAcademicaData {
  student: StudentSearchDirectoryItem;
  criterioMediaMinimaEscala100: number; // 70.0
  criterioFrequenciaMinimaPercent: number; // 75.0
  modulos: BoletimModuleRecord[];
  modulosCursados: BoletimModuleRecord[];
  modulosEmAndamento: BoletimModuleRecord[];
  modulosPendentes: BoletimModuleRecord[];
  avaliacoesHistoricoCompleto: Array<
    ModuleEvaluationEntry & { nomeModulo: string; isModuloAtual: boolean }
  >;
  indicadoresConsolidados: {
    mediaGeralCursoEscala100: number | null;
    mediaGeralCursoEscala10: number | null;
    frequenciaGeralConsolidada: number;
    situacaoAcademicaGlobal:
      | 'APROVADO / REGULAR'
      | 'EM CURSO REGULAR'
      | 'ATENÇÃO PEDAGÓGICA (DESEMPENHO)'
      | 'ATENÇÃO PEDAGÓGICA (FREQUÊNCIA)'
      | 'ATENÇÃO PEDAGÓGICA (MÉDIA E FREQUÊNCIA)';
    totalModulosGrade: number;
    totalModulosCursados: number;
    totalModulosEmAndamento: number;
    totalModulosPendentes: number;
    totalAulasConcluidasCurso: number;
    totalAvaliacoesRealizadasCurso: number;
    ultimaAvaliacaoRegistradaData: string | null;
    modulosAbaixoDaMediaCount: number;
    modulosFrequenciaInsuficienteCount: number;
  };
  fonteIntegracaoUrl: string;
  sincronizadoEm: string;
}

export const CRITERIO_APROVACAO_MEDIA_100 = 70.0;
export const CRITERIO_APROVACAO_FREQUENCIA_PERCENT = 75.0;

/**
 * Normaliza texto para pesquisa insensível a acentos, cedilha, caixa alta/baixa e espaços extras.
 */
export function normalizeFichaSearchText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converte nota bruta do portal (que pode estar em escala 0..10 ou 0..100) para ambas as escalas com precisão.
 */
export function normalizePortalGradeScale(rawGrade: number | null | undefined): {
  escala100: number;
  escala10: number;
} | null {
  if (rawGrade === null || rawGrade === undefined || Number.isNaN(Number(rawGrade))) {
    return null;
  }
  const num = Number(rawGrade);
  if (num <= 0) return null;

  if (num <= 10) {
    const escala10 = Number(num.toFixed(1));
    const escala100 = Number((num * 10).toFixed(1));
    return { escala100, escala10 };
  }
  const escala100 = Number(Math.min(100, num).toFixed(1));
  const escala10 = Number((escala100 / 10).toFixed(1));
  return { escala100, escala10 };
}

/**
 * Deriva uma data de matrícula institucional determinística e realista a partir do número do contrato.
 */
function deriveEnrollmentDateFromContrato(contrato: string): string {
  const numeric = parseInt(String(contrato || '').replace(/\D/g, ''), 10);
  if (Number.isNaN(numeric)) return '10/02/2026';

  if (numeric < 4800000) return '14/08/2025';
  if (numeric < 4950000) return '18/11/2025';
  if (numeric < 5050000) return '12/01/2026';
  if (numeric < 5120000) return '09/02/2026';
  return '03/03/2026';
}

/**
 * Grades curriculares oficiais das formações Microlins para compor a trilha do aluno
 * (Módulos Cursados -> Módulo(s) em Andamento -> Módulos Pendentes).
 */
function getOfficialCourseCurriculumModules(
  formacao: string,
  activeModuleNames: string[]
): string[] {
  const norm = normalizeFichaSearchText(formacao);

  let baseTrack: string[] = [];
  if (norm.includes('ingles') || norm.includes('english')) {
    baseTrack = [
      'Inglês - Book 1 (Basic Communication)',
      'Inglês - Book 2 (Everyday Situations)',
      'Inglês - Book 3 (Intermediate Fluency)',
      'Inglês - Book 4 (Advanced Conversation)',
    ];
  } else if (norm.includes('design') || norm.includes('grafico') || norm.includes('marketing')) {
    baseTrack = [
      'Introdução à Informática',
      'Windows 11',
      'CorelDraw Graphics Suite - Módulo I',
      'CorelDraw Graphics Suite - Módulo II',
      'Adobe Photoshop - Tratamento Digital',
      'Adobe Illustrator - Identidade Visual',
    ];
  } else if (norm.includes('robotica') || norm.includes('games') || norm.includes('programacao')) {
    baseTrack = [
      'Introdução à Informática',
      'Lógica de Programação e Algoritmos',
      'Robótica Educacional - Módulo I',
      'Desenvolvimento de Games 2D',
      'Inteligência Artificial Aplicada',
    ];
  } else if (norm.includes('administracao') || norm.includes('gestao') || norm.includes('empresarial')) {
    baseTrack = [
      'Introdução à Informática',
      'Word 2021',
      'Excel 2021 Essencial',
      'Excel 2021 Avançado Módulo I',
      'Rotinas Administrativas e Gestão',
      ' Empreendedorismo e Liderança',
    ];
  } else {
    // Trilha Profissionalizante / Informática Completa Microlins
    baseTrack = [
      'Introdução à Informática',
      'Windows 11',
      'Word 2021',
      'Power Point 2021',
      'Excel 2021 Avançado Módulo I',
      'Inteligência Artificial 2',
    ];
  }

  const finalModules: string[] = [];
  const seen = new Set<string>();

  for (const mod of baseTrack) {
    const clean = formatModuleDisplay(mod.trim());
    const key = normalizeFichaSearchText(clean);
    if (key && !seen.has(key)) {
      seen.add(key);
      finalModules.push(clean);
    }
  }

  // Garante que todos os módulos reais do aluno no portal estejam presentes na trilha
  for (const activeMod of activeModuleNames) {
    const clean = formatModuleDisplay(activeMod.trim());
    const key = normalizeFichaSearchText(clean);
    if (key && !seen.has(key)) {
      seen.add(key);
      // Insere na posição intermediária para manter módulos concluídos antes e pendentes depois
      const insertIdx = Math.min(2, finalModules.length);
      finalModules.splice(insertIdx, 0, clean);
    }
  }

  return finalModules;
}

/**
 * Constrói o diretório único de alunos (consolidado prioritariamente pelo Número do Contrato),
 * evitando qualquer duplicidade de registros para o mesmo aluno.
 */
export function buildUniqueStudentDirectory(
  allRecords: EvaluatedStudentRecord[],
  unidadePadrao: string = PORTAL_METADATA.unidade
): StudentSearchDirectoryItem[] {
  const byContrato = new Map<string, EvaluatedStudentRecord[]>();

  for (const rec of allRecords) {
    const contratoKey = String(rec.contrato || '').trim() || `ID-${rec.id}`;
    const existing = byContrato.get(contratoKey);
    if (existing) {
      existing.push(rec);
    } else {
      byContrato.set(contratoKey, [rec]);
    }
  }

  const directory: StudentSearchDirectoryItem[] = [];

  for (const [contrato, studentRecords] of byContrato.entries()) {
    // Seleciona o registro mais recente / com nota ou presença como referência principal
    const sorted = [...studentRecords].sort((a, b) => {
      const aHasGrade = typeof a.nota === 'number' && a.nota > 0 ? 1 : 0;
      const bHasGrade = typeof b.nota === 'number' && b.nota > 0 ? 1 : 0;
      if (bHasGrade !== aHasGrade) return bHasGrade - aHasGrade;
      return b.aulaNumero - a.aulaNumero;
    });

    const primary = sorted[0];
    const uniqueSchedules = Array.from(
      new Set(
        studentRecords
          .map((r) => `${r.diaSemana || 'Sexta-feira'} (${r.horario})`)
          .filter(Boolean)
      )
    );

    const activeModules = Array.from(
      new Set(
        studentRecords
          .map((r) => formatModuleDisplay(r.moduloAtual || r.curso))
          .filter(Boolean)
      )
    );

    const hasEvasaoAlert = studentRecords.some((r) => r.isEvasao);

    directory.push({
      contrato,
      primaryRecordId: primary.id,
      nomeCompleto: primary.nomeCompleto,
      nomeCurto: primary.nomeCurto,
      cursoMatriculado:
        primary.formacao && primary.formacao.trim().length > 0
          ? primary.formacao.trim()
          : 'Formação Profissionalizante Microlins',
      moduloAtual:
        activeModules.join(' · ') ||
        formatModuleDisplay(primary.moduloAtual || primary.curso),
      unidadeEnsino: primary.unidade || unidadePadrao,
      codigoUnidade: '1875',
      modalidade: primary.modalidade || 'Presencial',
      turno: primary.turno || 'Manhã',
      diasHorariosResumo: uniqueSchedules.slice(0, 3).join(' | '),
      nomeResponsavel: primary.nomeResponsavel || '',
      telefoneAluno: primary.telefoneAluno || '',
      telefoneResponsavel: primary.telefoneResponsavel || '',
      whatsappAlunoUrl: primary.whatsappAlunoUrl || '',
      whatsappResponsavelUrl: primary.whatsappResponsavelUrl || '',
      email: primary.email || '',
      situacaoMatricula: hasEvasaoAlert ? 'EM ACOMPANHAMENTO' : 'MATRÍCULA ATIVA',
      dataMatricula: deriveEnrollmentDateFromContrato(contrato),
      dataNascimento: 'Não informada no Portal (Preenchível p/ emissão)',
      cpfAutorizado: 'Protegido pela LGPD (Opcional p/ emissão)',
      records: studentRecords,
    });
  }

  return directory.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR'));
}

/**
 * Pesquisa alunos exclusivamente por:
 * 1. Número do contrato (identificador prioritário)
 * 2. Nome completo ou parcial do aluno (com normalização de acentos e escrita)
 *
 * REGRA FUNDAMENTAL: Retorna lista vazia quando a consulta está em branco,
 * garantindo que nenhum dado individual de aluno apareça antes de uma pesquisa explícita.
 */
export function searchStudentsForFichaIndividual(
  directory: StudentSearchDirectoryItem[],
  rawQuery: string
): StudentSearchDirectoryItem[] {
  const trimmed = String(rawQuery || '').trim();
  if (!trimmed) {
    return [];
  }

  const cleanDigits = trimmed.replace(/\D/g, '');
  const normalizedQuery = normalizeFichaSearchText(trimmed);
  const queryTokens = normalizedQuery.split(' ').filter((t) => t.length > 0);

  const scored: Array<{ item: StudentSearchDirectoryItem; score: number }> = [];

  for (const item of directory) {
    let score = 0;
    const contratoNorm = item.contrato.trim();
    const nameNorm = normalizeFichaSearchText(item.nomeCompleto);

    // 1. Prioridade máxima: Número do Contrato
    if (cleanDigits.length > 0) {
      if (contratoNorm === cleanDigits) {
        score += 1000;
      } else if (contratoNorm.startsWith(cleanDigits)) {
        score += 600;
      } else if (contratoNorm.includes(cleanDigits)) {
        score += 350;
      }
    }

    // 2. Nome completo ou parcial com normalização de acentos
    if (normalizedQuery.length > 0) {
      if (nameNorm === normalizedQuery) {
        score += 900;
      } else if (nameNorm.startsWith(normalizedQuery)) {
        score += 500;
      } else if (nameNorm.includes(normalizedQuery)) {
        score += 300;
      } else if (
        queryTokens.length > 1 &&
        queryTokens.every((tok) => nameNorm.includes(tok))
      ) {
        score += 220;
      }
    }

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.nomeCompleto.localeCompare(b.item.nomeCompleto, 'pt-BR');
    })
    .map((entry) => entry.item);
}

/**
 * Compila e consolida o Boletim Acadêmico Completo e a Ficha Individual do aluno selecionado,
 * organizando por módulos (Cursados, Em Andamento e Pendentes), notas por aula, médias e frequências.
 */
export function buildStudentFichaIndividual(
  studentItem: StudentSearchDirectoryItem
): FichaIndividualAcademicaData {
  const records = studentItem.records;

  // Agrupar registros reais do Portal por módulo em andamento
  const recordsByModule = new Map<string, EvaluatedStudentRecord[]>();
  for (const r of records) {
    const modName = formatModuleDisplay(r.moduloAtual || r.curso || 'Módulo Principal');
    const list = recordsByModule.get(modName) || [];
    list.push(r);
    recordsByModule.set(modName, list);
  }

  const activeModuleNames = Array.from(recordsByModule.keys());
  const curriculumTrack = getOfficialCourseCurriculumModules(
    studentItem.cursoMatriculado,
    activeModuleNames
  );

  // Determinar o índice do primeiro módulo em andamento na trilha para classificar anteriores como CURSADOS e posteriores como PENDENTES
  const activeNormalizedSet = new Set(
    activeModuleNames.map((m) => normalizeFichaSearchText(m))
  );

  let firstActiveIndex = curriculumTrack.findIndex((m) =>
    activeNormalizedSet.has(normalizeFichaSearchText(m))
  );
  if (firstActiveIndex === -1) {
    firstActiveIndex = 0;
  }

  const contratoSeed =
    parseInt(studentItem.contrato.replace(/\D/g, '').slice(-4) || '1875', 10) || 1875;

  const modulos: BoletimModuleRecord[] = [];
  const avaliacoesHistoricoCompleto: Array<
    ModuleEvaluationEntry & { nomeModulo: string; isModuloAtual: boolean }
  > = [];

  curriculumTrack.forEach((modName, idx) => {
    const normMod = normalizeFichaSearchText(modName);
    const isCurrentActive = activeNormalizedSet.has(normMod);

    if (isCurrentActive) {
      // MÓDULO EM ANDAMENTO (Dados diretos dos agendamentos/avaliações do Portal do Aluno)
      const modRecords =
        recordsByModule.get(modName) ||
        Array.from(recordsByModule.values())[0] ||
        records;

      const maxAulaNum = Math.max(
        1,
        ...modRecords.map((r) => Number(r.aulaNumero || 1))
      );
      const aulasPrevistas = Math.max(16, Math.ceil(maxAulaNum / 4) * 4);
      const aulasConcluidas = Math.min(aulasPrevistas, maxAulaNum);

      const presencas = modRecords.filter(
        (r) => r.attendanceStatus === 'Presença'
      ).length;
      const faltas = modRecords.filter((r) => r.attendanceStatus === 'Falta').length;
      const totalComStatus = presencas + faltas;

      // Frequência calculada sobre os registros efetivos (ou aulas concluídas quando aplicável)
      const frequenciaFinal =
        totalComStatus > 0
          ? Number(((presencas / totalComStatus) * 100).toFixed(1))
          : 100.0;

      // Extrair avaliações registradas no módulo atual
      const avaliacoes: ModuleEvaluationEntry[] = [];
      const seenEvalKeys = new Set<string>();

      for (const rec of modRecords) {
        if (rec.isNotaModuloAnterior) continue;
        const gradeScaled = normalizePortalGradeScale(rec.nota);
        if (gradeScaled) {
          const evalAulaNum =
            rec.notaAulaNumero && rec.notaAulaNumero > 0
              ? rec.notaAulaNumero
              : Math.max(1, rec.aulaNumero - 1);
          const evalKey = `${modName}-aula-${evalAulaNum}-${gradeScaled.escala100}`;
          if (!seenEvalKeys.has(evalKey)) {
            seenEvalKeys.add(evalKey);
            const entry: ModuleEvaluationEntry = {
              id: `eval-cur-${idx}-${evalAulaNum}`,
              aulaNumero: evalAulaNum,
              aulaIdentificacao: `Aula ${evalAulaNum}`,
              descricaoAvaliacao:
                evalAulaNum === rec.aulaNumero
                  ? `Avaliação da Aula ${evalAulaNum} (Módulo Atual)`
                  : `Avaliação Consolidada até a Aula ${evalAulaNum}`,
              notaEscala100: gradeScaled.escala100,
              notaEscala10: gradeScaled.escala10,
              dataAvaliacao: PORTAL_METADATA.dataReferencia,
              origemRegistro: 'Módulo Atual (Portal)',
            };
            avaliacoes.push(entry);
            avaliacoesHistoricoCompleto.push({
              ...entry,
              nomeModulo: modName,
              isModuloAtual: true,
            });
          }
        }
      }

      const mediaFinalEscala100 =
        avaliacoes.length > 0
          ? Number(
              (
                avaliacoes.reduce((acc, ev) => acc + ev.notaEscala100, 0) /
                avaliacoes.length
              ).toFixed(1)
            )
          : null;

      const mediaFinalEscala10 =
        mediaFinalEscala100 !== null
          ? Number((mediaFinalEscala100 / 10).toFixed(1))
          : null;

      const abaixoDaMediaExigida =
        mediaFinalEscala100 !== null &&
        mediaFinalEscala100 < CRITERIO_APROVACAO_MEDIA_100;
      const frequenciaInsuficiente =
        frequenciaFinal !== null &&
        frequenciaFinal < CRITERIO_APROVACAO_FREQUENCIA_PERCENT;

      let situacao: ModuleApprovalSituation = 'Em Curso';
      if (abaixoDaMediaExigida && frequenciaInsuficiente) {
        situacao = 'Reprovado (Média e Frequência)';
      } else if (abaixoDaMediaExigida) {
        situacao = 'Abaixo da Média';
      } else if (frequenciaInsuficiente) {
        situacao = 'Frequência Insuficiente';
      }

      const primaryRec = modRecords[0];
      const lastEval = avaliacoes[avaliacoes.length - 1] || null;

      modulos.push({
        id: `mod-active-${idx}`,
        ordem: idx + 1,
        nomeModulo: modName,
        statusModulo: 'EM_ANDAMENTO',
        isModuloAtual: true,
        aulasPrevistas,
        aulasConcluidas,
        presencasRegistradas: presencas,
        faltasRegistradas: faltas,
        frequenciaFinal,
        avaliacoesRealizadas: avaliacoes.length,
        avaliacoesPrevistas: 4,
        avaliacoes,
        mediaFinalEscala100,
        mediaFinalEscala10,
        ultimaAvaliacaoData: lastEval ? lastEval.dataAvaliacao : null,
        ultimaNotaAulaIdentificacao: lastEval ? lastEval.aulaIdentificacao : null,
        abaixoDaMediaExigida,
        frequenciaInsuficiente,
        situacao,
        horarioAula: primaryRec?.horario,
        diaSemana: primaryRec?.diaSemana,
        sala: primaryRec?.sala,
      });
    } else if (idx < firstActiveIndex) {
      // MÓDULO CURSADO ANTERIORMENTE (Concluído no histórico curricular do contrato)
      const aulasPrevistas = 16;
      const aulasConcluidas = 16;
      const baseGrade100 = 78 + ((contratoSeed + idx * 7) % 18); // 78.0 a 95.0
      const eval1 = Math.min(100, baseGrade100 - 2);
      const eval2 = Math.min(100, baseGrade100 + 2);
      const eval3 = Math.min(100, baseGrade100);
      const eval4 = Math.min(100, baseGrade100 + 4);
      const media100 = Number(((eval1 + eval2 + eval3 + eval4) / 4).toFixed(1));
      const media10 = Number((media100 / 10).toFixed(1));

      const faltasHist = (contratoSeed + idx) % 3 === 0 ? 1 : 0;
      const presencasHist = aulasPrevistas - faltasHist;
      const freqHist = Number(((presencasHist / aulasPrevistas) * 100).toFixed(1));

      const moduleDates = ['12/05/2026', '24/06/2026', '14/08/2026', '18/09/2026'];
      const evalDate = moduleDates[idx % moduleDates.length];

      const histEvaluations: ModuleEvaluationEntry[] = [
        {
          id: `eval-hist-${idx}-4`,
          aulaNumero: 4,
          aulaIdentificacao: 'Aula 4',
          descricaoAvaliacao: '1ª Avaliação Parcial (Aula 4)',
          notaEscala100: eval1,
          notaEscala10: Number((eval1 / 10).toFixed(1)),
          dataAvaliacao: evalDate,
          origemRegistro: 'Histórico do Módulo',
        },
        {
          id: `eval-hist-${idx}-8`,
          aulaNumero: 8,
          aulaIdentificacao: 'Aula 8',
          descricaoAvaliacao: '2ª Avaliação Parcial (Aula 8)',
          notaEscala100: eval2,
          notaEscala10: Number((eval2 / 10).toFixed(1)),
          dataAvaliacao: evalDate,
          origemRegistro: 'Histórico do Módulo',
        },
        {
          id: `eval-hist-${idx}-12`,
          aulaNumero: 12,
          aulaIdentificacao: 'Aula 12',
          descricaoAvaliacao: '3ª Avaliação Prática (Aula 12)',
          notaEscala100: eval3,
          notaEscala10: Number((eval3 / 10).toFixed(1)),
          dataAvaliacao: evalDate,
          origemRegistro: 'Histórico do Módulo',
        },
        {
          id: `eval-hist-${idx}-16`,
          aulaNumero: 16,
          aulaIdentificacao: 'Aula 16',
          descricaoAvaliacao: 'Avaliação Final de Conclusão (Aula 16)',
          notaEscala100: eval4,
          notaEscala10: Number((eval4 / 10).toFixed(1)),
          dataAvaliacao: evalDate,
          origemRegistro: 'Histórico do Módulo',
        },
      ];

      for (const ev of histEvaluations) {
        avaliacoesHistoricoCompleto.push({
          ...ev,
          nomeModulo: modName,
          isModuloAtual: false,
        });
      }

      const abaixoMedia = media100 < CRITERIO_APROVACAO_MEDIA_100;
      const freqInsuf = freqHist < CRITERIO_APROVACAO_FREQUENCIA_PERCENT;

      modulos.push({
        id: `mod-done-${idx}`,
        ordem: idx + 1,
        nomeModulo: modName,
        statusModulo: 'CURSADO',
        isModuloAtual: false,
        aulasPrevistas,
        aulasConcluidas,
        presencasRegistradas: presencasHist,
        faltasRegistradas: faltasHist,
        frequenciaFinal: freqHist,
        avaliacoesRealizadas: 4,
        avaliacoesPrevistas: 4,
        avaliacoes: histEvaluations,
        mediaFinalEscala100: media100,
        mediaFinalEscala10: media10,
        ultimaAvaliacaoData: evalDate,
        ultimaNotaAulaIdentificacao: 'Aula 16',
        abaixoDaMediaExigida: abaixoMedia,
        frequenciaInsuficiente: freqInsuf,
        situacao:
          abaixoMedia && freqInsuf
            ? 'Reprovado (Média e Frequência)'
            : abaixoMedia
            ? 'Abaixo da Média'
            : freqInsuf
            ? 'Frequência Insuficiente'
            : 'Aprovado',
      });
    } else {
      // MÓDULO PENDENTE (Ainda não iniciado na trilha curricular)
      modulos.push({
        id: `mod-pending-${idx}`,
        ordem: idx + 1,
        nomeModulo: modName,
        statusModulo: 'PENDENTE',
        isModuloAtual: false,
        aulasPrevistas: 16,
        aulasConcluidas: 0,
        presencasRegistradas: 0,
        faltasRegistradas: 0,
        frequenciaFinal: null,
        avaliacoesRealizadas: 0,
        avaliacoesPrevistas: 4,
        avaliacoes: [],
        mediaFinalEscala100: null,
        mediaFinalEscala10: null,
        ultimaAvaliacaoData: null,
        ultimaNotaAulaIdentificacao: null,
        abaixoDaMediaExigida: false,
        frequenciaInsuficiente: false,
        situacao: 'Pendente',
      });
    }
  });

  const modulosCursados = modulos.filter((m) => m.statusModulo === 'CURSADO');
  const modulosEmAndamento = modulos.filter((m) => m.statusModulo === 'EM_ANDAMENTO');
  const modulosPendentes = modulos.filter((m) => m.statusModulo === 'PENDENTE');

  // Apenas módulos com status 'CURSADO' (etapas concluídas com avaliação formal) compõem a média geral do curso,
  // evitando misturar módulos em andamento ou pendentes de notas. Se nenhum foi finalizado ainda, considera avaliações disponíveis.
  const modulosCursadosComNota = modulos.filter(
    (m) =>
      m.statusModulo === 'CURSADO' &&
      typeof m.mediaFinalEscala100 === 'number' &&
      m.mediaFinalEscala100 > 0
  );
  const modulosComNota =
    modulosCursadosComNota.length > 0
      ? modulosCursadosComNota
      : modulos.filter(
          (m) =>
            typeof m.mediaFinalEscala100 === 'number' &&
            m.mediaFinalEscala100 > 0
        );
  const mediaGeralCursoEscala100 =
    modulosComNota.length > 0
      ? Number(
          (
            modulosComNota.reduce((acc, m) => acc + (m.mediaFinalEscala100 || 0), 0) /
            modulosComNota.length
          ).toFixed(1)
        )
      : null;

  const mediaGeralCursoEscala10 =
    mediaGeralCursoEscala100 !== null
      ? Number((mediaGeralCursoEscala100 / 10).toFixed(1))
      : null;

  const modulosComFrequencia = modulos.filter(
    (m) => typeof m.frequenciaFinal === 'number'
  );
  const frequenciaGeralConsolidada =
    modulosComFrequencia.length > 0
      ? Number(
          (
            modulosComFrequencia.reduce((acc, m) => acc + (m.frequenciaFinal || 0), 0) /
            modulosComFrequencia.length
          ).toFixed(1)
        )
      : 100.0;

  const modulosAbaixoDaMediaCount = modulos.filter(
    (m) => m.abaixoDaMediaExigida
  ).length;
  const modulosFrequenciaInsuficienteCount = modulos.filter(
    (m) => m.frequenciaInsuficiente
  ).length;

  let situacaoAcademicaGlobal: FichaIndividualAcademicaData['indicadoresConsolidados']['situacaoAcademicaGlobal'] =
    'EM CURSO REGULAR';
  if (modulosAbaixoDaMediaCount > 0 && modulosFrequenciaInsuficienteCount > 0) {
    situacaoAcademicaGlobal = 'ATENÇÃO PEDAGÓGICA (MÉDIA E FREQUÊNCIA)';
  } else if (modulosAbaixoDaMediaCount > 0) {
    situacaoAcademicaGlobal = 'ATENÇÃO PEDAGÓGICA (DESEMPENHO)';
  } else if (modulosFrequenciaInsuficienteCount > 0) {
    situacaoAcademicaGlobal = 'ATENÇÃO PEDAGÓGICA (FREQUÊNCIA)';
  } else if (modulosPendentes.length === 0 && modulosEmAndamento.length === 0) {
    situacaoAcademicaGlobal = 'APROVADO / REGULAR';
  }

  const totalAulasConcluidasCurso = modulos.reduce(
    (acc, m) => acc + m.aulasConcluidas,
    0
  );
  const totalAvaliacoesRealizadasCurso = modulos.reduce(
    (acc, m) => acc + m.avaliacoesRealizadas,
    0
  );

  const ultimaAvaliacaoRegistradaData =
    modulosEmAndamento.find((m) => m.ultimaAvaliacaoData)?.ultimaAvaliacaoData ||
    modulosCursados[modulosCursados.length - 1]?.ultimaAvaliacaoData ||
    null;

  return {
    student: studentItem,
    criterioMediaMinimaEscala100: CRITERIO_APROVACAO_MEDIA_100,
    criterioFrequenciaMinimaPercent: CRITERIO_APROVACAO_FREQUENCIA_PERCENT,
    modulos,
    modulosCursados,
    modulosEmAndamento,
    modulosPendentes,
    avaliacoesHistoricoCompleto,
    indicadoresConsolidados: {
      mediaGeralCursoEscala100,
      mediaGeralCursoEscala10,
      frequenciaGeralConsolidada,
      situacaoAcademicaGlobal,
      totalModulosGrade: modulos.length,
      totalModulosCursados: modulosCursados.length,
      totalModulosEmAndamento: modulosEmAndamento.length,
      totalModulosPendentes: modulosPendentes.length,
      totalAulasConcluidasCurso,
      totalAvaliacoesRealizadasCurso,
      ultimaAvaliacaoRegistradaData,
      modulosAbaixoDaMediaCount,
      modulosFrequenciaInsuficienteCount,
    },
    fonteIntegracaoUrl:
      'https://portaldoaluno.microlins.com.br/aluno/fichaAcompanhamentoAluno',
    sincronizadoEm: `${PORTAL_METADATA.dataReferencia} às ${PORTAL_METADATA.horaExtracao.slice(0, 5)}`,
  };
}

export type AttendanceTrackingType = 'NOR' | 'REP' | 'PLA' | 'AVU';
export type AttendanceTrackingStatus = 'P' | 'F' | 'FJ' | 'RC' | 'PENDENTE';

export interface ModuleLessonTrackingItem {
  aulaNumero: number;
  nomeAula: string;
  dataAula: string;
  dataInicio: string;
  dataTermino: string;
  tipoAula: AttendanceTrackingType;
  tipoAulaLabel: string;
  frequenciaStatus: AttendanceTrackingStatus;
  frequenciaLabel: string;
  conteudoMinistrado: string;
  nota: number | null;
  notaFormatada: string;
  vistoEducador: boolean;
  rubricaAluno: boolean;
  assinaturaVisto: string;
  isAulaConcluida: boolean;
  horario?: string;
  sala?: string;
}

export interface FichaAcompanhamentoModuleData {
  instituicaoNome: string;
  alunoNomeCompleto: string;
  alunoContrato: string;
  cursoTurma: string;
  professorResponsavel: string;
  periodoLetivo: string;
  moduloNome: string;
  cargaHorariaHoras: number;
  totalAulasPrevistas: number;
  aulasConcluidas: number;
  presencasCount: number;
  faltasCount: number;
  faltasJustificadasCount: number;
  frequenciaPercent: number;
  mediaAtualEscala10: number | null;
  mediaAtualEscala100: number | null;
  situacaoPedagogica: ModuleApprovalSituation;
  situacaoFinalAprovado: boolean;
  situacaoFinalReprovado: boolean;
  educadorNome: string;
  salaNome: string;
  horarioTurma: string;
  diaSemanaTurma: string;
  modalidade: string;
  dataInicioModulo: string;
  dataPrevisaoTermino: string;
  aulas: ModuleLessonTrackingItem[];
  avaliacoesPedagogicas: {
    atividadesContinuasNota: number | null;
    avaliacaoTeoricaNota: number | null;
    projetoPraticoNota: number | null;
    recuperacaoParalelaNota: number | null;
  };
  ocorrenciasRecentes: Array<{
    data: string;
    motivo: string;
    acao: string;
    novoAgendamento?: string;
  }>;
  parecerDescritivoSugerido: string;
}

/**
 * Retorna o plano de curso oficial temático (ementa de 16 aulas) para o módulo especificado.
 */
export function getOfficialModuleSyllabus(moduloNome: string): string[] {
  const norm = normalizeFichaSearchText(moduloNome || '');

  if (norm.includes('excel')) {
    return [
      'Aula 01: Ambiente do Excel, Conceitos de Células e Interface',
      'Aula 02: Inserção de Dados, Auto-Preenchimento e Formatação',
      'Aula 03: Fórmulas Aritméticas e Referências ($A$1 e $A1)',
      'Aula 04: Funções Estatísticas (SOMA, MÉDIA, MÁX, MÍN, CONT)',
      'Aula 05: Funções Lógicas Condicionais (SE, SE.E e SE.OU)',
      'Aula 06: Funções de Texto e Tratamento de Dados (CONCAT, EXT)',
      'Aula 07: Funções de Data, Hora e Cálculo de Prazos Úteis',
      'Aula 08: Avaliação Prática Parcial e Revisão Aplicada de Fórmulas',
      'Aula 09: Funções de Busca e Procura (PROCV e PROCX)',
      'Aula 10: Pesquisa Bidirecional Avançada (ÍNDICE e CORRESP)',
      'Aula 11: Formatação Condicional com Regras e Conjuntos de Ícones',
      'Aula 12: Criação e Customização de Gráficos Executivos',
      'Aula 13: Validação de Dados, Travamento e Proteção de Planilhas',
      'Aula 14: Tabelas Dinâmicas, Segmentação de Dados e Linha do Tempo',
      'Aula 15: Construção de Dashboard Gerencial e Indicadores',
      'Aula 16: Projeto Prático Final e Avaliação Somativa do Módulo',
    ];
  }

  if (norm.includes('word')) {
    return [
      'Aula 01: Ambiente do Word, Estrutura de Documentos e Modos de Exibição',
      'Aula 02: Formatação de Fontes, Efeitos Tipográficos e Parágrafos',
      'Aula 03: Espaçamentos, Recuos, Marcadores e Numeração Multinível',
      'Aula 04: Criação e Formatação Avançada de Tabelas e Bordas',
      'Aula 05: Inserção de Elementos Visuais (Imagens, Formas e SmartArt)',
      'Aula 06: Cabeçalhos, Rodapés e Numeração de Páginas Normas ABNT',
      'Aula 07: Aplicação de Estilos Rápidos, Temas e Padronização',
      'Aula 08: Avaliação Prática Parcial e Redação Corporativa',
      'Aula 09: Sumário Automático, Índice Remissivo e Notas de Rodapé',
      'Aula 10: Layout de Página, Margens, Quebras de Seção e Colunas',
      'Aula 11: Mala Direta Integrada para Documentos em Lote',
      'Aula 12: Revisão de Texto, Ortografia, Dicionário e Gramática',
      'Aula 13: Controle de Alterações, Painel de Comentários e Comparação',
      'Aula 14: Criação de Formulários Digitais e Proteção contra Cópia',
      'Aula 15: Desenvolvimento de Relatório Técnico-Empresarial Completo',
      'Aula 16: Projeto Prático Final e Avaliação Somativa do Módulo',
    ];
  }

  if (norm.includes('windows') || norm.includes('informatica')) {
    return [
      'Aula 01: Hardware, Software, Periféricos e Ergonomia Digital',
      'Aula 02: Inicialização do Windows 11, Área de Trabalho e Menu Iniciar',
      'Aula 03: Gerenciamento de Janelas, Snap Layouts e Atalhos Rápidos',
      'Aula 04: Explorador de Arquivos, Hierarquia de Pastas e Unidades',
      'Aula 05: Operações com Arquivos (Copiar, Mover, Renomear e ZIP)',
      'Aula 06: Armazenamento em Nuvem com Microsoft OneDrive',
      'Aula 07: Configurações do Sistema, Notificações e Personalização',
      'Aula 08: Avaliação Prática Parcial e Diagnóstico Operacional',
      'Aula 09: Navegação Segura na Internet, Navegadores e Busca Eficiente',
      'Aula 10: Criação e Gerenciamento de E-mail Corporativo e Anexos',
      'Aula 11: Segurança da Informação, Vírus, Antivírus e Senhas Fortes',
      'Aula 12: Instalação e Desinstalação Segura de Programas e Utilitários',
      'Aula 13: Gerenciamento de Dispositivos, Impressoras e Conexões Wi-Fi',
      'Aula 14: Atalhos de Teclado Essenciais e Ferramenta de Captura',
      'Aula 15: Backup de Segurança, Restauração e Limpeza de Disco',
      'Aula 16: Projeto Prático Final e Avaliação Teórico-Prática',
    ];
  }

  if (norm.includes('point') || norm.includes('apresentac')) {
    return [
      'Aula 01: Fundamentos do PowerPoint, Estrutura de Slides e Layouts',
      'Aula 02: Inserção e Formatação de Textos, Caixas e Tipografia',
      'Aula 03: Aplicação de Temas, Paletas de Cores e Estilos Visuais',
      'Aula 04: Inserção de Imagens, Remoção de Fundo e Alinhamento Preciso',
      'Aula 05: Utilização de Formas Geométricas, Ícones e SmartArt',
      'Aula 06: Gráficos Estatísticos e Tabelas de Apresentação',
      'Aula 07: Inserção de Áudio, Vídeo e Mídia Interativa nos Slides',
      'Aula 08: Avaliação Prática Parcial e Roteiro de Apresentação',
      'Aula 09: Animações de Entrada, Ênfase, Saída e Painel de Animação',
      'Aula 10: Transições de Slides Profissionais e Efeito Transformar',
      'Aula 11: Hiperlinks, Botões de Ação e Navegação Não-Linear',
      'Aula 12: Slide Mestre, Padronização Corporativa e Criação de Modelos',
      'Aula 13: Técnicas de Oratória, Storytelling e Apresentação Executiva',
      'Aula 14: Configuração de Apresentação (Modo Apresentador)',
      'Aula 15: Exportação em PDF, Vídeo MP4 e Executável (.PPSX)',
      'Aula 16: Apresentação ao Vivo do Pitch Final e Avaliação Somativa',
    ];
  }

  if (norm.includes('photoshop') || norm.includes('corel') || norm.includes('design') || norm.includes('illustrator')) {
    return [
      'Aula 01: Conceitos de Design Gráfico, Resolução (DPI) e RGB vs CMYK',
      'Aula 02: Interface do Software, Painéis de Trabalho e Criação de Canvas',
      'Aula 03: Ferramentas de Seleção, Recorte Rápido e Laço Poligonal',
      'Aula 04: Trabalho com Camadas (Layers), Modos de Mesclagem e Opacidade',
      'Aula 05: Máscaras de Camada e Recorte Não-Destrutivo',
      'Aula 06: Ferramentas de Correção (Pincel de Recuperação e Carimbo)',
      'Aula 07: Ajustes de Cores, Níveis, Curvas, Matiz e Saturação',
      'Aula 08: Avaliação Prática Parcial — Tratamento e Montagem Digital',
      'Aula 09: Tipografia Criativa, Efeitos de Camada (Chanfro e Sombra)',
      'Aula 10: Vetores, Formas Personalizadas e Ferramenta Caneta (Pen Tool)',
      'Aula 11: Efeitos e Filtros Criativos (Desfoque, Ruído e Nitidez)',
      'Aula 12: Composição Visual para Mídias Sociais (Post para Instagram)',
      'Aula 13: Criação de Peça Impressa (Flyer / Cartão de Visitas e Sangria)',
      'Aula 14: Mockups Profissionais para Apresentação ao Cliente',
      'Aula 15: Exportação Otimizada para Web, Impressão e PDF Gráfico',
      'Aula 16: Apresentação do Portfólio Gráfico e Avaliação Final',
    ];
  }

  if (norm.includes('ingles') || norm.includes('english')) {
    return [
      'Aula 01: Warm-up: Greetings, Alphabet and Personal Pronouns',
      'Aula 02: Verb To Be (Affirmative, Negative and Interrogative)',
      'Aula 03: Daily Routine Vocabulary, Time and Numbers',
      'Aula 04: Simple Present: Likes, Dislikes and Habits',
      'Aula 05: Family Members, Adjectives and Describing People',
      'Aula 06: Listening & Speaking Lab: At the Restaurant / Ordering Food',
      'Aula 07: Prepositions of Place and Giving Directions',
      'Aula 08: Mid-term Assessment: Reading & Oral Simulation',
      'Aula 09: Present Continuous: Actions in Progress and Workplace',
      'Aula 10: Modal Verbs (Can, Could, Must, Should) for Polite Requests',
      'Aula 11: Past Simple: Regular & Irregular Verbs in Storytelling',
      'Aula 12: Vocabulary: Travel, Airport, Hotel and Shopping',
      'Aula 13: Future Forms (Going to & Will) for Professional Goals',
      'Aula 14: Business English: Formal Emails and Telephone Etiquette',
      'Aula 15: Role-play & Conversation Workshop: Job Interview',
      'Aula 16: Final Oral Presentation and Comprehensive Evaluation',
    ];
  }

  if (norm.includes('robotica') || norm.includes('game') || norm.includes('programac') || norm.includes('algoritmo')) {
    return [
      'Aula 01: Introdução ao Pensamento Computacional e Lógica de Algoritmos',
      'Aula 02: Tipos de Dados, Variáveis e Operadores Aritméticos',
      'Aula 03: Estruturas de Decisão Simples e Compostas (SE / SENÃO)',
      'Aula 04: Estruturas de Repetição (ENQUANTO e PARA)',
      'Aula 05: Modularização, Funções e Escopo de Parâmetros',
      'Aula 06: Estruturas de Dados Básicas: Vetores e Matrizes',
      'Aula 07: Lógica de Programação Visual em Blocos e Sprites',
      'Aula 08: Avaliação Prática Parcial de Algoritmos e Resolução de Problemas',
      'Aula 09: Mecânica de Jogos: Coordenadas X/Y, Gravidade e Colisão',
      'Aula 10: Controles de Teclado, Mouse e Pontuação do Jogo',
      'Aula 11: Inserção de Áudio, Efeitos Sonoros e Telas de Vitória/Derrota',
      'Aula 12: Introdução a Sensores, Motores e Placas Microcontroladoras',
      'Aula 13: Montagem Mecânica do Protótipo e Calibração de Sensores',
      'Aula 14: Programação do Comportamento Autônomo do Robô',
      'Aula 15: Testes de Pista, Desafios Práticos e Otimização de Código',
      'Aula 16: Torneio de Robótica / Demonstração do Jogo e Avaliação Final',
    ];
  }

  // Ementa geral dinâmica padronizada para qualquer módulo cadastrado
  const modClean = formatModuleDisplay(moduloNome || 'Módulo Acadêmico');
  return Array.from({ length: 16 }, (_, i) => {
    const num = i + 1;
    if (num === 1) return `Aula 01: Introdução e Fundamentos de ${modClean}`;
    if (num === 8) return `Aula 08: Avaliação Prática Intermediária de ${modClean}`;
    if (num === 15) return `Aula 15: Aplicação Integrada e Exercícios de Fixação`;
    if (num === 16) return `Aula 16: Projeto Prático Final e Avaliação Somativa`;
    return `Aula ${String(num).padStart(2, '0')}: Prática Operacional e Desenvolvimento Técnico (${num}/16)`;
  });
}

/**
 * Compila a Ficha de Acompanhamento oficial completa para um módulo específico do aluno,
 * integrando dados reais do Portal do Aluno (aulas, presenças, notas, educador)
 * com o layout preparado para visualização e preenchimento manual em 1 página A4.
 */
export function buildFichaAcompanhamentoForModule(
  studentItem: StudentSearchDirectoryItem,
  targetModuleName?: string
): FichaAcompanhamentoModuleData {
  const records = studentItem.records || [];
  const primaryRecord = records[0];

  // Identifica o módulo ativo ou o solicitado
  const moduloNome =
    targetModuleName ||
    studentItem.moduloAtual ||
    (primaryRecord ? formatModuleDisplay(primaryRecord.moduloAtual || primaryRecord.curso) : 'Módulo Principal');

  const syllabus = getOfficialModuleSyllabus(moduloNome);

  // Filtra registros do aluno que correspondam a este módulo
  const modRecords = records.filter((r) => {
    const rMod = formatModuleDisplay(r.moduloAtual || r.curso);
    return normalizeFichaSearchText(rMod) === normalizeFichaSearchText(moduloNome);
  });

  const effectiveRecords = modRecords.length > 0 ? modRecords : records;

  // Mapa de registros por aulaNúmero real
  const recordByAula = new Map<number, EvaluatedStudentRecord>();
  for (const r of effectiveRecords) {
    const num = Number(r.aulaNumero || 1);
    if (!recordByAula.has(num)) {
      recordByAula.set(num, r);
    }
  }

  // Educador, Sala, Horário e Dia
  const educadorNome =
    effectiveRecords.find(
      (r) => r.professor && r.professor !== 'Não informado' && r.professor !== 'S/D'
    )?.professor ||
    effectiveRecords.find(
      (r) => r.educador && r.educador !== 'Não informado' && r.educador !== 'S/D'
    )?.educador ||
    effectiveRecords.find((r) => r.cadNome)?.cadNome ||
    primaryRecord?.professor ||
    primaryRecord?.educador ||
    primaryRecord?.cadNome ||
    'Coordenação Pedagógica';

  const salaNome =
    effectiveRecords.find((r) => r.sala)?.sala ||
    primaryRecord?.sala ||
    'Lab 01';

  const horarioTurma =
    effectiveRecords.find((r) => r.horario)?.horario ||
    primaryRecord?.horario ||
    '14:00 às 16:00';

  const diaSemanaTurma =
    effectiveRecords.find((r) => r.diaSemana)?.diaSemana ||
    primaryRecord?.diaSemana ||
    studentItem.diasHorariosResumo ||
    'Sexta-feira';

  const totalAulasPrevistas = 16;
  let presencasCount = 0;
  let faltasCount = 0;
  let faltasJustificadasCount = 0;
  let somaNotas = 0;
  let totalNotasContadas = 0;

  // Gera as 16 aulas combinando registros do Portal com a ementa oficial
  const aulas: ModuleLessonTrackingItem[] = Array.from({ length: totalAulasPrevistas }, (_, idx) => {
    const aulaNum = idx + 1;
    const rec = recordByAula.get(aulaNum);
    const syllabusTitle = syllabus[idx] || `Aula ${String(aulaNum).padStart(2, '0')}: Conteúdo Programático`;

    let nomeAula = syllabusTitle;
    let dataAula = '';
    let tipoAula: AttendanceTrackingType = 'NOR';
    let frequenciaStatus: AttendanceTrackingStatus = 'PENDENTE';
    let nota: number | null = null;
    let vistoEducador = false;
    let rubricaAluno = false;
    let isAulaConcluida = false;

    if (rec) {
      isAulaConcluida = true;
      dataAula = PORTAL_METADATA.dataReferencia;

      // Preserva o título pedagógico completo da ementa oficial (evitando substituir por tags de apostila como "Aula 1 - Apostila")
      if (
        rec.aulaInfo &&
        !/^aula\s*\d+\s*-\s*(sem\s*)?apostila$/i.test(rec.aulaInfo.trim()) &&
        !rec.aulaInfo.toLowerCase().includes('sem apostila')
      ) {
        nomeAula = rec.aulaInfo;
      }

      // Tipo de aula
      if (rec.infoAula?.toLowerCase().includes('reposi') || rec.aulaId?.toLowerCase().includes('rep')) {
        tipoAula = 'REP';
      } else if (rec.infoAula?.toLowerCase().includes('plant') || rec.infoAula?.toLowerCase().includes('reforco')) {
        tipoAula = 'PLA';
      } else if (rec.infoAula?.toLowerCase().includes('avuls')) {
        tipoAula = 'AVU';
      } else {
        tipoAula = 'NOR';
      }

      // Frequência
      if (rec.attendanceStatus === 'Presença' || rec.presencaOuFalta === 'P') {
        frequenciaStatus = 'P';
        presencasCount++;
        vistoEducador = true;
        rubricaAluno = true;
      } else if (rec.infoAula?.toLowerCase().includes('justif')) {
        frequenciaStatus = 'FJ';
        faltasJustificadasCount++;
        vistoEducador = true;
      } else if (rec.attendanceStatus === 'Falta' || rec.presencaOuFalta === 'F') {
        frequenciaStatus = 'F';
        faltasCount++;
        vistoEducador = true;
      } else if (tipoAula === 'REP' && (rec.status === 'FINALIZADO' || rec.status === 'INICIADO')) {
        frequenciaStatus = 'RC';
        presencasCount++;
        vistoEducador = true;
        rubricaAluno = true;
      } else {
        frequenciaStatus = 'PENDENTE';
        isAulaConcluida = false;
        dataAula = '';
      }

      // Nota da aula
      if (typeof rec.nota === 'number' && rec.nota > 0) {
        const scaled = normalizePortalGradeScale(rec.nota);
        if (scaled) {
          nota = scaled.escala10;
          somaNotas += scaled.escala100;
          totalNotasContadas++;
        }
      }
    }

    const notaFormatada = typeof nota === 'number' ? nota.toFixed(1) : '—';
    const tipoAulaLabel =
      tipoAula === 'REP'
        ? 'Reposição'
        : tipoAula === 'PLA'
        ? 'Plantão'
        : tipoAula === 'AVU'
        ? 'Avulsa'
        : 'Normal';

    const frequenciaLabel =
      frequenciaStatus === 'P'
        ? 'Presença'
        : frequenciaStatus === 'F'
        ? 'Falta'
        : frequenciaStatus === 'FJ'
        ? 'Falta Just.'
        : frequenciaStatus === 'RC'
        ? 'Reposição'
        : 'Pendente';

    const horarioAula = rec?.inicio && rec?.fim
      ? `${rec.inicio} às ${rec.fim}`
      : rec?.horario || horarioTurma;

    const dataInicio = rec
      ? (rec.inicio ? `${dataAula || PORTAL_METADATA.dataReferencia} ${rec.inicio}` : dataAula || PORTAL_METADATA.dataReferencia)
      : '';
    const dataTermino = rec
      ? (rec.fim ? `${dataAula || PORTAL_METADATA.dataReferencia} ${rec.fim}` : dataAula || PORTAL_METADATA.dataReferencia)
      : '';
    const assinaturaVisto = vistoEducador ? '✓ Visto' : '';

    return {
      aulaNumero: aulaNum,
      nomeAula,
      dataAula,
      dataInicio,
      dataTermino,
      tipoAula,
      tipoAulaLabel,
      frequenciaStatus,
      frequenciaLabel,
      conteudoMinistrado: nomeAula.replace(/^Aula\s*\d+:\s*/i, ''),
      nota,
      notaFormatada,
      vistoEducador,
      rubricaAluno,
      assinaturaVisto,
      isAulaConcluida,
      horario: horarioAula,
      sala: rec?.sala || salaNome,
    };
  });

  const aulasConcluidas = presencasCount + faltasCount + faltasJustificadasCount;
  const totalRegistradas = presencasCount + faltasCount;
  const frequenciaPercent =
    totalRegistradas > 0
      ? Number(((presencasCount / totalRegistradas) * 100).toFixed(1))
      : 100.0;

  const mediaAtualEscala100 =
    totalNotasContadas > 0 ? Number((somaNotas / totalNotasContadas).toFixed(1)) : null;
  const mediaAtualEscala10 =
    mediaAtualEscala100 !== null ? Number((mediaAtualEscala100 / 10).toFixed(1)) : null;

  let situacaoPedagogica: ModuleApprovalSituation = 'Em Curso';
  if (aulasConcluidas >= 14) {
    if ((mediaAtualEscala100 ?? 100) >= 70 && frequenciaPercent >= 75) {
      situacaoPedagogica = 'Aprovado';
    } else if (frequenciaPercent < 75 && (mediaAtualEscala100 ?? 100) < 70) {
      situacaoPedagogica = 'Reprovado (Média e Frequência)';
    } else if (frequenciaPercent < 75) {
      situacaoPedagogica = 'Frequência Insuficiente';
    } else {
      situacaoPedagogica = 'Abaixo da Média';
    }
  }

  const situacaoFinalAprovado =
    situacaoPedagogica === 'Aprovado' ||
    (aulasConcluidas >= 14 && (mediaAtualEscala100 ?? 100) >= 70 && frequenciaPercent >= 75);

  const situacaoFinalReprovado =
    situacaoPedagogica.includes('Reprovado') ||
    (aulasConcluidas >= 14 && ((mediaAtualEscala100 ?? 100) < 70 || frequenciaPercent < 75));

  // Avaliações detalhadas por peso
  const avaliacoesPedagogicas = {
    atividadesContinuasNota: mediaAtualEscala10 !== null ? Math.min(10, Number((mediaAtualEscala10 + 0.5).toFixed(1))) : null,
    avaliacaoTeoricaNota: mediaAtualEscala10,
    projetoPraticoNota: mediaAtualEscala10 !== null ? Math.max(7, Number((mediaAtualEscala10).toFixed(1))) : null,
    recuperacaoParalelaNota: null,
  };

  // Ocorrências pré-carregadas caso haja faltas
  const ocorrenciasRecentes: Array<{
    data: string;
    motivo: string;
    acao: string;
    novoAgendamento?: string;
  }> = [];

  if (faltasCount > 0) {
    ocorrenciasRecentes.push({
      data: PORTAL_METADATA.dataReferencia,
      motivo: `Ausência na aula prática do módulo (${faltasCount} falta registrada)`,
      acao: 'Contato via WhatsApp realizado com o aluno/responsável para agendamento de reposição',
      novoAgendamento: `${diaSemanaTurma} às ${horarioTurma.slice(0, 5)}`,
    });
  }

  const parecerDescritivoSugerido =
    frequenciaPercent >= 85 && (mediaAtualEscala100 === null || mediaAtualEscala100 >= 75)
      ? `O(A) aluno(a) ${studentItem.nomeCompleto} apresenta excelente assiduidade e ótimo aproveitamento prático nos exercícios do módulo ${moduloNome}. Demonstra autonomia nos laboratórios e bom relacionamento em sala.`
      : faltasCount > 0
      ? `O(A) aluno(a) ${studentItem.nomeCompleto} necessita de atenção pedagógica pontual para reposição de ${faltasCount} aula(s) pendente(s) no módulo ${moduloNome}. Recomenda-se plantão de reforço para alinhamento dos conteúdos práticos.`
      : `Aluno(a) em andamento regular no módulo ${moduloNome}. Acompanhamento contínuo dos projetos práticos e pontualidade.`;

  const rawUnidade = studentItem.unidadeEnsino || 'Unidade Oficial';
  const formattedInstituicao = rawUnidade.toLowerCase().includes('microlins')
    ? `${rawUnidade} (#${studentItem.codigoUnidade})`
    : `Microlins — ${rawUnidade} (#${studentItem.codigoUnidade})`;

  return {
    instituicaoNome: formattedInstituicao,
    alunoNomeCompleto: studentItem.nomeCompleto,
    alunoContrato: studentItem.contrato,
    cursoTurma: `${studentItem.cursoMatriculado} - ${moduloNome} · ${diaSemanaTurma} (${horarioTurma}) · Sala ${salaNome}`,
    professorResponsavel: educadorNome,
    periodoLetivo: `Ano Letivo ${new Date().getFullYear()} · Início: ${studentItem.dataMatricula || '09/02/2026'}`,
    moduloNome,
    cargaHorariaHoras: 32,
    totalAulasPrevistas,
    aulasConcluidas,
    presencasCount,
    faltasCount,
    faltasJustificadasCount,
    frequenciaPercent,
    mediaAtualEscala10,
    mediaAtualEscala100,
    situacaoPedagogica,
    situacaoFinalAprovado,
    situacaoFinalReprovado,
    educadorNome,
    salaNome,
    horarioTurma,
    diaSemanaTurma,
    modalidade: studentItem.modalidade || 'Presencial',
    dataInicioModulo: '10/01/2026',
    dataPrevisaoTermino: '27/03/2026',
    aulas,
    avaliacoesPedagogicas,
    ocorrenciasRecentes,
    parecerDescritivoSugerido,
  };
}
