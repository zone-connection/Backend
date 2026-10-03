import { LEAD_TYPE_LABEL } from './grupozap.constants';

export type GrupoZapMcmv = {
  sellerDocument: string;
  unitType: string;
  state: string;
  city: string;
  propertyValue: number | null;
  subsidyRange: string;
  urgencyToBuy: string;
  documentType: string;
  hasMinimumFgtsContribution: boolean | null;
  downPayment: number | null;
  estimatedFinancingAmount: number | null;
};

export type GrupoZapLead = {
  leadOrigin: string;
  originLeadId: string;
  originListingId: string;
  clientListingId: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  temperature: string;
  prioridade: string;
  transactionType: string;
  interesse: string;
  leadType: string;
  leadTypeLabel: string;
  leadCerto: boolean;
  izi: string;
  feedback: string;
  mcmv: GrupoZapMcmv | null;
  isMcmv: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Telefone nacional formatado. Prefere ddd + phone; phoneNumber está depreciado. */
export function formatGrupoZapPhone(
  ddd: string,
  phone: string,
  phoneNumber: string,
): string {
  const area = digits(ddd);
  const local = digits(phone);
  let national = '';
  if (area.length === 2 && local.length >= 8 && local.length <= 9) {
    national = `${area}${local}`;
  } else if (local.length >= 10) {
    national = local.replace(/^55/, '').slice(0, 11);
  } else {
    national = digits(phoneNumber).replace(/^55/, '').slice(0, 11);
  }

  if (!/^\d{10,11}$/.test(national)) return '(00) 00000-0000';
  const d = national.slice(0, 2);
  const rest = national.slice(2);
  return rest.length === 9
    ? `(${d}) ${rest.slice(0, 5)}-${rest.slice(5)}`
    : `(${d}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

function prioridadeFromTemperature(temperature: string): string {
  if (temperature === 'Baixa' || temperature === 'Alta') return temperature;
  if (temperature === 'Média' || temperature === 'Media') return 'Média';
  return 'Média';
}

function parseMcmv(extra: Record<string, unknown> | null): GrupoZapMcmv | null {
  const raw = asRecord(extra?.mcmv);
  if (!raw) return null;
  const location = asRecord(raw.propertyLocation);
  const num = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    sellerDocument: digits(text(raw.sellerDocument)),
    unitType: text(raw.unitType),
    state: text(location?.state),
    city: text(location?.city),
    propertyValue: num(raw.propertyValue),
    subsidyRange: text(raw.subsidyRange),
    urgencyToBuy: text(raw.urgencyToBuy),
    documentType: text(raw.documentType),
    hasMinimumFgtsContribution:
      typeof raw.hasMinimumFgtsContribution === 'boolean'
        ? raw.hasMinimumFgtsContribution
        : null,
    downPayment: num(raw.downPayment),
    estimatedFinancingAmount: num(raw.estimatedFinancingAmount),
  };
}

/**
 * Motivo para responder 4xx. Lead de anúncio sem clientListingId volta para
 * reprocessamento. Lead MCMV_OLX não tem anúncio.
 */
export function leadRejectionReason(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return 'Payload inválido.';
  if (!text(record.originLeadId)) return 'originLeadId ausente.';
  const origin = text(record.leadOrigin);
  const listing = text(record.clientListingId);
  if (origin !== 'MCMV_OLX' && !listing) return 'clientListingId ausente.';
  return null;
}

export function parseGrupoZapLead(body: unknown): GrupoZapLead {
  const record = asRecord(body) ?? {};
  const extra = asRecord(record.extraData);
  const leadOrigin = text(record.leadOrigin) || 'Grupo OLX';
  const leadType = text(extra?.leadType);
  const temperature = text(record.temperature);
  const transactionType = text(record.transactionType).toUpperCase();
  const mcmv = parseMcmv(extra);

  return {
    leadOrigin,
    originLeadId: text(record.originLeadId),
    originListingId: text(record.originListingId),
    clientListingId: text(record.clientListingId),
    name: text(record.name) || 'Lead Grupo OLX',
    email: text(record.email),
    phone: formatGrupoZapPhone(
      text(record.ddd),
      text(record.phone),
      text(record.phoneNumber),
    ),
    message: text(record.message),
    temperature,
    prioridade: prioridadeFromTemperature(temperature),
    transactionType,
    interesse: transactionType === 'RENT' ? 'Alugar' : 'Comprar',
    leadType,
    leadTypeLabel: LEAD_TYPE_LABEL[leadType] ?? leadType,
    leadCerto: extra?.leadCerto === true,
    izi: text(extra?.izi),
    feedback: text(extra?.feedback),
    mcmv,
    isMcmv: leadOrigin === 'MCMV_OLX',
  };
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
