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
  hasUserModule,
  isSensitiveApiWrite,
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
    if (allowed) {
      return true;
    }

    const moduleOk = hasAnyUserModule(
      user.role,
      user.permissions,
      modulesForApiPath(rawPath),
    );
    // Assistente: o admin libera módulos — permite escrita nas rotas liberadas.
    if (
      moduleOk &&
      (user.role === Role.assistente ||
        !isSensitiveApiWrite(rawPath, request.method))
    ) {
      return true;
    }

    throw new ForbiddenException(
      'Você não tem permissão para acessar este recurso.',
    );
  }
}
