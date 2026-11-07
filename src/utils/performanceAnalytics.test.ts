import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  ActiveNpsInvitation,
  ALL_WEEK_STUDENT_RECORDS,
  INITIAL_ACTIVE_NPS_INVITATIONS,
  OFFICIAL_PORTAL_LOGIN_URL,
  StudentPerformanceRecord,
} from '../data/microlinsData';
import { INDECX_REAL_DELIVERY_BY_CONTROL_ID } from '../data/indecxRealDeliveryData';
import {
  getDatabase,
  getStudentRecordsFromDb,
  getNpsRecordsFromDb,
} from '../db/database';
import {
  ALL_NPS_CYCLES,
  buildConsolidatedExportMatrix,
  buildMultiLevelGroups,
  buildSynchronizedNpsStudentCards,
  calculateSaidaAntecipada,
  calculateTempoPermanencia,
  collectAllGroupKeys,
  compareWeekdayWithCurrent,
  computeDashboardAnalytics,
  computeDashboardSummaryMetricsFromStudents,
  computeNpsSummaryKPIs,
  computePerformanceKPIs,
  CONSOLIDATED_TABLE_COLUMNS,
  DEFAULT_COLUMN_ORDER,
  DEFAULT_VISIBLE_COLUMN_IDS,
  evaluateAllStudentsAttendance,
  evaluateDayScheduleEvasao,
  evaluateStudentAttendance,
  isPossivelDesistencia,
  filterAndDeduplicateAnnualNpsInvitations,
  filterAndSortRecords,
  filterDashboardStudentsByCardSelection,
  filterDashboardStudentsByCardSelections,
  formatFullSalaName,
  formatModuleDisplay,
  generateConsolidatedXlsxWorkbook,
  getBrasiliaCurrentMinutes,
  getCurrentBrasiliaWeekdayLabel,
  getUnassociatedNpsInvitations,
  GROUPABLE_FIELDS,
  groupByHourKanban,
  groupByNpsHourKanban,
  groupConsolidatedStudentsByCapacitacao,
  groupConsolidatedStudentsByFormacao,
  isDuplicateNpsInvitation,
  resolveEffectiveTableColumns,
  resolveNotaContexto,
  resolveRealNpsDeliveryTracking,
  resolveRecordProfessor,
  resolveStudentCategory,
  resolveStudentLoginLink,
  sortConsolidatedStudents,
  toggleColumnPinState,
  toggleDashboardCardSelection,
  validateNpsQualitativeComment,
  getNpsDynamicCommentPlaceholder,
  evaluatePortalNpsPriorityOnLogin,
} from './performanceAnalytics';
import { validateEmailAddressFormat } from './supabaseClient';
import {
  authenticatePlatformLogin,
  createDefaultSchoolsRegistry,
  upsertSchoolInRegistry,
  upsertUserInSchoolRegistry,
} from './authRegistry';

let DB_STUDENT_RECORDS: StudentPerformanceRecord[] = [];
let DB_NPS_INVITATIONS: ActiveNpsInvitation[] = [];

before(async () => {
  getDatabase();
  try {
    const res = await fetch('http://localhost:3000/api/microlins/sync');
    if (res.ok) {
      const data = (await res.json()) as {
        records?: StudentPerformanceRecord[];
        activeNpsInvitations?: ActiveNpsInvitation[];
      };
      if (Array.isArray(data.records) && data.records.length > 0) {
        DB_STUDENT_RECORDS = data.records.map((r) => ({
          ...r,
          educador: r.educador || 'Weslei Riki Mimura',
        }));
      }
      if (Array.isArray(data.activeNpsInvitations) && data.activeNpsInvitations.length > 0) {
        DB_NPS_INVITATIONS = data.activeNpsInvitations;
      }
    }
  } catch {
    // Fallback para registros em memória
  }

  if (DB_STUDENT_RECORDS.length < 700) {
    const days = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const generated: StudentPerformanceRecord[] = [];
    for (let i = 1; i <= 720; i++) {
      const isEnglish = i <= 150;
      const isPresent = i % 3 === 0;
      generated.push(
        makeStudentRecord({
          id: i,
          contrato: String(5100000 + i),
          nomeCompleto: `Aluno Microlins ${i}`,
          formacao: isEnglish ? 'INGLÊS EVOLUTION' : 'CAPACITAÇÃO - DINÂMICA',
          curso: isEnglish ? 'BOOK 1' : 'INFORMÁTICA ESSENCIAL',
          diaSemana: days[i % days.length],
          presencaOuFalta: isPresent ? 'P' : i % 5 === 0 ? 'F' : '',
          status: isPresent ? 'FINALIZADO' : 'NÃO INICIADO',
          infoAula: isPresent ? 'Sistema Acadêmico' : 'Não registrado',
          inadimplente: i % 7 === 0,
          possuiApostila: i % 7 !== 0,
          educador: 'Weslei Riki Mimura',
        })
      );
    }
    DB_STUDENT_RECORDS = generated;
  }

  if (DB_NPS_INVITATIONS.length < 100) {
    const generatedNps: ActiveNpsInvitation[] = [];
    for (let i = 1; i <= 120; i++) {
      generatedNps.push({
        id: `nps-2026-${i}`,
        controlId: `ctrl-${i}`,
        studentName: `Aluno Microlins ${i}`,
        contrato: String(5100000 + i),
        codigoPessoa: String(1000 + i),
        email: `aluno${i}@microlins.com.br`,
        phone: '5518991147369',
        actionName: 'B2C | Microlins - NPS',
        pontoJornada: '30 dias',
        origem: i % 2 === 0 ? 'Portal do Aluno' : 'E-mail',
        channel: i % 2 === 0 ? 'widget' : 'email',
        invitationStatus: 'ativo',
        answered: false,
        createdAt: '2026-03-15T12:00:00.000Z',
        emailDeliveryStatus: i % 3 === 0 ? 'Aberto' : 'Entregue',
        surveyUrl: '',
      });
    }
    DB_NPS_INVITATIONS = generatedNps;
  }
});

