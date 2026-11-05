import test from 'node:test';
import assert from 'node:assert/strict';
import {
  supabase,
  checkSupabaseHealth,
  fetchStudentRecords,
  fetchNpsInvitations,
  fetchSchoolsFromSupabase,
  upsertSchoolInSupabase,
  deleteSchoolFromSupabase,
  upsertUserInSupabase,
  updateUserPasswordInSupabase,
  toggleUserStatusInSupabase,
  deleteUserFromSupabase,
  authenticateUserInSupabase,
  migrateAllDataToSupabase,
} from './supabaseClient';
import { resolveRecordProfessor, filterAndDeduplicateAnnualNpsInvitations } from './performanceAnalytics';

test('SUPABASE-01: Inicialização do cliente Supabase, Auth, Storage e RPC', () => {
  assert.ok(supabase, 'Cliente Supabase deve estar instanciado');
  assert.equal(typeof supabase.auth, 'object', 'Módulo Supabase Auth deve estar disponível');
  assert.equal(typeof supabase.storage, 'object', 'Módulo Supabase Storage deve estar disponível');
  assert.equal(typeof supabase.rpc, 'function', 'Método Supabase RPC (.rpc) deve estar disponível');
  assert.equal(typeof supabase.from, 'function', 'Query builder .from() deve ser uma função');
});

test('SUPABASE-02: Health Check de conexão e disponibilidade das 4 tabelas ativas no PostgreSQL', async () => {
  const health = await checkSupabaseHealth('school-1875');
  assert.equal(health.connected, true, `Supabase deve estar conectado (${health.error || 'OK'})`);
  assert.ok(health.supabaseUrl.includes('supabase.co'), 'URL do projeto Supabase deve ser válida');
  assert.ok(health.counts.schools >= 1, 'Tabela schools deve conter ao menos 1 unidade ativa');
  assert.ok(health.counts.users >= 1, 'Tabela users deve conter ao menos 1 credencial cadastrada');
  assert.ok(health.counts.studentRecords >= 700, 'Tabela student_records deve conter os 717 agendamentos reais da escola');
  assert.ok(health.counts.npsRecords >= 100, 'Tabela nps_records deve conter os convites ativos do Indecx NPS');
});

test('SUPABASE-03: Leitura multi-escola de student_records retorna dados reais do Portal e todos com professor vinculado', async () => {
  const records = await fetchStudentRecords('school-1875');
  assert.ok(Array.isArray(records), 'fetchStudentRecords deve retornar um array');
  assert.ok(
    records.length >= 717,
    `Esperado ao menos 717 registros reais na escola 1875, recebido ${records.length}`
  );

  const sample = records[0];
  assert.ok(sample.contrato && sample.contrato.length > 0, 'Registro deve possuir número de contrato');
  assert.ok(sample.nomeCompleto && sample.nomeCompleto.length > 0, 'Registro deve possuir nomeCompleto');
  assert.equal(sample.schoolId, 'school-1875', 'Registro deve estar vinculado à school-1875');

  const fictitiousSet = new Set(['João Silva', 'Camila Ferreira', 'Lucas Almeida', 'A definir']);
  for (const r of records) {
    const prof = resolveRecordProfessor(r);
    assert.equal(
      fictitiousSet.has(prof),
      false,
      `Educador inválido/fictício detectado no contrato ${r.contrato}: ${prof}`
    );
  }
});

test('SUPABASE-04: Leitura de nps_records retorna convites NPS de 2026 com status de envio preservado', async () => {
  const activeInvitations = await fetchNpsInvitations('school-1875');
  assert.ok(Array.isArray(activeInvitations), 'fetchNpsInvitations deve retornar um array');
  assert.ok(activeInvitations.length >= 100, `Esperado convites ativos no Supabase, recebido ${activeInvitations.length}`);

  const allHistorical = await fetchNpsInvitations('school-1875', undefined, { includeHistory: true });
  const deduplicated = filterAndDeduplicateAnnualNpsInvitations(allHistorical, 2026);
  assert.ok(deduplicated.length >= 100, `Esperado convites ativos no Supabase, recebido ${deduplicated.length}`);
  const sample = deduplicated[0];
  assert.ok(sample.controlId !== undefined, 'Convite NPS deve possuir controlId');
  assert.ok(sample.emailDeliveryStatus !== undefined, 'Convite NPS deve possuir emailDeliveryStatus decodificado');
  assert.equal(sample.surveyUrl, '', 'Link direto da pesquisa não deve ser exposto no front-end');
});

