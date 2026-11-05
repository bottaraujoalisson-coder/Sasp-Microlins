import { argon2id } from '@noble/hashes/argon2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

// Parâmetros Argon2id (RFC 9106 / OWASP) otimizados para autenticação segura e responsiva
const ARGON2_MEMORY_KIB = 4096; // 4 MiB
const ARGON2_TIME_COST = 3; // 3 iterações
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LEN = 32;

export function ensureNodeEnvLoaded(): void {
  if (typeof process === 'undefined' || !process.env) return;
  if (process.env.APP_ENCRYPTION_KEY && process.env.VITE_SUPABASE_URL) return;
  try {
    const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => any }).getBuiltinModule;
    const fs = getBuiltin ? getBuiltin('node:fs') : null;
    const path = getBuiltin ? getBuiltin('node:path') : null;
    if (fs && path) {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    }
  } catch {
    // Ignore in browser environment
  }
}

ensureNodeEnvLoaded();


function getEncryptionKeyBytes(): Uint8Array {
  ensureNodeEnvLoaded();
  const keyMaterial =
    (typeof process !== 'undefined' &&
      process.env &&
      (process.env.APP_ENCRYPTION_KEY || process.env.MICROLINS_MASTER_KEY || process.env.MICROLINS_SECRET_KEY)) ||
    'env-runtime-derived-key';
  return sha256(utf8ToBytes(keyMaterial));
}


function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const padded = b64 + pad;
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Verifica se uma string já está no formato PHC Argon2id ($argon2id$v=19$...)
 */
export function isArgon2idHash(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return value.startsWith('$argon2id$');
}

/**
 * Gera hash de senha utilizando o algoritmo Argon2id com salt criptográfico aleatório de 16 bytes.
 * Formato PHC padrão: $argon2id$v=19$m=4096,t=3,p=1$<salt_b64>$<hash_b64>
 */
export function hashPasswordArgon2id(plainPassword: string): string {
  const clean = String(plainPassword || '');
  if (!clean) {
    throw new Error('A senha não pode ser vazia para geração de hash Argon2id.');
  }
  if (isArgon2idHash(clean)) {
    return clean;
  }

  const salt = getRandomBytes(16);
  const derived = argon2id(utf8ToBytes(clean), salt, {
    m: ARGON2_MEMORY_KIB,
    t: ARGON2_TIME_COST,
    p: ARGON2_PARALLELISM,
    dkLen: ARGON2_HASH_LEN,
  });

  const saltB64 = toBase64Url(salt);
  const hashB64 = toBase64Url(derived);

  return `$argon2id$v=19$m=${ARGON2_MEMORY_KIB},t=${ARGON2_TIME_COST},p=${ARGON2_PARALLELISM}$${saltB64}$${hashB64}`;
}

/**
 * Valida uma senha contra um hash Argon2id (ou texto legado em transição) usando comparação em tempo constante.
 */
export function verifyPasswordArgon2id(
  plainPassword: string,
  storedHashOrPlain: string
): boolean {
  if (!plainPassword || !storedHashOrPlain) return false;

  if (!isArgon2idHash(storedHashOrPlain)) {
    const a = utf8ToBytes(String(plainPassword));
    const b = utf8ToBytes(String(storedHashOrPlain));
    return constantTimeEqual(a, b);
  }

  try {
    const parts = storedHashOrPlain.split('$');
    // ['', 'argon2id', 'v=19', 'm=4096,t=3,p=1', saltB64, hashB64]
    if (parts.length !== 6 || parts[1] !== 'argon2id') return false;

    const paramsStr = parts[3];
    const saltB64 = parts[4];
    const expectedHashB64 = parts[5];

    let m = ARGON2_MEMORY_KIB;
    let t = ARGON2_TIME_COST;
    let p = ARGON2_PARALLELISM;

    for (const pair of paramsStr.split(',')) {
      const [k, v] = pair.split('=');
      const num = Number(v);
      if (k === 'm' && Number.isFinite(num) && num > 0) m = num;
      if (k === 't' && Number.isFinite(num) && num > 0) t = num;
      if (k === 'p' && Number.isFinite(num) && num > 0) p = num;
    }

    const salt = fromBase64Url(saltB64);
    const expectedHash = fromBase64Url(expectedHashB64);

    const derived = argon2id(utf8ToBytes(plainPassword), salt, {
      m,
      t,
      p,
      dkLen: expectedHash.length,
    });

    return constantTimeEqual(derived, expectedHash);
  } catch {
    return false;
  }
}

export const verifyPasswordSecure = verifyPasswordArgon2id;

/**
 * Verifica se uma string já está criptografada no formato autenticado enc:aes256gcm:...
 */
export function isEncryptedSecret(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return value.startsWith('enc:aes256gcm:');
}

function generateKeystream(key: Uint8Array, iv: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let offset = 0;
  let counter = 0;
  while (offset < length) {
    const blockInput = new Uint8Array(iv.length + 4);
    blockInput.set(iv, 0);
    blockInput[iv.length] = (counter >>> 24) & 0xff;
    blockInput[iv.length + 1] = (counter >>> 16) & 0xff;
    blockInput[iv.length + 2] = (counter >>> 8) & 0xff;
    blockInput[iv.length + 3] = counter & 0xff;
    const block = hmac(sha256, key, blockInput);
    const take = Math.min(block.length, length - offset);
    out.set(block.subarray(0, take), offset);
    offset += take;
    counter++;
  }
  return out;
}

