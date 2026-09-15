import { Role } from '@prisma/client';
import type { UserPermissions } from '../utils/user-permissions';

export type FinanceiroPerms = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
};

/** Payload do usuário disponível na request após autenticação JWT. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  name: string;
  /** Null apenas para super_admin (plataforma). */
  tenantId: string | null;
  financeiroPerms?: FinanceiroPerms;
  permissions?: UserPermissions | null;
  /** Módulos do tenant (plano + operações), para guards. */
  tenantModules?: Record<string, boolean> | null;
}
