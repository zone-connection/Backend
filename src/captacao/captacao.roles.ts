import { Role } from '@prisma/client';

export const CAPTACAO_ROLES = [
  Role.admin,
  Role.gerente,
  Role.corretor,
  Role.analista,
  Role.treinee,
] as const;
