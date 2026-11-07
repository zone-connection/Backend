import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ALG = 'aes-256-gcm';

export function chaveWebhook(env = process.env.WEBHOOK_ENCRYPTION_KEY) {
  const bruta = env?.trim() ?? '';
  if (!bruta) {
    throw new Error('WEBHOOK_ENCRYPTION_KEY ausente.');
  }
  const chave = Buffer.from(bruta, 'base64');
  if (chave.length !== 32) {
    throw new Error('WEBHOOK_ENCRYPTION_KEY deve ser 32 bytes em base64.');
  }
  return chave;
}

export function cifrarSegredo(segredo: string, chave = chaveWebhook()) {
  const iv = randomBytes(12);
  const cifra = createCipheriv(ALG, chave, iv);
  const corpo = Buffer.concat([cifra.update(segredo, 'utf8'), cifra.final()]);
  const tag = cifra.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${corpo.toString('base64url')}`;
}

export function decifrarSegredo(pacote: string, chave = chaveWebhook()) {
  const [ivRaw, tagRaw, corpoRaw] = pacote.split('.');
  if (!ivRaw || !tagRaw || !corpoRaw) throw new Error('segredo cifrado inválido');
  const decifra = createDecipheriv(ALG, chave, Buffer.from(ivRaw, 'base64url'));
  decifra.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decifra.update(Buffer.from(corpoRaw, 'base64url')),
    decifra.final(),
  ]).toString('utf8');
}

export function gerarSegredoWebhook() {
  return randomBytes(32).toString('base64url');
}

export function assinarEntrega(segredo: string, timestamp: string, rawBody: string) {
  const hex = createHmac('sha256', segredo).update(`${timestamp}.${rawBody}`).digest('hex');
  return `sha256=${hex}`;
}

export function corpoEvento(payload: {
  id: string;
  name: string;
  occurredAt: string;
  data: { resourceId: string; resourceType: string };
}) {
  return JSON.stringify({
    id: payload.id,
    name: payload.name,
    occurredAt: payload.occurredAt,
    data: {
      resourceId: payload.data.resourceId,
      resourceType: payload.data.resourceType,
    },
  });
}
