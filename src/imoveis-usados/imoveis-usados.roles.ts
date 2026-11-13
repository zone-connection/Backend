import { Role } from '@prisma/client';

export const IMOVEIS_USADOS_ROLES = [
  Role.admin,
  Role.gerente,
  Role.corretor,
  Role.analista,
  Role.treinee,
] as const;

/** Quem confirma ou recusa o encaminhamento ao funil de pós-venda. */
export const POS_VENDA_ENCAMINHAR_ROLES = [Role.admin, Role.gerente] as const;

export function canEncaminharPosVenda(role: Role): boolean {
  return role === Role.admin || role === Role.gerente;
}
