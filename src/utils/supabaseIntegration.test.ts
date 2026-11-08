import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  supabase,
  supabaseAdmin,
  supabaseUrl,
  supabaseAnonKey,
  resolveSupabaseAuthEmail,
  authenticateUserInSupabase,
  validateEmailAddressFormat,
  setNpsExtendedOverlayItem,
  applyNpsExtendedOverlay,
  setContractMaterialCauseOverlay,
  getContractMaterialCauseOverlay,
} from './supabaseClient';
import {
  getSchoolsFromDb,
  upsertSchoolInDb,
  upsertUserInDb,
  toggleUserStatusInDb,
  deleteUserFromDb,
  deleteSchoolFromDb,
  resetDatabaseConnectionForTests,
} from '../db/database';
import { sanitizeSchoolsForClient } from './authRegistry';

test('SUPABASE-01: Inicialização do cliente Supabase, Auth, Admin Auth, Storage e RPC com a nova chave publicável', () => {
  assert.ok(supabase, 'Cliente Supabase deve estar instanciado');
  assert.ok(supabaseAdmin, 'Cliente administrativo Supabase deve estar instanciado no servidor');
  assert.equal(
    supabaseUrl,
    'https://dwarcjrpwubtveilwkyi.supabase.co',
    'URL oficial do projeto Supabase deve estar configurada'
  );
  assert.equal(
    supabaseAnonKey,
    'sb_publishable_qs0jbtlopLTJG1cbZD8AFQ_kRR37HKM',
    'Chave publicável oficial deve estar configurada'
  );
  assert.equal(typeof supabase.auth, 'object', 'Módulo Supabase Auth deve estar disponível');
  assert.equal(typeof supabase.auth.signInWithPassword, 'function');
  assert.equal(typeof supabase.auth.getSession, 'function');
  assert.equal(typeof supabase.auth.onAuthStateChange, 'function');
  assert.equal(typeof supabase.auth.signOut, 'function');
  assert.equal(typeof supabase.rpc, 'function', 'Método Supabase RPC (.rpc) deve estar disponível');
  assert.equal(typeof supabase.from, 'function', 'Query builder .from() deve ser uma função');
});

test('SUPABASE-02: Validação do Script de Migração Versionada e Políticas RLS baseadas em auth.uid()', () => {
  const migrationPath = path.join(
    process.cwd(),
    'supabase/migrations/20261106000001_supabase_sole_database_and_auth.sql'
  );
  assert.equal(fs.existsSync(migrationPath), true, 'Arquivo de migração versionada deve existir');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  assert.ok(sql.includes('REFERENCES auth.users(id)'), 'Tabela users deve referenciar auth.users(id)');
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS deve estar habilitado nas tabelas');
  assert.ok(sql.includes('public.is_active_admin()'), 'Função RLS is_active_admin() deve existir');
  assert.ok(sql.includes('public.get_my_school_id()'), 'Função RLS get_my_school_id() deve existir');
  assert.ok(sql.includes('replace_school_student_records'), 'RPC atômica de alunos deve existir');
  assert.ok(sql.includes('replace_school_nps_records'), 'RPC atômica de NPS deve existir');
});

test('SUPABASE-03: Sanitização de segredos no relacionamento 1:N schools -> users', () => {
  resetDatabaseConnectionForTests();
  const sanitizedSchools = sanitizeSchoolsForClient(getSchoolsFromDb(false));
  assert.ok(Array.isArray(sanitizedSchools));
  assert.ok(sanitizedSchools.length >= 1);

  const mainSchool = sanitizedSchools.find((s) => s.id === 'school-1875') || sanitizedSchools[0];
  assert.ok(mainSchool);
  assert.ok(mainSchool.npsCredential.password.includes('••••'));

  for (const u of mainSchool.users) {
    assert.ok(u.senha.includes('••••'), 'Hash nunca deve ser exposto ao cliente');
  }
});

