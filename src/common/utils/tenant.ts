import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../types/authenticated-user';

/** UUID fixo do tenant default criado na migration de multitenant. */
export const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
export const DEFAULT_TENANT_SLUG = 'new-palace';

/**
 * Tenant interno da plataforma Zone Connection (livros contábeis do super_admin).
 * Não aparece na lista de clientes/imobiliárias.
 */
export const PLATFORM_TENANT_ID = '00000000-0000-4000-8000-000000000000';
export const PLATFORM_TENANT_SLUG = 'zone-connection-platform';

export function isPlatformAdmin(user: AuthenticatedUser): boolean {
  return String(user.role) === Role.super_admin;
}

/** Admin da imobiliária ou super_admin da plataforma (leads perdidos do próprio tenant). */
export function canViewLostLeads(user: AuthenticatedUser): boolean {
  const role = String(user.role);
  return role === Role.admin || role === Role.super_admin;
}

/** Exige tenantId no JWT (usuários de imobiliária). Super admin usa o tenant da plataforma. */
export function requireTenantId(user: AuthenticatedUser): string {
  if (isPlatformAdmin(user)) {
    return PLATFORM_TENANT_ID;
  }
  if (!user.tenantId) {
    throw new ForbiddenException(
      'Esta operação requer um usuário vinculado a um tenant.',
    );
  }
  return user.tenantId;
}

/**
 * Escopo financeiro: imobiliária usa o próprio tenant;
 * super_admin opera o livro da plataforma.
 */
export function resolveFinanceiroTenantId(user: AuthenticatedUser): string {
  if (isPlatformAdmin(user)) {
    return PLATFORM_TENANT_ID;
  }
  return requireTenantId(user);
}
