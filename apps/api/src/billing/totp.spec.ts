import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateSecret,
  hotp,
  otpauthUrl,
  verifyTotp,
} from './totp';

// The shared secret used by the RFC 4226 / RFC 6238 test vectors.
const RFC_SECRET = Buffer.from('12345678901234567890');
const RFC_SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  beforeAll(() => {
    process.env['JWT_SECRET'] = 'test-secret-that-is-long-enough-for-hashing';
  });

  it('encodes and decodes base32 (RFC 4648)', () => {
    expect(base32Encode(RFC_SECRET)).toBe(RFC_SECRET_B32);
    expect(base32Decode(RFC_SECRET_B32).equals(RFC_SECRET)).toBe(true);
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
  });

  it('matches the RFC 4226 HOTP test values', () => {
    expect(hotp(RFC_SECRET, 0)).toBe('755224');
    expect(hotp(RFC_SECRET, 1)).toBe('287082');
    expect(hotp(RFC_SECRET, 2)).toBe('359152');
    expect(hotp(RFC_SECRET, 3)).toBe('969429');
  });

  it('matches the RFC 6238 TOTP test values (last 6 digits)', () => {
    const at = (seconds: number) => hotp(RFC_SECRET, Math.floor(seconds / 30));
    expect(at(59)).toBe('287082');
    expect(at(1111111109)).toBe('081804');
    expect(at(1234567890)).toBe('005924');
    expect(at(2000000000)).toBe('279037');
  });

  describe('verifyTotp', () => {
    const now = 59_000; // time-step 1

    it('accepts the current code and returns its step', () => {
      expect(verifyTotp(RFC_SECRET_B32, '287082', now, null)).toBe(1);
    });

    it('allows one step of clock drift either way, but not two', () => {
      expect(verifyTotp(RFC_SECRET_B32, '755224', now, null)).toBe(0); // step 0
      expect(verifyTotp(RFC_SECRET_B32, '359152', now, null)).toBe(2); // step 2
      expect(verifyTotp(RFC_SECRET_B32, '969429', now, null)).toBeNull(); // step 3
    });

    it('rejects malformed codes', () => {
      for (const bad of ['', '12345', '1234567', 'abcdef', '287 082']) {
        expect(verifyTotp(RFC_SECRET_B32, bad, now, null)).toBeNull();
      }
    });

    it('rejects a code that was already used (replay) but accepts a newer step', () => {
      expect(verifyTotp(RFC_SECRET_B32, '287082', now, 1)).toBeNull();
      expect(verifyTotp(RFC_SECRET_B32, '287082', now, 5)).toBeNull();
      expect(verifyTotp(RFC_SECRET_B32, '287082', now, 0)).toBe(1);
    });
  });

  it('encrypts the secret at rest and can read it back', () => {
    const secret = generateSecret();
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).not.toContain(secret);
    expect(a).not.toBe(b); // fresh IV each time
    expect(decryptSecret(a)).toBe(secret);
  });

  it('refuses a tampered ciphertext', () => {
    const blob = encryptSecret(generateSecret());
    const [iv, tag, ct] = blob.split('.');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 0xff;
    expect(() =>
      decryptSecret([iv, tag, flipped.toString('base64')].join('.')),
    ).toThrow();
  });

  it('builds a standard otpauth URL', () => {
    const url = otpauthUrl(
      'op@example.com',
      RFC_SECRET_B32,
      'Fluxen POS Operator',
    );
    expect(url).toContain(
      'otpauth://totp/Fluxen%20POS%20Operator:op%40example.com',
    );
    expect(url).toContain(`secret=${RFC_SECRET_B32}`);
    expect(url).toContain('digits=6');
    expect(url).toContain('period=30');
  });
});
