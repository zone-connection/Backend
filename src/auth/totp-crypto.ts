import { ConfigService } from '@nestjs/config';
import { scryptSync } from 'crypto';
import { decryptSecret, encryptSecret } from '../meta/meta-token.crypto';

const SALT = 'crm-totp-secret';

function totpKey(config: ConfigService): Buffer {
  const raw = config.get<string>('JWT_ACCESS_SECRET')?.trim() || '';
  return scryptSync(raw, SALT, 32);
}

export function encryptTotpSecret(plain: string, config: ConfigService) {
  return encryptSecret(plain, totpKey(config));
}

export function decryptTotpSecret(value: string, config: ConfigService) {
  try {
    return decryptSecret(value, totpKey(config));
  } catch {
    return value;
  }
}
