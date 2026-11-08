import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getStudentRecordsFromDb, upsertStudentRecordsInDb } from '../db/database';
import { fetchStudentRecords } from './supabaseClient';
import { evaluateAllStudentsAttendance } from './performanceAnalytics';
import {
  buildStudentFichaIndividual,
  buildUniqueStudentDirectory,
  normalizeFichaSearchText,
  normalizePortalGradeScale,
  searchStudentsForFichaIndividual,
  buildFichaAcompanhamentoForModule,
  getOfficialModuleSyllabus,
} from './fichaIndividualAcademic';

describe('Ficha Individual do Aluno — Busca e Consolidação Acadêmica Unificada', () => {
  let directory: ReturnType<typeof buildUniqueStudentDirectory> = [];

  before(async () => {
    let dbRecords = getStudentRecordsFromDb('school-1875');
    if (dbRecords.length < 50) {
      const supaRecords = await fetchStudentRecords('school-1875');
      if (supaRecords && supaRecords.length > 0) {
        upsertStudentRecordsInDb(supaRecords, 'school-1875', '1875', 'ESCOLA PRESIDENTE PRUDENTE', true);
        dbRecords = supaRecords;
      }
    }
    const evaluated = evaluateAllStudentsAttendance(
      dbRecords,
      18 * 60,
      {},
      [],
      'Sábado'
    );
    directory = buildUniqueStudentDirectory(evaluated);
  });

  it('deve consolidar alunos únicos por número de contrato sem duplicatas', () => {
    assert.ok(directory.length > 50, 'Diretório deve conter dezenas de alunos únicos');
    const contratos = directory.map((s) => s.contrato);
    const uniqueContratos = new Set(contratos);
    assert.equal(contratos.length, uniqueContratos.size, 'Não deve haver contratos duplicados');
  });

  it('deve retornar lista vazia quando a pesquisa está em branco (regra de abertura inicialmente vazia)', () => {
    assert.deepEqual(searchStudentsForFichaIndividual(directory, ''), []);
    assert.deepEqual(searchStudentsForFichaIndividual(directory, '   '), []);
  });

  it('deve priorizar pesquisa exata ou parcial pelo número do contrato', () => {
    const targetContract = directory[0].contrato;
    const results = searchStudentsForFichaIndividual(directory, String(targetContract));
    assert.ok(results.length >= 1);
    assert.equal(results[0].contrato, targetContract);
  });

  it('deve localizar alunos por nome completo ou parcial ignorando acentuação e caixa', () => {
    const sample = directory[0];
    const normalizedQuery = normalizeFichaSearchText(sample.nomeCompleto.slice(0, 8));
    const results = searchStudentsForFichaIndividual(directory, normalizedQuery);
    assert.ok(
      results.some((r) => r.contrato === sample.contrato),
      'Aluno deve ser encontrado por nome parcial sem acentos'
    );
  });

  it('deve normalizar notas na escala 0 a 100 corretamente', () => {
    assert.deepEqual(normalizePortalGradeScale(10), { escala100: 100, escala10: 10 });
    assert.deepEqual(normalizePortalGradeScale(8.5), { escala100: 85, escala10: 8.5 });
    assert.deepEqual(normalizePortalGradeScale(92.5), { escala100: 92.5, escala10: 9.3 });
  });

  it('deve construir o Boletim Acadêmico com a mesma contagem unificada de presenças e faltas', () => {
    const sample = directory[0];
    const ficha = buildStudentFichaIndividual(sample);

    assert.equal(ficha.student.contrato, sample.contrato);
    assert.equal(ficha.student.nomeCompleto, sample.nomeCompleto);
    assert.ok(ficha.modulos.length >= 3, 'Deve listar grade curricular modular completa');
    assert.equal(
      ficha.indicadoresConsolidados.totalModulosCursados +
        ficha.indicadoresConsolidados.totalModulosEmAndamento +
        ficha.indicadoresConsolidados.totalModulosPendentes,
      ficha.modulos.length
    );

    const activeOrDoneModules = ficha.modulos.filter((m) => m.statusModulo !== 'PENDENTE');
    assert.ok(activeOrDoneModules.length >= 1, 'Deve possuir ao menos 1 módulo cursado ou em andamento');

    for (const mod of activeOrDoneModules) {
      assert.ok(mod.frequenciaFinal !== null && mod.frequenciaFinal >= 0 && mod.frequenciaFinal <= 100);
      assert.ok(mod.aulasConcluidas >= 1);
    }
  });

  it('deve gerar a Ficha de Acompanhamento com as 16 aulas preenchidas com dados reais e ementa temática', () => {
    const sample = directory[0];

    const syllabusExcel = getOfficialModuleSyllabus('Excel 2021 Avançado Módulo I');
    assert.equal(syllabusExcel.length, 16);
    assert.ok(syllabusExcel[0].includes('Aula 01'));
    assert.ok(syllabusExcel[15].includes('Aula 16'));

    const acompanhamento = buildFichaAcompanhamentoForModule(sample);
    assert.ok(acompanhamento.moduloNome);
    assert.ok(acompanhamento.instituicaoNome.includes('Microlins'));
    assert.equal(acompanhamento.alunoNomeCompleto, sample.nomeCompleto);
    assert.ok(acompanhamento.cursoTurma.length > 3);
    assert.ok(acompanhamento.professorResponsavel.length > 2);
    assert.ok(acompanhamento.periodoLetivo.length > 3);
    assert.equal(acompanhamento.totalAulasPrevistas, 16);
    assert.equal(acompanhamento.aulas.length, 16);
    assert.ok(acompanhamento.educadorNome);
    assert.ok(acompanhamento.horarioTurma !== '');
    assert.ok(acompanhamento.frequenciaPercent >= 0 && acompanhamento.frequenciaPercent <= 100);
    assert.equal(typeof acompanhamento.situacaoFinalAprovado, 'boolean');
    assert.equal(typeof acompanhamento.situacaoFinalReprovado, 'boolean');

    // Validação das 16 aulas estruturadas com as 5 colunas oficiais (Conteúdo, Data de início, Data de término, Nota, Assinatura)
    acompanhamento.aulas.forEach((aula: any, i: number) => {
      assert.equal(aula.aulaNumero, i + 1);
      assert.ok(aula.nomeAula && aula.nomeAula.length > 5, 'Cada aula deve conter o nome/tópico real pré-carregado');
      assert.equal(typeof aula.dataInicio, 'string');
      assert.equal(typeof aula.dataTermino, 'string');
      assert.equal(typeof aula.assinaturaVisto, 'string');
      assert.ok(['NOR', 'REP', 'PLA', 'AVU'].includes(aula.tipoAula));
      assert.ok(['P', 'F', 'FJ', 'RC', 'PENDENTE'].includes(aula.frequenciaStatus));
    });
  });
});
