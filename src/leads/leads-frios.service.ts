import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContatoTipo, Prisma, Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { isCorretorLike } from '../common/utils/roles';
import { requireTenantId } from '../common/utils/tenant';
import { FunisService } from '../funis/funis.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImportLeadsFriosDto, LeadFrioIdsDto } from './dto/leads-frios.dto';
import { leadSelect } from './lead-select';

const frioSelect = {
  ...leadSelect,
} satisfies Prisma.LeadSelect;

@Injectable()
export class LeadsFriosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly funis: FunisService,
  ) {}

  list(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    return this.prisma.lead.findMany({
      where: {
        tenantId,
        baseFria: true,
        perdidoAt: null,
        tipo: ContatoTipo.lead,
      },
      select: frioSelect,
      orderBy: { baseFriaEm: 'asc' },
      take: 500,
    });
  }

  async importRows(dto: ImportLeadsFriosDto, requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.super_admin &&
      requester.role !== Role.gerente
    ) {
      throw new ForbiddenException('Só a gestão envia planilha para a base fria.');
    }
    const tenantId = requireTenantId(requester);
    const placement = await this.funis.comercialPlacement(tenantId);
    const now = new Date();
    let created = 0;
    for (const row of dto.rows) {
      const telefone = row.telefone.trim();
      const digits = telefone.replace(/\D/g, '');
      if (digits.length < 8) continue;
      const email =
        row.email?.trim().toLowerCase() ||
        `contato.${digits}@sem-email.local`;
      await this.prisma.lead.create({
        data: {
          tenantId,
          tipo: ContatoTipo.lead,
          nome: row.nome.trim(),
          telefone,
          email,
          origem: row.origem?.trim() || 'Base fria',
          interesse: 'Comprar',
          cidade: row.cidade?.trim() || '',
          bairro: row.bairro?.trim() || '',
          stage: placement.stage,
          funilId: placement.funilId,
          prioridade: 'Média',
          corretorId: null,
          equipeId: null,
          baseFria: true,
          origemBaseFria: true,
          baseFriaEm: now,
          stageEnteredAt: now,
          lastMovementAt: now,
        },
      });
      created += 1;
    }
    if (created === 0) {
      throw new BadRequestException('Nenhum lead válido na planilha.');
    }
    return { created };
  }

  async puxar(dto: LeadFrioIdsDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const corretorId = requester.id;
    const updated = await this.prisma.lead.updateMany({
      where: {
        tenantId,
        id: { in: dto.ids },
        baseFria: true,
        perdidoAt: null,
      },
      data: {
        baseFria: false,
        origemBaseFria: true,
        baseFriaEm: null,
        corretorId,
        equipeId: null,
        lastMovementAt: new Date(),
      },
    });
    return { updated: updated.count };
  }

  async devolver(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId, tipo: ContatoTipo.lead },
      select: { id: true, corretorId: true, baseFria: true, origemBaseFria: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    if (!lead.origemBaseFria) {
      throw new BadRequestException(
        'Só um lead que veio da base fria pode voltar para ela.',
      );
    }
    const gestor =
      requester.role === Role.admin ||
      requester.role === Role.super_admin ||
      requester.role === Role.gerente;
    if (!gestor && lead.corretorId !== requester.id) {
      throw new ForbiddenException('Só o corretor deste lead pode devolvê-lo.');
    }
    if (lead.baseFria) {
      throw new BadRequestException('Este lead já está na base fria.');
    }
    if (isCorretorLike(requester.role) && lead.corretorId !== requester.id) {
      throw new ForbiddenException('Só o corretor deste lead pode devolvê-lo.');
    }
    const now = new Date();
    return this.prisma.lead.update({
      where: { id },
      data: {
        baseFria: true,
        origemBaseFria: true,
        baseFriaEm: now,
        corretorId: null,
        equipeId: null,
        perdidoAt: null,
        motivoPerda: null,
        perdidoPorId: null,
        lastMovementAt: now,
      },
      select: frioSelect,
    });
  }

  async apagar(dto: LeadFrioIdsDto, requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.super_admin
    ) {
      throw new ForbiddenException('Só o administrador apaga leads da base fria.');
    }
    const tenantId = requireTenantId(requester);
    const result = await this.prisma.lead.deleteMany({
      where: {
        tenantId,
        id: { in: dto.ids },
        baseFria: true,
      },
    });
    return { deleted: result.count };
  }
}
