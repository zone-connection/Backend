export const WEBHOOK_EVENTOS = [
  'lead.created',
  'lead.updated',
  'lead.stage_changed',
  'property.available',
  'property.unavailable',
  'property.updated',
] as const;

export type WebhookEventoNome = (typeof WEBHOOK_EVENTOS)[number];

export function eventoValido(nome: string): nome is WebhookEventoNome {
  return (WEBHOOK_EVENTOS as readonly string[]).includes(nome);
}

const DISPONIVEL = 'disponivel';

export function eventoDeTransicaoStatus(
  antes: string,
  depois: string,
): 'property.available' | 'property.unavailable' | null {
  if (antes === depois) return null;
  if (depois === DISPONIVEL && antes !== DISPONIVEL) return 'property.available';
  if (antes === DISPONIVEL && depois !== DISPONIVEL) return 'property.unavailable';
  return null;
}

export const CAMPOS_PUBLICOS_LEAD = [
  'nome',
  'telefone',
  'email',
  'origem',
  'interesse',
  'categoria',
  'cidade',
  'bairro',
  'prioridade',
] as const;

export function leadPublicoMudou(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
) {
  return CAMPOS_PUBLICOS_LEAD.some((campo) => antes[campo] !== depois[campo]);
}

export const CAMPOS_PUBLICOS_IMOVEL = [
  'tipo',
  'descricao',
  'cidade',
  'estado',
  'bairro',
  'quartos',
  'suites',
  'banheiros',
  'vagas',
  'area',
  'areaConstruida',
  'fotoUrl',
] as const;

export function imovelPublicoMudou(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
) {
  return CAMPOS_PUBLICOS_IMOVEL.some((campo) => String(antes[campo] ?? '') !== String(depois[campo] ?? ''));
}

export function payloadEvento(input: {
  id: string;
  nome: WebhookEventoNome;
  occurredAt: Date;
  resourceId: string;
  resourceType: 'lead' | 'property';
}) {
  return {
    id: input.id,
    name: input.nome,
    occurredAt: input.occurredAt.toISOString(),
    data: {
      resourceId: input.resourceId,
      resourceType: input.resourceType,
    },
  };
}

export const INTERVALOS_RETENTATIVA_SEGUNDOS = [0, 60, 300, 900, 3600, 21600];

export function proximaTentativa(tentativasFeitas: number, agora: Date) {
  const indice = Math.min(tentativasFeitas, INTERVALOS_RETENTATIVA_SEGUNDOS.length - 1);
  const segundos = INTERVALOS_RETENTATIVA_SEGUNDOS[indice];
  const jitter = segundos === 0 ? 0 : Math.floor(segundos * 0.1);
  return new Date(agora.getTime() + (segundos + jitter) * 1000);
}

export function entregaEsgotada(tentativas: number) {
  return tentativas >= INTERVALOS_RETENTATIVA_SEGUNDOS.length;
}
