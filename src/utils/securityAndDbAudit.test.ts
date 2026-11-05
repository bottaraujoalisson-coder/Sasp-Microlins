import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  hashPasswordArgon2id,
  verifyPasswordSecure,
  isArgon2idHash,
  encryptSecretAES256GCM,
  decryptSecretAES256GCM,
  isEncryptedSecret,
  generateSessionToken,
  hashSessionToken,
  sanitizeInputText,
  detectMaliciousPayload,
} from './securityCrypto';

import {
  searchPrivacyKnowledgeBase,
  PRIVACY_KNOWLEDGE_BASE,
  PRIVACY_QUICK_QUESTIONS,
} from './privacyKnowledgeBase';

import {
  getDatabase,
  closeDatabase,
  getDatabaseStatusSummary,
  authenticateUserInDb,
  validateSessionTokenInDb,
  revokeSessionTokenInDb,
  createPasswordRecoveryTokenInDb,
  resetPasswordWithRecoveryTokenInDb,
  upsertSchoolInDb,
  upsertUserInDb,
  getSchoolsFromDb,
} from '../db/database';
import { sanitizeSchoolsForClient } from './authRegistry';

const tmpTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'microlins-audit-test-'));
const isolatedDbPath = path.join(tmpTestDir, 'test_audit.sqlite');

test('SEÇÃO 6.1: Argon2id password hashing and constant-time verification', () => {
  const rawPassword = 'StrongPassword@2026!';
  const hash = hashPasswordArgon2id(rawPassword);

  assert.equal(isArgon2idHash(hash), true, 'Hash must use PHC $argon2id$v=19$ format');
  assert.notEqual(hash, rawPassword, 'Hash must never equal plaintext password');
  assert.equal(verifyPasswordSecure(rawPassword, hash), true, 'Correct password must verify true');
  assert.equal(verifyPasswordSecure('WrongPassword@2026!', hash), false, 'Wrong password must verify false');
  assert.equal(verifyPasswordSecure('', hash), false, 'Empty password must verify false');
});

test('SEÇÃO 6.1: Authenticated encryption at rest for external integration secrets', () => {
  const secretPortalPass = 'PortalMoveEdu#Secret99';
  const encrypted = encryptSecretAES256GCM(secretPortalPass);

  assert.equal(isEncryptedSecret(encrypted), true, 'Encrypted value must have enc:aes256gcm: prefix');
  assert.ok(!encrypted.includes(secretPortalPass), 'Ciphertext must not contain plaintext');

  const decrypted = decryptSecretAES256GCM(encrypted);
  assert.equal(decrypted, secretPortalPass, 'Decrypted value must match original plaintext');
});

test('SEÇÃO 6.1: Session token generation (256-bit entropy) and SHA-256 digest', () => {
  const tokenA = generateSessionToken();
  const tokenB = generateSessionToken();
  assert.equal(tokenA.length, 64, '256-bit hex token must be 64 hex chars');
  assert.notEqual(tokenA, tokenB, 'Tokens must be unique CSPRNG values');

  const digestA = hashSessionToken(tokenA);
  assert.equal(digestA.length, 64);
  assert.notEqual(digestA, tokenA);
});

test('SEÇÃO 6.1: XSS and SQL Injection payload detection & input sanitization', () => {
  const xssAttempt = '<script>alert("xss")</script>';
  assert.equal(detectMaliciousPayload(xssAttempt).isMalicious, true, 'Must detect <script> XSS tag');
  const sanitized = sanitizeInputText(xssAttempt);
  assert.ok(!sanitized.includes('<script>'), 'Sanitized string must not contain raw <script> tags');

  const sqliAttempt = "admin' UNION SELECT username, password FROM users --";
  assert.equal(detectMaliciousPayload(sqliAttempt).isMalicious, true, 'Must detect UNION SELECT SQLi pattern');

  const safeInput = 'ESCOLA PRESIDENTE PRUDENTE - Relatório Mensal 2026';
  assert.equal(detectMaliciousPayload(safeInput).isMalicious, false, 'Normal Portuguese text must not trigger false positive');
});

test('SEÇÃO 6.2 & 1.5/1.6: SQLite Multi-School schema initialization without backup/audit_logs/lgpd_requests', () => {
  closeDatabase();
  getDatabase(isolatedDbPath);
  const summary = getDatabaseStatusSummary();

  assert.equal(summary.engine.includes('SQLite'), true);
  assert.equal(summary.foreignKeysEnabled, true, 'SQLite PRAGMA foreign_keys must be enabled');
  assert.ok(summary.counts.schools >= 1, 'Default school must be seeded in SQLite');
  assert.ok(summary.counts.users >= 1, 'Users must be seeded in SQLite');
  assert.ok(summary.appliedMigrations.length >= 1, 'Migration must be recorded in schema_migrations');
});

