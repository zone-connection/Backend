export const PARCEIRO_JWT_KIND = 'portal_parceiro' as const;

export type PortalParceiroSession = {
  parceiroId: string;
  email: string;
  name: string;
};
