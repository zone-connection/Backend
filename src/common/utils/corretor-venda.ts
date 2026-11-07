import { PrismaService } from '../../prisma/prisma.service';
import {
  documentacaoVinculadaAoCorretorWhere,
  status2VendidoWhere,
} from './documentacao-status';

/** Corretor com documentação vendida vinculada ou comissão lançada. */
export async function corretorTemVendaVinculada(
  prisma: PrismaService,
  opts: { tenantId: string; userId: string },
) {
  const venda = await prisma.documentacao.findFirst({
    where: {
      tenantId: opts.tenantId,
      AND: [
        documentacaoVinculadaAoCorretorWhere(opts.userId),
        status2VendidoWhere(),
      ],
    },
    select: { id: true },
  });
  if (venda) return true;
  const comissao = await prisma.financeiroComissao.findFirst({
    where: { tenantId: opts.tenantId, corretorId: opts.userId },
    select: { id: true },
  });
  return Boolean(comissao);
}
