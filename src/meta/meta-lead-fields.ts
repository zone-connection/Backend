import type { MetaLeadField } from './meta-graph-api.service';

export type MappedMetaLead = {
  nome: string;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
  cep: string | null;
  renda: number | null;
  tipoRenda: string | null;
  estadoCivil: string | null;
  cpf: string | null;
  rg: string | null;
  orcamentoMax: number | null;
  quartosMin: number | null;
  vagasMin: number | null;
  interesse: string | null;
  empreendimentoNome: string | null;
  extraTags: string[];
};

const NAME_KEYS = new Set([
  'full_name',
  'nome_completo',
  'name',
  'first_name',
  'nome',
  'last_name',
  'sobrenome',
]);
const PHONE_HINTS = [
  'phone_number',
  'phone',
  'telefone',
  'celular',
  'whatsapp',
  'mobile',
  'work_phone',
  'fone',
];
const EMAIL_HINTS = ['email', 'e_mail', 'work_email', 'mail'];
const CITY_HINTS = ['city', 'cidade'];
const NEIGH_HINTS = ['bairro', 'neighborhood', 'district'];
const ADDRESS_HINTS = ['street_address', 'endereco', 'address', 'logradouro'];
const ZIP_HINTS = ['zip_code', 'post_code', 'postal', 'cep'];
const INCOME_HINTS = ['renda_mensal', 'renda', 'income', 'salary', 'salario'];
const INCOME_TYPE_HINTS = ['tipo_de_renda', 'tipo_renda', 'profissao', 'occupation'];
const MARITAL_HINTS = ['estado_civil', 'marital', 'civil'];
const CPF_HINTS = ['cpf'];
const RG_HINTS = ['rg', 'identidade'];
const BUDGET_HINTS = ['orcamento', 'budget', 'valor_imovel', 'valor_do_imovel'];
const ROOMS_HINTS = ['quartos', 'dormitorios', 'bedrooms'];
const PARKING_HINTS = ['vagas', 'garagem', 'parking'];
const INTEREST_HINTS = ['interesse', 'looking_for', 'intencao'];
const EMP_HINTS = [
  'empreendimento',
  'imovel_interesse',
  'condominio',
  'produto',
];
const SKIP_HINTS = ['corretor', 'equipe', 'broker', 'team', 'assigned'];

function normalizeKey(name: string) {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function firstValue(field: MetaLeadField) {
  return field.values?.find((v) => typeof v === 'string' && v.trim())?.trim();
}

function hintMatch(key: string, hints: string[]) {
  return hints.some((hint) => key === hint || key.includes(hint));
}

function pickByHint(byName: Map<string, string>, hints: string[]) {
  for (const hint of hints) {
    const exact = byName.get(hint);
    if (exact) return exact;
  }
  for (const [key, value] of byName) {
    if (hintMatch(key, hints) && value) return value;
  }
  return null;
}

function parseEmail(raw: string | null) {
  if (!raw) return null;
  const match = raw.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  const email = match?.[0]?.toLowerCase() ?? null;
  if (!email || email.endsWith('@facebook.meta.local')) return null;
  return email;
}

function parsePhone(raw: string | null) {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.length > 11) digits = digits.slice(-11);
  if (!/^\d{10,11}$/.test(digits)) return null;
  const ddd = digits.slice(0, 2);
  const local = digits.slice(2);
  return local.length === 9
    ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
    : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
}

function parseMoney(raw: string | null) {
  if (!raw) return null;
  const compact = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number.parseInt(compact, 10);
  return Number.isFinite(n) && n > 0 && n <= 2_000_000_000 ? n : null;
}

