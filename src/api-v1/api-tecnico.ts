/** Usuário técnico da imobiliária. Um por Tenant, compartilhado entre aplicações. */
export const API_TECNICO_NOME = 'Integração API';

export function emailTecnico(tenantId: string): string {
  return `integracao+${tenantId}@api.zoneconnection.invalid`;
}
