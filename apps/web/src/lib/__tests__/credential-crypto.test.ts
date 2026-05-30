import { describe, it, expect } from 'vitest';
import { encryptWithKey, decryptWithKey } from '@/lib/credential-crypto';

// 32-byte test key (64 hex chars) — never used in production
const TEST_KEY = 'a'.repeat(64);
const ALT_KEY  = 'b'.repeat(64);

describe('encryptWithKey', () => {
  it('returns a string in iv:tag:ciphertext format (3 colon-separated parts)', () => {
    const result = encryptWithKey('hello', TEST_KEY);
    expect(result.split(':').length).toBe(3);
  });

  it('each part is non-empty', () => {
    const [iv, tag, ct] = encryptWithKey('hello', TEST_KEY).split(':') as [string, string, string];
    expect(iv.length).toBeGreaterThan(0);
    expect(tag.length).toBeGreaterThan(0);
    expect(ct.length).toBeGreaterThan(0);
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const a = encryptWithKey('same plaintext', TEST_KEY);
    const b = encryptWithKey('same plaintext', TEST_KEY);
    expect(a).not.toBe(b);
  });

  it('throws when key is wrong length (not 64 hex chars)', () => {
    expect(() => encryptWithKey('hello', 'short')).toThrow();
    expect(() => encryptWithKey('hello', 'a'.repeat(63))).toThrow();
    expect(() => encryptWithKey('hello', 'a'.repeat(65))).toThrow();
  });

  it('encrypts empty string without error', () => {
    expect(() => encryptWithKey('', TEST_KEY)).not.toThrow();
  });

  it('encrypts Unicode / Arabic text correctly', () => {
    const arabic = 'بيانات اعتماد أماديوس السرية 🔐';
    const encrypted = encryptWithKey(arabic, TEST_KEY);
    expect(encrypted.split(':').length).toBe(3);
  });
});

describe('decryptWithKey', () => {
  it('round-trips: decrypt(encrypt(plaintext)) === plaintext', () => {
    const plain     = 'my-secret-api-key-12345';
    const encrypted = encryptWithKey(plain, TEST_KEY);
    expect(decryptWithKey(encrypted, TEST_KEY)).toBe(plain);
  });

  it('round-trips with Arabic text', () => {
    const arabic = 'كلمة المرور السرية للمزود';
    expect(decryptWithKey(encryptWithKey(arabic, TEST_KEY), TEST_KEY)).toBe(arabic);
  });

  it('round-trips with JSON payload (typical credential object)', () => {
    const payload = JSON.stringify({ clientId: 'myId', clientSecret: 'mySecret', hostname: 'api.example.com' });
    const decrypted = decryptWithKey(encryptWithKey(payload, TEST_KEY), TEST_KEY);
    expect(JSON.parse(decrypted)).toEqual({ clientId: 'myId', clientSecret: 'mySecret', hostname: 'api.example.com' });
  });

  it('round-trips with empty string', () => {
    expect(decryptWithKey(encryptWithKey('', TEST_KEY), TEST_KEY)).toBe('');
  });

  it('throws when decrypting with wrong key (auth tag mismatch)', () => {
    const encrypted = encryptWithKey('secret', TEST_KEY);
    expect(() => decryptWithKey(encrypted, ALT_KEY)).toThrow();
  });

  it('throws on malformed encoded string (not 3 parts)', () => {
    expect(() => decryptWithKey('only-two-parts:here', TEST_KEY)).toThrow('Invalid credential format');
    expect(() => decryptWithKey('one', TEST_KEY)).toThrow('Invalid credential format');
  });

  it('throws when key is wrong length', () => {
    const encrypted = encryptWithKey('hello', TEST_KEY);
    expect(() => decryptWithKey(encrypted, 'short')).toThrow();
  });

  it('throws on tampered ciphertext (integrity check)', () => {
    const parts = encryptWithKey('secret', TEST_KEY).split(':') as [string, string, string];
    // tamper with the ciphertext portion (last part)
    const tampered = `${parts[0]}:${parts[1]}:AAAA`;
    expect(() => decryptWithKey(tampered, TEST_KEY)).toThrow();
  });
});
