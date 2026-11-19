import { ConfigService } from '@nestjs/config';
import { scryptSync } from 'crypto';
import { decryptSecret, encryptSecret } from '../meta/meta-token.crypto';

const SALT = 'crm-orulo-secret';

export function oruloTokenKey(config: ConfigService): Buffer {
  const raw =
    config.get<string>('ORULO_TOKEN_ENCRYPTION_KEY')?.trim() ||
    config.get<string>('JWT_ACCESS_SECRET')?.trim() ||
    '';
  return scryptSync(raw, SALT, 32);
}

export function encryptOruloSecret(plain: string, config: ConfigService) {
  return encryptSecret(plain, oruloTokenKey(config));
}

export function decryptOruloSecret(value: string, config: ConfigService) {
  const key = oruloTokenKey(config);
  const parts = value.split('.');
  if (parts.length !== 3) return value;
  try {
    return decryptSecret(value, key);
  } catch {
    return value;
  }
}
