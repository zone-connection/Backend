import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, PropostaStatus, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TeamScopeService } from "../equipes/team-scope.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { requireTenantId } from "../common/utils/tenant";
import { prismaTableOrderBy } from "../common/utils/table-sort";
import { CreatePropostaDto } from "./dto/create-proposta.dto";
import { UpdatePropostaDto } from "./dto/update-proposta.dto";
import { QueryPropostaDto } from "./dto/query-proposta.dto";

const userMini = { select: { id: true, name: true } } as const;

const propostaSelect = {
  id: true,
  codigo: true,
  leadId: true,
  clienteNome: true,
  clienteTelefone: true,
  clienteCpf: true,
  clienteRg: true,
  clienteRgOrgaoEmissor: true,
  clienteDataNascimento: true,
  clienteNacionalidade: true,
  clienteEstadoCivil: true,
  clienteRegimeBens: true,
  clienteDataCasamento: true,
  clienteNomePai: true,
  clienteNomeMae: true,
  clienteRenda: true,
  clienteTelefoneFixo: true,
  clienteEmail: true,
  clienteEnderecoResidencial: true,
  clienteBairroResidencial: true,
  clienteCidadeResidencial: true,
  clienteUfResidencial: true,
  clienteCepResidencial: true,
  clienteCobrancaResidencial: true,
  clienteEmpregador: true,
  clienteProfissao: true,
  clienteEnderecoComercial: true,
  clienteBairroComercial: true,
  clienteCidadeComercial: true,
  clienteUfComercial: true,
  clienteCepComercial: true,
  clienteCobrancaComercial: true,
  clienteSite: true,
  clienteTelefoneComercial1: true,
  clienteTelefoneComercial2: true,
  construtoraId: true,
  empreendimentoId: true,
  unidade: true,
  corretorId: true,
  autorId: true,
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
  status: true,
  validade: true,
  enviadaEm: true,
  observacao: true,
  createdAt: true,
  updatedAt: true,
  autor: userMini,
  corretor: userMini,
  construtora: { select: { id: true, nome: true, cor: true } },
  empreendimento: { select: { id: true, nome: true, cidade: true } },
  lead: {
    select: {
      id: true,
      tipo: true,
      nome: true,
      telefone: true,
      corretorId: true,
      equipe: { select: { id: true, name: true } },
    },
  },
} as const;

function parseOptionalDate(value?: string | null): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(value);
}

const clienteTextFields = [
  "clienteCpf",
  "clienteRg",
  "clienteRgOrgaoEmissor",
  "clienteNacionalidade",
  "clienteEstadoCivil",
  "clienteRegimeBens",
  "clienteNomePai",
  "clienteNomeMae",
  "clienteTelefoneFixo",
  "clienteEmail",
  "clienteEnderecoResidencial",
  "clienteBairroResidencial",
  "clienteCidadeResidencial",
  "clienteUfResidencial",
  "clienteCepResidencial",
  "clienteEmpregador",
  "clienteProfissao",
  "clienteEnderecoComercial",
  "clienteBairroComercial",
  "clienteCidadeComercial",
  "clienteUfComercial",
  "clienteCepComercial",
  "clienteSite",
  "clienteTelefoneComercial1",
  "clienteTelefoneComercial2",
] as const;

function clienteDados(
  dto: CreatePropostaDto | UpdatePropostaDto,
  includeEmpty: boolean,
): Partial<Prisma.PropostaUncheckedCreateInput> {
  const data: Record<string, unknown> = {};
  const input = dto as Record<string, unknown>;

  for (const field of clienteTextFields) {
    if (includeEmpty || input[field] !== undefined) {
      data[field] =
        typeof input[field] === "string" && input[field].trim()
          ? input[field].trim()
          : null;
    }
  }

  for (const field of ["clienteDataNascimento", "clienteDataCasamento"]) {
    if (includeEmpty || input[field] !== undefined) {
      data[field] = parseOptionalDate(input[field] as string | null);
    }
  }

  for (const field of [
    "clienteRenda",
    "clienteCobrancaResidencial",
    "clienteCobrancaComercial",
  ]) {
    if (includeEmpty || input[field] !== undefined) data[field] = input[field];
  }

  return data as Partial<Prisma.PropostaUncheckedCreateInput>;
}

