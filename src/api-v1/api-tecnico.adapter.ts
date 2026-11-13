import { HttpException, Injectable } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { emailTecnico } from './api-tecnico';

@Injectable()
export class ApiTecnicoAdapter {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Monta o usuário que o CRM espera.
   * O papel admin existe só neste objeto. O registro no banco permanece assistente.
   */
  async contexto(tenantId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: { email: emailTecnico(tenantId) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        tenantId: true,
      },
    });
    if (!user) {
      throw erroTecnico(
        'TECHNICAL_USER_MISSING',
        'Esta imobiliária ainda não tem usuário técnico da API.',
      );
    }
    if (user.tenantId !== tenantId) {
      throw erroTecnico(
        'TECHNICAL_USER_TENANT_MISMATCH',
        'O usuário técnico não pertence a esta imobiliária.',
      );
    }
    if (user.status !== UserStatus.ativo) {
      throw erroTecnico(
        'TECHNICAL_USER_INACTIVE',
        'O usuário técnico desta imobiliária está inativo.',
      );
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: Role.admin,
      tenantId,
      permissions: { modules: {}, actions: {} },
    };
  }
}

function erroTecnico(code: string, message: string) {
  return new HttpException({ statusCode: 422, code, message }, 422);
}