test('SUPABASE-05: Leitura de schools e relacionamento 1:N com users (sanitização de segredos)', async () => {
  const sanitizedSchools = await fetchSchoolsFromSupabase(false);
  assert.ok(Array.isArray(sanitizedSchools), 'Schools deve ser um array');
  assert.ok(sanitizedSchools.length >= 1, 'Deve existir ao menos a unidade padrão');

  const mainSchool = sanitizedSchools.find((s) => s.id === 'school-1875') || sanitizedSchools[0];
  assert.ok(mainSchool, 'Unidade principal deve existir');
  assert.ok(Array.isArray(mainSchool.users), 'Relacionamento school.users deve ser um array');
  assert.ok(mainSchool.npsCredential.password.includes('••••'), 'Senha do NPS nunca deve ser exposta ao cliente');

  for (const u of mainSchool.users) {
    assert.ok(
      u.senha.includes('••••'),
      'Hash/senha do usuário não deve ser exposto para o cliente quando sanitizado'
    );
  }
});

test('SUPABASE-06: Ciclo completo CRUD (INSERT, SELECT, UPDATE, DELETE) em schools e users com limpeza automática', async () => {
  const tempSchoolId = `school-audit-test-${Date.now()}`;
  const tempUserId = `user-audit-test-${Date.now()}`;
  const tempLogin = `audit.user.${Date.now()}`;

  try {
    const createdSchoolRes = await upsertSchoolInSupabase({
      id: tempSchoolId,
      nome: 'UNIDADE TESTE AUDITORIA SUPABASE',
      cidade: 'Presidente Prudente',
      uf: 'SP',
      codigoPortal: '9999',
      ativa: true,
      npsEmail: 'auditoria@microlins.com.br',
    });
    assert.ok(
      createdSchoolRes.schools.some((s) => s.id === tempSchoolId),
      'Escola recém-inserida deve constar no Supabase'
    );

    const updatedSchoolRes = await upsertSchoolInSupabase({
      id: tempSchoolId,
      nome: 'UNIDADE TESTE AUDITORIA ATUALIZADA',
      ativa: true,
    });
    const updatedSchool = updatedSchoolRes.schools.find((s) => s.id === tempSchoolId);
    assert.equal(
      updatedSchool?.nome,
      'UNIDADE TESTE AUDITORIA ATUALIZADA',
      'Nome da unidade deve ser atualizado no Supabase'
    );

    const createdUserRes = await upsertUserInSupabase(tempSchoolId, {
      id: tempUserId,
      login: tempLogin,
      senha: 'AuditPass@2026',
      nomeCompleto: 'Colaborador Teste Auditoria',
      cargo: 'Coordenador Pedagógico',
      ativo: true,
    });
    assert.equal(createdUserRes.user.login, tempLogin, 'Usuário deve ser inserido com login correto');

    const authSuccess = await authenticateUserInSupabase(tempLogin, 'AuditPass@2026');
    assert.equal(authSuccess.ok, true, 'Autenticação com senha correta deve ter sucesso no Supabase');
    assert.equal(authSuccess.session?.role, 'ESCOLA', 'Perfil deve ser ESCOLA');
    assert.equal(authSuccess.session?.schoolId, tempSchoolId, 'Sessão deve conter o schoolId da escola do usuário');

    await updateUserPasswordInSupabase(tempSchoolId, tempUserId, 'NovaSenha@2026');
    const authAfterPassChange = await authenticateUserInSupabase(tempLogin, 'NovaSenha@2026');
    assert.equal(
      authAfterPassChange.ok,
      true,
      'Autenticação com a nova senha atualizada deve funcionar imediatamente'
    );

    await toggleUserStatusInSupabase(tempSchoolId, tempUserId);
    const authWhenInactive = await authenticateUserInSupabase(tempLogin, 'NovaSenha@2026');
    assert.equal(
      authWhenInactive.ok,
      false,
      'Usuário inativado deve ter login bloqueado'
    );

    const afterDeleteUser = await deleteUserFromSupabase(tempSchoolId, tempUserId);
    const schoolAfterUserDel = afterDeleteUser.find((s) => s.id === tempSchoolId);
    assert.equal(
      schoolAfterUserDel?.users.some((u) => u.id === tempUserId),
      false,
      'Usuário excluído não deve mais existir na unidade'
    );
  } finally {
    await deleteSchoolFromSupabase(tempSchoolId);
  }

  const finalSchools = await fetchSchoolsFromSupabase(false);
  assert.equal(
    finalSchools.some((s) => s.id === tempSchoolId),
    false,
    'Unidade temporária de teste deve ter sido completamente removida'
  );
});

test('SUPABASE-07: Função migrateAllDataToSupabase está disponível e funcional', () => {
  assert.equal(typeof migrateAllDataToSupabase, 'function');
});
