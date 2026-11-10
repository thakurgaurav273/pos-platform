import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** RFC 6238 time-based one-time passwords (SHA-1, 6 digits, 30 s), as every authenticator app expects. */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit random secret, base32 encoded (what authenticator apps import). */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code =
    ((h[off] & 0x7f) << 24) |
    (h[off + 1] << 16) |
    (h[off + 2] << 8) |
    h[off + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

export const stepAt = (nowMs: number) =>
  Math.floor(nowMs / 1000 / STEP_SECONDS);

/**
 * Returns the time-step the code belongs to (accepting one step of clock drift either
 * way), or null if it is wrong. A step at or before `lastUsedStep` is rejected so a
 * code cannot be replayed.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  nowMs: number,
  lastUsedStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const current = stepAt(nowMs);
  const given = Buffer.from(code);
  let matched: number | null = null;
  // Check every step (no early exit) so timing does not reveal which one matched.
  for (const step of [current - 1, current, current + 1]) {
    const ok = timingSafeEqual(Buffer.from(hotp(secret, step)), given);
    if (ok && matched === null) matched = step;
  }
  if (matched === null) return null;
  if (lastUsedStep !== null && matched <= lastUsedStep) return null;
  return matched;
}

export function otpauthUrl(
  account: string,
  secretB32: string,
  issuer: string,
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return (
    `otpauth://totp/${label}?secret=${secretB32}` +
    `&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
  );
}

// ---- encryption at rest (the secret is never stored in plain text) ----

function requireJwtSecret(): string {
  const s = process.env['JWT_SECRET'];
  if (!s) throw new Error('JWT_SECRET is required');
  return s;
}

const key = () =>
  createHash('sha256').update(`${requireJwtSecret()}:operator-totp`).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct]
    .map((b) => b.toString('base64'))
    .join('.');
}

export function decryptSecret(blob: string): string {
  const [iv, tag, ct] = blob.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    'utf8',
  );
}

/** Signing secret for operator-session tokens; different from the login secret so one can never pass as the other. */
export function operatorSessionSecret(): string {
  return createHash('sha256')
    .update(`${requireJwtSecret()}:operator-session`)
    .digest('hex');
}
