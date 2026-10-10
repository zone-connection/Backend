import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, atMs = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  return hotp(key, counter);
}

export function totpValid(secret: string, code: string, atMs = Date.now()): boolean {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
    const expected = hotp(key, counter + offset);
    if (codesMatch(expected, normalized)) return true;
  }
  return false;
}

export function otpauthUrl(params: {
  email: string;
  secret: string;
  issuer?: string;
}): string {
  const issuer = encodeURIComponent(params.issuer ?? 'Zone Connection');
  const label = encodeURIComponent(`${params.issuer ?? 'Zone Connection'}:${params.email}`);
  return `otpauth://totp/${label}?secret=${params.secret}&issuer=${issuer}&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(5).toString('hex').toUpperCase().slice(0, 10),
  );
}

export function hashBackupCode(code: string): string {
  return createHmac('sha256', 'crm-totp-backup')
    .update(code.replace(/\s/g, '').toUpperCase())
    .digest('hex');
}

export function consumeBackupCode(
  hashes: string[],
  code: string,
): string[] | null {
  const hashed = hashBackupCode(code);
  const index = hashes.findIndex((item) => {
    try {
      const a = Buffer.from(item);
      const b = Buffer.from(hashed);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
  if (index < 0) return null;
  return hashes.filter((_, i) => i !== index);
}

function codesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function roleNeedsTotp(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}
