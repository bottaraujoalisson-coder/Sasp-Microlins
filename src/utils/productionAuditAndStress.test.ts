import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticatePlatformLogin,
  createDefaultSchoolsRegistry,
  DEFAULT_ADMIN_CREDENTIALS,
  generateInternalSchoolId,
  upsertSchoolInRegistry,
  upsertUserInSchoolRegistry,
} from './authRegistry';
import { hashPasswordArgon2id } from './securityCrypto';
import {
  acquireSchoolSyncLock,
  comparePortalWithStoredRecords,
  deleteSchoolFromDb,
  getAuditLogsFromDb,
  getNpsRecordsFromDb,
  getStudentEducatorsMap,
  getStudentRecordsFromDb,
  getSyncLogsFromDb,
  isSchoolSyncLocked,
  recordAuditLog,
  recordSyncLog,
  releaseSchoolSyncLock,
  upsertNpsRecordsInDb,
  upsertSchoolInDb,
  upsertStudentEducator,
  upsertStudentRecordsInDb,
} from '../db/database';
import {
  computeDashboardAnalytics,
  evaluateAllStudentsAttendance,
  evaluateStudentAttendance,
  filterAndSortRecords,
  sortConsolidatedStudents,
} from './performanceAnalytics';
import {
  CONSOLIDATED_TABLE_COLUMNS,
  extractStudentGroupValue,
  getStudentColumnDisplayValue,
} from './powerBiConsolidation';
import { SYSTEM_INDICATORS_HELP } from '../components/IndicatorHelpPopover';
import {
  ALL_WEEK_STUDENT_RECORDS,
  INITIAL_ACTIVE_NPS_INVITATIONS,
  StudentPerformanceRecord,
} from '../data/microlinsData';

test('Seção 3 — Autenticação de Produção (Admin, Escola e Fallback Resiliente)', () => {
  const adminPass = 'AdminProd@2026!';
  const schoolPass = 'SchoolProd@2026!';
  const adminCredentials = {
    login: DEFAULT_ADMIN_CREDENTIALS.login,
    senha: hashPasswordArgon2id(adminPass),
    alternateHash: DEFAULT_ADMIN_CREDENTIALS.alternateHash,
    nomeCompleto: DEFAULT_ADMIN_CREDENTIALS.nomeCompleto,
    cargo: DEFAULT_ADMIN_CREDENTIALS.cargo,
  };
  const { schools } = upsertUserInSchoolRegistry(
    createDefaultSchoolsRegistry(),
    'school-1875',
    {
      id: 'user-a116882',
      login: 'a116882',
      senha: schoolPass,
      nomeCompleto: 'Coordenação Pedagógica',
      cargo: 'Auxiliar Pedagógico',
    }
  );

  // 1. Login Admin válido
  const adminRes = authenticatePlatformLogin(
    schools,
    DEFAULT_ADMIN_CREDENTIALS.login,
    adminPass,
    adminCredentials
  );
  assert.equal(adminRes.ok, true);
  assert.equal(adminRes.session?.role, 'ADMIN');

  // 2. Login Escola válido (a116882)
  const schoolRes = authenticatePlatformLogin(schools, 'a116882', schoolPass, adminCredentials);
  assert.equal(schoolRes.ok, true);
  assert.equal(schoolRes.session?.role, 'ESCOLA');
  assert.equal(schoolRes.session?.schoolId, 'school-1875');

  // 3. Credenciais inválidas devem ser recusadas com mensagem clara
  const invalidRes = authenticatePlatformLogin(
    schools,
    'a116882',
    'senha_errada_999',
    adminCredentials
  );
  assert.equal(invalidRes.ok, false);
  assert.ok(invalidRes.error && invalidRes.error.length > 5);
});

