import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getStudentRecordsFromDb } from '../db/database';
import { evaluateAllStudentsAttendance } from './performanceAnalytics';
import {
  buildStudentFichaIndividual,
  buildUniqueStudentDirectory,
  normalizeFichaSearchText,
  normalizePortalGradeScale,
  searchStudentsForFichaIndividual,
} from './fichaIndividualAcademic';

describe('Ficha Individual do Aluno — Busca e Consolidação Acadêmica Unificada', () => {
  const dbRecords = getStudentRecordsFromDb('school-1875');
  const evaluated = evaluateAllStudentsAttendance(
    dbRecords,
    18 * 60,
    {},
    [],
    'Sábado'
  );
  const directory = buildUniqueStudentDirectory(evaluated);

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
});