test('SEÇÃO 6.2: Multi-School Isolation, Authentication, Server-side Sessions, and Brute-Force Protection', () => {
  getDatabase(isolatedDbPath);

  // Create school and user to test authentication & session isolation
  const { school } = upsertSchoolInDb({
    id: 'school-1875',
    nome: 'ESCOLA PRESIDENTE PRUDENTE',
    codigoPortal: '1875',
    cidade: 'Presidente Prudente',
    uf: 'SP',
    npsEmail: 'prudente@microlins.com.br',
    npsPassword: 'NpsSecretPassword2026',
  });

  upsertUserInDb(school.id, {
    login: 'a116882',
    senha: 'SchoolUserPass@2025',
    nomeCompleto: 'João Pedro Pereira França',
    cargo: 'Auxiliar Pedagógico',
  });

  // Verify sanitized registry never exposes plaintext passwords or hashes
  const sanitizedSchools = sanitizeSchoolsForClient(getSchoolsFromDb(false));
  const s1875 = sanitizedSchools.find((s) => s.id === 'school-1875')!;
  assert.ok(s1875.npsCredential.password.includes('••••'));
  for (const u of s1875.users) {
    assert.ok(u.senha.includes('••••'));
  }

  // 1. Valid login for school user
  const validAuth = authenticateUserInDb(
    'a116882',
    'SchoolUserPass@2025',
    '127.0.0.1',
    'NodeTestAgent'
  );
  assert.equal(validAuth.ok, true);
  assert.equal(validAuth.status, 200);
  assert.ok(validAuth.session?.sessionToken, 'Must issue 256-bit session token');
  assert.equal(validAuth.session?.role, 'ESCOLA');
  assert.equal(validAuth.session?.schoolId, 'school-1875');

  // 2. Validate session token in DB
  const sessionCheck = validateSessionTokenInDb(validAuth.session?.sessionToken);
  assert.ok(sessionCheck, 'Session token must validate in DB');
  assert.equal(sessionCheck?.login, 'a116882');
  assert.equal(sessionCheck?.schoolId, 'school-1875');

  // 3. Revoke session token (Logout)
  revokeSessionTokenInDb(validAuth.session?.sessionToken);
  const afterRevoke = validateSessionTokenInDb(validAuth.session?.sessionToken);
  assert.equal(afterRevoke, null, 'Revoked session token must no longer validate');

  // 4. Brute-force protection: 5 failed attempts lock the username
  const bruteUser = 'brute_target_user';
  for (let i = 1; i <= 5; i++) {
    const res = authenticateUserInDb(bruteUser, 'WrongPass', '10.0.0.99', 'AttackerBot');
    assert.equal(res.ok, false);
  }

  const lockedAttempt = authenticateUserInDb(bruteUser, 'WrongPass', '10.0.0.99', 'AttackerBot');
  assert.equal(lockedAttempt.ok, false);
  assert.equal(lockedAttempt.status, 429, 'Locked account must return HTTP 429');
});

test('SEÇÃO 6.1: Secure single-use time-limited Password Recovery flow', () => {
  getDatabase(isolatedDbPath);

  const { school } = upsertSchoolInDb({
    nome: 'UNIDADE TESTE RECUPERACAO',
    codigoPortal: '9991',
    cidade: 'Marília',
    uf: 'SP',
    npsEmail: 'marilia@microlins.com.br',
    npsPassword: 'MariliaNps@2026',
  });
  assert.ok(school.id);

  const { user } = upsertUserInDb(school.id, {
    login: 'prof_recuperacao',
    senha: 'Initial@123',
    nomeCompleto: 'Prof Teste Recuperacao',
    cargo: 'Instrutor',
  });
  assert.equal(user.login, 'prof_recuperacao');

  const recovery = createPasswordRecoveryTokenInDb('prof_recuperacao', '127.0.0.1');
  assert.equal(recovery.ok, true);
  assert.ok(recovery.recoveryToken, 'Must generate single-use recovery token');

  const resetRes = resetPasswordWithRecoveryTokenInDb(
    recovery.recoveryToken!,
    'NewSecurePass#2026',
    '127.0.0.1'
  );
  assert.equal(resetRes.ok, true);

  const reuseRes = resetPasswordWithRecoveryTokenInDb(
    recovery.recoveryToken!,
    'AnotherPass#2026',
    '127.0.0.1'
  );
  assert.equal(reuseRes.ok, false, 'Single-use recovery token must reject second use');

  const loginNew = authenticateUserInDb('prof_recuperacao', 'NewSecurePass#2026', '127.0.0.1');
  assert.equal(loginNew.ok, true, 'User must be able to login with the newly reset password');
});

test('SEÇÃO 6.3: Technical LGPD Knowledge Base & Multi-School Isolation Documentation', () => {
  assert.ok(PRIVACY_KNOWLEDGE_BASE.length >= 6, 'Knowledge base must cover technical LGPD, RBAC, and multi-school isolation');
  assert.ok(PRIVACY_QUICK_QUESTIONS.length >= 5, 'Must expose quick technical questions');

  for (const question of PRIVACY_QUICK_QUESTIONS) {
    const results = searchPrivacyKnowledgeBase(question);
    assert.ok(results.length >= 1, `Search must return relevant answer for: "${question}"`);
  }

  closeDatabase();
  // Re-open default database so subsequent tests use the production SQLite file
  getDatabase();
});
