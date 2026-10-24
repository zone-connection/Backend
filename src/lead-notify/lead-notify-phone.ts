import { phonesMatch } from '../common/utils/phone';

/** True se o destino do aviso já é telefone/WhatsApp de outra imobiliária. */
export function isPhoneOwnedByAnotherTenant(
  phone: string,
  otherPhones: Array<string | null | undefined>,
): boolean {
  return otherPhones.some(
    (other) => Boolean(other?.trim()) && phonesMatch(phone, other as string),
  );
}