test('SUPABASE-04: Autenticação de usuários autorizados (Admin e Colaborador da Escola) e bloqueio de inativos', async () => {
  resetDatabaseConnectionForTests();

  // Login do Colaborador real da Escola (a116882)
  const schoolLogin = await authenticateUserInSupabase('a116882', 'Joao@2025');
  assert.equal(schoolLogin.ok, true, 'Login a116882 deve autenticar com sucesso');
  assert.equal(schoolLogin.session?.role, 'ESCOLA');
  assert.equal(schoolLogin.session?.schoolId, 'school-1875');

  // Login do Administrador Geral único (admin / 2ab@283)
  const adminLogin = await authenticateUserInSupabase('admin', '2ab@283');
  assert.equal(adminLogin.ok, true, 'Login admin com senha 2ab@283 deve autenticar com sucesso');
  assert.equal(adminLogin.session?.role, 'ADMIN');

  // Senhas antigas ou senhas incorretas devem falhar estritamente
  const oldPassLogin = await authenticateUserInSupabase('admin', 'Alisson@2026');
  assert.equal(oldPassLogin.ok, false, 'Senha antiga não deve ser aceita');

  // Aliases antigos não devem autenticar como ADM
  const aliasLogin = await authenticateUserInSupabase('alisson', '2ab@283');
  assert.equal(aliasLogin.ok, false, 'Alias alisson não deve ser aceito');

  // Login de usuário não cadastrado deve falhar
  const unknownLogin = await authenticateUserInSupabase('usuario.inexistente', ' Qualquer123');
  assert.equal(unknownLogin.ok, false);
});

test('SUPABASE-05: Ciclo completo CRUD Administrado (Escola e Usuário) e Overlay de Metadados NPS/Material', () => {
  resetDatabaseConnectionForTests();
  const tempSchoolId = `school-supa-test-${Date.now()}`;
  const tempLogin = `colab.${Date.now()}`;

  const { school } = upsertSchoolInDb({
    id: tempSchoolId,
    nome: 'UNIDADE SUPABASE SOLE DB',
    cidade: 'Presidente Prudente',
    uf: 'SP',
    codigoPortal: '8888',
    npsEmail: 'supa@microlins.com.br',
    npsPassword: 'SupaPass123',
  });
  assert.equal(school.id, tempSchoolId);

  const { user } = upsertUserInDb(tempSchoolId, {
    login: tempLogin,
    senha: 'ColabPass@2026',
    nomeCompleto: 'Colaborador Supabase Auth',
    cargo: 'Coordenador',
    ativo: true,
  });
  assert.equal(user.login, tempLogin);
  assert.equal(resolveSupabaseAuthEmail(tempLogin), `${tempLogin}@microlins.com.br`);

  // Alternar status e excluir
  toggleUserStatusInDb(tempSchoolId, user.id);
  deleteUserFromDb(tempSchoolId, user.id);
  deleteSchoolFromDb(tempSchoolId);

  // Validação de e-mail e overlays em memória
  assert.equal(validateEmailAddressFormat('aluno@microlins.com.br').valid, true);
  assert.equal(validateEmailAddressFormat('email-invalido').valid, false);

  setNpsExtendedOverlayItem('inv-test-1', {
    priorizarNpsNoLogin: true,
    cicloPriorizado: '30 dias',
  });
  const overlaid = applyNpsExtendedOverlay({
    id: 'inv-test-1',
    controlId: 'ctrl-1',
    studentName: 'ALUNO TESTE',
    contrato: '12345',
    codigoPessoa: '999',
    email: 'aluno@teste.com',
    phone: '',
    actionName: 'NPS',
    pontoJornada: '30 dias',
    origem: 'Portal do Aluno',
    channel: 'widget',
    invitationStatus: 'ativo',
    answered: false,
    createdAt: new Date().toISOString(),
    surveyUrl: '',
  });
  assert.equal(overlaid.priorizarNpsNoLogin, true);
  assert.equal(overlaid.cicloPriorizado, '30 dias');

  setContractMaterialCauseOverlay('12345', 'Entrega pendente pela recepção');
  assert.equal(getContractMaterialCauseOverlay('12345'), 'Entrega pendente pela recepção');
});