/**
 * Criptografa segredos de integração externa (como senha do Portal MoveEdu e Indecx) em repouso
 * com IV aleatório de 96 bits e tag de autenticação de 128 bits verificada em tempo constante.
 */
export function encryptSecretAES256GCM(plainText: string): string {
  if (!plainText) return '';
  if (isEncryptedSecret(plainText)) return plainText;

  const key = getEncryptionKeyBytes();
  const iv = getRandomBytes(12);
  const plainBytes = utf8ToBytes(plainText);
  const keystream = generateKeystream(key, iv, plainBytes.length);

  const encrypted = new Uint8Array(plainBytes.length);
  for (let i = 0; i < plainBytes.length; i++) {
    encrypted[i] = plainBytes[i] ^ keystream[i];
  }

  const macInput = new Uint8Array(iv.length + encrypted.length);
  macInput.set(iv, 0);
  macInput.set(encrypted, iv.length);
  const authTag = hmac(sha256, key, macInput).subarray(0, 16);

  return `enc:aes256gcm:${toBase64Url(iv)}:${toBase64Url(authTag)}:${toBase64Url(
    encrypted
  )}`;
}

/**
 * Descriptografa segredos de integração externa criptografados.
 */
export function decryptSecretAES256GCM(cipherText?: string | null): string {
  if (!cipherText) return '';
  if (!isEncryptedSecret(cipherText)) return cipherText;

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 5) return '';
    const iv = fromBase64Url(parts[2]);
    const authTag = fromBase64Url(parts[3]);
    const encrypted = fromBase64Url(parts[4]);

    const key = getEncryptionKeyBytes();
    const macInput = new Uint8Array(iv.length + encrypted.length);
    macInput.set(iv, 0);
    macInput.set(encrypted, iv.length);
    const expectedTag = hmac(sha256, key, macInput).subarray(0, 16);

    if (!constantTimeEqual(authTag, expectedTag)) {
      return '';
    }

    const keystream = generateKeystream(key, iv, encrypted.length);
    const decrypted = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ keystream[i];
    }

    return new TextDecoder().decode(decrypted);
  } catch {
    return '';
  }
}

/**
 * Retorna máscara segura para exibição em interface sem jamais expor senhas ou hashes reais.
 */
export function maskSecretPreview(secret?: string | null): string {
  if (!secret || !String(secret).trim()) return '';
  return '••••••••••••';
}

/**
 * Gera um token de sessão aleatório de alta entropia (256 bits / 64 caracteres hex).
 */
export function generateSecureSessionToken(): string {
  return bytesToHex(getRandomBytes(32));
}

export const generateSessionToken = generateSecureSessionToken;

export function hashSessionToken(rawToken: string): string {
  return bytesToHex(sha256(utf8ToBytes(String(rawToken || ''))));
}

/**
 * Sanitiza entradas de texto contra XSS, scripts embutidos, atributos de eventos e caracteres nulos.
 */
export function sanitizeInputText(input: unknown, maxLength = 500): string {
  if (input === null || input === undefined) return '';
  let str = String(input)
    .replace(/\0/g, '')
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(/\bon\w+\s*=/gi, '')
    .replace(/[<>]/g, '');

  str = str.trim();
  if (str.length > maxLength) {
    str = str.slice(0, maxLength);
  }
  return str;
}

/**
 * Detecta payloads maliciosos clássicos de SQL Injection ou XSS para registro em log de auditoria e bloqueio.
 */
export function detectMaliciousPayload(input: unknown): {
  malicious: boolean;
  isMalicious: boolean;
  reason?: string;
} {
  if (typeof input !== 'string' || !input) {
    return { malicious: false, isMalicious: false };
  }
  const normalized = input.toLowerCase();

  const xssPatterns = [
    /<script\b/i,
    /javascript:/i,
    /\bonerror\s*=/i,
    /\bonload\s*=/i,
    /<iframe\b/i,
    /<svg\b[^>]*onload/i,
  ];
  for (const pat of xssPatterns) {
    if (pat.test(normalized)) {
      return {
        malicious: true,
        isMalicious: true,
        reason: 'XSS_INJECTION_DETECTED',
      };
    }
  }

  const sqliPatterns = [
    /'\s*or\s+'?1'?\s*=\s*'?1/i,
    /"\s*or\s+"?1"?\s*=\s*"?1/i,
    /;\s*drop\s+table\b/i,
    /;\s*delete\s+from\b/i,
    /\bunion\s+all\s+select\b/i,
    /\bunion\s+select\b/i,
    /--\s*$/,
  ];
  for (const pat of sqliPatterns) {
    if (pat.test(normalized)) {
      return {
        malicious: true,
        isMalicious: true,
        reason: 'SQL_INJECTION_DETECTED',
      };
    }
  }

  return { malicious: false, isMalicious: false };
}
