import { PrismaService } from '../prisma/prisma.service';

const BRASIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function diaBrasil(date: Date) {
  return new Date(date.getTime() - BRASIL_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Visitas e reuniões marcadas na agenda, nos lembretes ou no histórico.
 * O espelho da agenda gerado pelo lembrete não entra de novo.
 */
export async function contarVisitasEReunioes(
  prisma: PrismaService,
  tenantId: string,
  inicio: Date,
  fim: Date,
  corretorIds: string[] | null,
) {
  const pessoas = corretorIds === null ? undefined : { in: corretorIds };
  const [agenda, lembretes, historico] = await Promise.all([
    prisma.agendamento.count({
      where: {
        tenantId,
        tipo: { in: ['visita', 'reuniao'] },
        status: { not: 'cancelado' },
        origemTarefa: false,
        startsAt: { gte: inicio, lt: fim },
        ...(pessoas
          ? {
              OR: [
                { atribuidoParaId: pessoas },
                { atribuidoParaId: null, autorId: pessoas },
              ],
            }
          : {}),
      },
    }),
    prisma.tarefa.count({
      where: {
        tenantId,
        tipo: { in: ['visita', 'reuniao'] },
        status: { not: 'cancelada' },
        data: { gte: diaBrasil(inicio), lt: diaBrasil(fim) },
        ...(pessoas ? { responsavelId: pessoas } : {}),
      },
    }),
    prisma.triagemEvent.count({
      where: {
        tipo: { in: ['visita', 'reuniao'] },
        createdAt: { gte: inicio, lt: fim },
        lead: { tenantId },
        ...(pessoas ? { autorId: pessoas } : {}),
      },
    }),
  ]);
  return agenda + lembretes + historico;
}
