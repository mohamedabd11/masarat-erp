/**
 * AES-256-GCM encryption for GDS provider credentials.
 *
 * Each call to encryptWithKey() produces a unique ciphertext (random 12-byte IV).
 * The encoded format is:   <iv>:<tag>:<ciphertext>
 * where each component is base64url-encoded with no padding.
 *
 * Key requirement: 32 bytes = 64 hex characters, set via CREDENTIAL_ENCRYPTION_KEY.
 *
 * Pure functions (encryptWithKey / decryptWithKey) accept an explicit key and
 * are used directly in tests. Production callers use encryptCredential /
 * decryptCredential which read the key from env.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALG       = 'aes-256-gcm' as const;
const IV_BYTES  = 12;
const KEY_BYTES = 32;

// ── Pure (testable) functions ─────────────────────────────────────────────────

export function encryptWithKey(plaintext: string, keyHex: string): string {
  if (keyHex.length !== KEY_BYTES * 2) {
    throw new Error(`Encryption key must be ${KEY_BYTES * 2} hex characters`);
  }
  const key    = Buffer.from(keyHex, 'hex');
  const iv     = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);
  const ct     = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    ct.toString('base64url'),
  ].join(':');
}

export function decryptWithKey(encoded: string, keyHex: string): string {
  if (keyHex.length !== KEY_BYTES * 2) {
    throw new Error(`Encryption key must be ${KEY_BYTES * 2} hex characters`);
  }
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid credential format: expected iv:tag:ciphertext');
  }
  const [ivB64, tagB64, ctB64] = parts as [string, string, string];
  const key      = Buffer.from(keyHex, 'hex');
  const iv       = Buffer.from(ivB64, 'base64url');
  const tag      = Buffer.from(tagB64, 'base64url');
  const ct       = Buffer.from(ctB64, 'base64url');
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ct, undefined, 'utf8') + decipher.final('utf8');
}

// ── Production wrappers (read from env) ───────────────────────────────────────

function getEnvKey(): string {
  const hex = process.env['CREDENTIAL_ENCRYPTION_KEY'];
  if (!hex || hex.length !== KEY_BYTES * 2) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY must be set to exactly 64 hex characters (32 bytes)',
    );
  }
  return hex;
}

export function encryptCredential(plaintext: string): string {
  return encryptWithKey(plaintext, getEnvKey());
}

export function decryptCredential(encoded: string): string {
  return decryptWithKey(encoded, getEnvKey());
}
