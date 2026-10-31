import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PlatformContratoStatus,
  PlatformContratoTipo,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  isPlatformAdmin,
  PLATFORM_TENANT_ID,
} from '../common/utils/tenant';
import { PlatformContratosService } from '../platform-contratos/platform-contratos.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { ConverterLeadClienteDto } from './dto/converter-lead-cliente.dto';

/** Trava sem renovação depois deste prazo é tratada como processo morto. */
const LOCK_ABANDONADA_MS = 60_000;

const ASSINATURA_VALIDA: PlatformContratoStatus[] = [
  PlatformContratoStatus.proposta,
  PlatformContratoStatus.ativo,
  PlatformContratoStatus.atrasado,
  PlatformContratoStatus.suspenso,
];

type LeadRow = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cpf: string | null;
  perdidoAt: Date | null;
  convertedTenantId: string | null;
  conversionSlug: string | null;
  conversionLock: string | null;
  conversionLockedAt: Date | null;
};

export type ConversaoLeadResult = {
  alreadyConverted: boolean;
  tenantId: string;
  contratoId: string;
  temporaryPassword?: string;
  titulos: Array<{
    id: string;
    descricao: string;
    parcela: string;
    valor: number;
    vencimento: string;
    status: string;
    platformContratoId: string | null;
  }>;
};

