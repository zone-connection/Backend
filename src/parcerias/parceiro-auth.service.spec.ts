import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ParceiroAuthService } from './parceiro-auth.service';

function jwtMock() {
  return {
    signAsync: async () => 'jwt-token',
    verifyAsync: async (token: string) => {
      if (token === 'bad') throw new Error('invalid');
      return {
        sub: 'parceiro-1',
        email: 'parceiro@ex.com',
        name: 'Ana',
        kind: 'portal_parceiro',
      };
    },
  };
}

function configMock() {
  return {
    get: (_key: string, fallback?: string) => fallback,
    getOrThrow: (key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'access';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh';
      throw new Error(key);
    },
  };
}

describe('portal parceiro — autenticação', () => {
  it('login válido', async () => {
    const password = await bcrypt.hash('Senha123', 4);
    const prisma = {
      corretorParceiro: {
        findFirst: async () => ({
          id: 'parceiro-1',
          email: 'parceiro@ex.com',
          nome: 'Ana',
          password,
          ativo: true,
        }),
        update: async () => ({}),
      },
    };
    const service = new ParceiroAuthService(
      prisma as never,
      jwtMock() as never,
      configMock() as never,
    );
    const result = await service.login('parceiro@ex.com', 'Senha123');
    assert.equal(result.parceiro.id, 'parceiro-1');
    assert.equal(result.accessToken, 'jwt-token');
  });

  it('login inválido', async () => {
    const prisma = {
      corretorParceiro: { findFirst: async () => null },
    };
    const service = new ParceiroAuthService(
      prisma as never,
      jwtMock() as never,
      configMock() as never,
    );
    await assert.rejects(
      () => service.login('x@ex.com', 'errada'),
      UnauthorizedException,
    );
  });

  it('recusa refresh de outro portal', async () => {
    const prisma = { corretorParceiro: { findFirst: async () => null } };
    const jwt = {
      signAsync: async () => 'jwt-token',
      verifyAsync: async () => ({
        sub: 'p1',
        kind: 'portal_proprietario',
      }),
    };
    const service = new ParceiroAuthService(
      prisma as never,
      jwt as never,
      configMock() as never,
    );
    await assert.rejects(() => service.refresh('token'), UnauthorizedException);
  });
});
