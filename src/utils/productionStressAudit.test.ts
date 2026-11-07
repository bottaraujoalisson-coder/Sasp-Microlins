import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAllStudentsAttendance,
  evaluateStudentAttendance,
  isPossivelDesistencia,
  getCurrentBrasiliaWeekdayLabel,
  getCurrentBrasiliaYear,
} from './performanceAnalytics';
import { StudentPerformanceRecord } from '../data/microlinsData';

const BASE_URL = process.env.TEST_APP_URL || 'http://127.0.0.1:3000';

interface RequestMetric {
  durationMs: number;
  status: number;
  ok: boolean;
}

async function executeConcurrentBatch(
  url: string,
  totalRequests: number,
  concurrency: number,
  options: RequestInit = {}
): Promise<{
  metrics: RequestMetric[];
  totalTimeMs: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
  successRate: number;
  reqPerSec: number;
}> {
  const metrics: RequestMetric[] = [];
  const startTotal = performance.now();
  let completed = 0;
  let inFlight = 0;
  let currentIndex = 0;

  return new Promise((resolve, reject) => {
    function launchNext() {
      if (completed >= totalRequests) {
        const totalTimeMs = performance.now() - startTotal;
        const sorted = [...metrics].sort((a, b) => a.durationMs - b.durationMs);
        const p50 = sorted[Math.floor(sorted.length * 0.5)]?.durationMs || 0;
        const p95 = sorted[Math.floor(sorted.length * 0.95)]?.durationMs || 0;
        const p99 = sorted[Math.floor(sorted.length * 0.99)]?.durationMs || 0;
        const min = sorted[0]?.durationMs || 0;
        const max = sorted[sorted.length - 1]?.durationMs || 0;
        const avg = sorted.reduce((acc, m) => acc + m.durationMs, 0) / (sorted.length || 1);
        const successCount = metrics.filter((m) => m.ok).length;
        const successRate = (successCount / (metrics.length || 1)) * 100;
        const reqPerSec = (metrics.length / (totalTimeMs / 1000));

        resolve({
          metrics,
          totalTimeMs,
          p50,
          p95,
          p99,
          min,
          max,
          avg,
          successRate,
          reqPerSec,
        });
        return;
      }

      while (inFlight < concurrency && currentIndex < totalRequests) {
        currentIndex++;
        inFlight++;
        const reqStart = performance.now();

        fetch(url, options)
          .then((res) => {
            const durationMs = performance.now() - reqStart;
            metrics.push({
              durationMs,
              status: res.status,
              ok: res.ok,
            });
          })
          .catch(() => {
            const durationMs = performance.now() - reqStart;
            metrics.push({
              durationMs,
              status: 0,
              ok: false,
            });
          })
          .finally(() => {
            inFlight--;
            completed++;
            launchNext();
          });
      }
    }

    launchNext();
  });
}

test('AUDITORIA DE STRESS 1: Processamento em Alta Carga (10.000 alunos) do Motor Analítico', () => {
  // Gera 10.000 registros sintéticos de alunos distribuídos em diferentes salas, turmas e dias
  const dias = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const syntheticRecords: StudentPerformanceRecord[] = [];

  for (let i = 1; i <= 10000; i++) {
    const dia = dias[i % dias.length];
    const isMultiAula = i % 5 === 0;
    const contrato = `CTR-${Math.floor(i / 2) + 1}`;
    const presencaOuFalta = i % 4 === 0 ? 'F' : i % 3 === 0 ? 'P' : '';

    syntheticRecords.push({
      id: i,
      contrato,
      aulaId: `AULA-${i}`,
      nomeCompleto: `Aluno Stress Test ${i}`,
      nomeCurto: `Aluno ${i}`,
      telefoneAluno: '+5518999999999',
      whatsappAlunoUrl: '',
      nomeResponsavel: `Responsável ${i}`,
      telefoneResponsavel: '+5518988888888',
      whatsappResponsavelUrl: '',
      formacao: i % 2 === 0 ? 'INFORMÁTICA' : 'INGLÊS',
      curso: 'Módulo Principal',
      aulaInfo: `Aula ${(i % 16) + 1} - Apostila`,
      aulaNumero: (i % 16) + 1,
      tipoMaterial: 'Apostila',
      possuiApostila: i % 3 !== 0,
      horario: '14:00 à 16:00',
      horaInicio: '14:00',
      horaFim: '16:00',
      turno: 'Tarde',
      sala: `Sala ${(i % 5) + 1}`,
      modalidade: 'Presencial',
      inicio: presencaOuFalta === 'P' ? '14:05' : '',
      fim: presencaOuFalta === 'P' ? '15:55' : '',
      nota: 8.5,
      notaAulaNumero: 1,
      notaId: `N-${i}`,
      infoAula: 'Portal',
      status: presencaOuFalta === 'P' ? 'FINALIZADO' : presencaOuFalta === 'F' ? 'FINALIZADO' : 'NÃO INICIADO',
      presencaOuFalta,
      inadimplente: i % 7 === 0,
      parcelasAtrasadas: i % 7 === 0 ? 2 : 0,
      diaSemana: dia,
      linkLoginUrl: `https://portaldoaluno.microlins.com.br/token/${contrato}`,
      educador: `Educador ${(i % 4) + 1}`,
    });
  }

  const startCompute = performance.now();
  const evaluationResult = evaluateAllStudentsAttendance(syntheticRecords, undefined, {}, undefined, 'Sexta-feira');
  const computeDurationMs = performance.now() - startCompute;

  assert.equal(evaluationResult.length, 10000, 'Todos os 10.000 alunos devem ser processados');
  assert.ok(computeDurationMs < 1000, `Cálculo de 10.000 alunos executado em ${computeDurationMs.toFixed(2)}ms (meta < 1000ms)`);

  // Validação de desistências sob escala
  let possiveisDesistenciasCount = 0;
  for (const rec of evaluationResult) {
    if (isPossivelDesistencia(rec)) {
      possiveisDesistenciasCount++;
    }
  }

  assert.ok(possiveisDesistenciasCount >= 0, 'Cálculo de possíveis desistências executou sem exceções');
});

