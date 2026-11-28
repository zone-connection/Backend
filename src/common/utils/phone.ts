/** Dígitos nacionais (DDD + número), ignora DDI 55. */
export function nationalPhoneDigits(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 11);
}

/** Chat ID do WhatsApp (E.164 sem +). Null se o número não for BR válido. */
export function toWhatsAppChatId(value: string): string | null {
  const national = nationalPhoneDigits(value);
  if (!/^\d{10,11}$/.test(national)) return null;
  return `55${national}`;
}

/** Celular antigo de 8 dígitos e o mesmo número com o 9. */
function canonicalMobile(value: string): string {
  const digits = nationalPhoneDigits(value);
  if (digits.length === 10) {
    return `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return digits;
}

export function phonesMatch(a: string, b: string): boolean {
  const left = canonicalMobile(a);
  const right = canonicalMobile(b);
  return left.length >= 10 && left === right;
}
