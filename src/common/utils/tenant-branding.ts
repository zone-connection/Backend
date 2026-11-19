import { Prisma } from '@prisma/client';

/** Campos de branding/layout expostos ao frontend. */
export const tenantBrandingSelect = {
  id: true,
  name: true,
  slug: true,
  documento: true,
  creci: true,
  email: true,
  telefone: true,
  endereco: true,
  cidade: true,
  banco: true,
  agencia: true,
  contaBancaria: true,
  pix: true,
  representanteLegal: true,
  intermediacaoModeloUrl: true,
  intermediacaoModeloNome: true,
  intermediacaoTemplateUrl: true,
  logoUrl: true,
  primaryColor: true,
  sidebarStyle: true,
  density: true,
  homePath: true,
  modules: true,
  plano: true,
  maxUsuarios: true,
  usuariosExtras: true,
  iaBotEnabled: true,
  tarefasEnabled: true,
} satisfies Prisma.TenantSelect;

export type TenantBranding = Prisma.TenantGetPayload<{
  select: typeof tenantBrandingSelect;
}> & {
  hasOzapConnection?: boolean;
};

export const tenantOzapFlagSelect = {
  ozapConnections: {
    where: { ativo: true },
    select: { id: true },
    take: 1,
  },
} as const;

export function withOzapConnectionFlag<
  T extends { ozapConnections?: ReadonlyArray<{ id: string }> },
>(tenant: T): Omit<T, 'ozapConnections'> & { hasOzapConnection: boolean } {
  const { ozapConnections, ...rest } = tenant;
  return {
    ...rest,
    hasOzapConnection: Boolean(ozapConnections?.length),
  };
}

export const tenantAdminSelect = {
  ...tenantBrandingSelect,
  status: true,
  isTest: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TenantSelect;
