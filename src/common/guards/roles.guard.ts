import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';
import {
  hasAnyUserModule,
  hasModuleVerb,
  hasUserModule,
  httpPermissionVerb,
  modulesForApiPath,
} from '../utils/user-permissions';
import { operationModuleForApiPath, isTenantOperationEnabled } from '../../tenants/tenant-operation.util';

/** Autoriza a rota para os perfis de @Roles() ou para quem recebeu o módulo. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException(
        'Sessão inválida para esta operação. Faça login novamente.',
      );
    }

    const rawPath = `${request.originalUrl ?? request.url ?? ''}`.split('?')[0];
    if (
      user.tenantId &&
      user.role !== Role.super_admin &&
      /\/mural-chaves(?:\/|$)/.test(rawPath) &&
      user.tenantModules?.muralChaves !== true
    ) {
      throw new ForbiddenException(
        'O Mural de Chaves não está ativo nesta imobiliária.',
      );
    }

    const operation = operationModuleForApiPath(rawPath);
    if (operation && user.tenantId) {
      if (!isTenantOperationEnabled(user.tenantModules, operation)) {
        throw new ForbiddenException(
          'Esta operação não está ativa nesta imobiliária.',
        );
      }
      if (
        user.role !== Role.admin &&
        user.role !== Role.super_admin &&
        !hasUserModule(user.role, user.permissions, operation)
      ) {
        throw new ForbiddenException(
          'Você não tem permissão para acessar este recurso.',
        );
      }
    }

    const userRole = String(user.role);
    const allowed = requiredRoles.some((role) => String(role) === userRole);
    const modules = modulesForApiPath(rawPath, request.method);
    const moduleOk = hasAnyUserModule(user.role, user.permissions, modules);
    if (!allowed && !moduleOk) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este recurso.',
      );
    }

    const verb = httpPermissionVerb(request.method);
    if (verb && modules.length > 0) {
      const explicitDeny = modules.every(
        (moduleKey) =>
          user.permissions?.actions?.[`${moduleKey}.${verb}`] === false,
      );
      if (explicitDeny) {
        throw new ForbiddenException(
          'Você não tem permissão para esta ação.',
        );
      }
      if (!allowed) {
        const actionOk = modules.some((moduleKey) =>
          hasModuleVerb(user.role, user.permissions, moduleKey, verb),
        );
        if (!actionOk) {
          throw new ForbiddenException(
            'Você não tem permissão para esta ação.',
          );
        }
      }
    }

    return true;
  }
}
