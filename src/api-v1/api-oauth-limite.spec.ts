import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import { ApiOauthLimiteService, aplicarFalha, normalizarClientId, segundosDeBloqueio } from './api-oauth-limite.service';

describe('limite do OAuth', () => {
  it('normaliza o client id para a mesma chave', () => {
    assert.equal(normalizarClientId('  ZC_AbC  '), normalizarClientId('zc_abc'));
  });

  it('bloqueia a partir da quinta falha e dobra o intervalo', () => {
    assert.equal(segundosDeBloqueio(4), 0);
    assert.equal(segundosDeBloqueio(5), 15);
    assert.equal(segundosDeBloqueio(6), 30);
    assert.equal(segundosDeBloqueio(20), 15 * 64);
    const now = new Date('2026-11-06T12:00:00Z');
    let row = aplicarFalha(null, now);
    for (let i = 0; i < 4; i += 1) row = aplicarFalha(row, now);
    assert.equal(row.falhas, 5);
    assert.equal(row.bloqueadoAte?.toISOString(), '2026-11-06T12:00:15.000Z');
    row = aplicarFalha(row, now);
    assert.equal(row.bloqueadoAte?.toISOString(), '2026-11-06T12:00:30.000Z');
  });

  it('recusa por IP e por client id enquanto o bloqueio estiver no banco', async () => {
    const rows = new Map<string, { falhas: number; bloqueadoAte: Date | null }>();
    const prisma = {
      apiOauthTentativa: {
        findMany: async ({ where }: { where: { chave: { in: string[] } } }) =>
          where.chave.in
            .filter((chave) => rows.has(chave))
            .map((chave) => ({ bloqueadoAte: rows.get(chave)?.bloqueadoAte ?? null })),
      },
    };
    const limite = new ApiOauthLimiteService(prisma as never);
    const ate = new Date(Date.now() + 20_000);
    rows.set('ip:10.0.0.1', { falhas: 5, bloqueadoAte: ate });
    await assert.rejects(
      () => limite.assertLivre('10.0.0.1', 'zc_outro'),
      (err: unknown) => err instanceof HttpException && err.getStatus() === 429,
    );
    rows.delete('ip:10.0.0.1');
    rows.set('client:zc_abc', { falhas: 5, bloqueadoAte: ate });
    await assert.rejects(
      () => limite.assertLivre('10.0.0.2', 'ZC_ABC'),
      (err: unknown) => err instanceof HttpException && err.getStatus() === 429,
    );
    rows.delete('client:zc_abc');
    await limite.assertLivre('10.0.0.2', 'zc_abc');
  });
});