test('Seção 4 — Identificação Interna Automática (sch_<uuid>) e Isolamento Multi-Escola Completo (Escolas A, B e C)', () => {
  // 4.1 IDs internos gerados automaticamente pelo banco (distintos do código externo)
  const idA = generateInternalSchoolId();
  const idB = generateInternalSchoolId();
  const idC = generateInternalSchoolId();

  assert.match(idA, /^sch_[0-9a-f-]{16,36}$/);
  assert.match(idB, /^sch_[0-9a-f-]{16,36}$/);
  assert.match(idC, /^sch_[0-9a-f-]{16,36}$/);
  assert.notEqual(idA, idB);
  assert.notEqual(idB, idC);

  // Mesmo código externo do Portal ("1875") em três instituições distintas
  const registry = createDefaultSchoolsRegistry();
  const { schools: withSchoolA, school: foundA } = upsertSchoolInRegistry(registry, {
    id: idA,
    nome: 'Escola Simulada A',
    codigoPortal: '1875',
    npsEmail: 'a@escola.com',
    npsPassword: '123',
    npsCompanyFilter: 'Escola Simulada A',
  });
  const { schools: withSchoolB, school: foundB } = upsertSchoolInRegistry(withSchoolA, {
    id: idB,
    nome: 'Escola Simulada B',
    codigoPortal: '1875',
    npsEmail: 'b@escola.com',
    npsPassword: '123',
    npsCompanyFilter: 'Escola Simulada B',
  });
  const { school: foundC } = upsertSchoolInRegistry(withSchoolB, {
    id: idC,
    nome: 'Escola Simulada C',
    codigoPortal: '1875',
    npsEmail: 'c@escola.com',
    npsPassword: '123',
    npsCompanyFilter: 'Escola Simulada C',
  });

  upsertSchoolInDb({
    id: foundA.id,
    nome: foundA.nome,
    codigoPortal: foundA.codigoPortal,
    npsEmail: foundA.npsCredential.email,
    npsPassword: foundA.npsCredential.password,
  });
  upsertSchoolInDb({
    id: foundB.id,
    nome: foundB.nome,
    codigoPortal: foundB.codigoPortal,
    npsEmail: foundB.npsCredential.email,
    npsPassword: foundB.npsCredential.password,
  });
  upsertSchoolInDb({
    id: foundC.id,
    nome: foundC.nome,
    codigoPortal: foundC.codigoPortal,
    npsEmail: foundC.npsCredential.email,
    npsPassword: foundC.npsCredential.password,
  });

  // Mesmo número de contrato ("77777") e mesmo horário em todas as 3 escolas, com dados distintos
  const baseRecord = ALL_WEEK_STUDENT_RECORDS[0];
  upsertStudentRecordsInDb(
    [
      {
        ...baseRecord,
        id: 777771,
        contrato: '77777',
        nomeCompleto: 'ALUNO ESCOLA A',
        diaSemana: 'Quarta-feira',
        horaInicio: '14:00',
        presencaOuFalta: 'P',
        inicio: '14:02:00',
        educador: 'Educador Escola A',
      },
    ],
    idA,
    '1875',
    'Escola Simulada A',
    true
  );

  upsertStudentRecordsInDb(
    [
      {
        ...baseRecord,
        id: 777771,
        contrato: '77777',
        nomeCompleto: 'ALUNO ESCOLA B',
        diaSemana: 'Quarta-feira',
        horaInicio: '14:00',
        presencaOuFalta: 'F',
        inicio: '',
        educador: 'Educador Escola B',
      },
    ],
    idB,
    '1875',
    'Escola Simulada B',
    true
  );

  upsertStudentRecordsInDb(
    [
      {
        ...baseRecord,
        id: 777771,
        contrato: '77777',
        nomeCompleto: 'ALUNO ESCOLA C',
        diaSemana: 'Quarta-feira',
        horaInicio: '14:00',
        presencaOuFalta: '',
        inicio: '',
        educador: 'Educador Escola C',
      },
    ],
    idC,
    '1875',
    'Escola Simulada C',
    true
  );

  // Mesmo contrato em student_educators nas 3 escolas
  upsertStudentEducator('77777', 'ALUNO ESCOLA A', 'Educador Oficial A', '1875', idA);
  upsertStudentEducator('77777', 'ALUNO ESCOLA B', 'Educador Oficial B', '1875', idB);
  upsertStudentEducator('77777', 'ALUNO ESCOLA C', 'Educador Oficial C', '1875', idC);

  // Mesmo ID base de convite NPS nas 3 escolas
  const baseNps = INITIAL_ACTIVE_NPS_INVITATIONS[0];
  upsertNpsRecordsInDb(
    [{ ...baseNps, id: 'inv-shared-1', contrato: '77777', studentName: 'ALUNO ESCOLA A' }],
    idA
  );
  upsertNpsRecordsInDb(
    [{ ...baseNps, id: 'inv-shared-1', contrato: '77777', studentName: 'ALUNO ESCOLA B' }],
    idB
  );

  const recordsA = getStudentRecordsFromDb(idA);
  const recordsB = getStudentRecordsFromDb(idB);
  const recordsC = getStudentRecordsFromDb(idC);

  assert.equal(recordsA.length, 1);
  assert.equal(recordsB.length, 1);
  assert.equal(recordsC.length, 1);
  assert.equal(recordsA[0].nomeCompleto, 'ALUNO ESCOLA A');
  assert.equal(recordsA[0].presencaOuFalta, 'P');
  assert.equal(recordsB[0].nomeCompleto, 'ALUNO ESCOLA B');
  assert.equal(recordsB[0].presencaOuFalta, 'F');
  assert.equal(recordsC[0].nomeCompleto, 'ALUNO ESCOLA C');

  assert.equal(
    getStudentEducatorsMap('1875', idA).get('77777')?.educadorNome,
    'Educador Oficial A'
  );
  assert.equal(
    getStudentEducatorsMap('1875', idB).get('77777')?.educadorNome,
    'Educador Oficial B'
  );
  assert.equal(
    getStudentEducatorsMap('1875', idC).get('77777')?.educadorNome,
    'Educador Oficial C'
  );

  const npsA = getNpsRecordsFromDb(idA);
  const npsB = getNpsRecordsFromDb(idB);
  assert.equal(npsA.length, 1);
  assert.equal(npsB.length, 1);
  assert.equal(npsA[0].studentName, 'ALUNO ESCOLA A');
  assert.equal(npsB[0].studentName, 'ALUNO ESCOLA B');

  // Lock de sincronização isolado por escola
  assert.equal(acquireSchoolSyncLock(idA), true);
  assert.equal(isSchoolSyncLocked(idA), true);
  assert.equal(isSchoolSyncLocked(idB), false);
  assert.equal(acquireSchoolSyncLock(idB), true);
  releaseSchoolSyncLock(idA);
  releaseSchoolSyncLock(idB);
  assert.equal(isSchoolSyncLocked(idA), false);

  // Logs de sincronização e auditoria isolados por escola
  recordSyncLog({
    schoolId: idA,
    escolaCodigo: '1875',
    syncType: 'PORTAL_ALUNO',
    weekdayCode: '3',
    status: 'SUCCESS',
    recordsReceived: 25,
    recordsInserted: 0,
    recordsUpdated: 25,
    divergencesCount: 0,
    durationMs: 120,
  });
  recordAuditLog({
    actorLogin: 'admin',
    actorRole: 'ADMIN',
    action: 'TEST_MULTI_TENANT_AUDIT',
    resource: `schools/${idA}`,
    status: 'SUCCESS',
    details: 'Auditoria multi-escola verificada.',
  });

  assert.ok(getSyncLogsFromDb(idA).length >= 1);
  assert.equal(getSyncLogsFromDb(idB).length, 0);
  assert.ok(getAuditLogsFromDb(50).length >= 1);

  // Limpa os registros temporários das escolas simuladas após validar o isolamento
  for (const tid of [idA, idB, idC]) {
    deleteSchoolFromDb(tid);
  }
});