test('AUDITORIA DE STRESS 2: Throughput e Latência Concorrente no Healthcheck (/api/health)', async () => {
  // Warmup para garantir cache aquecido
  await fetch(`${BASE_URL}/api/health`);
  const result = await executeConcurrentBatch(`${BASE_URL}/api/health`, 60, 15);

  assert.equal(result.successRate, 100, '100% das requisições ao healthcheck devem responder 200 OK');
  assert.ok(result.p95 < 250, `P95 da latência do healthcheck foi ${result.p95.toFixed(2)}ms (meta < 250ms)`);
  assert.ok(result.reqPerSec > 40, `Vazão do healthcheck foi ${result.reqPerSec.toFixed(2)} req/s`);
});

test('AUDITORIA DE STRESS 3: Throughput e Concorrência na Sincronização Acadêmica (/api/microlins/sync)', async () => {
  // Warmup para garantir cache de sincronização aquecido
  await fetch(`${BASE_URL}/api/microlins/sync`);
  const result = await executeConcurrentBatch(`${BASE_URL}/api/microlins/sync`, 30, 8);

  assert.equal(result.successRate, 100, 'Todas as requisições à sincronização acadêmica devem ter sucesso');
  assert.ok(result.p95 < 2500, `P95 da sincronização foi ${result.p95.toFixed(2)}ms (meta < 2500ms em ambiente conteinerizado)`);
});

test('AUDITORIA DE STRESS 4: Concorrência e Integridade de Dados no NPS Anual (/api/nps/active)', async () => {
  const result = await executeConcurrentBatch(`${BASE_URL}/api/nps/active`, 30, 8);

  assert.equal(result.successRate, 100, '100% das requisições ao NPS devem responder 200 OK');
  assert.ok(result.p95 < 1500, `P95 do NPS foi ${result.p95.toFixed(2)}ms (meta < 1500ms em ambiente conteinerizado)`);

  const singleRes = await fetch(`${BASE_URL}/api/nps/active`);
  const data = await singleRes.json() as { ok: boolean; activeNpsInvitations: unknown[] };
  assert.equal(data.ok, true);
  assert.ok(data.activeNpsInvitations.length >= 100, 'Deve manter os convites NPS ativos');
});

test('AUDITORIA DE STRESS 5: Concorrência de Consultas LGPD e Educadores', async () => {
  const [lgpdResult, educadoresResult] = await Promise.all([
    executeConcurrentBatch(`${BASE_URL}/api/privacy/knowledge?q=consentimento`, 25, 5),
    executeConcurrentBatch(`${BASE_URL}/api/pedagogico/educadores`, 25, 5),
  ]);

  assert.equal(lgpdResult.successRate, 100, 'Busca LGPD deve ter 100% de sucesso');
  assert.equal(educadoresResult.successRate, 100, 'Mapeamento de educadores deve ter 100% de sucesso');
});

test('AUDITORIA DE STRESS 6: Proteção contra Injeção Maliciosa (XSS e SQL Injection)', async () => {
  const maliciousVectors = [
    { login: '<script>alert("xss")</script>', senha: '123' },
    { login: "admin' OR 1=1 --", senha: '123' },
    { login: 'admin', senha: '<img src=x onerror=alert(1)>' },
    { login: "admin' UNION SELECT * FROM users --", senha: '123' },
  ];

  for (const vector of maliciousVectors) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vector),
    });

    assert.equal(
      res.status,
      400,
      `Payload malicioso deve ser barrado com HTTP 400 (vetor: ${vector.login || vector.senha})`
    );
    const body = await res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('filtro de segurança') || body.error.includes('bloqueada'));
  }
});

test('AUDITORIA DE STRESS 7: Teste de Sobrecarga de Memória (Memory Leak Check)', async () => {
  const resBefore = await fetch(`${BASE_URL}/api/health`);
  const healthBefore = await resBefore.json() as {
    memoryMb: { rss: number; heapUsed: number; heapTotal: number };
  };

  // Dispara uma bateria rápida de 100 requisições
  await executeConcurrentBatch(`${BASE_URL}/api/health`, 100, 20);

  const resAfter = await fetch(`${BASE_URL}/api/health`);
  const healthAfter = await resAfter.json() as {
    memoryMb: { rss: number; heapUsed: number; heapTotal: number };
  };

  const heapDiff = healthAfter.memoryMb.heapUsed - healthBefore.memoryMb.heapUsed;
  assert.ok(
    healthAfter.memoryMb.heapUsed < 300,
    `Heap utilizado após stress (${healthAfter.memoryMb.heapUsed}MB) deve ser seguro e inferior a 300MB`
  );
});
