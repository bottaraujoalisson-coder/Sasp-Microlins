import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  hashPasswordArgon2id,
  verifyPasswordArgon2id,
  encryptSecretAES256GCM,
  decryptSecretAES256GCM,
  detectMaliciousPayload,
  sanitizeInputText,
} from './securityCrypto';
import {
  attemptPublicSelfRegistrationInDb,
  getDatabase,
  resetDatabaseConnectionForTests,
  upsertSchoolInDb,
  upsertUserInDb,
  authenticateUserInDb,
  validateSessionTokenInDb,
  revokeSessionTokenInDb,
  createPasswordRecoveryTokenInDb,
  resetPasswordWithRecoveryTokenInDb,
  getDatabaseStatusSummary,
  getSchoolsFromDb,
  toggleUserStatusInDb,
  deleteUserFromDb,
  upsertStudentRecordsInDb,
  getStudentRecordsFromDb,
  upsertNpsRecordsInDb,
  getNpsRecordsFromDb,
  comparePortalWithStoredRecords,
  acquireSchoolSyncLock,
  releaseSchoolSyncLock,
  recordAuditLog,
  getAuditLogsFromDb,
  recordSyncLog,
  getSyncLogsFromDb,
} from '../db/database';
import {
  resolveSupabaseAuthEmail,
  supabaseAnonKey,
} from './supabaseClient';
import { PRIVACY_KNOWLEDGE_BASE, searchPrivacyKnowledgeBase } from './privacyKnowledgeBase';

