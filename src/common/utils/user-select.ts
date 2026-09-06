import { Prisma } from '@prisma/client';

/** Campos públicos de usuário retornados pela API (nunca inclui senha/segredos). */
export const publicUserSelect = {
  id: true,
  tenantId: true,
  name: true,
  email: true,
  phone: true,
  whatsapp: true,
  dataNascimento: true,
  cargo: true,
  creci: true,
  cpf: true,
  rg: true,
  endereco: true,
  cep: true,
  creciStatus: true,
  cor: true,
  corAside: true,
  corPrincipal: true,
  corModulo: true,
  role: true,
  financeiroCanView: true,
  financeiroCanCreate: true,
  financeiroCanEdit: true,
  financeiroCanDelete: true,
  permissions: true,
  status: true,
  avatar: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export const publicUserSelectSafe = {
  ...publicUserSelect,
  cpf: false,
  rg: false,
  endereco: false,
  cep: false,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export function activePublicUserSelect(hasContratoCols: boolean) {
  return hasContratoCols ? publicUserSelect : publicUserSelectSafe;
}