test('Seção 5 — Sincronização do Período da Tarde e Proteção contra Falsas Faltas', () => {
  const base = ALL_WEEK_STUDENT_RECORDS[0];

  // Cenário 1: Aula das 14:00 às 16:00 no dia atual (Quarta-feira, 15:30 = 930 min), período da tarde AINDA NÃO SINCRONIZADO (statusSistema = NAO_INICIADA / vazio)
  const unsyncedAfternoonStudent = {
    ...base,
    id: 90001,
    contrato: '90001',
    nomeCompleto: 'ALUNO TARDE NAO SINCRONIZADO',
    diaSemana: 'Quarta-feira',
    turno: 'Tarde' as const,
    horaInicio: '14:00',
    horaFim: '16:00',
    horario: '14:00 às 16:00',
    inicio: '',
    fim: '',
    presencaOuFalta: '' as const,
    status: 'NÃO INICIADO' as const,
    infoAula: 'Não registrado',
  };

  // Avaliado às 15:30 (930 min) na Quarta-feira sem confirmação de fechamento do período -> DEVE permanecer 'Não iniciada' (NUNCA virar 'Falta' indevida!)
  const evalUnsynced = evaluateStudentAttendance(
    unsyncedAfternoonStudent,
    930,
    {},
    [],
    'Quarta-feira',
    false
  );
  assert.equal(
    evalUnsynced.attendanceStatus,
    'Não iniciada',
    'Aluno da tarde sem sincronização confirmada não pode receber Falta automática'
  );

  // Cenário 2: Mesmo horário (15:30), porém o período da tarde JÁ FOI SINCRONIZADO (colega de turma das 14:00 já possui presença confirmada no Portal)
  const confirmedClassmate = {
    ...unsyncedAfternoonStudent,
    id: 90002,
    contrato: '90002',
    nomeCompleto: 'COLEGA TARDE PRESENTE',
    inicio: '14:03:00',
    presencaOuFalta: 'P' as const,
    status: 'INICIADO' as const,
    infoAula: 'Em andamento',
  };

  const evaluatedBatch = evaluateAllStudentsAttendance(
    [unsyncedAfternoonStudent, confirmedClassmate],
    930,
    {},
    INITIAL_ACTIVE_NPS_INVITATIONS,
    'Quarta-feira'
  );

  const evalPresent = evaluatedBatch.find((r) => r.contrato === '90002')!;
  const evalAbsentInConfirmedShift = evaluatedBatch.find((r) => r.contrato === '90001')!;

  assert.equal(evalPresent.attendanceStatus, 'Presença');
  assert.equal(
    evalAbsentInConfirmedShift.attendanceStatus,
    'Falta',
    'Quando o turno da tarde já foi sincronizado e há aula confirmada no horário, o aluno ausente após os 15min recebe Falta'
  );

  // Cenário 3: Reconciliação entre Portal e Banco preserva presença já confirmada caso o Portal retorne payload parcial
  const storedRecords: StudentPerformanceRecord[] = [confirmedClassmate];
  const incompletePortalPayload: StudentPerformanceRecord[] = [
    {
      ...confirmedClassmate,
      inicio: '',
      presencaOuFalta: '',
      status: 'NÃO INICIADO',
    },
  ];
  const reconciliation = comparePortalWithStoredRecords(incompletePortalPayload, storedRecords);
  assert.equal(reconciliation.divergencesCount, 1);
  assert.equal(reconciliation.reconciledRecords[0].presencaOuFalta, 'P');
  assert.equal(reconciliation.reconciledRecords[0].inicio, '14:03:00');
});

