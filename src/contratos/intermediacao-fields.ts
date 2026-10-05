export const INTERMEDIACAO_KEYS = [
  'contratanteNome',
  'contratanteCpf',
  'contratanteRg',
  'contratanteRgOrgao',
  'contratanteTel',
  'contratanteEmail',
  'contratanteEndereco',
  'contratanteCep',
  'proprietarioNome',
  'proprietarioCnpj',
  'proprietarioEndereco',
  'proprietarioTel',
  'construtora',
  'empreendimento',
  'bloco',
  'unidade',
  'andar',
  'descricaoImovel',
  'precoImovel',
  'valorIntermediacao',
  'valorIntermediacaoExtenso',
  'banco',
  'agencia',
  'conta',
  'pix',
  'representanteLegal',
  'contratadaNome',
  'contratadaCnpj',
  'contratadaCreci',
  'contratadaEmail',
  'contratadaEndereco',
  'cidade',
  'data',
  'testemunha1Nome',
  'testemunha1Cpf',
  'testemunha2Nome',
  'testemunha2Cpf',
] as const;

export type IntermediacaoKey = (typeof INTERMEDIACAO_KEYS)[number];

export const INTERMEDIACAO_KEY_SET = new Set<string>(INTERMEDIACAO_KEYS);

export const COMPANY_KEYS = new Set<string>([
  'banco',
  'agencia',
  'conta',
  'pix',
  'representanteLegal',
  'contratadaNome',
  'contratadaCnpj',
  'contratadaCreci',
  'contratadaEmail',
  'contratadaEndereco',
]);

export type FieldConfidence = 'alta' | 'media' | 'baixa';

export type ExtractedField = {
  key: IntermediacaoKey;
  value: string;
  confidence: FieldConfidence;
  snippet: string;
  warning?: string;
};

export function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

export function isValidCpf(raw: string) {
  const digits = onlyDigits(raw);
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) {
      sum += Number(digits[i]) * (len + 1 - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

export function isValidCnpj(raw: string) {
  const digits = onlyDigits(raw);
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const calc = (len: number) => {
    const weights =
      len === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i += 1) {
      sum += Number(digits[i]) * weights[i]!;
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

export function isValidPhone(raw: string) {
  const digits = onlyDigits(raw);
  const national =
    digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  return national.length === 10 || national.length === 11;
}

export function isValidEmail(raw: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

export function formatCpf(raw: string) {
  const d = onlyDigits(raw).slice(0, 11);
  if (d.length !== 11) return raw.trim();
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatCnpj(raw: string) {
  const d = onlyDigits(raw).slice(0, 14);
  if (d.length !== 14) return raw.trim();
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatCep(raw: string) {
  const d = onlyDigits(raw).slice(0, 8);
  if (d.length !== 8) return raw.trim();
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function formatPhoneBr(raw: string) {
  let d = onlyDigits(raw);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return raw.trim();
}

export function sanitizeKnownValues(raw: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const key of INTERMEDIACAO_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().slice(0, 500);
    if (trimmed) out[key] = trimmed;
  }
  return out;
}
