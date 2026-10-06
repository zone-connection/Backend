import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificacaoTipo, Prisma, PropostaStatus } from "@prisma/client";
import { randomBytes } from "crypto";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { requireTenantId } from "../common/utils/tenant";
import { NotificacoesService } from "../notificacoes/notificacoes.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePropostaDto } from "./dto/create-proposta.dto";
import { PropostaHistoricoService } from "./proposta-historico.service";
import { PropostaVinculosService } from "./proposta-vinculos.service";
import { PropostasService } from "./propostas.service";

function parseOptionalDate(value?: string | null): Date | null {
  if (value === undefined || value === null || value === "") return null;
  return new Date(value);
}

function novoToken() {
  return randomBytes(24).toString("hex");
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

function brl(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const linkInclude = {
  imovel: {
    select: {
      id: true,
      tipo: true,
      logradouro: true,
      numero: true,
      complemento: true,
      bairro: true,
      cidade: true,
      estado: true,
      area: true,
      quartos: true,
      suites: true,
      banheiros: true,
      vagas: true,
      descricao: true,
      fotoUrl: true,
      proprietarioId: true,
      fotos: {
        orderBy: { sortOrder: "asc" as const },
        select: { url: true },
      },
    },
  },
  corretor: { select: { id: true, name: true, whatsapp: true, phone: true } },
  tenant: {
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      primaryColor: true,
      telefone: true,
    },
  },
  proprietario: { select: { id: true, nome: true } },
} as const;

@Injectable()
export class PropostaPublicaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propostas: PropostasService,
    private readonly vinculos: PropostaVinculosService,
    private readonly historico: PropostaHistoricoService,
    private readonly notificacoes: NotificacoesService,
    private readonly config: ConfigService,
  ) {}

  async obterOuCriarLink(imovelId: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    await this.propostas.assertModuloPropostasPublic(requester);
    const imovel = await this.prisma.imovel.findFirst({
      where: { id: imovelId, tenantId },
      select: { id: true, proprietarioId: true },
    });
    if (!imovel) throw new NotFoundException("Imóvel não encontrado.");

    const existing = await this.prisma.propostaPublicaLink.findUnique({
      where: {
        imovelId_corretorId: {
          imovelId: imovel.id,
          corretorId: requester.id,
        },
      },
    });
    const link =
      existing ??
      (await this.prisma.propostaPublicaLink.create({
        data: {
          tenantId,
          token: novoToken(),
          imovelId: imovel.id,
          proprietarioId: imovel.proprietarioId,
          corretorId: requester.id,
          ativo: true,
        },
      }));

    if (
      !link.ativo ||
      link.proprietarioId !== imovel.proprietarioId ||
      link.tenantId !== tenantId
    ) {
      const atualizado = await this.prisma.propostaPublicaLink.update({
        where: { id: link.id },
        data: {
          ativo: true,
          proprietarioId: imovel.proprietarioId,
          tenantId,
        },
      });
      return this.urlDoLink(atualizado.token);
    }

    return this.urlDoLink(link.token);
  }

  async resumo(token: string) {
    const link = await this.carregarLinkAtivo(token);
    const fotos = [
      link.imovel.fotoUrl,
      ...link.imovel.fotos.map((f) => f.url),
    ].filter((url): url is string => Boolean(url));
    const uniqueFotos = [...new Set(fotos)];
    return {
      token: link.token,
      imovel: {
        id: link.imovel.id,
        tipo: link.imovel.tipo,
        logradouro: link.imovel.logradouro,
        numero: link.imovel.numero,
        complemento: link.imovel.complemento,
        bairro: link.imovel.bairro,
        cidade: link.imovel.cidade,
        estado: link.imovel.estado,
        area: link.imovel.area,
        quartos: link.imovel.quartos,
        suites: link.imovel.suites,
        banheiros: link.imovel.banheiros,
        vagas: link.imovel.vagas,
        descricao: link.imovel.descricao,
        fotos: uniqueFotos,
        rotulo: rotuloImovel(link.imovel),
      },
      corretor: {
        nome: link.corretor.name,
        telefone: link.corretor.whatsapp || link.corretor.phone,
      },
      tenant: {
        nome: link.tenant.name,
        slug: link.tenant.slug,
        logoUrl: link.tenant.logoUrl,
        cor: link.tenant.primaryColor,
        telefone: link.tenant.telefone,
      },
    };
  }

  async enviar(token: string, dto: CreatePropostaDto) {
    const link = await this.carregarLinkAtivo(token);
    const clienteNome = dto.clienteNome.trim();
    if (clienteNome.length < 2) {
      throw new BadRequestException("Informe o nome do comprador.");
    }

    const codigo = await this.propostas.nextCodigoPublic(link.tenantId);
    const compradorToken = novoToken();
    const agora = new Date();

    const proposta = await this.prisma.proposta.create({
      data: {
        tenantId: link.tenantId,
        codigo,
        clienteNome,
        clienteTelefone: dto.clienteTelefone?.trim() || null,
        clienteCpf: dto.clienteCpf?.trim() || null,
        clienteRg: dto.clienteRg?.trim() || null,
        clienteRgOrgaoEmissor: dto.clienteRgOrgaoEmissor?.trim() || null,
        clienteDataNascimento: parseOptionalDate(dto.clienteDataNascimento),
        clienteNacionalidade: dto.clienteNacionalidade?.trim() || null,
        clienteEstadoCivil: dto.clienteEstadoCivil?.trim() || null,
        clienteRegimeBens: dto.clienteRegimeBens?.trim() || null,
        clienteDataCasamento: parseOptionalDate(dto.clienteDataCasamento),
        clienteNomePai: dto.clienteNomePai?.trim() || null,
        clienteNomeMae: dto.clienteNomeMae?.trim() || null,
        clienteRenda: dto.clienteRenda ?? null,
        clienteTelefoneFixo: dto.clienteTelefoneFixo?.trim() || null,
        clienteEmail: dto.clienteEmail?.trim() || null,
        clienteEnderecoResidencial:
          dto.clienteEnderecoResidencial?.trim() || null,
        clienteBairroResidencial: dto.clienteBairroResidencial?.trim() || null,
        clienteCidadeResidencial: dto.clienteCidadeResidencial?.trim() || null,
        clienteUfResidencial: dto.clienteUfResidencial?.trim() || null,
        clienteCepResidencial: dto.clienteCepResidencial?.trim() || null,
        clienteCobrancaResidencial: dto.clienteCobrancaResidencial ?? null,
        clienteEmpregador: dto.clienteEmpregador?.trim() || null,
        clienteProfissao: dto.clienteProfissao?.trim() || null,
        clienteEnderecoComercial: dto.clienteEnderecoComercial?.trim() || null,
        clienteBairroComercial: dto.clienteBairroComercial?.trim() || null,
        clienteCidadeComercial: dto.clienteCidadeComercial?.trim() || null,
        clienteUfComercial: dto.clienteUfComercial?.trim() || null,
        clienteCepComercial: dto.clienteCepComercial?.trim() || null,
        clienteCobrancaComercial: dto.clienteCobrancaComercial ?? null,
        clienteSite: dto.clienteSite?.trim() || null,
        clienteTelefoneComercial1: dto.clienteTelefoneComercial1?.trim() || null,
        clienteTelefoneComercial2: dto.clienteTelefoneComercial2?.trim() || null,
        corretorId: link.corretorId,
        autorId: link.corretorId,
        valor: dto.valor,
        entrada: dto.entrada ?? null,
        apartado: dto.apartado ?? null,
        preChaves: dto.preChaves ?? [],
        posChaves: dto.posChaves ?? [],
        intercaladas: dto.intercaladas ?? [],
        fgts: dto.fgts ?? null,
        moraBem: dto.moraBem ?? null,
        mcmv: dto.mcmv ?? null,
        parcelaCaixa: dto.parcelaCaixa ?? null,
        financiamento: dto.financiamento ?? null,
        desconto: dto.desconto ?? null,
        status: PropostaStatus.enviada,
        validade: parseOptionalDate(dto.validade),
        enviadaEm: agora,
        observacao: dto.observacao?.trim() || null,
        origemPublica: true,
        linkId: link.id,
        compradorToken,
      },
      select: {
        id: true,
        codigo: true,
        valor: true,
        desconto: true,
        clienteNome: true,
        compradorToken: true,
      },
    });

    await this.vinculos.createForPublico({
      propostaId: proposta.id,
      tenantId: link.tenantId,
      imovelId: link.imovelId,
      corretorId: link.corretorId,
      corretorNome: link.corretor.name,
      proposta,
    });

    await this.historico.append({
      tenantId: link.tenantId,
      propostaId: proposta.id,
      tipo: "enviada_publico",
      payload: { valor: proposta.valor, codigo: proposta.codigo } as Prisma.InputJsonValue,
      atorTipo: "comprador",
      atorNome: clienteNome,
    });

    await this.notificacoes.createPropostaPublica({
      userId: link.corretorId,
      propostaId: proposta.id,
      tipo: NotificacaoTipo.proposta_publica_recebida,
      titulo: `Nova proposta pública — ${proposta.codigo}`,
      corpo: `${clienteNome} enviou uma proposta de ${brl(proposta.valor)} para ${rotuloImovel(link.imovel)}.`,
      eventoChave: `proposta_publica_recebida:${proposta.id}`,
    });

    return {
      reciboUrl: this.urlRecibo(proposta.compradorToken!),
      codigo: proposta.codigo,
    };
  }

  async recibo(compradorToken: string) {
    const proposta = await this.prisma.proposta.findUnique({
      where: { compradorToken },
      select: {
        codigo: true,
        status: true,
        valor: true,
        entrada: true,
        apartado: true,
        preChaves: true,
        posChaves: true,
        intercaladas: true,
        fgts: true,
        moraBem: true,
        mcmv: true,
        parcelaCaixa: true,
        financiamento: true,
        desconto: true,
        validade: true,
        observacao: true,
        clienteNome: true,
        aceitaEm: true,
        enviadaEm: true,
        createdAt: true,
        tenant: {
          select: { name: true, logoUrl: true, primaryColor: true },
        },
        corretor: { select: { name: true } },
        vinculos: {
          where: { removidoEm: null },
          take: 1,
          select: {
            imovel: {
              select: {
                logradouro: true,
                numero: true,
                bairro: true,
                cidade: true,
                fotoUrl: true,
              },
            },
          },
        },
      },
    });
    if (!proposta) throw new NotFoundException("Recibo não encontrado.");
    const imovel = proposta.vinculos[0]?.imovel ?? null;
    return {
      codigo: proposta.codigo,
      status: proposta.status,
      valor: proposta.valor,
      entrada: proposta.entrada,
      apartado: proposta.apartado,
      preChaves: proposta.preChaves,
      posChaves: proposta.posChaves,
      intercaladas: proposta.intercaladas,
      fgts: proposta.fgts,
      moraBem: proposta.moraBem,
      mcmv: proposta.mcmv,
      parcelaCaixa: proposta.parcelaCaixa,
      financiamento: proposta.financiamento,
      desconto: proposta.desconto,
      validade: proposta.validade,
      observacao: proposta.observacao,
      clienteNome: proposta.clienteNome,
      aceitaEm: proposta.aceitaEm,
      enviadaEm: proposta.enviadaEm,
      createdAt: proposta.createdAt,
      tenant: proposta.tenant,
      corretorNome: proposta.corretor?.name ?? null,
      imovel: imovel
        ? {
            rotulo: rotuloImovel(imovel),
            fotoUrl: imovel.fotoUrl,
          }
        : null,
    };
  }

  async listHistorico(propostaId: string, requester: AuthenticatedUser) {
    await this.propostas.findOne(propostaId, requester);
    return this.historico.list(propostaId, requireTenantId(requester));
  }

  private async carregarLinkAtivo(token: string) {
    const link = await this.prisma.propostaPublicaLink.findUnique({
      where: { token },
      include: linkInclude,
    });
    if (!link?.ativo) {
      throw new NotFoundException("Link de proposta inválido ou inativo.");
    }
    if (link.imovel.proprietarioId !== link.proprietarioId) {
      throw new NotFoundException("Este link não é mais válido para o imóvel.");
    }
    return link;
  }

  private frontendOrigin() {
    const raw = this.config.get<string>("FRONTEND_URL") ?? "";
    return raw.split(",")[0]?.trim().replace(/\/$/, "") ?? "";
  }

  private urlDoLink(token: string) {
    const origin =
      this.frontendOrigin() ||
      (typeof process !== "undefined" ? "" : "");
    return {
      token,
      url: origin
        ? `${origin}/publico/proposta/${token}`
        : `/publico/proposta/${token}`,
    };
  }

  private urlRecibo(compradorToken: string) {
    const origin = this.frontendOrigin();
    return origin
      ? `${origin}/publico/proposta/recibo/${compradorToken}`
      : `/publico/proposta/recibo/${compradorToken}`;
  }
}