test('Seções 9, 10 e 15 — Aba Consolidado (Coluna Educador), Filtro Educador no Kanban e Dicionário (?) de Indicadores', async () => {
  // 1. Verificar coluna Educador na tabela do Consolidado
  const educadorCol = CONSOLIDATED_TABLE_COLUMNS.find((c) => c.id === 'educador');
  assert.ok(educadorCol, 'Coluna educador deve existir em CONSOLIDATED_TABLE_COLUMNS');
  assert.equal(educadorCol.label, 'Educador');

  const { fetchStudentRecords } = await import('./supabaseClient');
  let sourceRecords =
    ALL_WEEK_STUDENT_RECORDS.length > 0
      ? ALL_WEEK_STUDENT_RECORDS
      : getStudentRecordsFromDb('school-1875');
  if (sourceRecords.length === 0) {
    const supaRecords = await fetchStudentRecords('school-1875');
    if (supaRecords && supaRecords.length > 0) {
      sourceRecords = supaRecords;
    }
  }

  const evaluated = evaluateAllStudentsAttendance(sourceRecords, 600);
  const analytics = computeDashboardAnalytics(evaluated, {
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
  assert.ok(analytics.filteredStudents.length > 0);

  const sampleStudent = analytics.filteredStudents[0];
  assert.ok(typeof sampleStudent.educador === 'string' && sampleStudent.educador.length > 0);
  assert.equal(getStudentColumnDisplayValue(sampleStudent, 'educador'), sampleStudent.educador);
  assert.equal(extractStudentGroupValue(sampleStudent, 'educador'), sampleStudent.educador);

  const sortedByEducador = sortConsolidatedStudents(
    analytics.filteredStudents,
    'educador',
    'asc'
  );
  assert.equal(sortedByEducador.length, analytics.filteredStudents.length);

  // 2. Verificar filtro de Educador no Kanban de Alunos
  const targetProf = evaluated[0].professor;
  const filteredByProf = filterAndSortRecords(evaluated, {
    search: '',
    professor: targetProf,
    status: 'TODOS',
    modalidade: 'TODAS',
    turno: 'TODOS',
    curso: 'TODOS',
    horario: 'TODOS',
    notaFilter: 'TODOS',
    apenasInadimplentes: false,
    sortBy: 'id',
    sortDir: 'asc',
  });
  assert.ok(filteredByProf.length > 0);
  assert.ok(filteredByProf.every((r) => r.professor === targetProf));

  // 3. Verificar que todos os 17 cards do sistema possuem explicação completa no dicionário SYSTEM_INDICATORS_HELP
  const expectedIndicators = [
    'KANBAN_TODOS_ALUNOS',
    'KANBAN_PRESENCA',
    'KANBAN_FALTA',
    'KANBAN_NAO_INICIADA',
    'KANBAN_FREQUENCIA',
    'KANBAN_EVASAO',
    'NPS_ELEGIVEIS_DIA',
    'NPS_PORTAL_ALUNO',
    'NPS_EMAIL_INDECX',
    'NPS_CICLO_30_DIAS',
    'NPS_CICLO_50_70_DIAS',
    'CONSOLIDADO_FORMACOES_ATIVAS',
    'CONSOLIDADO_ALUNOS_E_DESISTENCIAS',
    'CONSOLIDADO_APOSTILAS',
    'CONSOLIDADO_FREQUENCIA_E_EVASOES',
    'CONSOLIDADO_FINANCEIRO',
    'CONSOLIDADO_SEM_APOSTILA_E_NPS',
  ];

  for (const id of expectedIndicators) {
    const info = SYSTEM_INDICATORS_HELP[id];
    assert.ok(info, `Indicador ${id} deve existir em SYSTEM_INDICATORS_HELP`);
    assert.ok(info.titulo.length > 3);
    assert.ok(info.oQueRepresenta.length > 10);
    assert.ok(info.dadosUtilizados.length > 10);
    assert.ok(info.regraNegocioFormula.length > 10);
    assert.ok(info.periodoConsiderado.length > 5);
    assert.ok(info.filtrosQueInfluenciam.length > 10);
    assert.ok(info.comoInterpretar.length > 10);
  }
});

test('Seção 20 — Teste de Carga e Estresse Concorrente (10, 50, 100 e 200 requisições simultâneas)', async () => {
  const baseUrl = 'http://127.0.0.1:3000';
  let serverReachable = false;
  try {
    const ping = await fetch(`${baseUrl}/api/pedagogico/educadores`);
    serverReachable = ping.ok;
  } catch {
    serverReachable = false;
  }

  if (!serverReachable) {
    return;
  }

  const concurrencyLevels = [10, 50, 100, 200];
  for (const level of concurrencyLevels) {
    const latencies: number[] = [];
    let failures = 0;

    const tasks = Array.from({ length: level }, async (_, idx) => {
      const start = performance.now();
      try {
        const endpoint =
          idx % 3 === 0
            ? '/api/pedagogico/educadores'
            : idx % 3 === 1
            ? '/api/admin/schools'
            : '/api/microlins/sync?semana=3';
        const res = await fetch(`${baseUrl}${endpoint}`);
        if (!res.ok) {
          failures++;
        }
        await res.arrayBuffer();
      } catch {
        failures++;
      } finally {
        latencies.push(performance.now() - start);
      }
    });

    await Promise.all(tasks);
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

    console.log(
      `[STRESS TEST] Concorrência=${level} | Falhas=${failures}/${level} | p50=${p50.toFixed(1)}ms | p95=${p95.toFixed(1)}ms | p99=${p99.toFixed(1)}ms`
    );
    assert.equal(failures, 0, `Nenhuma falha permitida sob ${level} requisições concorrentes`);
  }
});
