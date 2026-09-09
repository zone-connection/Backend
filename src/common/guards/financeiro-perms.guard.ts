import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthenticatedUser } from '../types/authenticated-user';
import {
  canFinanceiroAction,
  type FinanceiroAcao,
} from '../utils/financeiro-perms';
import { isCorretorLike } from '../utils/roles';
import { hasUserAction, hasUserModule } from '../utils/user-permissions';

/** Restringe create/edit/delete do Financeiro conforme cargo e permissões. */
@Injectable()
export class FinanceiroPermsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) return true;

    const action = actionFromRequest(request);
    const path = collectRequestPath(request);
    const isComissao = path.includes('comissao');

    // Corretor/treinee: @Roles já limita quais rotas eles alcançam.
    // Aqui só liberamos a LEITURA da própria fatia de comissão.
    const role = String(user.role);
    if (
      (role === Role.corretor ||
        role === Role.treinee ||
        isCorretorLike(user.role)) &&
      action === 'view' &&
      isComissao
    ) {
      return true;
    }

    if (user.role === Role.financeiro) {
      if (!canFinanceiroAction(user, action)) {
        throw new ForbiddenException(
          'Você não tem permissão para esta ação no Financeiro.',
        );
      }
      return true;
    }

    if (canFinanceiroAction(user, action)) {
      return true;
    }

    if (
      isComissao &&
      action === 'view' &&
      (hasUserModule(user.role, user.permissions, 'comissao') ||
        hasUserAction(user.role, user.permissions, 'financeiro.comissao'))
    ) {
      return true;
    }

    throw new ForbiddenException(
      'Você não tem permissão para esta ação no Financeiro.',
    );
  }
}

function collectRequestPath(request: Request): string {
  const parts = [
    request.originalUrl,
    request.url,
    request.baseUrl,
    request.path,
    `${request.baseUrl ?? ''}${request.path ?? ''}`,
  ];
  return parts
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase()
    .split('?')[0];
}

function actionFromRequest(request: Request): FinanceiroAcao {
  const method = request.method.toUpperCase();
  const path = `${request.baseUrl ?? ''}${request.path ?? ''}`;
  if (method === 'GET' || method === 'HEAD') return 'view';
  if (method === 'DELETE') return 'delete';
  if (method === 'PATCH' || method === 'PUT') return 'edit';
  if (method === 'POST' && path.includes('/baixar')) return 'edit';
  if (method === 'POST') return 'create';
  return 'view';
}
