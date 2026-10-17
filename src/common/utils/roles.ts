import { Role } from '@prisma/client';

/** Perfis com o mesmo escopo operacional do corretor (própria carteira). */
export const CORRETOR_LIKE_ROLES: Role[] = [Role.corretor, Role.treinee];

export function isCorretorLike(role: Role): boolean {
  return role === Role.corretor || role === Role.treinee;
}

/** Admin e gerente enviam no inbox; demais perfis só se o admin liberar. */
export function canSendWhatsappInbox(user: {
  role: Role;
  tenantModules?: Record<string, boolean> | null;
}): boolean {
  if (
    user.role === Role.admin ||
    user.role === Role.super_admin ||
    user.role === Role.gerente
  ) {
    return true;
  }
  return user.tenantModules?.whatsappStaffCanSend === true;
}

/** Quem vê o inbox inteiro da instância, sem filtrar pela carteira. */
export function seesAllWhatsappInbox(role: Role): boolean {
  return role === Role.admin || role === Role.super_admin;
}

/** Quem pode registrar e editar o próprio relato na triagem. */
export function canWriteTriagem(role: Role): boolean {
  return (
    role === Role.corretor ||
    role === Role.treinee ||
    role === Role.gerente ||
    role === Role.admin
  );
}
