import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ProprietarioPortalStatus, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PortalProprietarioAuthService } from './portal-proprietario-auth.service';

function jwtMock() {
  return {
    signAsync: async () => 'jwt-token',
    verifyAsync: async (token: string) => {
      if (token === 'bad') throw new Error('invalid');
      return {
        sub: 'a1',
        proprietarioId: 'p1',
        tenantId: 't1',
        email: 'joao@ex.com',
        name: 'João',
        kind: 'portal_proprietario',
      };
    },
  };
}

function configMock(env = 'test') {
  return {
    get: (key: string, fallback?: string) => {
      if (key === 'NODE_ENV') return env;
      return fallback;
    },
    getOrThrow: (key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'access';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh';
      throw new Error(key);
    },
  };
}

describe('portal proprietário — autenticação', () => {
  it('login válido', async () => {
    const password = await bcrypt.hash('Senha123', 4);
    const prisma = {
      proprietario: {
        findMany: async () => [
          {
            id: 'p1',
            tenantId: 't1',
            nome: 'João',
            email: 'joao@ex.com',
            tenant: { id: 't1', status: UserStatus.ativo, slug: 'np' },
            portalAcesso: {
              id: 'a1',
              password,
              status: ProprietarioPortalStatus.ativo,
            },
          },
        ],
      },
      proprietarioPortalAcesso: {
        update: async () => ({}),
      },
    };
    const service = new PortalProprietarioAuthService(
      prisma as never,
      jwtMock() as never,
      configMock() as never,
    );
    const result = await service.login('joao@ex.com', 'Senha123');
    assert.equal(result.proprietario.id, 'p1');
    assert.equal(result.accessToken, 'jwt-token');
  });

  it('login inválido', async () => {
    const prisma = {
      proprietario: { findMany: async () => [] },
    };
    const service = new PortalProprietarioAuthService(
      prisma as never,
      jwtMock() as never,
      configMock() as never,
    );
    await assert.rejects(
      () => service.login('x@ex.com', 'errada'),
      UnauthorizedException,
    );
  });

  it('proprietário desativado', async () => {
    const password = await bcrypt.hash('Senha123', 4);
    const prisma = {
      proprietario: {
        findMany: async () => [
          {
            id: 'p1',
            tenantId: 't1',
            nome: 'João',
            email: 'joao@ex.com',
            tenant: { id: 't1', status: UserStatus.ativo, slug: 'np' },
            portalAcesso: {
              id: 'a1',
              password,
              status: ProprietarioPortalStatus.inativo,
            },
          },
        ],
      },
    };
    const service = new PortalProprietarioAuthService(
      prisma as never,
      jwtMock() as never,
      configMock() as never,
    );
    await assert.rejects(
      () => service.login('joao@ex.com', 'Senha123'),
      ForbiddenException,
    );
  });

  it('token inválido no refresh', async () => {
    const service = new PortalProprietarioAuthService(
      {} as never,
      jwtMock() as never,
      configMock() as never,
    );
    await assert.rejects(() => service.refresh('bad'), UnauthorizedException);
  });

  it('ativação exige e-mail', async () => {
    const prisma = {
      proprietario: {
        findFirst: async () => ({
          id: 'p1',
          email: '',
          portalAcesso: null,
        }),
      },
    };
    const service = new PortalProprietarioAuthService(
      prisma as never,
      jwtMock() as never,
      configMock() as never,
    );
    await assert.rejects(
      () => service.setAcesso('p1', 't1', { ativo: true }),
      BadRequestException,
    );
  });

  it('gera senha temporária sob demanda', async () => {
    const prisma = {
      proprietario: {
        findFirst: async () => ({
          id: 'p1',
          email: 'joao@ex.com',
          portalAcesso: {
            id: 'a1',
            password: 'hash',
            lastLoginAt: null,
          },
        }),
      },
      proprietarioPortalAcesso: {
        upsert: async () => ({ lastLoginAt: null }),
      },
    };
    const service = new PortalProprietarioAuthService(
      prisma as never,
      jwtMock() as never,
      configMock() as never,
    );
    const result = await service.setAcesso('p1', 't1', {
      ativo: true,
      gerarSenhaTemporaria: true,
    });
    assert.equal(result.ativo, true);
    assert.match(result.senhaTemporaria ?? '', /^Portal1a[0-9a-f]{6}$/);
  });
});
