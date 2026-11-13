import { createHmac, randomBytes } from 'crypto';

const STEP_SECONDS = 30;
const DIGITS = 6;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): Buffer {
  return randomBytes(20);
}

export function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function totpCode(secret: Buffer, at = Date.now()): { code: string; step: number } {
  const step = Math.floor(at / 1000 / STEP_SECONDS);
  return { code: hotp(secret, step), step };
}

export function totpMatches(
  secret: Buffer,
  code: string,
  lastStep: number | null,
  at = Date.now(),
): { ok: boolean; step: number } {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return { ok: false, step: 0 };
  const current = Math.floor(at / 1000 / STEP_SECONDS);
  for (const step of [current - 1, current, current + 1]) {
    if (step < 0) continue;
    if (lastStep != null && step <= lastStep) continue;
    if (hotp(secret, step) === normalized) return { ok: true, step };
  }
  return { ok: false, step: current };
}

function hotp(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(DIGITS, '0');
}

export function otpauthUrl(email: string, secret: Buffer): string {
  const label = encodeURIComponent(`Zone Connection:${email}`);
  return `otpauth://totp/${label}?secret=${encodeBase32(secret)}&issuer=${encodeURIComponent('Zone Connection')}&digits=6&period=30`;
}
