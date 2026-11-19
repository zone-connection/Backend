import { Role } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { hasUserAction, hasUserModule } from './user-permissions';

export type FinanceiroAcao = 'view' | 'create' | 'edit' | 'delete';

export function defaultFinanceiroPerms() {
  return {
    view: true,
    create: true,
    edit: true,
    delete: true,
  };
}

export function canFinanceiroAction(
  user: Pick<AuthenticatedUser, 'role' | 'financeiroPerms' | 'permissions'>,
  action: FinanceiroAcao,
): boolean {
  if (
    user.role === Role.admin ||
    user.role === Role.super_admin ||
    user.role === Role.gerente
  ) {
    return true;
  }
  if (user.role === Role.financeiro) {
    const perms = user.financeiroPerms ?? defaultFinanceiroPerms();
    return perms[action] !== false;
  }
  if (action === 'view') {
    return (
      hasUserModule(user.role, user.permissions, 'financeiro') ||
      hasUserAction(user.role, user.permissions, 'financeiro.access')
    );
  }
  if (action === 'create') {
    return (
      hasUserAction(user.role, user.permissions, 'financeiro.pagar.create') ||
      hasUserAction(user.role, user.permissions, 'financeiro.receber.create')
    );
  }
  if (action === 'edit') {
    return (
      hasUserAction(user.role, user.permissions, 'financeiro.pagar.edit') ||
      hasUserAction(user.role, user.permissions, 'financeiro.receber.edit')
    );
  }
  return (
    hasUserAction(user.role, user.permissions, 'financeiro.pagar.delete') ||
    hasUserAction(user.role, user.permissions, 'financeiro.receber.delete')
  );
}

export function assertFinanceiroAction(
  user: AuthenticatedUser,
  action: FinanceiroAcao,
) {
  if (!canFinanceiroAction(user, action)) {
    throw new ForbiddenException(
      'Você não tem permissão para esta ação no Financeiro.',
    );
  }
}