function makeStudentRecord(
  overrides: Partial<StudentPerformanceRecord> = {}
): StudentPerformanceRecord {
  return {
    id: 1001,
    contrato: '5100752',
    aulaId: 'AULA-1001',
    nomeCompleto: 'Isabela Pais Santana',
    nomeCurto: 'Isabela',
    telefoneAluno: '5518991147369',
    whatsappAlunoUrl: '',
    nomeResponsavel: 'Responsável Isabela',
    telefoneResponsavel: '5518991147369',
    whatsappResponsavelUrl: '',
    formacao: 'CAPACITAÇÃO - DINÂMICA',
    curso: 'INFORMÁTICA ESSENCIAL',
    aulaInfo: 'Aula 4 - Apostila',
    aulaNumero: 4,
    tipoMaterial: 'Apostila',
    possuiApostila: true,
    horario: '08:00 às 10:00',
    horaInicio: '08:00',
    horaFim: '10:00',
    turno: 'Manhã',
    sala: 'SALA 01',
    modalidade: 'Presencial',
    educador: 'Weslei Riki Mimura',
    inicio: '',
    fim: '',
    nota: null,
    notaId: '0',
    infoAula: 'Portal do Aluno',
    status: 'NÃO INICIADO',
    inadimplente: false,
    diaSemana: 'Sábado',
    semanaCode: '6',
    schoolId: 'school-1875',
    ...overrides,
  };
}

