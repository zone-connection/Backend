import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { ApiAccessGuard } from './api-access.guard';
import { ApiAppsService } from './api-apps.service';
import { ApiLeadsService } from './api-leads.service';
import { ApiOauthService } from './api-oauth.service';
import { ApiTecnicoAdapter } from './api-tecnico.adapter';
import { emailTecnico } from './api-tecnico';
import { CriarLeadApiDto } from './dto/criar-lead-api.dto';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';

type UserRow = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  status: UserStatus;
  permissions: unknown;
};

type GrantRow = {
  id: string;
  aplicacaoId: string;
  tenantId: string;
  scopes: string[];
  status: string;
  revokedAt: Date | null;
};

function banco() {
  const users: UserRow[] = [];
  const grants: GrantRow[] = [];
  let seq = 0;
  const client = {
    user: {
      findFirst: async ({ where }: { where: { email?: string; tenantId?: string } }) =>
        users.find(
          (user) =>
            (where.email === undefined || user.email === where.email) &&
            (where.tenantId === undefined || user.tenantId === where.tenantId),
        ) ?? null,
      create: async ({ data }: { data: Omit<UserRow, 'id'> }) => {
        if (users.some((user) => user.tenantId === data.tenantId && user.email === data.email)) {
          throw new Prisma.PrismaClientKnownRequestError('chave única', {
            code: 'P2002',
            clientVersion: '6.2.0',
            meta: { target: ['tenantId', 'email'] },
          });
        }
        const row: UserRow = { ...data, id: `user-${++seq}` };
        users.push(row);
        return { id: row.id };
      },
    },
    apiAutorizacao: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { aplicacaoId_tenantId: { aplicacaoId: string; tenantId: string } };
        create: Omit<GrantRow, 'id' | 'revokedAt'>;
        update: { scopes: string[]; status: string; revokedAt: null };
      }) => {
        const chave = where.aplicacaoId_tenantId;
        const atual = grants.find(
          (grant) =>
            grant.aplicacaoId === chave.aplicacaoId && grant.tenantId === chave.tenantId,
        );
        if (atual) {
          atual.scopes = update.scopes;
          atual.status = update.status;
          atual.revokedAt = update.revokedAt;
          return {
            id: atual.id,
            tenantId: atual.tenantId,
            scopes: atual.scopes,
            status: atual.status,
          };
        }
        const row: GrantRow = {
          id: `grant-${++seq}`,
          ...create,
          revokedAt: null,
        };
        grants.push(row);
        return { id: row.id, tenantId: row.tenantId, scopes: row.scopes, status: row.status };
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        grants.find((grant) => grant.id === where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: string; revokedAt: Date };
      }) => {
        const grant = grants.find((item) => item.id === where.id);
        if (!grant) return null;
        grant.status = data.status;
        grant.revokedAt = data.revokedAt;
        return grant;
      },
    },
    tenant: {
      findUnique: async () => ({ id: TENANT }),
    },
    apiAplicacao: {
      findUnique: async () => ({ id: 'app' }),
      create: async ({
        data,
      }: {
        data: {
          nome: string;
          clientId: string;
          autorizacoes: { create: { tenantId: string; scopes: string[]; status: string } };
        };
      }) => {
        const id = `app-${++seq}`;
        grants.push({
          id: `grant-${++seq}`,
          aplicacaoId: id,
          tenantId: data.autorizacoes.create.tenantId,
          scopes: data.autorizacoes.create.scopes,
          status: data.autorizacoes.create.status,
          revokedAt: null,
        });
        return {
          id,
          nome: data.nome,
          clientId: data.clientId,
          status: 'ativa',
        };
      },
    },
  };
  return {
    users,
    grants,
    prisma: {
      ...client,
      $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client),
    },
  };
}

function apps(prisma: object) {
  return new ApiAppsService(prisma as never);
}

