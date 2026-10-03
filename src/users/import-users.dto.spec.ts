import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '@prisma/client';
import { ImportUserItemDto, ImportUsersDto } from './dto/import-users.dto';

async function validateItem(plain: Record<string, unknown>) {
  return validate(plainToInstance(ImportUserItemDto, plain));
}

describe('importação de usuários', () => {
  it('aceita nome, CRECI, e-mail, senha e acesso', async () => {
    const errors = await validateItem({
      name: 'Marina Alves',
      creci: '51209-F',
      email: 'marina@imob.com',
      password: 'Senha@123',
      role: Role.corretor,
    });
    assert.equal(errors.length, 0);
  });

  it('aceita sem CRECI', async () => {
    const errors = await validateItem({
      name: 'Pedro Henrique',
      email: 'pedro@imob.com',
      password: 'Senha@123',
      role: Role.gerente,
    });
    assert.equal(errors.length, 0);
  });

  it('recusa senha fraca', async () => {
    const errors = await validateItem({
      name: 'Sofia Ramos',
      email: 'sofia@imob.com',
      password: 'fraca',
      role: Role.corretor,
    });
    assert.ok(errors.some((item) => item.property === 'password'));
  });

  it('recusa e-mail inválido', async () => {
    const errors = await validateItem({
      name: 'Sofia Ramos',
      email: 'sofia',
      password: 'Senha@123',
      role: Role.corretor,
    });
    assert.ok(errors.some((item) => item.property === 'email'));
  });

  it('recusa acesso inválido', async () => {
    const errors = await validateItem({
      name: 'Sofia Ramos',
      email: 'sofia@imob.com',
      password: 'Senha@123',
      role: 'super_admin',
    });
    assert.ok(errors.some((item) => item.property === 'role'));
  });

  it('limita o lote a 200 usuários', async () => {
    const dto = plainToInstance(ImportUsersDto, {
      users: Array.from({ length: 201 }, (_, index) => ({
        name: `Usuário ${index + 1}`,
        email: `user${index + 1}@imob.com`,
        password: 'Senha@123',
        role: Role.corretor,
      })),
    });
    const errors = await validate(dto);
    assert.ok(errors.some((item) => item.property === 'users'));
  });
});