function parsePositiveInt(raw: string | null) {
  if (!raw) return null;
  const n = Number.parseInt(raw.replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}

function parseCpf(raw: string | null) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function parseCep(raw: string | null) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function parseInteresse(raw: string | null) {
  if (!raw) return null;
  const n = normalizeKey(raw);
  if (n.includes('alug')) return 'Alugar';
  if (n.includes('compr') || n.includes('invest')) return 'Comprar';
  return raw.slice(0, 80);
}

function scanEmail(byName: Map<string, string>) {
  for (const value of byName.values()) {
    const email = parseEmail(value);
    if (email) return email;
  }
  return null;
}

function scanPhone(byName: Map<string, string>) {
  for (const value of byName.values()) {
    const phone = parsePhone(value);
    if (phone) return phone;
  }
  return null;
}

function scanCpf(byName: Map<string, string>) {
  for (const value of byName.values()) {
    const cpf = parseCpf(value);
    if (cpf) return cpf;
  }
  return null;
}

const MAPPED_HINTS = [
  PHONE_HINTS,
  EMAIL_HINTS,
  CITY_HINTS,
  NEIGH_HINTS,
  ADDRESS_HINTS,
  ZIP_HINTS,
  INCOME_HINTS,
  INCOME_TYPE_HINTS,
  MARITAL_HINTS,
  CPF_HINTS,
  RG_HINTS,
  BUDGET_HINTS,
  ROOMS_HINTS,
  PARKING_HINTS,
  INTEREST_HINTS,
  EMP_HINTS,
  SKIP_HINTS,
];

export function mapMetaLeadFields(fields: MetaLeadField[]): MappedMetaLead {
  const byName = new Map<string, string>();
  for (const field of fields) {
    const key = normalizeKey(field.name ?? '');
    const value = firstValue(field);
    if (key && value) byName.set(key, value);
  }

  const firstName = pickByHint(byName, ['first_name']);
  const lastName = pickByHint(byName, ['last_name', 'sobrenome']);
  const joined = [firstName, lastName].filter(Boolean).join(' ').trim();
  const fullName =
    pickByHint(byName, ['full_name', 'nome_completo', 'name']) ||
    pickByHint(byName, ['nome']) ||
    joined ||
    null;

  const extraTags: string[] = [];
  for (const [key, value] of byName) {
    if (NAME_KEYS.has(key) || MAPPED_HINTS.some((hints) => hintMatch(key, hints))) {
      continue;
    }
    extraTags.push(`${key}: ${value.slice(0, 80)}`);
  }

  return {
    nome: fullName || 'Lead Facebook',
    telefone: parsePhone(pickByHint(byName, PHONE_HINTS)) ?? scanPhone(byName),
    email: parseEmail(pickByHint(byName, EMAIL_HINTS)) ?? scanEmail(byName),
    cidade: pickByHint(byName, CITY_HINTS),
    bairro: pickByHint(byName, NEIGH_HINTS),
    endereco: pickByHint(byName, ADDRESS_HINTS),
    cep: parseCep(pickByHint(byName, ZIP_HINTS)),
    renda: parseMoney(pickByHint(byName, INCOME_HINTS)),
    tipoRenda: pickByHint(byName, INCOME_TYPE_HINTS),
    estadoCivil: pickByHint(byName, MARITAL_HINTS),
    cpf: parseCpf(pickByHint(byName, CPF_HINTS)) ?? scanCpf(byName),
    rg: pickByHint(byName, RG_HINTS),
    orcamentoMax: parseMoney(pickByHint(byName, BUDGET_HINTS)),
    quartosMin: parsePositiveInt(pickByHint(byName, ROOMS_HINTS)),
    vagasMin: parsePositiveInt(pickByHint(byName, PARKING_HINTS)),
    interesse: parseInteresse(pickByHint(byName, INTEREST_HINTS)),
    empreendimentoNome: pickByHint(byName, EMP_HINTS),
    extraTags,
  };
}

export function metaFieldKeys(fields: MetaLeadField[]) {
  return fields.map((f) => f.name).filter(Boolean).join(',');
}

export function emptyMappedMetaLead(partial: Partial<MappedMetaLead>): MappedMetaLead {
  return {
    nome: 'Lead Facebook',
    telefone: null,
    email: null,
    cidade: null,
    bairro: null,
    endereco: null,
    cep: null,
    renda: null,
    tipoRenda: null,
    estadoCivil: null,
    cpf: null,
    rg: null,
    orcamentoMax: null,
    quartosMin: null,
    vagasMin: null,
    interesse: null,
    empreendimentoNome: null,
    extraTags: [],
    ...partial,
  };
}
