import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { requireTenantId } from "../common/utils/tenant";
import {
  isDeliverableEmail,
  MailerService,
} from "../mailer/mailer.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePropostaVinculoDto } from "./dto/create-proposta-vinculo.dto";
import { PropostasService } from "./propostas.service";

const vinculoSelect = {
  id: true,
  propostaId: true,
  imovelId: true,
  empreendimentoId: true,
  proprietarioId: true,
  corretorId: true,
  corretorNome: true,
  vinculadoEm: true,
  removidoEm: true,
  removidoPorId: true,
  removidoPorNome: true,
  imovel: {
    select: {
      id: true,
      logradouro: true,
      numero: true,
      complemento: true,
      bairro: true,
      cidade: true,
      estado: true,
      tipo: true,
      proprietario: { select: { id: true, nome: true, email: true } },
    },
  },
  empreendimento: {
    select: { id: true, nome: true, cidade: true },
  },
  proprietario: { select: { id: true, nome: true, email: true } },
  notificacoes: {
    select: {
      id: true,
      email: true,
      status: true,
      detalhe: true,
      enviadoEm: true,
    },
    orderBy: { enviadoEm: "desc" as const },
  },
} satisfies Prisma.PropostaVinculoSelect;

function brl(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function rotuloImovel(imovel: {
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
}) {
  const endereco = [imovel.logradouro, imovel.numero].filter(Boolean).join(", ");
  const local = [imovel.bairro, imovel.cidade].filter(Boolean).join(" · ");
  return [endereco || "Imóvel", local].filter(Boolean).join(" — ");
}

@Injectable()
export class PropostaVinculosService {
  private readonly logger = new Logger(PropostaVinculosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly propostas: PropostasService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async list(propostaId: string, requester: AuthenticatedUser) {
    await this.propostas.findOne(propostaId, requester);
    const tenantId = requireTenantId(requester);
    return this.prisma.propostaVinculo.findMany({
      where: { propostaId, tenantId },
      select: vinculoSelect,
      orderBy: { vinculadoEm: "desc" },
    });
  }

  async create(
    propostaId: string,
    dto: CreatePropostaVinculoDto,
    requester: AuthenticatedUser,
  ) {
    const proposta = await this.propostas.findOne(propostaId, requester);
    const tenantId = requireTenantId(requester);
    const imovelId = dto.imovelId || null;
    const empreendimentoId = dto.empreendimentoId || null;
    if (Boolean(imovelId) === Boolean(empreendimentoId)) {
      throw new BadRequestException(
        "Informe um imóvel ou um empreendimento, não os dois.",
      );
    }

    let proprietarioId: string | null = null;
    let imovel: {
      id: string;
      logradouro: string;
      numero: string;
      bairro: string;
      cidade: string;
      proprietario: { id: string; nome: string; email: string };
    } | null = null;

    if (imovelId) {
      imovel = await this.prisma.imovel.findFirst({
        where: { id: imovelId, tenantId },
        select: {
          id: true,
          logradouro: true,
          numero: true,
          bairro: true,
          cidade: true,
          proprietario: { select: { id: true, nome: true, email: true } },
        },
      });
      if (!imovel) throw new NotFoundException("Imóvel não encontrado.");
      proprietarioId = imovel.proprietario.id;
      const ativo = await this.prisma.propostaVinculo.findFirst({
        where: { propostaId, imovelId, removidoEm: null },
        select: { id: true },
      });
      if (ativo) {
        throw new ConflictException("Esta proposta já está vinculada a este imóvel.");
      }
    } else if (empreendimentoId) {
      const empreendimento = await this.prisma.empreendimento.findFirst({
        where: { id: empreendimentoId, tenantId },
        select: { id: true },
      });
      if (!empreendimento) {
        throw new NotFoundException("Empreendimento não encontrado.");
      }
      const ativo = await this.prisma.propostaVinculo.findFirst({
        where: { propostaId, empreendimentoId, removidoEm: null },
        select: { id: true },
      });
      if (ativo) {
        throw new ConflictException(
          "Esta proposta já está vinculada a este empreendimento.",
        );
      }
    }

    let criado: { id: string };
    try {
      criado = await this.prisma.propostaVinculo.create({
        data: {
          tenantId,
          propostaId,
          imovelId,
          empreendimentoId,
          proprietarioId,
          corretorId: requester.id,
          corretorNome: requester.name?.trim() || "Corretor",
        },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Esta proposta já está vinculada a este alvo.");
      }
      throw error;
    }

    if (imovel) {
      await this.notificarProprietario(criado.id, proposta, imovel);
    }

    return this.prisma.propostaVinculo.findFirstOrThrow({
      where: { id: criado.id, tenantId },
      select: vinculoSelect,
    });
  }

  async remove(
    propostaId: string,
    vinculoId: string,
    requester: AuthenticatedUser,
  ) {
    await this.propostas.findOne(propostaId, requester);
    const tenantId = requireTenantId(requester);
    const atual = await this.prisma.propostaVinculo.findFirst({
      where: { id: vinculoId, propostaId, tenantId },
      select: { id: true, removidoEm: true },
    });
    if (!atual) throw new NotFoundException("Vínculo não encontrado.");
    if (atual.removidoEm) {
      throw new ConflictException("Este vínculo já foi removido.");
    }

    return this.prisma.propostaVinculo.update({
      where: { id: vinculoId },
      data: {
        removidoEm: new Date(),
        removidoPorId: requester.id,
        removidoPorNome: requester.name?.trim() || "Corretor",
      },
      select: vinculoSelect,
    });
  }

  private async notificarProprietario(
    vinculoId: string,
    proposta: {
      codigo: string;
      clienteNome: string;
      valor: number;
      desconto: number | null;
    },
    imovel: {
      logradouro: string;
      numero: string;
      bairro: string;
      cidade: string;
      proprietario: { nome: string; email: string };
    },
  ) {
    const destino = imovel.proprietario.email?.trim().toLowerCase() ?? "";
    const imovelLabel = rotuloImovel(imovel);
    const portalUrl = this.portalUrl();
    if (!isDeliverableEmail(destino)) {
      await this.registrarNotificacao(vinculoId, destino, "sem_email", "Proprietário sem e-mail válido.");
      return;
    }

    const assunto = `Nova proposta vinculada ao seu imóvel`;
    const linhas = [
      `Olá, ${imovel.proprietario.nome}.`,
      "",
      "Uma nova proposta foi vinculada ao seu imóvel.",
      `Proposta: ${proposta.codigo}`,
      `Interessado: ${proposta.clienteNome}`,
      `Valor: ${brl(proposta.valor)}`,
      proposta.desconto
        ? `Desconto: ${brl(proposta.desconto)}`
        : "",
      `Imóvel: ${imovelLabel}`,
      portalUrl ? "" : "",
      portalUrl
        ? `Consulte a proposta no Portal do Proprietário: ${portalUrl}`
        : "",
    ].filter((linha) => linha !== "");

    try {
      await this.mailer.sendText({
        to: destino,
        subject: assunto,
        text: linhas.join("\n"),
      });
      await this.registrarNotificacao(vinculoId, destino, "enviado", assunto);
    } catch (error) {
      const detalhe = error instanceof Error ? error.message : "Falha ao enviar.";
      this.logger.warn(`Aviso de vínculo não enviado: ${detalhe}`);
      await this.registrarNotificacao(vinculoId, destino, "falhou", detalhe);
    }
  }

  private registrarNotificacao(
    vinculoId: string,
    email: string,
    status: "enviado" | "falhou" | "sem_email",
    detalhe: string,
  ) {
    return this.prisma.propostaVinculoNotificacao.create({
      data: { vinculoId, email, status, detalhe },
    });
  }

  private portalUrl() {
    const raw = this.config.get<string>("FRONTEND_URL") ?? "";
    const origin = raw.split(",")[0]?.trim().replace(/\/$/, "") ?? "";
    return origin ? `${origin}/portal/propostas` : "";
  }
}
