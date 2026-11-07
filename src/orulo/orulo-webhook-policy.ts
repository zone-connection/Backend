/**
 * A Órulo não assina o webhook. O contrato oficial é:
 * - `active` e `removed` chegam sem client_id e valem para o catálogo;
 * - `added_to_distribution` e `excluded_from_distribution` trazem client_id
 *   e valem só para aquela integração.
 * Evento de distribuição sem client_id é ignorado: espalhar para todas as
 * imobiliárias era o que permitia apagar o catálogo sem login. A
 * reconciliação diária cobre o que o webhook não aplicar.
 */

const CATALOG_STATUSES = new Set(['active', 'removed']);
const DISTRIBUTION_STATUSES = new Set([
  'added_to_distribution',
  'excluded_from_distribution',
]);

export type OruloWebhookRoute = 'catalog' | 'distribution' | 'ignore';

export function routeOruloWebhook(input: {
  status: string;
  clientId?: string;
}): OruloWebhookRoute {
  if (CATALOG_STATUSES.has(input.status)) return 'catalog';
  if (DISTRIBUTION_STATUSES.has(input.status)) {
    return input.clientId ? 'distribution' : 'ignore';
  }
  return 'ignore';
}

export function isOruloRemoval(status: string): boolean {
  return status === 'removed' || status === 'excluded_from_distribution';
}
