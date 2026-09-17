export const PORTAL_JWT_KIND = 'portal_proprietario' as const;

export type PortalProprietarioSession = {
  acessoId: string;
  proprietarioId: string;
  tenantId: string;
  email: string;
  name: string;
};

export type PortalJwtPayload = {
  sub: string;
  proprietarioId: string;
  tenantId: string;
  email: string;
  name: string;
  kind: typeof PORTAL_JWT_KIND;
};
