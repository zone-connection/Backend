import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const FALHAS_PARA_BLOQUEIO = 5;
const BASE_SEGUNDOS = 15;
const MAX_DOBRA = 6;

/** Mesma chave para `ZC_Ab` e `zc_ab`. */
export function normalizarClientId(clientId: string): string {
  return clientId.trim().toLowerCase().replace(/\s+/g, '');
}

/** 5 falhas = 15s, 6 = 30s, até o teto de 15 * 2^6 segundos. */
export function segundosDeBloqueio(falhas: number): number {
  if (falhas < FALHAS_PARA_BLOQUEIO) return 0;
  const dobras = Math.min(falhas - FALHAS_PARA_BLOQUEIO, MAX_DOBRA);
  return BASE_SEGUNDOS * 2 ** dobras;
}

@Injectable()
export class ApiOauthLimiteService {
  constructor(private readonly prisma: PrismaService) {}

  async assertLivre(ip: string, clientId: string, now = new Date()): Promise<void> {
    const chaves = this.chaves(ip, clientId);
    const rows = await this.prisma.apiOauthTentativa.findMany({
      where: { chave: { in: chaves } },
      select: { bloqueadoAte: true },
    });
    const bloqueado = rows
      .map((row) => row.bloqueadoAte)
      .filter((ate): ate is Date => ate instanceof Date && ate.getTime() > now.getTime())
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (!bloqueado) return;
    const retry = Math.max(1, Math.ceil((bloqueado.getTime() - now.getTime()) / 1000));
    throw new HttpException(
      {
        error: 'rate_limited',
        error_description: 'Muitas tentativas. Tente de novo mais tarde.',
        retry_after: retry,
      },
      429,
    );
  }

  async registrarFalha(ip: string, clientId: string, now = new Date()): Promise<void> {
    for (const chave of this.chaves(ip, clientId)) {
      await this.prisma.$queryRaw`
        INSERT INTO "api_oauth_tentativas" ("chave", "falhas", "bloqueadoAte", "updatedAt")
        VALUES (
          ${chave},
          1,
          NULL,
          ${now}
        )
        ON CONFLICT ("chave") DO UPDATE SET
          "falhas" = "api_oauth_tentativas"."falhas" + 1,
          "updatedAt" = ${now},
          "bloqueadoAte" = CASE
            WHEN "api_oauth_tentativas"."falhas" + 1 >= ${FALHAS_PARA_BLOQUEIO}
            THEN ${now} + (
              (${BASE_SEGUNDOS} * POWER(
                2,
                LEAST("api_oauth_tentativas"."falhas" + 1 - ${FALHAS_PARA_BLOQUEIO}, ${MAX_DOBRA})
              )) * INTERVAL '1 second'
            )
            ELSE "api_oauth_tentativas"."bloqueadoAte"
          END
      `;
    }
  }

  async zerar(ip: string, clientId: string): Promise<void> {
    await this.prisma.apiOauthTentativa.deleteMany({
      where: { chave: { in: this.chaves(ip, clientId) } },
    });
  }

  private chaves(ip: string, clientId: string): string[] {
    const chaves = [`ip:${ip.trim() || 'desconhecido'}`];
    const client = normalizarClientId(clientId);
    if (client) chaves.push(`client:${client}`);
    return chaves;
  }
}

export type TentativaRow = { falhas: number; bloqueadoAte: Date | null };

/** Espelho em memória da mesma regra, para os testes do bloqueio progressivo. */
export function aplicarFalha(atual: TentativaRow | null, now: Date): TentativaRow {
  const falhas = (atual?.falhas ?? 0) + 1;
  const segundos = segundosDeBloqueio(falhas);
  return {
    falhas,
    bloqueadoAte:
      segundos > 0 ? new Date(now.getTime() + segundos * 1000) : atual?.bloqueadoAte ?? null,
  };
}
