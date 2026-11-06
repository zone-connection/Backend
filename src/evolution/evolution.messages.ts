export const NOVO_LEAD_NOTIFICATION = 'novo_lead';
export const MAX_WHATSAPP_ATTEMPTS = 3;

export type LeadWhatsappFields = {
  nomeCorretor: string;
  nomeLead: string;
  interesse: string;
  origem: string;
};

export function leadWhatsappMessage(fields: LeadWhatsappFields): string {
  const nomeCorretor = fields.nomeCorretor.trim() || 'corretor';
  const nomeLead = fields.nomeLead.trim() || 'não informado';
  const interesse = fields.interesse.trim() || 'não informado';
  const origem = fields.origem.trim() || 'não informada';
  return [
    `Olá, ${nomeCorretor}!`,
    '',
    'Você recebeu um novo lead pelo Zone Connection!',
    '',
    `Lead: ${nomeLead}`,
    `Interesse: ${interesse}`,
    `Origem: ${origem}`,
    '',
    'Acesse seu CRM para visualizar os detalhes e iniciar o atendimento.',
    '',
    'Zone Connection CRM.',
  ].join('\n');
}

export function instanceNameForUser(userId: string): string {
  const compact = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
  return `zc${compact}`;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Evolution entrega no Brasil com DDI 55. O cadastro costuma vir só com DDD. */
export function whatsappDestination(value: string): string {
  const digits = digitsOnly(value);
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export type ConnectionView = 'disconnected' | 'connecting' | 'connected' | 'error';

export function mapEvolutionState(state: string | null | undefined): ConnectionView {
  const normalized = (state ?? '').toLowerCase();
  if (normalized === 'open') return 'connected';
  if (normalized === 'connecting') return 'connecting';
  if (normalized === 'close' || normalized === 'closed') return 'disconnected';
  return 'error';
}

export function phoneFromJid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = digitsOnly(value.split('@')[0] ?? '');
  return digits.length >= 10 ? digits : null;
}

export type WebhookUpdate = {
  instanceName: string;
  status: ConnectionView | null;
  phoneNumber: string | null;
};

export function parseEvolutionWebhook(body: unknown): WebhookUpdate | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const instance =
    typeof record.instance === 'string'
      ? record.instance
      : typeof record.instanceName === 'string'
        ? record.instanceName
        : null;
  if (!instance) return null;
  const event = String(record.event ?? '').toLowerCase();
  const data =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : {};
  const cares =
    event.includes('connection') || event.includes('qrcode') || event === '';
  if (!cares) return null;
  const state = typeof data.state === 'string' ? data.state : null;
  const phone =
    phoneFromJid(data.wuid) ??
    phoneFromJid(data.owner) ??
    phoneFromJid(data.number);
  return {
    instanceName: instance,
    status: state ? mapEvolutionState(state) : null,
    phoneNumber: phone,
  };
}

export function readQrBase64(payload: unknown): string | null {
  return findQrString(payload, (key, value) => key.includes('base64') || value.startsWith('data:image'));
}

export function readQrCode(payload: unknown): string | null {
  return findQrString(payload, (key, value) => key === 'code' && value.startsWith('2@'));
}

function findQrString(
  payload: unknown,
  match: (key: string, value: string) => boolean,
): string | null {
  const found = walkQr(payload, 0, match);
  return found;
}

function walkQr(
  value: unknown,
  depth: number,
  match: (key: string, value: string) => boolean,
): string | null {
  if (!value || typeof value !== 'object' || depth > 4) return null;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string' && item.trim().length > 20 && match(key.toLowerCase(), item.trim())) {
      return item.trim();
    }
    const nested = walkQr(item, depth + 1, match);
    if (nested) return nested;
  }
  return null;
}

export function readConnectionState(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const instance = record.instance;
  if (instance && typeof instance === 'object') {
    const state = (instance as Record<string, unknown>).state;
    if (typeof state === 'string') return state;
  }
  if (typeof record.state === 'string') return record.state;
  return null;
}
