/**
 * Symmetric encryption for at-rest secrets in the Integration.credentials JSON.
 * Uses AES-256-GCM with a key derived from APP_ENCRYPTION_KEY env var.
 *
 * Why this exists: storing OAuth refresh tokens and API keys directly in the
 * DB lets us look them up at runtime per tenant, but they're sensitive enough
 * that we shouldn't trust DB compromise. GCM gives us authenticated encryption
 * so tampering shows up as a decrypt failure.
 *
 * Falls back to a deterministic dev key when APP_ENCRYPTION_KEY is missing so
 * local dev works without setup, with a console warning.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALG = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

let warned = false;
function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    if (!warned) {
      console.warn(
        '[crypto] APP_ENCRYPTION_KEY not set — using deterministic dev key. SET this in production.'
      );
      warned = true;
    }
    return createHash('sha256').update('honeybook-dev-key-fallback').digest();
  }
  // Accept either 32 raw bytes (base64) or a longer secret we hash down.
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length === 44) {
    return Buffer.from(raw, 'base64');
  }
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Encoded as base64(iv || tag || ciphertext) — single-string, copy-safe.
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES) throw new Error('Invalid ciphertext');
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALG, getKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/** Encrypt every value in an object; useful for the Integration.credentials shape. */
export function encryptCredentials(creds: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) out[k] = encryptSecret(v);
  return out;
}

export function decryptCredentials(creds: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    try { out[k] = decryptSecret(v); }
    catch { /* drop bad value; logged at callsite */ }
  }
  return out;
}
