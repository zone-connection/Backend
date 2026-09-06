import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /** Colunas opcionais de contrato em leads/users. Sem elas a API não quebra. */
  contatoContratoCols = false;

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.contatoContratoCols = await this.detectContatoContratoCols();
  }

  private async detectContatoContratoCols(): Promise<boolean> {
    try {
      const rows = await this.$queryRaw<Array<{ ok: boolean }>>`
        SELECT (
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'cpf'
          )
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'cpf'
          )
        ) AS ok
      `;
      return Boolean(rows[0]?.ok);
    } catch {
      return false;
    }
  }

  /** Evita SELECT de colunas de contrato quando a migration ainda não rodou. */
  userQueryOmit() {
    if (this.contatoContratoCols) return {};
    return {
      omit: {
        cpf: true,
        rg: true,
        endereco: true,
        cep: true,
      },
    } as const;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