@Injectable()
export class LeadConversaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly contratos: PlatformContratosService,
  ) {}

  async converter(
    leadId: string,
    dto: ConverterLeadClienteDto,
    requester: AuthenticatedUser,
  ): Promise<ConversaoLeadResult> {
    if (!isPlatformAdmin(requester)) {
      throw new ForbiddenException(
        'Apenas o super admin pode converter um lead em cliente.',
      );
    }
    this.assertCondicoes(dto);

    const lead = await this.loadLead(leadId);
    if (lead.perdidoAt) {
      throw new BadRequestException('Um lead perdido não pode ser convertido.');
    }
    if (lead.convertedTenantId) {
      return this.finish(lead, lead.convertedTenantId, dto, requester, true);
    }

    const lock = randomUUID();
    const slug = lead.conversionSlug ?? slugForLead(lead.nome, lead.id);
    const claimed = await this.claim(lead, lock, slug);
    if (!claimed) {
      return this.waitOrResume(lead.id, dto, requester);
    }

    let created: { tenantId: string; temporaryPassword?: string } | null = null;
    try {
      created = await this.ensureTenant(lead, slug, dto);
      const linked = await this.prisma.lead.updateMany({
        where: { id: lead.id, conversionLock: lock, convertedTenantId: null },
        data: {
          convertedTenantId: created.tenantId,
          convertedAt: new Date(),
          conversionLock: null,
          conversionLockedAt: null,
        },
      });
      if (linked.count === 0) {
        return this.waitOrResume(lead.id, dto, requester);
      }
      const result = await this.finish(
        { ...lead, convertedTenantId: created.tenantId },
        created.tenantId,
        dto,
        requester,
        false,
      );
      return created.temporaryPassword
        ? { ...result, temporaryPassword: created.temporaryPassword }
        : result;
    } catch (error) {
      await this.prisma.lead.updateMany({
        where: { id: lead.id, conversionLock: lock, convertedTenantId: null },
        data: { conversionLock: null, conversionLockedAt: null },
      });
      if (created?.temporaryPassword) {
        throw new HttpException(
          {
            message:
              `O cliente foi criado, mas a assinatura não foi gerada. Senha temporária do admin: ${created.temporaryPassword}. Tente converter de novo para concluir só a assinatura.`,
            tenantId: created.tenantId,
            temporaryPassword: created.temporaryPassword,
          },
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /** Grava slug e trava antes de criar o cliente. Retoma trava abandonada. */
  private async claim(lead: LeadRow, lock: string, slug: string) {
    const now = new Date();
    const fresh = await this.prisma.lead.updateMany({
      where: { id: lead.id, convertedTenantId: null, conversionLock: null },
      data: { conversionLock: lock, conversionLockedAt: now, conversionSlug: slug },
    });
    if (fresh.count === 1) return true;

    const current = await this.loadLead(lead.id);
    const abandoned =
      current.conversionLock &&
      current.conversionLockedAt &&
      now.getTime() - current.conversionLockedAt.getTime() > LOCK_ABANDONADA_MS;
    if (!abandoned || current.convertedTenantId) return false;

    const stolen = await this.prisma.lead.updateMany({
      where: {
        id: lead.id,
        convertedTenantId: null,
        conversionLock: current.conversionLock,
      },
      data: {
        conversionLock: lock,
        conversionLockedAt: now,
        conversionSlug: current.conversionSlug ?? slug,
      },
    });
    return stolen.count === 1;
  }

  private assertCondicoes(dto: ConverterLeadClienteDto) {
    if (!dto.plano) {
      throw new BadRequestException(
        'Informe o plano acordado (solo, bronze, prata ou ouro).',
      );
    }
    if (!(dto.valorAdesao > 0) || !(dto.valorMensalidade > 0)) {
      throw new BadRequestException(
        'Informe o valor de adesão e a mensalidade acordados. A conversão não assume preço de tabela.',
      );
    }
    if (!dto.qtdMensalidades || dto.qtdMensalidades < 1) {
      throw new BadRequestException('Informe a quantidade de mensalidades.');
    }
    if (!dto.dataInicio || !dto.vencimento) {
      throw new BadRequestException(
        'Informe a data de início e o vencimento acordados.',
      );
    }
  }

  private async loadLead(leadId: string): Promise<LeadRow> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: PLATFORM_TENANT_ID },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        cpf: true,
        perdidoAt: true,
        convertedTenantId: true,
        conversionSlug: true,
        conversionLock: true,
        conversionLockedAt: true,
      },
    });
    if (!lead) {
      throw new NotFoundException(
        'Lead comercial da plataforma não encontrado.',
      );
    }
    return lead;
  }

  private async waitOrResume(
    leadId: string,
    dto: ConverterLeadClienteDto,
    requester: AuthenticatedUser,
  ): Promise<ConversaoLeadResult> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const current = await this.loadLead(leadId);
      if (current.convertedTenantId) {
        return this.finish(current, current.convertedTenantId, dto, requester, true);
      }
      if (!current.conversionLock) {
        return this.converter(leadId, dto, requester);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new ConflictException(
      'A conversão deste lead já está em andamento. Tente novamente em instantes.',
    );
  }

  private async ensureTenant(
    lead: LeadRow,
    slug: string,
    dto: ConverterLeadClienteDto,
  ): Promise<{ tenantId: string; temporaryPassword?: string }> {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing) return { tenantId: existing.id };

    const created = await this.tenants.create({
      name: lead.nome.trim(),
      slug,
      plano: dto.plano,
      documento: lead.cpf ?? undefined,
    });
    return { tenantId: created.id, temporaryPassword: created.temporaryPassword };
  }

  private async finish(
    lead: LeadRow,
    tenantId: string,
    dto: ConverterLeadClienteDto,
    requester: AuthenticatedUser,
    alreadyConverted: boolean,
  ): Promise<ConversaoLeadResult> {
    const existente = await this.prisma.platformContrato.findFirst({
      where: {
        tenantId,
        tipo: PlatformContratoTipo.assinatura,
        status: { in: ASSINATURA_VALIDA },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existente) {
      return {
        alreadyConverted: true,
        tenantId,
        contratoId: existente.id,
        titulos: await this.titulosDoContrato(existente.id),
      };
    }

    const lock = randomUUID();
    const claimed = await this.prisma.lead.updateMany({
      where: { id: lead.id, convertedTenantId: tenantId, conversionLock: null },
      data: { conversionLock: lock, conversionLockedAt: new Date() },
    });
    if (claimed.count === 0) {
      return this.waitContrato(lead, tenantId, dto, requester);
    }

    try {
      const criado = await this.contratos.createComTitulos(
        {
          tenantId,
          titulo: `Assinatura ${lead.nome.trim()}`,
          tipo: PlatformContratoTipo.assinatura,
          plano: dto.plano,
          valorAdesao: dto.valorAdesao,
          qtdParcelasAdesao: dto.qtdParcelasAdesao,
          valorMensalidade: dto.valorMensalidade,
          qtdMensalidades: dto.qtdMensalidades,
          dataInicio: dto.dataInicio,
          vencimento: dto.vencimento,
          status: PlatformContratoStatus.ativo,
          observacao: dto.observacao,
          parceiroNome: lead.nome.trim(),
        },
        requester,
      );
      await this.prisma.lead.updateMany({
        where: { id: lead.id, conversionLock: lock },
        data: { conversionLock: null, conversionLockedAt: null },
      });
      return {
        alreadyConverted,
        tenantId,
        contratoId: criado.id,
        titulos: criado.titulos,
      };
    } catch (error) {
      await this.prisma.lead.updateMany({
        where: { id: lead.id, conversionLock: lock },
        data: { conversionLock: null, conversionLockedAt: null },
      });
      throw error;
    }
  }

  private async waitContrato(
    lead: LeadRow,
    tenantId: string,
    dto: ConverterLeadClienteDto,
    requester: AuthenticatedUser,
  ): Promise<ConversaoLeadResult> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const contrato = await this.prisma.platformContrato.findFirst({
        where: {
          tenantId,
          tipo: PlatformContratoTipo.assinatura,
          status: { in: ASSINATURA_VALIDA },
        },
        select: { id: true },
      });
      if (contrato) {
        return {
          alreadyConverted: true,
          tenantId,
          contratoId: contrato.id,
          titulos: await this.titulosDoContrato(contrato.id),
        };
      }
      const current = await this.loadLead(lead.id);
      if (!current.conversionLock) {
        return this.finish(current, tenantId, dto, requester, true);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new ConflictException(
      'A assinatura deste cliente está sendo gerada. Tente novamente em instantes.',
    );
  }

  private async titulosDoContrato(contratoId: string) {
    const rows = await this.prisma.financeiroTitulo.findMany({
      where: { platformContratoId: contratoId, tenantId: PLATFORM_TENANT_ID },
      orderBy: { vencimento: 'asc' },
    });
    return rows.map((t) => ({
      id: t.id,
      descricao: t.descricao,
      parcela: t.parcela,
      valor: t.valor,
      vencimento: t.vencimento.toISOString().slice(0, 10),
      status: t.status,
      platformContratoId: t.platformContratoId,
    }));
  }
}

function slugForLead(nome: string, leadId: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = leadId.replace(/-/g, '').slice(0, 8);
  return `${base || 'cliente'}-${suffix}`.slice(0, 80);
}