test('Auditoria de Segurança, Supabase Sole Database, Supabase Auth e Remoção de Estruturas Antigas', async (t) => {
  resetDatabaseConnectionForTests();

  await t.test('1. Eliminação total de SQLite (.db / .sqlite), node:sqlite, localStorage e chaves antigas', () => {
    const dbInstance = getDatabase();
    assert.equal(dbInstance.engine, 'SUPABASE_SOLE_DATABASE');

    const status = getDatabaseStatusSummary();
    assert.ok(status.engine.includes('Supabase'));
    assert.equal(status.foreignKeysEnabled, true);
    assert.ok(status.counts.schools >= 1);
    assert.ok(status.counts.users >= 2);

    // Verificar ausência de diretório .data com arquivos .sqlite
    const dataDir = path.join(process.cwd(), '.data');
    assert.equal(fs.existsSync(dataDir), false, 'Diretório .data legado não deve existir');

    // Verificar que database.ts e microlinsData.ts não importam node:sqlite
    const dbSource = fs.readFileSync(path.join(process.cwd(), 'src/db/database.ts'), 'utf-8');
    assert.equal(dbSource.includes('node:sqlite'), false, 'database.ts não deve importar node:sqlite');

    const microlinsDataSource = fs.readFileSync(path.join(process.cwd(), 'src/data/microlinsData.ts'), 'utf-8');
    assert.equal(microlinsDataSource.includes('node:sqlite'), false, 'microlinsData.ts não deve importar node:sqlite');

    // Verificar que LoginView.tsx e App.tsx não utilizam localStorage ou sessionStorage customizado
    const loginViewSource = fs.readFileSync(path.join(process.cwd(), 'src/components/LoginView.tsx'), 'utf-8');
    assert.equal(loginViewSource.includes('localStorage'), false, 'LoginView.tsx não deve usar localStorage');

    const appSource = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');
    assert.equal(appSource.includes('localStorage'), false, 'App.tsx não deve usar localStorage');
    assert.equal(appSource.includes('sessionStorage'), false, 'App.tsx não deve usar sessionStorage manual');

    // Verificar que supabaseClient.ts não expõe sb_secret_ no código e usa a chave publicável fornecida
    const supaSource = fs.readFileSync(path.join(process.cwd(), 'src/utils/supabaseClient.ts'), 'utf-8');
    assert.equal(supaSource.includes('sb_secret_2F1ilg'), false);
    assert.equal(supaSource.includes('sb_secret_8lM2QbtK80'), false, 'Chave secreta nunca deve estar hardcoded em supabaseClient.ts');
    assert.equal(supabaseAnonKey, 'sb_publishable_qs0jbtlopLTJG1cbZD8AFQ_kRR37HKM');
  });

  await t.test('2. Bloqueio estrito de cadastro público (Self-Registration / SignUp)', () => {
    const blocked = attemptPublicSelfRegistrationInDb({
      login: 'intruso.publico',
      email: 'intruso@externo.com',
      ipAddress: '10.0.0.99',
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, 403);
    assert.ok(blocked.error.includes('Cadastro público desabilitado'));

    const logs = getAuditLogsFromDb(10);
    assert.equal(logs[0]?.action, 'PUBLIC_SIGNUP_BLOCKED');
    assert.equal(logs[0]?.status, 'DENIED');
  });

  await t.test('3. Normalização de e-mail para Supabase Auth e Hashing Argon2id + AES-256-GCM', () => {
    assert.equal(resolveSupabaseAuthEmail('admin'), 'admin@microlins.com.br');
    assert.equal(resolveSupabaseAuthEmail('a116882'), 'a116882@microlins.com.br');
    assert.equal(
      resolveSupabaseAuthEmail('presidenteprudente@microlins.com.br'),
      'presidenteprudente@microlins.com.br'
    );

    const hash1 = hashPasswordArgon2id('SenhaForte@2026');
    const hash2 = hashPasswordArgon2id('SenhaForte@2026');
    assert.ok(hash1.startsWith('$argon2id$v=19$'));
    assert.notEqual(hash1, hash2, 'Salts aleatórios devem produzir hashes distintos');
    assert.equal(verifyPasswordArgon2id('SenhaForte@2026', hash1), true);
    assert.equal(verifyPasswordArgon2id('SenhaErrada', hash1), false);

    const encrypted = encryptSecretAES256GCM('SegredoIntegracao@2026');
    assert.ok(encrypted.startsWith('enc:aes256gcm:'));
    assert.equal(decryptSecretAES256GCM(encrypted), 'SegredoIntegracao@2026');
  });

  await t.test('4. Ciclo Administrado de Usuários: Criação pelo Admin, Login, Bloqueio de Inativo e Exclusão', () => {
    const { school } = upsertSchoolInDb({
      nome: 'ESCOLA TESTE AUDITORIA',
      cidade: 'Presidente Prudente',
      uf: 'SP',
      codigoPortal: '1999',
      npsEmail: 'teste@microlins.com.br',
      npsPassword: 'NpsSecretPassword123',
    });
    assert.ok(school.id);

    const { user } = upsertUserInDb(school.id, {
      login: 'coord.teste',
      senha: 'CoordPassword@2026',
      nomeCompleto: 'Maria Coordenadora',
      cargo: 'Coordenadora Pedagógica',
      ativo: true,
    });
    assert.equal(user.login, 'coord.teste');
    assert.ok(user.senha.startsWith('$argon2id$v=19$'));

    // Login válido de usuário autorizado pelo Admin
    const authOk = authenticateUserInDb('coord.teste', 'CoordPassword@2026', '127.0.0.1', 'NodeTest');
    assert.equal(authOk.ok, true);
    assert.equal(authOk.status, 200);
    assert.ok(authOk.session?.sessionToken);

    const validated = validateSessionTokenInDb(authOk.session?.sessionToken);
    assert.ok(validated);
    assert.equal(validated?.login, 'coord.teste');

    // Bloqueio/desativação imediata pelo Administrador
    toggleUserStatusInDb(school.id, user.id);

    // Sessão ativa deve ser automaticamente revogada quando o usuário é bloqueado
    assert.equal(validateSessionTokenInDb(authOk.session?.sessionToken), null);

    // Tentativa de login por usuário bloqueado/desativado deve ser negada (403)
    const blockedLogin = authenticateUserInDb('coord.teste', 'CoordPassword@2026', '127.0.0.1', 'NodeTest');
    assert.equal(blockedLogin.ok, false);
    assert.equal(blockedLogin.status, 403);

    // Reativação pelo Administrador restaura o acesso
    toggleUserStatusInDb(school.id, user.id);
    const reenabledLogin = authenticateUserInDb('coord.teste', 'CoordPassword@2026', '127.0.0.1', 'NodeTest');
    assert.equal(reenabledLogin.ok, true);

    // Logout revoga sessão
    const revoked = revokeSessionTokenInDb(reenabledLogin.session?.sessionToken);
    assert.equal(revoked, true);
    assert.equal(validateSessionTokenInDb(reenabledLogin.session?.sessionToken), null);

    // Exclusão pelo Administrador
    deleteUserFromDb(school.id, user.id);
    const afterDelete = authenticateUserInDb('coord.teste', 'CoordPassword@2026', '127.0.0.1', 'NodeTest');
    assert.equal(afterDelete.ok, false);
    assert.equal(afterDelete.status, 401);
  });

  await t.test('5. Proteção contra Força Bruta (Rate Limiting) e Recuperação Segura de Senha', () => {
    const schools = getSchoolsFromDb(false);
    const targetSchool = schools[0];
    upsertUserInDb(targetSchool.id, {
      login: 'rate.user',
      senha: 'RatePass@2026',
      nomeCompleto: 'Teste Rate Limit',
      cargo: 'Auxiliar',
      ativo: true,
    });

    for (let i = 1; i <= 5; i++) {
      const fail = authenticateUserInDb('rate.user', 'WrongPass', '127.0.0.1');
      assert.equal(fail.ok, false);
    }

    const lockedAttempt = authenticateUserInDb('rate.user', 'RatePass@2026', '127.0.0.1');
    assert.equal(lockedAttempt.ok, false);
    assert.equal(lockedAttempt.status, 429);
    assert.ok(lockedAttempt.lockedUntil);

    const rec = createPasswordRecoveryTokenInDb('rate.user', '127.0.0.1');
    assert.equal(rec.ok, true);
    assert.ok(rec.recoveryToken);

    const reset = resetPasswordWithRecoveryTokenInDb(rec.recoveryToken!, 'NovaSenha@2027', '127.0.0.1');
    assert.equal(reset.ok, true);

    const reuse = resetPasswordWithRecoveryTokenInDb(rec.recoveryToken!, 'OutraSenha@2028', '127.0.0.1');
    assert.equal(reuse.ok, false);

    const authNew = authenticateUserInDb('rate.user', 'NovaSenha@2027', '127.0.0.1');
    assert.equal(authNew.ok, true);
  });

  await t.test('6. Isolamento Multi-Escola (RLS Lógico) e Reconciliação de Presenças', () => {
    upsertStudentRecordsInDb(
      [
        {
          id: 1,
          contrato: '1001',
          nomeCompleto: 'ALUNO ESCOLA A',
          diaSemana: 'Segunda-feira',
          horaInicio: '08:00',
          presencaOuFalta: 'P',
          status: 'FINALIZADO',
        },
      ],
      'school-A',
      '1111',
      'UNIDADE ESCOLA A',
      true
    );

    upsertStudentRecordsInDb(
      [
        {
          id: 1,
          contrato: '2002',
          nomeCompleto: 'ALUNO ESCOLA B',
          diaSemana: 'Terça-feira',
          horaInicio: '14:00',
          presencaOuFalta: 'F',
          status: 'NÃO INICIADO',
        },
      ],
      'school-B',
      '2222',
      'UNIDADE ESCOLA B',
      true
    );

    const recordsA = getStudentRecordsFromDb('school-A');
    const recordsB = getStudentRecordsFromDb('school-B');

    assert.equal(recordsA.length, 1);
    assert.equal(recordsA[0].contrato, '1001');
    assert.equal(recordsB.length, 1);
    assert.equal(recordsB[0].contrato, '2002');

    // Reconciliação: presença confirmada não deve ser perdida se o portal retornar vazio
    const report = comparePortalWithStoredRecords(
      [
        {
          id: 1,
          contrato: '1001',
          nomeCompleto: 'ALUNO ESCOLA A',
          diaSemana: 'Segunda-feira',
          horaInicio: '08:00',
          presencaOuFalta: '',
          status: 'NÃO INICIADO',
        },
      ],
      recordsA,
      'school-A'
    );
    assert.equal(report.preservedPresencesCount, 1);
    assert.equal(report.reconciledRecords[0].presencaOuFalta, 'P');
    assert.equal(report.reconciledRecords[0].status, 'FINALIZADO');
  });

  await t.test('7. Concorrência de Sincronização, Filtro Anti-Injeção e Base LGPD', () => {
    assert.equal(acquireSchoolSyncLock('school-1875', 'worker-1', 5000), true);
    assert.equal(acquireSchoolSyncLock('school-1875', 'worker-2', 5000), false);
    releaseSchoolSyncLock('school-1875');
    assert.equal(acquireSchoolSyncLock('school-1875', 'worker-2', 5000), true);
    releaseSchoolSyncLock('school-1875');

    assert.equal(detectMaliciousPayload('<script>alert(1)</script>').malicious, true);
    assert.equal(detectMaliciousPayload("admin' UNION SELECT * FROM users--").malicious, true);
    assert.equal(sanitizeInputText('<b>Maria</b>', 80), 'bMaria/b');

    recordAuditLog({
      actorLogin: 'admin',
      actorRole: 'ADMIN',
      action: 'TEST_REDACTION',
      resource: 'api/test',
      status: 'SUCCESS',
      details: '{"login":"a116882","senha":"SuperSecretPassword123"}',
    });
    const logs = getAuditLogsFromDb(5);
    assert.equal(logs[0].details.includes('SuperSecretPassword123'), false);
    assert.equal(logs[0].details.includes('[REDACTED]'), true);

    recordSyncLog({
      schoolId: 'school-1875',
      escolaCodigo: '1875',
      syncType: 'PORTAL_FULL_WEEK',
      status: 'SUCCESS',
      recordsReceived: 717,
      recordsInserted: 717,
      durationMs: 420,
    });
    assert.equal(getSyncLogsFromDb('school-1875', 5).length, 1);

    assert.ok(PRIVACY_KNOWLEDGE_BASE.length >= 7);
    const searchRes = searchPrivacyKnowledgeBase('supabase');
    assert.ok(searchRes.length > 0);
  });
});