describe('usuário técnico na autorização', () => {
  it('cria o usuário na primeira autorização e não devolve a senha', async () => {
    const db = banco();
    const grant = await apps(db.prisma).conceder({
      aplicacaoId: 'app-1',
      tenantId: TENANT,
      scopes: ['leads:write'],
    });
    assert.equal(db.users.length, 1);
    assert.equal(db.users[0].name, 'Integração API');
    assert.equal(db.users[0].email, emailTecnico(TENANT));
    assert.equal(db.users[0].role, Role.assistente);
    assert.deepEqual(db.users[0].permissions, {});
    assert.equal(db.users[0].password.startsWith('$2'), true);
    assert.equal(db.users[0].password.includes('Integração'), false);
    assert.equal('password' in grant, false);
    assert.equal('clientSecret' in grant, false);
  });

  it('reutiliza o usuário entre aplicações do mesmo tenant', async () => {
    const db = banco();
    const service = apps(db.prisma);
    await service.conceder({
      aplicacaoId: 'app-1',
      tenantId: TENANT,
      scopes: ['leads:write'],
    });
    await service.conceder({
      aplicacaoId: 'app-2',
      tenantId: TENANT,
      scopes: ['leads:read'],
    });
    assert.equal(db.users.length, 1);
    assert.equal(db.grants.length, 2);
  });

  it('cria usuário distinto para outro tenant', async () => {
    const db = banco();
    db.prisma.tenant.findUnique = async () => ({ id: 'qualquer' });
    const service = apps(db.prisma);
    await service.conceder({
      aplicacaoId: 'app-1',
      tenantId: TENANT,
      scopes: ['leads:write'],
    });
    await service.conceder({
      aplicacaoId: 'app-1',
      tenantId: OUTRO,
      scopes: ['leads:write'],
    });
    assert.equal(db.users.length, 2);
    assert.notEqual(db.users[0].email, db.users[1].email);
  });

  it('revogação não exclui nem inativa o usuário', async () => {
    const db = banco();
    const service = apps(db.prisma);
    const grant = await service.conceder({
      aplicacaoId: 'app-1',
      tenantId: TENANT,
      scopes: ['leads:write'],
    });
    await service.revogarAutorizacao(grant.id);
    assert.equal(db.users.length, 1);
    assert.equal(db.users[0].status, UserStatus.ativo);
    assert.equal(db.users[0].role, Role.assistente);
    assert.equal(db.grants[0].status, 'revogada');
  });

  it('duas autorizações simultâneas não duplicam o usuário', async () => {
    const db = banco();
    let entraram = 0;
    let liberar: () => void = () => undefined;
    const ambos = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const find = db.prisma.user.findFirst;
    db.prisma.user.findFirst = async (args) => {
      entraram += 1;
      if (entraram === 1) await ambos;
      if (entraram === 2) liberar();
      return find(args);
    };
    const service = apps(db.prisma);
    await Promise.all([
      service.conceder({
        aplicacaoId: 'app-1',
        tenantId: TENANT,
        scopes: ['leads:write'],
      }),
      service.conceder({
        aplicacaoId: 'app-2',
        tenantId: TENANT,
        scopes: ['leads:read'],
      }),
    ]);
    assert.equal(db.users.length, 1);
    assert.equal(db.grants.length, 2);
  });

  it('não esconde erro de banco que não seja unicidade de e-mail', async () => {
    const db = banco();
    db.prisma.user.create = async () => {
      throw new Prisma.PrismaClientKnownRequestError('falha', {
        code: 'P2003',
        clientVersion: '6.2.0',
      });
    };
    await assert.rejects(
      () =>
        apps(db.prisma).conceder({
          aplicacaoId: 'app-1',
          tenantId: TENANT,
          scopes: ['leads:write'],
        }),
      (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003',
    );
    assert.equal(db.users.length, 0);
    assert.equal(db.grants.length, 0);
  });
});

describe('criação da aplicação com autorização inicial', () => {
  it('cria o usuário técnico e não existe cadastro sem autorização', async () => {
    const db = banco();
    const created = await apps(db.prisma).criar({
      nome: 'Discador',
      tenantId: TENANT,
      scopes: ['leads:write'],
    });
    assert.match(created.clientId, /^zc_/);
    assert.equal('password' in created, false);
    assert.equal(db.users.length, 1);
    assert.equal(db.users[0].role, Role.assistente);
    assert.deepEqual(db.users[0].permissions, {});
    assert.equal(db.grants.length, 1);
    assert.equal(db.grants[0].tenantId, TENANT);
  });

  it('segunda aplicação do mesmo tenant reutiliza o usuário', async () => {
    const db = banco();
    const service = apps(db.prisma);
    await service.criar({ nome: 'Um', tenantId: TENANT, scopes: ['leads:write'] });
    await service.criar({ nome: 'Dois', tenantId: TENANT, scopes: ['leads:read'] });
    assert.equal(db.users.length, 1);
    assert.equal(db.grants.length, 2);
  });

  it('outro tenant recebe outro usuário técnico', async () => {
    const db = banco();
    const service = apps(db.prisma);
    await service.criar({ nome: 'Um', tenantId: TENANT, scopes: ['leads:write'] });
    await service.criar({ nome: 'Dois', tenantId: OUTRO, scopes: ['leads:write'] });
    assert.equal(db.users.length, 2);
    assert.notEqual(db.users[0].email, db.users[1].email);
  });

  it('autorização posterior reutiliza o usuário criado no cadastro', async () => {
    const db = banco();
    const service = apps(db.prisma);
    const created = await service.criar({
      nome: 'Discador',
      tenantId: TENANT,
      scopes: ['leads:read'],
    });
    await service.conceder({
      aplicacaoId: created.id,
      tenantId: TENANT,
      scopes: ['leads:write'],
    });
    assert.equal(db.users.length, 1);
    assert.equal(db.users[0].role, Role.assistente);
    assert.equal(db.grants.length, 1);
    assert.deepEqual(db.grants[0].scopes, ['leads:write']);
  });

  it('duas criações simultâneas não duplicam o usuário', async () => {
    const db = banco();
    let entraram = 0;
    let liberar: () => void = () => undefined;
    const ambos = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const find = db.prisma.user.findFirst;
    db.prisma.user.findFirst = async (args) => {
      entraram += 1;
      if (entraram === 1) await ambos;
      if (entraram === 2) liberar();
      return find(args);
    };
    const service = apps(db.prisma);
    await Promise.all([
      service.criar({ nome: 'Um', tenantId: TENANT, scopes: ['leads:write'] }),
      service.criar({ nome: 'Dois', tenantId: TENANT, scopes: ['leads:read'] }),
    ]);
    assert.equal(db.users.length, 1);
    assert.equal(db.grants.length, 2);
    assert.equal(db.users[0].role, Role.assistente);
    assert.deepEqual(db.users[0].permissions, {});
  });
});

describe('adaptador do usuário técnico', () => {
  function prismaUsuario(user: UserRow | null) {
    return {
      user: {
        findFirst: async () => user,
      },
    };
  }

  const ativo: UserRow = {
    id: 'tecnico-1',
    tenantId: TENANT,
    name: 'Integração API',
    email: emailTecnico(TENANT),
    password: '$2b$hash',
    role: Role.assistente,
    status: UserStatus.ativo,
    permissions: {},
  };

  it('aceita usuário ativo do tenant e usa admin só em memória', async () => {
    const adapter = new ApiTecnicoAdapter(prismaUsuario(ativo) as never);
    const ctx = await adapter.contexto(TENANT);
    assert.equal(ctx.id, 'tecnico-1');
    assert.equal(ctx.role, Role.admin);
    assert.equal(ctx.tenantId, TENANT);
    assert.equal(ativo.role, Role.assistente);
  });

  it('recusa usuário inexistente, inativo ou de outro tenant', async () => {
    await assert.rejects(
      () => new ApiTecnicoAdapter(prismaUsuario(null) as never).contexto(TENANT),
      (err: unknown) => codigo(err) === 'TECHNICAL_USER_MISSING',
    );
    await assert.rejects(
      () =>
        new ApiTecnicoAdapter(
          prismaUsuario({ ...ativo, status: UserStatus.inativo }) as never,
        ).contexto(TENANT),
      (err: unknown) => codigo(err) === 'TECHNICAL_USER_INACTIVE',
    );
    await assert.rejects(
      () =>
        new ApiTecnicoAdapter(
          prismaUsuario({ ...ativo, tenantId: OUTRO }) as never,
        ).contexto(TENANT),
      (err: unknown) => codigo(err) === 'TECHNICAL_USER_TENANT_MISMATCH',
    );
  });
});

describe('POST /api/v1/leads', () => {
  const tecnico: UserRow = {
    id: 'tecnico-1',
    tenantId: TENANT,
    name: 'Integração API',
    email: emailTecnico(TENANT),
    password: '$2b$hash',
    role: Role.assistente,
    status: UserStatus.ativo,
    permissions: {},
  };

  function servico(opts: {
    etapas?: string[];
    funil?: boolean;
    fila?: { chamadas: number };
    leads?: Array<{ telefone: string }>;
  }) {
    const chamadasFila = opts.fila ?? { chamadas: 0 };
    const criados = opts.leads ?? [];
    const leads = {
      create: async (dto: { telefone: string; stage?: string }, actor: { id: string; role: Role; tenantId: string }) => {
        assert.equal(actor.id, tecnico.id);
        assert.equal(actor.role, Role.admin);
        assert.equal(actor.tenantId, TENANT);
        assert.equal('corretorId' in dto, false);
        chamadasFila.chamadas += 1;
        const row = {
          id: `lead-${criados.length + 1}`,
          nome: 'João da Silva',
          telefone: dto.telefone,
          email: 'joao@email.com',
          origem: 'Site',
          interesse: 'Comprar',
          cidade: 'Recife',
          bairro: 'Boa Viagem',
          stage: dto.stage ?? 'novo',
          funilId: 'funil-1',
          prioridade: 'Média',
          corretorId: 'corretor-1',
          corretor: {
            name: 'Ana',
            cpf: '000',
            rg: '111',
            email: 'ana@crm.local',
          },
          cpf: '123',
          rg: '456',
          endereco: 'Rua interna',
          prospeccao: { origem: 'fila' },
          createdAt: new Date('2026-11-07T12:00:00.000Z'),
          updatedAt: new Date('2026-11-07T12:00:00.000Z'),
          stageEnteredAt: new Date('2026-11-07T12:00:00.000Z'),
          prazoDueAt: new Date('2026-11-08T12:00:00.000Z'),
        };
        criados.push({ telefone: dto.telefone });
        return row;
      },
    };
    const prisma = {
      user: { findFirst: async () => tecnico },
      funil: {
        findFirst: async () =>
          opts.funil === false
            ? null
            : {
                id: 'funil-1',
                etapas: (opts.etapas ?? ['novo']).map((slug) => ({ slug })),
              },
      },
    };
    return {
      service: new ApiLeadsService(prisma as never, leads as never, new ApiTecnicoAdapter(prisma as never)),
      criados,
      chamadasFila,
    };
  }

  const valido = {
    nome: 'João da Silva',
    telefone: '(81) 99999-9999',
    email: 'joao@email.com',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Boa Viagem',
    origem: 'Site',
    prioridade: 'Média',
  };

  it('cria o lead no tenant do token e esconde dados internos', async () => {
    const { service, chamadasFila } = servico({ fila: { chamadas: 0 } });
    const resposta = await service.criar(TENANT, valido);
    assert.equal(resposta.id, 'lead-1');
    assert.equal(resposta.corretorNome, 'Ana');
    assert.equal(resposta.funilId, 'funil-1');
    assert.equal(chamadasFila.chamadas, 1);
    assert.equal('cpf' in resposta, false);
    assert.equal('rg' in resposta, false);
    assert.equal('endereco' in resposta, false);
    assert.equal('prospeccao' in resposta, false);
    assert.equal('prazoDueAt' in resposta, false);
    assert.equal(JSON.stringify(resposta).includes('123'), false);
  });

  it('telefone repetido gera outro lead', async () => {
    const { service, criados } = servico({});
    await service.criar(TENANT, valido);
    await service.criar(TENANT, valido);
    assert.equal(criados.length, 2);
  });

  it('recusa etapa inexistente e funil sem etapas', async () => {
    await assert.rejects(
      () => servico({ etapas: ['novo'] }).service.criar(TENANT, { ...valido, stage: 'ganho' }),
      BadRequestException,
    );
    await assert.rejects(
      () => servico({ etapas: [] }).service.criar(TENANT, valido),
      (err: unknown) => codigo(err) === 'COMMERCIAL_FUNNEL_WITHOUT_STAGES' && status(err) === 422,
    );
    await assert.rejects(
      () => servico({ funil: false }).service.criar(TENANT, valido),
      (err: unknown) => codigo(err) === 'COMMERCIAL_FUNNEL_NOT_FOUND',
    );
  });

  it('o corpo externo não define tenant, autor ou papel', async () => {
    const dto = plainToInstance(CriarLeadApiDto, {
      ...valido,
      tenantId: OUTRO,
      actorId: 'admin-humano',
      role: 'super_admin',
      permissoes: { leads: true },
    });
    const erros = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    assert.equal(erros.length > 0, true);
    assert.equal(erros.some((erro) => erro.property === 'tenantId'), true);
  });

  it('recusa telefone e interesse inválidos', async () => {
    const telefone = plainToInstance(CriarLeadApiDto, { ...valido, telefone: '81999999999' });
    const interesse = plainToInstance(CriarLeadApiDto, { ...valido, interesse: 'Alugar' });
    assert.equal((await validate(telefone)).length > 0, true);
    assert.equal((await validate(interesse)).length > 0, true);
  });

  it('scope ausente responde 403', async () => {
    const guard = new ApiAccessGuard(
      {
        authenticate: async () => ({
          sub: 'zc_abc',
          appId: 'app',
          tenantId: TENANT,
          scopes: ['leads:read'],
          jti: 'j',
        }),
      } as never,
      { getAllAndOverride: () => ['leads:write'] } as never,
    );
    await assert.rejects(
      () =>
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({ header: () => 'Bearer token' }),
          }),
          getHandler: () => null,
          getClass: () => null,
        } as never),
      ForbiddenException,
    );
  });
});

describe('OAuth não cria usuário técnico', () => {
  it('emissão de token não grava usuário', async () => {
    let usuarios = 0;
    const service = new ApiOauthService(
      {
        apiAplicacao: {
          findUnique: async () => null,
        },
        user: {
          create: async () => {
            usuarios += 1;
            return { id: 'nao' };
          },
        },
      } as never,
      { get: () => 'x'.repeat(40) } as never,
      { assertLivre: async () => undefined, registrarFalha: async () => undefined, zerar: async () => undefined } as never,
    );
    await assert.rejects(() =>
      service.issue(
        {
          grant_type: 'client_credentials',
          client_id: 'zc_cliente',
          client_secret: 'segredo-que-nao-existe',
          tenant_slug: 'new-palace',
        },
        '127.0.0.1',
      ),
    );
    assert.equal(usuarios, 0);
  });
});

function codigo(err: unknown): string | undefined {
  if (!(err instanceof HttpException)) return undefined;
  const body = err.getResponse();
  if (body && typeof body === 'object' && 'code' in body) {
    return String((body as { code: unknown }).code);
  }
  return undefined;
}

function status(err: unknown): number | undefined {
  return err instanceof HttpException ? err.getStatus() : undefined;
}