@Injectable()
export class PropostasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
  ) {}

  async list(query: QueryPropostaDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const where: Prisma.PropostaWhereInput = { tenantId };

    if (requester.role !== Role.admin) {
      const leadScope = await this.teamScope.leadScope(requester);
      const corretorIds = await this.allowedCorretorIds(requester);
      where.OR = [
        { lead: leadScope },
        { leadId: null, corretorId: { in: corretorIds } },
        { leadId: null, autorId: requester.id },
      ];
    }

    if (query.corretorId) {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        query.corretorId,
      );
      if (!allowed) return [];
      where.corretorId = query.corretorId;
    }

    if (query.status) where.status = query.status;

    return this.prisma.proposta.findMany({
      where,
      select: propostaSelect,
      orderBy: prismaTableOrderBy(query.sort, "clienteNome"),
    });
  }

  async buscarCep(cep: string, requester: AuthenticatedUser) {
    requireTenantId(requester);
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      throw new BadRequestException("Informe um CEP com 8 dígitos.");
    }

    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new ServiceUnavailableException(
          "Não foi possível consultar o CEP agora.",
        );
      }
      const result = (await response.json()) as {
        erro?: boolean;
        cep?: string;
        logradouro?: string;
        complemento?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (result.erro) {
        throw new NotFoundException("CEP não encontrado.");
      }
      return {
        cep: result.cep ?? digits,
        endereco: result.logradouro ?? "",
        complemento: result.complemento ?? "",
        bairro: result.bairro ?? "",
        cidade: result.localidade ?? "",
        uf: result.uf ?? "",
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException(
        "Não foi possível consultar o CEP agora.",
      );
    }
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const item = await this.prisma.proposta.findFirst({
      where: { id, tenantId },
      select: propostaSelect,
    });
    if (!item) throw new NotFoundException("Proposta não encontrada.");
    await this.ensureAccessible(item, requester);
    return item;
  }

  async create(dto: CreatePropostaDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);

    let clienteNome = dto.clienteNome.trim();
    let clienteTelefone = dto.clienteTelefone?.trim() || null;
    let corretorId = dto.corretorId || null;
    let construtoraId = dto.construtoraId || null;
    let empreendimentoId = dto.empreendimentoId || null;

    if (dto.leadId) {
      const lead = await this.ensureLeadAccessible(dto.leadId, requester);
      clienteNome = lead.nome;
      clienteTelefone = lead.telefone || clienteTelefone;
      corretorId = corretorId || lead.corretorId;
      construtoraId = construtoraId || lead.construtoraId;
      empreendimentoId = empreendimentoId || lead.empreendimentoId;
    }

    if (corretorId) {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        corretorId,
      );
      if (!allowed) {
        throw new ForbiddenException("Corretor fora do seu escopo.");
      }
    }

    const status = dto.status ?? PropostaStatus.rascunho;
    const codigo = await this.nextCodigo(tenantId);

    return this.prisma.proposta.create({
      data: {
        tenantId,
        codigo,
        leadId: dto.leadId || null,
        clienteNome,
        clienteTelefone,
        ...clienteDados(dto, true),
        construtoraId,
        empreendimentoId,
        unidade: dto.unidade?.trim() || null,
        corretorId,
        autorId: requester.id,
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
        status,
        validade: parseOptionalDate(dto.validade) ?? null,
        enviadaEm:
          status === PropostaStatus.enviada ||
          status === PropostaStatus.negociacao ||
          status === PropostaStatus.aceita
            ? new Date()
            : null,
        observacao: dto.observacao?.trim() || null,
      },
      select: propostaSelect,
    });
  }

  async update(
    id: string,
    dto: UpdatePropostaDto,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.proposta.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        autorId: true,
        corretorId: true,
        leadId: true,
        status: true,
        enviadaEm: true,
      },
    });
    if (!existing) throw new NotFoundException("Proposta não encontrada.");
    await this.ensureAccessible(existing, requester);

    const data: Prisma.PropostaUpdateInput = {};
    if (dto.clienteNome !== undefined)
      data.clienteNome = dto.clienteNome.trim();
    if (dto.clienteTelefone !== undefined) {
      data.clienteTelefone = dto.clienteTelefone?.trim() || null;
    }
    Object.assign(data, clienteDados(dto, false));
    if (dto.unidade !== undefined) data.unidade = dto.unidade?.trim() || null;
    if (dto.valor !== undefined) data.valor = dto.valor;
    if (dto.entrada !== undefined) data.entrada = dto.entrada;
    if (dto.apartado !== undefined) data.apartado = dto.apartado;
    if (dto.preChaves !== undefined) data.preChaves = dto.preChaves;
    if (dto.posChaves !== undefined) data.posChaves = dto.posChaves;
    if (dto.intercaladas !== undefined) data.intercaladas = dto.intercaladas;
    if (dto.fgts !== undefined) data.fgts = dto.fgts;
    if (dto.moraBem !== undefined) data.moraBem = dto.moraBem;
    if (dto.mcmv !== undefined) data.mcmv = dto.mcmv;
    if (dto.parcelaCaixa !== undefined) data.parcelaCaixa = dto.parcelaCaixa;
    if (dto.financiamento !== undefined) data.financiamento = dto.financiamento;
    if (dto.desconto !== undefined) data.desconto = dto.desconto;
    if (dto.observacao !== undefined) {
      data.observacao = dto.observacao?.trim() || null;
    }
    if (dto.validade !== undefined) {
      data.validade = parseOptionalDate(dto.validade) ?? null;
    }
    if (dto.construtoraId !== undefined) {
      data.construtora = dto.construtoraId
        ? { connect: { id: dto.construtoraId } }
        : { disconnect: true };
    }
    if (dto.empreendimentoId !== undefined) {
      data.empreendimento = dto.empreendimentoId
        ? { connect: { id: dto.empreendimentoId } }
        : { disconnect: true };
    }
    if (dto.corretorId !== undefined) {
      if (dto.corretorId) {
        const allowed = await this.teamScope.canAccessCorretor(
          requester,
          dto.corretorId,
        );
        if (!allowed) {
          throw new ForbiddenException("Corretor fora do seu escopo.");
        }
        data.corretor = { connect: { id: dto.corretorId } };
      } else {
        data.corretor = { disconnect: true };
      }
    }
    if (dto.leadId !== undefined) {
      if (dto.leadId) {
        const lead = await this.ensureLeadAccessible(dto.leadId, requester);
        data.lead = { connect: { id: lead.id } };
        if (dto.clienteNome === undefined) data.clienteNome = lead.nome;
        if (dto.clienteTelefone === undefined) {
          data.clienteTelefone = lead.telefone;
        }
      } else {
        data.lead = { disconnect: true };
      }
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (
        !existing.enviadaEm &&
        (dto.status === PropostaStatus.enviada ||
          dto.status === PropostaStatus.negociacao ||
          dto.status === PropostaStatus.aceita)
      ) {
        data.enviadaEm = new Date();
      }
    }

    return this.prisma.proposta.update({
      where: { id },
      data,
      select: propostaSelect,
    });
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.proposta.findFirst({
      where: { id, tenantId },
      select: { id: true, autorId: true, corretorId: true, leadId: true },
    });
    if (!existing) throw new NotFoundException("Proposta não encontrada.");
    await this.ensureAccessible(existing, requester);

    await this.prisma.proposta.delete({ where: { id } });
    return { ok: true };
  }

  private async nextCodigo(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PROP-${year}-`;
    const last = await this.prisma.proposta.findFirst({
      where: { tenantId, codigo: { startsWith: prefix } },
      orderBy: { codigo: "desc" },
      select: { codigo: true },
    });
    const seq = last ? Number(last.codigo.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(Number.isFinite(seq) ? seq : 1).padStart(4, "0")}`;
  }

  private async allowedCorretorIds(requester: AuthenticatedUser) {
    const ids = await this.teamScope.getVisibleCorretorIds(requester);
    return ids ?? [];
  }

  private async ensureAccessible(
    item: { autorId: string; corretorId: string | null; leadId: string | null },
    requester: AuthenticatedUser,
  ) {
    if (requester.role === Role.admin) return;
    if (requester.role !== Role.gerente) {
      throw new ForbiddenException(
        "Apenas administradores e gerentes podem acessar propostas.",
      );
    }
    if (item.corretorId) {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        item.corretorId,
      );
      if (!allowed) throw new NotFoundException("Proposta não encontrada.");
      return;
    }
    if (item.leadId) {
      await this.ensureLeadAccessible(item.leadId, requester);
      return;
    }
    if (item.autorId !== requester.id) {
      throw new NotFoundException("Proposta não encontrada.");
    }
  }

  private async ensureLeadAccessible(
    leadId: string,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, perdidoAt: null },
      select: {
        id: true,
        nome: true,
        telefone: true,
        corretorId: true,
        construtoraId: true,
        empreendimentoId: true,
      },
    });
    if (!lead) throw new NotFoundException("Lead/cliente não encontrado.");
    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
    );
    if (!allowed) throw new NotFoundException("Lead/cliente não encontrado.");
    return lead;
  }
}