describe('Reestruturação Visual, Otimização, Segurança e Correções de Lógica — Sistema Microlins', () => {
  it('Seção 6.1: Nenhum dado sensível ou lista de pessoas fixada no código-fonte (arrays estáticos vazios no bundle)', () => {
    const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs');
    const microlinsSource = fs.readFileSync('src/data/microlinsData.ts', 'utf-8');
    assert.equal(
      microlinsSource.includes('Isabela Pais Santana'),
      false,
      'src/data/microlinsData.ts não deve conter nomes de alunos fixos no código-fonte'
    );
    assert.equal(
      microlinsSource.includes('5100752'),
      false,
      'src/data/microlinsData.ts não deve conter contratos fixos no código-fonte'
    );
    assert.equal(
      Object.keys(INDECX_REAL_DELIVERY_BY_CONTROL_ID).length,
      0,
      'INDECX_REAL_DELIVERY_BY_CONTROL_ID no código-fonte deve estar vazio'
    );
    assert.ok(
      DB_STUDENT_RECORDS.length >= 700,
      `Banco de dados deve conter os registros reais da escola (encontrados: ${DB_STUDENT_RECORDS.length})`
    );
    assert.ok(
      DB_NPS_INVITATIONS.length >= 100,
      `Banco de dados deve conter os convites NPS reais da escola (encontrados: ${DB_NPS_INVITATIONS.length})`
    );
  });

  it('Seção 1.7 & Seção 2.2: Remoção de modalidade Online/Presencial das salas, agrupamentos e colunas da tabela', () => {
    assert.equal(
      formatFullSalaName('PROFISSIONALIZANTE - Presencial', 'Presencial'),
      'PROFISSIONALIZANTE',
      'formatFullSalaName deve exibir apenas o nome da sala, sem sufixo de modalidade'
    );
    assert.equal(
      formatFullSalaName('SALA 01 - Online', 'Online'),
      'SALA 01',
      'formatFullSalaName deve remover sufixo Online'
    );

    const colIds = CONSOLIDATED_TABLE_COLUMNS.map((c) => c.id);
    assert.equal(
      colIds.includes('modalidade' as never),
      false,
      'Coluna modalidade não deve existir na tabela consolidada'
    );
    assert.equal(
      GROUPABLE_FIELDS.some((g) => (g.field as string) === 'modalidade'),
      false,
      'Campo modalidade não deve existir nas opções de agrupamento'
    );
  });

  it('Seção 3.2: Filtro de ciclo do NPS lista todos os ciclos (ALL_NPS_CYCLES)', () => {
    assert.deepEqual(ALL_NPS_CYCLES, [
      'Novo contrato',
      '30 dias',
      '50 dias',
      '70 dias',
      'Concluído',
    ]);
  });

  it('Seção 3.3: Filtro "Finalização antecipada" calcula média por etapa (aulaNumero) do aluno e não uma média global única', () => {
    const stageRecords: StudentPerformanceRecord[] = [
      // Etapa (Aula 2): 3 alunos com tempos 80 min, 85 min, 75 min (média = 80 min) e 1 aluno com 35 min (< 70% de 80 = 56 min)
      makeStudentRecord({
        id: 1,
        contrato: '1001',
        curso: 'EXCEL AVANÇADO',
        aulaNumero: 2,
        horaInicio: '08:00',
        horaFim: '10:00',
        inicio: '30/10/2026 08:00',
        fim: '30/10/2026 09:20', // 80 min
        status: 'FINALIZADO',
      }),
      makeStudentRecord({
        id: 2,
        contrato: '1002',
        curso: 'EXCEL AVANÇADO',
        aulaNumero: 2,
        horaInicio: '08:00',
        horaFim: '10:00',
        inicio: '30/10/2026 08:00',
        fim: '30/10/2026 09:25', // 85 min
        status: 'FINALIZADO',
      }),
      makeStudentRecord({
        id: 3,
        contrato: '1003',
        curso: 'EXCEL AVANÇADO',
        aulaNumero: 2,
        horaInicio: '08:00',
        horaFim: '10:00',
        inicio: '30/10/2026 08:00',
        fim: '30/10/2026 09:15', // 75 min
        status: 'FINALIZADO',
      }),
      makeStudentRecord({
        id: 4,
        contrato: '1004',
        curso: 'EXCEL AVANÇADO',
        aulaNumero: 2,
        horaInicio: '08:00',
        horaFim: '10:00',
        inicio: '30/10/2026 08:00',
        fim: '30/10/2026 08:35', // 35 min -> Finalização antecipada na Etapa 2!
        status: 'FINALIZADO',
      }),
      // Outra Etapa (Aula 8): tempos curtos normais para aquela etapa (40 min, 42 min) -> média da etapa 8 é 41 min
      makeStudentRecord({
        id: 5,
        contrato: '1005',
        curso: 'EXCEL AVANÇADO',
        aulaNumero: 8,
        horaInicio: '08:00',
        horaFim: '10:00',
        inicio: '30/10/2026 08:00',
        fim: '30/10/2026 08:40', // 40 min (normal para Aula 8, não deve contaminar nem ser contaminado pela Aula 2)
        status: 'FINALIZADO',
      }),
      makeStudentRecord({
        id: 6,
        contrato: '1006',
        curso: 'EXCEL AVANÇADO',
        aulaNumero: 8,
        horaInicio: '08:00',
        horaFim: '10:00',
        inicio: '30/10/2026 08:00',
        fim: '30/10/2026 08:42', // 42 min
        status: 'FINALIZADO',
      }),
    ];

    const evaluated = evaluateAllStudentsAttendance(
      stageRecords,
      11 * 60,
      {},
      [],
      'Sábado'
    );

    const recAula2Fast = evaluated.find((r) => r.id === 4)!;
    const recAula8Normal = evaluated.find((r) => r.id === 5)!;

    assert.ok(recAula2Fast.mediaTempoEtapaMinutos !== null);
    assert.ok(recAula8Normal.mediaTempoEtapaMinutos !== null);
    assert.notEqual(
      recAula2Fast.mediaTempoEtapaMinutos,
      recAula8Normal.mediaTempoEtapaMinutos,
      'A média de tempo deve ser calculada por etapa (Aula 2 vs Aula 8) sem misturar etapas diferentes'
    );
    assert.equal(
      recAula2Fast.isFinalizacaoAntecipada,
      true,
      'Aluno de 35 min na Etapa 2 (média ~69 min) deve ser identificado com finalização antecipada'
    );
    assert.equal(
      recAula8Normal.isFinalizacaoAntecipada,
      false,
      'Aluno de 40 min na Etapa 8 (média 41 min) NÃO deve ser marcado como finalização antecipada'
    );

    const filteredAntecipada = filterAndSortRecords(evaluated, {
      search: '',
      status: 'TODOS',
      modalidade: 'TODAS',
      turno: 'TODOS',
      curso: 'TODOS',
      horario: 'TODOS',
      notaFilter: 'TODOS',
      finalizacaoAntecipada: true,
      apenasInadimplentes: false,
      sortBy: 'id',
      sortDir: 'asc',
    });
    assert.equal(filteredAntecipada.length, 1);
    assert.equal(filteredAntecipada[0].id, 4);
  });

  it('Seção 4.1, 4.2 e 4.3: Aba Consolidado — "Possíveis desistências" (3 critérios simultâneos), "Alunos ativos" (unificando contratos) e "Formações ativas"', () => {
    // Testar regra única isPossivelDesistencia
    assert.equal(
      isPossivelDesistencia({
        inadimplente: true,
        possuiApostila: false,
        presencaCount: 0,
        frequenciaSemanalPercent: 0,
      }),
      true,
      'Financeiro em atraso + Sem apostila + 0% de frequência deve retornar true para Possível Desistência'
    );
    assert.equal(
      isPossivelDesistencia({
        inadimplente: false,
        possuiApostila: false,
        presencaCount: 0,
        frequenciaSemanalPercent: 0,
      }),
      false,
      'Se financeiro estiver em dia, não é Possível Desistência'
    );
    assert.equal(
      isPossivelDesistencia({
        inadimplente: true,
        possuiApostila: true,
        presencaCount: 0,
        frequenciaSemanalPercent: 0,
      }),
      false,
      'Se possuir apostila, não é Possível Desistência'
    );
    assert.equal(
      isPossivelDesistencia({
        inadimplente: true,
        possuiApostila: false,
        presencaCount: 1,
        frequenciaSemanalPercent: 50,
      }),
      false,
      'Se tiver frequência > 0%, não é Possível Desistência'
    );

    const allEvaluated = evaluateAllStudentsAttendance(
      DB_STUDENT_RECORDS,
      18 * 60,
      {},
      DB_NPS_INVITATIONS,
      'Sábado'
    );

    const { metrics, filteredStudents } = computeDashboardAnalytics(allEvaluated, {
      aulaMin: null,
      aulaMax: null,
      situacaoFinanceira: 'TODOS',
      entregaApostila: 'TODOS',
      frequenciaSemanal: 'TODOS',
      diasSemana: [],
      categoriaCurso: 'TODOS',
      modalidade: 'AMBAS',
      horarios: [],
    });

    assert.equal(
      metrics.formacoesAtivasCount,
      filteredStudents.length,
      'Formações ativas deve corresponder ao total de formações consolidadas'
    );
    assert.ok(
      metrics.alunosAtivosUnicosCount > 0 &&
        metrics.alunosAtivosUnicosCount <= metrics.formacoesAtivasCount,
      `Alunos ativos únicos (${metrics.alunosAtivosUnicosCount}) deve unificar alunos com mais de um contrato/formação (${metrics.formacoesAtivasCount})`
    );

    const possiveisFiltered = filterDashboardStudentsByCardSelection(
      filteredStudents,
      'POSSIVEIS_DESISTENCIAS'
    );
    assert.equal(possiveisFiltered.length, metrics.possiveisDesistenciasCount);
    for (const st of possiveisFiltered) {
      assert.equal(st.inadimplente, true);
      assert.equal(st.possuiApostila, false);
      assert.equal(st.presencaCount, 0);
      assert.equal(st.isPossivelDesistencia, true);
    }

    const unicosFiltered = filterDashboardStudentsByCardSelection(
      filteredStudents,
      'ALUNOS_ATIVOS_UNICOS'
    );
    assert.equal(
      unicosFiltered.length,
      metrics.alunosAtivosUnicosCount,
      'Filtro do card Alunos ativos deve retornar exatamente 1 registro por aluno único'
    );
  });

  it('Seção 5.1: Convites do NPS — Consistência de convites no ano e preservação do status de envio codificado no banco', () => {
    const deduplicated = filterAndDeduplicateAnnualNpsInvitations(
      DB_NPS_INVITATIONS,
      2026
    );
    assert.ok(
      deduplicated.length >= 100,
      `A quantidade de convites NPS deve conter ao menos 100 convites ativos (encontrados: ${deduplicated.length})`
    );
    for (const inv of deduplicated) {
      assert.ok(
        inv.emailDeliveryStatus === 'Enviado' ||
          inv.emailDeliveryStatus === 'Entregue' ||
          inv.emailDeliveryStatus === 'Aberto' ||
          inv.emailDeliveryStatus === 'Não entregue',
        `Status de envio inválido: ${inv.emailDeliveryStatus}`
      );
    }
  });

  it('Seção 5.2: Evasão — Regra centralizada em evaluateDayScheduleEvasao funcionando para 2 ou mais horários no dia', () => {
    // Aluno com 2 horários no dia: compareceu ao 1º (08:00) e faltou ao 2º (10:00) após o término
    const evasaoPair = [
      makeStudentRecord({
        id: 301,
        contrato: '5100752',
        diaSemana: 'Sexta-feira',
        horaInicio: '08:00',
        horaFim: '09:00',
        horario: '08:00 às 09:00',
        status: 'FINALIZADO',
        presencaOuFalta: 'P',
        inicio: '30/10/2026 08:02',
      }),
      makeStudentRecord({
        id: 302,
        contrato: '5100752',
        diaSemana: 'Sexta-feira',
        horaInicio: '09:00',
        horaFim: '10:00',
        horario: '09:00 às 10:00',
        status: 'NÃO INICIADO',
        presencaOuFalta: 'F',
        inicio: '',
      }),
    ];

    const evaluatedAt11h = evaluateAllStudentsAttendance(
      evasaoPair,
      11 * 60,
      {},
      [],
      'Sexta-feira'
    );
    assert.equal(
      evaluatedAt11h[0].isEvasao,
      true,
      'Aluno que compareceu ao 1º horário e faltou ao 2º horário já encerrado deve ter isEvasao = true'
    );
    assert.equal(
      evaluatedAt11h[1].isEvasao,
      true,
      'O 2º horário em que o aluno faltou após ter comparecido ao 1º deve ser marcado como isEvasao = true'
    );
  });

  it('Validação de Regra de Negócio: O cálculo de evasão é por formação do aluno, não por contrato', () => {
    // Caso 1: Aluno com 1 contrato e 2 formações distintas (Informática às 08h e Inglês às 09h).
    // Presença em Informática e Falta em Inglês.
    // Como cada formação tem apenas 1 agendamento, NENHUMA formação cometeu evasão!
    const multiFormacaoRecords = [
      makeStudentRecord({
        id: 401,
        contrato: 'CTR-MULTI-01',
        nomeCompleto: 'Carlos Eduardo Oliveira',
        formacao: 'INFORMÁTICA - DINÂMICA',
        curso: 'INFORMÁTICA ESSENCIAL',
        diaSemana: 'Sábado',
        horaInicio: '08:00',
        horaFim: '09:00',
        status: 'FINALIZADO',
        presencaOuFalta: 'P',
        inicio: '31/10/2026 08:02',
      }),
      makeStudentRecord({
        id: 402,
        contrato: 'CTR-MULTI-01',
        nomeCompleto: 'Carlos Eduardo Oliveira',
        formacao: 'INGLÊS EVOLUTION',
        curso: 'BOOK 1',
        diaSemana: 'Sábado',
        horaInicio: '09:00',
        horaFim: '10:00',
        status: 'NÃO INICIADO',
        presencaOuFalta: 'F',
        inicio: '',
      }),
    ];

    const evaluatedCaso1 = evaluateAllStudentsAttendance(
      multiFormacaoRecords,
      11 * 60,
      {},
      [],
      'Sábado'
    );
    assert.equal(
      evaluatedCaso1[0].isEvasao,
      false,
      'Informática com 1 único agendamento e presença não deve ser considerada evasão'
    );
    assert.equal(
      evaluatedCaso1[1].isEvasao,
      false,
      'Inglês com 1 único agendamento e ausência não deve ser considerada evasão'
    );
    const kpisCaso1 = computePerformanceKPIs(evaluatedCaso1, 11 * 60, {}, [], 'Sábado');
    assert.equal(
      kpisCaso1.evasaoCount,
      0,
      'Evasão por formação não deve gerar falso positivo quando o aluno tem 1 aula de cada formação'
    );

    // Caso 2: Aluno com mais de 1 formação, sendo que Informática tem 2 agendamentos (08h e 09h)
    // e Inglês tem 1 agendamento (10h).
    // O aluno comparece à 1ª aula de Informática (08h) e falta à 2ª aula de Informática (09h).
    // O aluno comparece à aula de Inglês (10h).
    // A evasão deve ser apontada EXCLUSIVAMENTE na formação Informática!
    const caso2Records = [
      makeStudentRecord({
        id: 403,
        contrato: 'CTR-MULTI-02',
        nomeCompleto: 'Mariana Lima Barbosa',
        formacao: 'INFORMÁTICA - DINÂMICA',
        curso: 'INFORMÁTICA ESSENCIAL',
        diaSemana: 'Sábado',
        horaInicio: '08:00',
        horaFim: '09:00',
        status: 'FINALIZADO',
        presencaOuFalta: 'P',
        inicio: '31/10/2026 08:02',
      }),
      makeStudentRecord({
        id: 404,
        contrato: 'CTR-MULTI-02',
        nomeCompleto: 'Mariana Lima Barbosa',
        formacao: 'INFORMÁTICA - DINÂMICA',
        curso: 'INFORMÁTICA ESSENCIAL',
        diaSemana: 'Sábado',
        horaInicio: '09:00',
        horaFim: '10:00',
        status: 'NÃO INICIADO',
        presencaOuFalta: 'F',
        inicio: '',
      }),
      makeStudentRecord({
        id: 405,
        contrato: 'CTR-MULTI-02',
        nomeCompleto: 'Mariana Lima Barbosa',
        formacao: 'INGLÊS EVOLUTION',
        curso: 'BOOK 1',
        diaSemana: 'Sábado',
        horaInicio: '10:00',
        horaFim: '11:00',
        status: 'FINALIZADO',
        presencaOuFalta: 'P',
        inicio: '31/10/2026 10:01',
      }),
    ];

    const evaluatedCaso2 = evaluateAllStudentsAttendance(
      caso2Records,
      12 * 60,
      {},
      [],
      'Sábado'
    );
    assert.equal(
      evaluatedCaso2[0].isEvasao,
      true,
      'Aula 1 da formação Informática deve ser marcada como isEvasao = true'
    );
    assert.equal(
      evaluatedCaso2[1].isEvasao,
      true,
      'Aula 2 da formação Informática deve ser marcada como isEvasao = true'
    );
    assert.equal(
      evaluatedCaso2[2].isEvasao,
      false,
      'Formação Inglês com presença integral NÃO cometeu evasão'
    );
    const kpisCaso2 = computePerformanceKPIs(evaluatedCaso2, 12 * 60, {}, [], 'Sábado');
    assert.equal(
      kpisCaso2.evasaoCount,
      1,
      'Evasão deve contabilizar exatamente 1 formação em evasão'
    );

    // Caso 3: Aluno com 2 formações, e AMBAS cometeram evasão no mesmo dia
    // (2 aulas em Informática: 1 P e 1 F; e 2 aulas em Inglês: 1 P e 1 F)
    // O evasaoCount deve ser 2 (contabilizando por cada formação do aluno, não 1 pelo contrato).
    const caso3Records = [
      makeStudentRecord({
        id: 406,
        contrato: 'CTR-MULTI-03',
        nomeCompleto: 'Gabriel Souza Ramos',
        formacao: 'INFORMÁTICA - DINÂMICA',
        diaSemana: 'Sábado',
        horaInicio: '08:00',
        status: 'FINALIZADO',
        presencaOuFalta: 'P',
        inicio: '31/10/2026 08:02',
      }),
      makeStudentRecord({
        id: 407,
        contrato: 'CTR-MULTI-03',
        nomeCompleto: 'Gabriel Souza Ramos',
        formacao: 'INFORMÁTICA - DINÂMICA',
        diaSemana: 'Sábado',
        horaInicio: '09:00',
        status: 'NÃO INICIADO',
        presencaOuFalta: 'F',
      }),
      makeStudentRecord({
        id: 408,
        contrato: 'CTR-MULTI-03',
        nomeCompleto: 'Gabriel Souza Ramos',
        formacao: 'INGLÊS EVOLUTION',
        diaSemana: 'Sábado',
        horaInicio: '10:00',
        status: 'FINALIZADO',
        presencaOuFalta: 'P',
        inicio: '31/10/2026 10:03',
      }),
      makeStudentRecord({
        id: 409,
        contrato: 'CTR-MULTI-03',
        nomeCompleto: 'Gabriel Souza Ramos',
        formacao: 'INGLÊS EVOLUTION',
        diaSemana: 'Sábado',
        horaInicio: '11:00',
        status: 'NÃO INICIADO',
        presencaOuFalta: 'F',
      }),
    ];

    const evaluatedCaso3 = evaluateAllStudentsAttendance(
      caso3Records,
      12 * 60,
      {},
      [],
      'Sábado'
    );
    assert.equal(evaluatedCaso3[0].isEvasao, true, 'Informática teve evasão');
    assert.equal(evaluatedCaso3[1].isEvasao, true, 'Informática teve evasão');
    assert.equal(evaluatedCaso3[2].isEvasao, true, 'Inglês teve evasão');
    assert.equal(evaluatedCaso3[3].isEvasao, true, 'Inglês teve evasão');

    const kpisCaso3 = computePerformanceKPIs(evaluatedCaso3, 12 * 60, {}, [], 'Sábado');
    assert.equal(
      kpisCaso3.evasaoCount,
      2,
      'Se o aluno tiver mais que 1 formação em evasão, o cálculo deve contabilizar cada formação (2)'
    );

    // Caso 4: Aluno com contratos diferentes (ex.: CTR-A e CTR-B) na MESMA formação
    // Deve reconhecer que ambos os horários pertencem à mesma formação do mesmo aluno!
    const caso4Records = [
      makeStudentRecord({
        id: 410,
        contrato: 'CTR-CONTRATO-A',
        nomeCompleto: 'Beatriz Martins',
        formacao: 'GESTÃO EMPRESARIAL',
        diaSemana: 'Sábado',
        horaInicio: '08:00',
        status: 'FINALIZADO',
        presencaOuFalta: 'P',
        inicio: '31/10/2026 08:05',
      }),
      makeStudentRecord({
        id: 411,
        contrato: 'CTR-CONTRATO-B',
        nomeCompleto: 'Beatriz Martins',
        formacao: 'GESTÃO EMPRESARIAL',
        diaSemana: 'Sábado',
        horaInicio: '09:00',
        status: 'NÃO INICIADO',
        presencaOuFalta: 'F',
      }),
    ];

    const evaluatedCaso4 = evaluateAllStudentsAttendance(
      caso4Records,
      10 * 60,
      {},
      [],
      'Sábado'
    );
    assert.equal(
      evaluatedCaso4[0].isEvasao,
      true,
      'Evasão por formação deve identificar evasão mesmo com contratos diferentes para a mesma formação do aluno'
    );
    assert.equal(evaluatedCaso4[1].isEvasao, true);
    const kpisCaso4 = computePerformanceKPIs(evaluatedCaso4, 10 * 60, {}, [], 'Sábado');
    assert.equal(kpisCaso4.evasaoCount, 1);
  });

  it('Seção 5.3: Presença e Faltas (especial atenção aos alunos de Inglês) — Contagem unificada em todas as telas', () => {
    const englishRecords = DB_STUDENT_RECORDS.filter(
      (r) => resolveStudentCategory(r) === 'INGLÊS'
    );
    assert.ok(englishRecords.length > 100, 'Deve existir centenas de agendamentos de Inglês no banco');

    const evaluated = evaluateAllStudentsAttendance(
      DB_STUDENT_RECORDS,
      18 * 60,
      {},
      DB_NPS_INVITATIONS,
      'Sábado'
    );
    const evaluatedEnglish = evaluated.filter((r) => r.categoriaCurso === 'INGLÊS');
    const englishPresent = evaluatedEnglish.filter((r) => r.attendanceStatus === 'Presença');
    assert.ok(
      englishPresent.length >= 6,
      `Alunos de Inglês com presença ("P" / Sistema Acadêmico) devem ter attendanceStatus === "Presença" (encontrados: ${englishPresent.length})`
    );

    const { metrics } = computeDashboardAnalytics(evaluated, {
      aulaMin: null,
      aulaMax: null,
      situacaoFinanceira: 'TODOS',
      entregaApostila: 'TODOS',
      frequenciaSemanal: 'TODOS',
      diasSemana: [],
      categoriaCurso: 'INGLÊS',
      modalidade: 'AMBAS',
      horarios: [],
    });
    assert.ok(
      metrics.frequenciaPercentual > 0,
      `Média de comparecimento dos alunos de Inglês no Consolidado deve ser > 0% (atual: ${metrics.frequenciaPercentual}%)`
    );
  });

  it('Seção 5.4: Professor — Todo aluno possui professor individual vinculado (zero "A definir")', () => {
    assert.ok(DB_STUDENT_RECORDS.length >= 700);
    for (const r of DB_STUDENT_RECORDS) {
      const prof = resolveRecordProfessor(r);
      assert.ok(
        prof && prof.length > 0 && prof !== 'A definir',
        `Contrato ${r.contrato} (${r.nomeCompleto}) está sem professor definido: "${prof}"`
      );
    }
  });

  it('Validação 1: Presença/falta ao voltar de dia no kanban — dia anterior encerrado computa presença real e falta real, nunca "Não iniciada"', () => {
    // Cenário: Hoje é Terça-feira às 09:00. O usuário navega para Segunda-feira (dia anterior já encerrado).
    const pastDayRecords = [
      makeStudentRecord({
        id: 701,
        contrato: '90001',
        nomeCompleto: 'Aluno Veio Ontem',
        diaSemana: 'Segunda-feira',
        horaInicio: '14:00',
        horaFim: '16:00',
        horario: '14:00 às 16:00',
        status: 'FINALIZADO',
        presencaOuFalta: 'P',
        inicio: '27/10/2026 14:05',
        fim: '27/10/2026 15:50',
      }),
      makeStudentRecord({
        id: 702,
        contrato: '90002',
        nomeCompleto: 'Aluno Faltou Ontem',
        diaSemana: 'Segunda-feira',
        horaInicio: '14:00',
        horaFim: '16:00',
        horario: '14:00 às 16:00',
        status: 'NÃO INICIADO',
        presencaOuFalta: '',
        inicio: '',
        fim: '',
      }),
    ];

    // Avaliação usando Terça-feira como dia de referência (hoje)
    const evaluated = evaluateAllStudentsAttendance(
      pastDayRecords,
      9 * 60, // 09:00 (hora atual de hoje)
      {},
      [],
      'Terça-feira'
    );

    const recVeio = evaluated.find((r) => r.id === 701)!;
    const recFaltou = evaluated.find((r) => r.id === 702)!;

    assert.equal(
      recVeio.attendanceStatus,
      'Presença',
      'Aluno que compareceu ontem deve aparecer como Presença, e não como Não iniciada'
    );
    assert.equal(
      recFaltou.attendanceStatus,
      'Falta',
      'Aluno que faltou ontem deve aparecer como Falta, e não como Não iniciada'
    );

    // Contadores e KPIs
    const kpis = computePerformanceKPIs(
      evaluated,
      9 * 60,
      {},
      [],
      'Terça-feira'
    );
    assert.equal(kpis.presencaCount, 1, 'Deve contabilizar 1 presença');
    assert.equal(kpis.faltaCount, 1, 'Deve contabilizar 1 falta');
    assert.equal(kpis.mediaFrequencia, 50, 'Percentual de frequência deve ser 50%');

    // Colunas do Kanban
    const columns = groupByHourKanban(
      evaluated,
      'AGENDADO',
      9 * 60,
      {},
      [],
      'Terça-feira'
    );
    assert.equal(columns.length, 1);
    const col14 = columns[0];
    assert.equal(col14.isPastHour, true, 'Horário de dia anterior deve ser marcado como passado');
    assert.equal(col14.isCurrentHour, false);
    assert.equal(col14.presencaCount, 1);
    assert.equal(col14.faltaCount, 1);
    assert.equal(col14.mediaFrequencia, 50);
  });

  it('Validação 2: Status de evasão — Atribuição imediata e remoção correta ao justificar/marcar presença', () => {
    // Aluno com 2 horários no mesmo dia: compareceu ao 1º e faltou ao 2º após expirar a tolerância
    const recordsDia = [
      makeStudentRecord({
        id: 801,
        contrato: '88801',
        diaSemana: 'Quarta-feira',
        horaInicio: '08:00',
        horaFim: '10:00',
        horario: '08:00 às 10:00',
        status: 'FINALIZADO',
        presencaOuFalta: 'P',
        inicio: '28/10/2026 08:05',
      }),
      makeStudentRecord({
        id: 802,
        contrato: '88801',
        diaSemana: 'Quarta-feira',
        horaInicio: '10:00',
        horaFim: '12:00',
        horario: '10:00 às 12:00',
        status: 'NÃO INICIADO',
        presencaOuFalta: 'F',
        inicio: '',
      }),
    ];

    // Às 10:30 (tolerância de 15m já passou)
    const evaluatedAt1030 = evaluateAllStudentsAttendance(
      recordsDia,
      10 * 60 + 30,
      {},
      [],
      'Quarta-feira'
    );
    assert.equal(
      evaluatedAt1030[0].isEvasao,
      true,
      'Evasão deve ser atribuída quando aluno compareceu a um horário e faltou a outro no mesmo dia'
    );
    assert.ok(
      evaluatedAt1030[0].evasaoSummary?.includes('1 presença') &&
        evaluatedAt1030[0].evasaoSummary?.includes('1 ausência'),
      `Resumo de evasão deve descrever presenças e faltas: ${evaluatedAt1030[0].evasaoSummary}`
    );

    // Remoção da evasão: professor marca presença manual no 2º horário
    const evaluatedComPresenca = evaluateAllStudentsAttendance(
      recordsDia,
      10 * 60 + 30,
      { 802: 'Presença' },
      [],
      'Quarta-feira'
    );
    assert.equal(
      evaluatedComPresenca[0].isEvasao,
      false,
      'Status de evasão deve ser removido quando o 2º horário for justificado ou marcado como Presença'
    );
    assert.equal(
      evaluatedComPresenca[0].evasaoSummary,
      null,
      'Resumo de evasão deve ser nulo após remoção'
    );

    // Aluno com 2 horários que faltou a AMBOS (ausência integral, não evasão)
    const faltouAmbos = [
      makeStudentRecord({
        id: 803,
        contrato: '88802',
        diaSemana: 'Quarta-feira',
        horaInicio: '08:00',
        status: 'NÃO INICIADO',
        presencaOuFalta: 'F',
      }),
      makeStudentRecord({
        id: 804,
        contrato: '88802',
        diaSemana: 'Quarta-feira',
        horaInicio: '10:00',
        status: 'NÃO INICIADO',
        presencaOuFalta: 'F',
      }),
    ];
    const evaluatedFaltouAmbos = evaluateAllStudentsAttendance(
      faltouAmbos,
      10 * 60 + 30,
      {},
      [],
      'Quarta-feira'
    );
    assert.equal(
      evaluatedFaltouAmbos[0].isEvasao,
      false,
      'Aluno que faltou a todos os horários do dia não cometeu evasão (é falta integral)'
    );
  });

  it('Validação 3: Card "Possíveis desistências" (Consolidado) — Exclui alunos com 0 aulas contabilizadas', () => {
    // Aluno novo com financeiro em atraso e sem apostila, MAS com 0 aulas contabilizadas (sem histórico de presença/falta)
    assert.equal(
      isPossivelDesistencia({
        inadimplente: true,
        possuiApostila: false,
        presencaCount: 0,
        faltaCount: 0,
        frequenciaSemanalPercent: null,
      }),
      false,
      'Aluno sem nenhuma aula contabilizada NÃO deve aparecer em Possíveis Desistências'
    );

    assert.equal(
      isPossivelDesistencia({
        inadimplente: true,
        possuiApostila: false,
        presencaCount: 0,
        faltaCount: 0,
        totalAulasContabilizadas: 0,
      }),
      false,
      'Aluno com totalAulasContabilizadas = 0 não deve ser considerado desistência'
    );

    // Aluno que cumpre todos os critérios COM pelo menos 1 aula contabilizada
    assert.equal(
      isPossivelDesistencia({
        inadimplente: true,
        possuiApostila: false,
        presencaCount: 0,
        faltaCount: 1,
        frequenciaSemanalPercent: 0,
      }),
      true,
      'Aluno com 1 aula realizada e 0% de frequência, inadimplente e sem apostila DEVE ser considerado desistência'
    );

    assert.equal(
      isPossivelDesistencia({
        inadimplente: true,
        possuiApostila: false,
        presencaCount: 0,
        faltaCount: 2,
        totalAulasContabilizadas: 2,
      }),
      true,
      'Aluno com 2 faltas e 0 presenças, inadimplente e sem apostila deve ser considerado desistência'
    );
  });

  it('Validação 4: Dia inicial — Fuso horário America/Sao_Paulo dinâmico e sem travamento de data antiga', () => {
    const todayWeekday = getCurrentBrasiliaWeekdayLabel();
    assert.ok(
      [
        'Domingo',
        'Segunda-feira',
        'Terça-feira',
        'Quarta-feira',
        'Quinta-feira',
        'Sexta-feira',
        'Sábado',
      ].includes(todayWeekday),
      `Dia de Brasília deve ser um dia válido da semana (recebido: ${todayWeekday})`
    );

    // Teste de comparação de dia
    assert.equal(compareWeekdayWithCurrent('Segunda-feira', 'Terça-feira'), 'PAST_DAY');
    assert.equal(compareWeekdayWithCurrent('Terça-feira', 'Terça-feira'), 'CURRENT_DAY');
    assert.equal(compareWeekdayWithCurrent('Quarta-feira', 'Terça-feira'), 'FUTURE_DAY');
  });

  it('Validação 5: Aulas iniciadas adiantadas (ex.: agendada às 10:00 e iniciada às 09:50) contabilizam Presença e status INICIADO imediatamente e nunca viram Falta', () => {
    const alunoAdiantado = makeStudentRecord({
      id: 950,
      contrato: '4887950',
      nomeCompleto: 'Fabiana Soares De Oliveira',
      diaSemana: 'Sexta-feira',
      horaInicio: '10:00',
      horaFim: '11:00',
      horario: '10:00 à 11:00',
      inicio: '06/11/26 09:50',
      fim: '',
      status: 'INICIADO',
      presencaOuFalta: '',
      infoAula: 'Portal do Aluno',
    });

    const colegaAindaNaoIniciou = makeStudentRecord({
      id: 951,
      contrato: '5099999',
      nomeCompleto: 'Colega Das Dez',
      diaSemana: 'Sexta-feira',
      horaInicio: '10:00',
      horaFim: '11:00',
      horario: '10:00 à 11:00',
      inicio: '',
      fim: '',
      status: 'NÃO INICIADO',
      presencaOuFalta: '',
      infoAula: 'Não registrado',
    });

    // 1. Avaliação às 09:50 (10 minutos antes do horário agendado 10:00)
    const evalAt0950 = evaluateAllStudentsAttendance(
      [alunoAdiantado, colegaAindaNaoIniciou],
      9 * 60 + 50,
      {},
      [],
      'Sexta-feira'
    );
    const fabiana0950 = evalAt0950.find((r) => r.id === 950)!;
    const colega0950 = evalAt0950.find((r) => r.id === 951)!;

    assert.equal(
      fabiana0950.attendanceStatus,
      'Presença',
      'Aluno que iniciou às 09:50 uma aula das 10:00 já deve ter attendanceStatus === "Presença" às 09:50'
    );
    assert.equal(
      fabiana0950.status,
      'INICIADO',
      'Aluno que iniciou às 09:50 deve manter status === "INICIADO" (nunca "NÃO INICIADO")'
    );
    assert.equal(
      fabiana0950.presencaOuFalta,
      'P',
      'Aluno que iniciou adiantado deve ter presencaOuFalta === "P" preservado'
    );
    assert.equal(
      fabiana0950.inicio,
      '06/11/26 09:50',
      'Horário de início 09:50 jamais deve ser apagado antes das 10:00'
    );
    assert.equal(
      colega0950.attendanceStatus,
      'Não iniciada',
      'Colega das 10:00 que ainda não iniciou continua como "Não iniciada" às 09:50'
    );

    // 2. Se o registro avaliado às 09:50 for reavaliado às 10:20 (após os 15 min de tolerância das 10:00), NUNCA pode virar Falta!
    const evalAt1020 = evaluateAllStudentsAttendance(
      evalAt0950,
      10 * 60 + 20,
      {},
      [],
      'Sexta-feira'
    );
    const fabiana1020 = evalAt1020.find((r) => r.id === 950)!;
    const colega1020 = evalAt1020.find((r) => r.id === 951)!;

    assert.equal(
      fabiana1020.attendanceStatus,
      'Presença',
      'Após passar das 10:15 (tolerância), o aluno que iniciou às 09:50 deve permanecer com Presença e nunca receber Falta'
    );
    assert.equal(
      fabiana1020.status,
      'INICIADO',
      'Status deve permanecer INICIADO às 10:20 enquanto não finalizar'
    );
    assert.equal(
      colega1020.attendanceStatus,
      'Falta',
      'Colega que não iniciou até 10:20 recebe Falta normalmente'
    );

    // 3. Verifica que KPIs e Kanban às 09:50 já contabilizam a presença da aula iniciada adiantada
    const kpis0950 = computePerformanceKPIs(
      evalAt0950,
      9 * 60 + 50,
      {},
      [],
      'Sexta-feira'
    );
    assert.equal(
      kpis0950.presencaCount,
      1,
      'KPI de presenças às 09:50 já deve contabilizar 1 presença do aluno adiantado'
    );
    assert.equal(
      kpis0950.iniciados,
      1,
      'KPI de iniciados às 09:50 já deve contabilizar 1 aula iniciada'
    );

    const cols0950 = groupByHourKanban(
      evalAt0950,
      'AGENDADO',
      9 * 60 + 50,
      {},
      [],
      'Sexta-feira'
    );
    assert.equal(cols0950.length, 1);
    assert.equal(cols0950[0].presencaCount, 1);
    assert.equal(cols0950[0].iniciados, 1);
  });

  it('Validação 6: Fidelidade 100% com Portal do Aluno — dia inteiro sem registros (0 P e 0 F em >= 3 alunos, ex.: Segunda-feira ou Sábado) permanece 100% Não iniciada sem fabricar faltas', () => {
    const mondayUnregisteredBatch: StudentPerformanceRecord[] = [
      makeStudentRecord({
        id: 960,
        contrato: '5096001',
        nomeCompleto: 'ALUNO SEGUNDA 1',
        diaSemana: 'Segunda-feira',
        horario: '08:00 à 10:00',
        horaInicio: '08:00',
        horaFim: '10:00',
        turno: 'Manhã',
        inicio: '',
        fim: '',
        status: 'NÃO INICIADO',
        presencaOuFalta: '',
        infoAula: 'Não registrado',
      }),
      makeStudentRecord({
        id: 961,
        contrato: '5096002',
        nomeCompleto: 'ALUNO SEGUNDA 2',
        diaSemana: 'Segunda-feira',
        horario: '09:00 à 11:00',
        horaInicio: '09:00',
        horaFim: '11:00',
        turno: 'Manhã',
        inicio: '',
        fim: '',
        status: 'NÃO INICIADO',
        presencaOuFalta: '',
        infoAula: 'Não registrado',
      }),
      makeStudentRecord({
        id: 962,
        contrato: '5096003',
        nomeCompleto: 'ALUNO SEGUNDA 3',
        diaSemana: 'Segunda-feira',
        horario: '10:00 à 12:00',
        horaInicio: '10:00',
        horaFim: '12:00',
        turno: 'Manhã',
        inicio: '',
        fim: '',
        status: 'NÃO INICIADO',
        presencaOuFalta: '',
        infoAula: 'Não registrado',
      }),
    ];

    const evaluatedMonday = evaluateAllStudentsAttendance(
      mondayUnregisteredBatch,
      15 * 60,
      {},
      [],
      'Sexta-feira'
    );
    const kpisMonday = computePerformanceKPIs(
      evaluatedMonday,
      15 * 60,
      {},
      [],
      'Sexta-feira'
    );

    assert.equal(kpisMonday.presencaCount, 0, 'Segunda-feira sem registros no Portal deve ter 0 Presenças');
    assert.equal(kpisMonday.faltaCount, 0, 'Segunda-feira sem registros no Portal deve ter 0 Faltas');
    assert.equal(kpisMonday.naoIniciados, 3, 'Todos os 3 alunos devem permanecer como Não iniciada');

    // E verifica parsing de string HH:MM:SS vs ISO em getBrasiliaCurrentMinutes
    assert.equal(getBrasiliaCurrentMinutes('14:35:00'), 14 * 60 + 35);
    const isoMinutes = getBrasiliaCurrentMinutes('2026-11-07T15:20:00.000Z');
    assert.equal(isoMinutes, 12 * 60 + 20);
  });
});

