/**
 * Symmetric encryption for sensitive credentials at rest (AES-256-GCM).
 *
 * Uses the Web Crypto API so it runs on both the Node.js and Edge runtimes.
 *
 * Key: 32-byte (256-bit) key supplied via the `ENCRYPTION_KEY` env var as a
 * 64-char hex string. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Backward compatibility: if `ENCRYPTION_KEY` is not set, encrypt/decrypt act as
 * identity functions — values are stored and read as plaintext. This lets older
 * deployments keep working until a key is provisioned. `decrypt` also returns the
 * input unchanged when it is not in our ciphertext envelope, so previously-stored
 * plaintext values keep working even after a key is added.
 */

// Envelope prefix marks values produced by this module so decrypt can tell
// encrypted ciphertext apart from legacy plaintext.
const ENVELOPE_PREFIX = 'enc:v1:';
const IV_BYTES = 12; // 96-bit nonce recommended for GCM

function getKeyHex(): string | undefined {
  const key = process.env['ENCRYPTION_KEY'];
  return key && key.length > 0 ? key : undefined;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length !== 64 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(): Promise<CryptoKey> {
  const keyHex = getKeyHex();
  if (!keyHex) throw new Error('ENCRYPTION_KEY not set');
  return crypto.subtle.importKey('raw', hexToBytes(keyHex) as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt a UTF-8 string. Returns an `enc:v1:` envelope (base64 IV + ciphertext).
 * If no encryption key is configured, returns the plaintext unchanged.
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!getKeyHex()) return plaintext;             // backward compatibility
  if (plaintext.startsWith(ENVELOPE_PREFIX)) return plaintext; // already encrypted

  const key = await importKey();
  const iv  = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource);

  return ENVELOPE_PREFIX + bytesToBase64(iv) + ':' + bytesToBase64(new Uint8Array(cipherBuf));
}

/**
 * Decrypt an `enc:v1:` envelope produced by `encrypt`. If the value is not in
 * the envelope format (legacy plaintext) or no key is configured, the input is
 * returned unchanged.
 */
export async function decrypt(ciphertext: string): Promise<string> {
  if (!ciphertext.startsWith(ENVELOPE_PREFIX)) return ciphertext; // legacy plaintext
  if (!getKeyHex()) return ciphertext;            // no key — cannot decrypt, pass through

  const body  = ciphertext.slice(ENVELOPE_PREFIX.length);
  const sep   = body.indexOf(':');
  if (sep < 0) return ciphertext;
  const iv     = base64ToBytes(body.slice(0, sep));
  const cipher = base64ToBytes(body.slice(sep + 1));

  const key = await importKey();
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, cipher as BufferSource);
  return new TextDecoder().decode(plainBuf);
}

/** Encrypt a JSON-serialisable object; returns an envelope string. */
export async function encryptJson(value: unknown): Promise<string> {
  return encrypt(JSON.stringify(value));
}

/**
 * Decrypt a value produced by `encryptJson`. Accepts either an envelope string
 * or a legacy plaintext object (returned as-is), so reads keep working during
 * the migration window.
 */
export async function decryptJson<T = unknown>(stored: unknown): Promise<T> {
  if (typeof stored !== 'string') return stored as T;          // legacy plaintext object
  if (!stored.startsWith(ENVELOPE_PREFIX)) {
    // Might be a plain JSON string — try to parse, otherwise return as-is.
    try { return JSON.parse(stored) as T; } catch { return stored as unknown as T; }
  }
  const plain = await decrypt(stored);
  return JSON.parse(plain) as T;
}
