import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ParceriaParticipacaoStatus,
  ParceriaRepasseStatus,
  ParceriaStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenantId } from '../common/utils/tenant';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { PortalParceiroSession } from './parceiro.types';
import { ParceiroAuthService } from './parceiro-auth.service';
import { FunisService } from '../funis/funis.service';
import type {
  ConvidarParceiroDto,
  CreateRepasseDto,
  IndicarClienteDto,
  UpdateParceriaDto,
} from './dto/parcerias.dto';

const INCLUDE_PARCERIA = {
  parceiro: {
    select: {
      id: true,
      nome: true,
      email: true,
      creci: true,
      telefone: true,
      imobiliariaOrigem: true,
      lastLoginAt: true,
    },
  },
  _count: {
    select: { interesses: true, participacoes: true, repasses: true },
  },
} as const;

@Injectable()
export class ParceriasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: ParceiroAuthService,
    private readonly funis: FunisService,
  ) {}

  list(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    return this.prisma.parceria.findMany({
      where: { tenantId },
      include: INCLUDE_PARCERIA,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const row = await this.prisma.parceria.findFirst({
      where: { id, tenantId },
      include: {
        ...INCLUDE_PARCERIA,
        interesses: {
          include: {
            imovel: {
              select: {
                id: true,
                tipo: true,
                logradouro: true,
                bairro: true,
                cidade: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        participacoes: {
          include: {
            lead: {
              select: {
                id: true,
                nome: true,
                telefone: true,
                stage: true,
                cidade: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        repasses: { orderBy: { createdAt: 'desc' } },
        eventos: { orderBy: { createdAt: 'desc' }, take: 40 },
      },
    });
    if (!row) throw new NotFoundException('Parceria não encontrada.');
    return row;
  }

  async convidar(dto: ConvidarParceiroDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const email = dto.email.toLowerCase().trim();
    let senhaTemporaria: string | undefined;
    let parceiro = await this.prisma.corretorParceiro.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!parceiro) {
      senhaTemporaria = this.auth.generateTempPassword();
      parceiro = await this.prisma.corretorParceiro.create({
        data: {
          email,
          nome: dto.nome.trim(),
          creci: dto.creci?.trim() ?? '',
          telefone: dto.telefone?.trim() ?? '',
          imobiliariaOrigem: dto.imobiliariaOrigem?.trim() ?? '',
          password: await this.auth.hashPassword(senhaTemporaria),
        },
      });
    }

    const existing = await this.prisma.parceria.findUnique({
      where: { tenantId_parceiroId: { tenantId, parceiroId: parceiro.id } },
    });
    if (existing && existing.status !== ParceriaStatus.encerrada) {
      throw new BadRequestException('Este corretor já tem parceria nesta imobiliária.');
    }

    const parceria = existing
      ? await this.prisma.parceria.update({
          where: { id: existing.id },
          data: {
            status: ParceriaStatus.convite,
            percentualParceiro: dto.percentualParceiro ?? 50,
            slaDias: dto.slaDias ?? 7,
            convidadoPorId: user.id,
            aceitoAt: null,
            encerradoAt: null,
          },
          include: INCLUDE_PARCERIA,
        })
      : await this.prisma.parceria.create({
          data: {
            tenantId,
            parceiroId: parceiro.id,
            percentualParceiro: dto.percentualParceiro ?? 50,
            slaDias: dto.slaDias ?? 7,
            convidadoPorId: user.id,
          },
          include: INCLUDE_PARCERIA,
        });

    await this.log(parceria.id, 'convite', `Convite enviado para ${email}.`);
    return { ...parceria, senhaTemporaria };
  }

  async update(id: string, dto: UpdateParceriaDto, user: AuthenticatedUser) {
    await this.get(id, user);
    const data: Record<string, unknown> = {};
    if (dto.percentualParceiro != null) data.percentualParceiro = dto.percentualParceiro;
    if (dto.podeVerEstoque != null) data.podeVerEstoque = dto.podeVerEstoque;
    if (dto.podeReceberLead != null) data.podeReceberLead = dto.podeReceberLead;
    if (dto.podeIndicar != null) data.podeIndicar = dto.podeIndicar;
    if (dto.slaDias != null) data.slaDias = dto.slaDias;
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === ParceriaStatus.encerrada) data.encerradoAt = new Date();
      if (dto.status === ParceriaStatus.ativa) data.aceitoAt = new Date();
    }
    const saved = await this.prisma.parceria.update({
      where: { id },
      data,
      include: INCLUDE_PARCERIA,
    });
    if (dto.status) {
      await this.log(id, 'status', `Status alterado para ${dto.status}.`);
    }
    return saved;
  }

  async listImoveisVitrine(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const rows = await this.prisma.imovel.findMany({
      where: { tenantId },
      select: {
        id: true,
        tipo: true,
        logradouro: true,
        numero: true,
        bairro: true,
        cidade: true,
        fotoUrl: true,
        liberadoParaParceria: true,
        _count: { select: { interessesParceria: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return rows;
  }

  async setImovelLiberado(
    imovelId: string,
    liberado: boolean,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const imovel = await this.prisma.imovel.findFirst({
      where: { id: imovelId, tenantId },
      select: { id: true },
    });
    if (!imovel) throw new NotFoundException('Imóvel não encontrado.');
    return this.prisma.imovel.update({
      where: { id: imovelId },
      data: { liberadoParaParceria: liberado },
      select: { id: true, liberadoParaParceria: true },
    });
  }

  async compartilharLead(
    parceriaId: string,
    leadId: string,
    user: AuthenticatedUser,
  ) {
    const parceria = await this.get(parceriaId, user);
    if (parceria.status !== ParceriaStatus.ativa) {
      throw new BadRequestException('A parceria precisa estar ativa.');
    }
    if (!parceria.podeReceberLead) {
      throw new ForbiddenException('Esta parceria não recebe leads.');
    }
    const tenantId = requireTenantId(user);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, perdidoAt: null },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parceria.slaDias);
    const row = await this.prisma.parceriaParticipacao.upsert({
      where: {
        parceriaId_leadId: { parceriaId, leadId },
      },
      create: {
        parceriaId,
        leadId,
        responsavelCasaId: user.id,
        status: ParceriaParticipacaoStatus.pendente,
        expiresAt,
      },
      update: {
        status: ParceriaParticipacaoStatus.pendente,
        expiresAt,
        aceitoAt: null,
        responsavelCasaId: user.id,
      },
    });
    await this.log(
      parceriaId,
      'lead',
      `Lead compartilhado com prazo até ${expiresAt.toLocaleDateString('pt-BR')}.`,
    );
    return row;
  }

  async createRepasse(
    parceriaId: string,
    dto: CreateRepasseDto,
    user: AuthenticatedUser,
  ) {
    await this.get(parceriaId, user);
    const status = (dto.status as ParceriaRepasseStatus | undefined) ??
      ParceriaRepasseStatus.prevista;
    const row = await this.prisma.parceriaRepasse.create({
      data: {
        parceriaId,
        descricao: dto.descricao.trim(),
        valor: dto.valor,
        status,
        pagoAt: status === ParceriaRepasseStatus.paga ? new Date() : null,
      },
    });
    await this.log(
      parceriaId,
      'repasse',
      `Repasse "${row.descricao}" (${status}).`,
    );
    return row;
  }

  minhasParcerias(session: PortalParceiroSession) {
    return this.prisma.parceria.findMany({
      where: { parceiroId: session.parceiroId },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async aceitar(parceriaId: string, session: PortalParceiroSession) {
    const row = await this.requireParceriaDoParceiro(parceriaId, session);
    if (row.status === ParceriaStatus.encerrada) {
      throw new BadRequestException('Esta parceria foi encerrada.');
    }
    const saved = await this.prisma.parceria.update({
      where: { id: parceriaId },
      data: { status: ParceriaStatus.ativa, aceitoAt: new Date() },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
    await this.log(parceriaId, 'aceite', 'Parceiro aceitou o convite.');
    return saved;
  }

  async vitrine(session: PortalParceiroSession, parceriaId?: string) {
    const parcerias = await this.ativas(session, parceriaId);
    const tenantIds = parcerias
      .filter((p) => p.podeVerEstoque)
      .map((p) => p.tenantId);
    if (tenantIds.length === 0) return [];
    const imoveis = await this.prisma.imovel.findMany({
      where: {
        tenantId: { in: tenantIds },
        liberadoParaParceria: true,
      },
      select: {
        id: true,
        tenantId: true,
        tipo: true,
        logradouro: true,
        numero: true,
        bairro: true,
        cidade: true,
        estado: true,
        descricao: true,
        fotoUrl: true,
        quartos: true,
        vagas: true,
        area: true,
        tenant: { select: { name: true } },
        vendaUsado: { select: { precoVenda: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return imoveis.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      imobiliaria: item.tenant.name,
      tipo: item.tipo,
      endereco: [item.logradouro, item.numero].filter(Boolean).join(', '),
      bairro: item.bairro,
      cidade: item.cidade,
      estado: item.estado,
      descricao: item.descricao,
      fotoUrl: item.fotoUrl,
      quartos: item.quartos,
      vagas: item.vagas,
      area: item.area,
      valor: item.vendaUsado?.precoVenda ?? null,
    }));
  }

  async registrarInteresse(
    session: PortalParceiroSession,
    imovelId: string,
    mensagem: string | undefined,
    parceriaId?: string,
  ) {
    const imovel = await this.prisma.imovel.findFirst({
      where: { id: imovelId, liberadoParaParceria: true },
      select: { id: true, tenantId: true },
    });
    if (!imovel) throw new NotFoundException('Imóvel não disponível.');
    const parceria = await this.prisma.parceria.findFirst({
      where: {
        parceiroId: session.parceiroId,
        tenantId: imovel.tenantId,
        status: ParceriaStatus.ativa,
        ...(parceriaId ? { id: parceriaId } : {}),
      },
    });
    if (!parceria?.podeVerEstoque) {
      throw new ForbiddenException('Sem parceria ativa para este imóvel.');
    }
    const row = await this.prisma.parceriaInteresse.upsert({
      where: {
        parceriaId_imovelId: { parceriaId: parceria.id, imovelId },
      },
      create: {
        parceriaId: parceria.id,
        imovelId,
        mensagem: mensagem?.trim() ?? '',
      },
      update: { mensagem: mensagem?.trim() ?? '' },
    });
    await this.log(parceria.id, 'interesse', 'Parceiro sinalizou interesse no imóvel.');
    return row;
  }

  async oportunidades(session: PortalParceiroSession, parceriaId?: string) {
    const parcerias = await this.ativas(session, parceriaId);
    const ids = parcerias.map((p) => p.id);
    if (ids.length === 0) return [];
    const now = new Date();
    const rows = await this.prisma.parceriaParticipacao.findMany({
      where: { parceriaId: { in: ids } },
      include: {
        lead: {
          select: {
            id: true,
            nome: true,
            telefone: true,
            email: true,
            cidade: true,
            bairro: true,
            stage: true,
            origem: true,
          },
        },
        parceria: { include: { tenant: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => {
      const expired =
        row.expiresAt && row.expiresAt < now && row.status === ParceriaParticipacaoStatus.pendente;
      const revelar =
        row.status === ParceriaParticipacaoStatus.ativa && !expired;
      return {
        id: row.id,
        parceriaId: row.parceriaId,
        imobiliaria: row.parceria.tenant.name,
        status: expired ? ParceriaParticipacaoStatus.expirada : row.status,
        expiresAt: row.expiresAt,
        lead: {
          id: row.lead.id,
          nome: row.lead.nome,
          cidade: row.lead.cidade,
          bairro: row.lead.bairro,
          stage: row.lead.stage,
          origem: row.lead.origem,
          telefone: revelar ? row.lead.telefone : null,
          email: revelar ? row.lead.email : null,
        },
      };
    });
  }

  async aceitarOportunidade(id: string, session: PortalParceiroSession) {
    const row = await this.prisma.parceriaParticipacao.findFirst({
      where: { id, parceria: { parceiroId: session.parceiroId } },
    });
    if (!row) throw new NotFoundException('Oportunidade não encontrada.');
    if (row.expiresAt && row.expiresAt < new Date()) {
      await this.prisma.parceriaParticipacao.update({
        where: { id },
        data: { status: ParceriaParticipacaoStatus.expirada },
      });
      throw new BadRequestException('O prazo desta oportunidade expirou.');
    }
    return this.prisma.parceriaParticipacao.update({
      where: { id },
      data: {
        status: ParceriaParticipacaoStatus.ativa,
        aceitoAt: new Date(),
      },
    });
  }

  async indicar(
    session: PortalParceiroSession,
    dto: IndicarClienteDto,
    parceriaId?: string,
  ) {
    let tenantId: string | undefined;
    if (dto.imovelId) {
      const imovel = await this.prisma.imovel.findFirst({
        where: { id: dto.imovelId, liberadoParaParceria: true },
        select: { tenantId: true },
      });
      tenantId = imovel?.tenantId;
    }
    const parcerias = await this.ativas(session, parceriaId);
    const parceria = tenantId
      ? parcerias.find((p) => p.tenantId === tenantId)
      : parcerias[0];
    if (!parceria?.podeIndicar) {
      throw new ForbiddenException('Sem permissão para indicar cliente.');
    }
    const placement = await this.funis.comercialPlacement(parceria.tenantId);
    const lead = await this.prisma.lead.create({
      data: {
        tenantId: parceria.tenantId,
        nome: dto.nome.trim(),
        telefone: dto.telefone.trim(),
        email: dto.email?.trim() ?? '',
        origem: 'Parceria',
        interesse: 'Comprar',
        cidade: '',
        bairro: '',
        stage: placement.stage,
        funilId: placement.funilId,
        corretorId: parceria.convidadoPorId,
      },
    });
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parceria.slaDias);
    await this.prisma.parceriaParticipacao.create({
      data: {
        parceriaId: parceria.id,
        leadId: lead.id,
        responsavelCasaId: parceria.convidadoPorId,
        status: ParceriaParticipacaoStatus.ativa,
        aceitoAt: new Date(),
        expiresAt,
      },
    });
    await this.log(
      parceria.id,
      'indicacao',
      `Parceiro indicou cliente ${dto.nome.trim()}.`,
    );
    return { ok: true, leadId: lead.id };
  }

  async extrato(session: PortalParceiroSession, parceriaId?: string) {
    const parcerias = await this.prisma.parceria.findMany({
      where: {
        parceiroId: session.parceiroId,
        ...(parceriaId ? { id: parceriaId } : {}),
      },
      select: { id: true },
    });
    const ids = parcerias.map((p) => p.id);
    if (ids.length === 0) return [];
    return this.prisma.parceriaRepasse.findMany({
      where: { parceriaId: { in: ids } },
      include: {
        parceria: { include: { tenant: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async ativas(session: PortalParceiroSession, parceriaId?: string) {
    return this.prisma.parceria.findMany({
      where: {
        parceiroId: session.parceiroId,
        status: ParceriaStatus.ativa,
        ...(parceriaId ? { id: parceriaId } : {}),
      },
    });
  }

  private async requireParceriaDoParceiro(
    parceriaId: string,
    session: PortalParceiroSession,
  ) {
    const row = await this.prisma.parceria.findFirst({
      where: { id: parceriaId, parceiroId: session.parceiroId },
    });
    if (!row) throw new NotFoundException('Parceria não encontrada.');
    return row;
  }

  private log(parceriaId: string, tipo: string, texto: string) {
    return this.prisma.parceriaEvento.create({
      data: { parceriaId, tipo, texto },
    });
  }
}
