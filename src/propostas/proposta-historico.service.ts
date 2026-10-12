import { Injectable } from "@nestjs/common";
import { Prisma, PropostaHistoricoAtor } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PropostaHistoricoService {
  constructor(private readonly prisma: PrismaService) {}

  append(params: {
    tenantId: string;
    propostaId: string;
    tipo: string;
    payload?: Prisma.InputJsonValue;
    atorTipo: PropostaHistoricoAtor;
    atorId?: string | null;
    atorNome?: string | null;
  }) {
    return this.prisma.propostaHistorico.create({
      data: {
        tenantId: params.tenantId,
        propostaId: params.propostaId,
        tipo: params.tipo,
        payload: params.payload ?? Prisma.JsonNull,
        atorTipo: params.atorTipo,
        atorId: params.atorId ?? null,
        atorNome: params.atorNome ?? null,
      },
    });
  }

  list(propostaId: string, tenantId: string) {
    return this.prisma.propostaHistorico.findMany({
      where: { propostaId, tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tipo: true,
        payload: true,
        atorTipo: true,
        atorId: true,
        atorNome: true,
        createdAt: true,
      },
    });
  }
}
