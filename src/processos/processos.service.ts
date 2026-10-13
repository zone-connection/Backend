import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ProcessoRetornoResultado,
  ProcessoStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { isCorretorLike } from '../common/utils/roles';
import {
  CreateProcessoDto,
  RetornoProcessoDto,
  UpdateProcessoDto,
} from './dto/create-processo.dto';

const include = {
  lead: { select: { id: true, nome: true, tipo: true } },
  autor: { select: { id: true, name: true } },
  corretor: { select: { id: true, name: true } },
  gerente: { select: { id: true, name: true } },
  empreendimento: { select: { id: true, nome: true } },
  retornos: {
    orderBy: { createdAt: 'desc' as const },
    include: { autor: { select: { id: true, name: true } } },
  },
};

@Injectable()
export class ProcessosService {
  constructor(private readonly prisma: PrismaService) {}

  private isGestor(user: AuthenticatedUser) {
    const role = String(user.role);
    return (
      role === Role.admin ||
      role === Role.gerente ||
      role === Role.super_admin
    );
  }

  private whereMine(tenantId: string, user: AuthenticatedUser) {
    if (this.isGestor(user)) return { tenantId };
    return {
      tenantId,
      OR: [{ autorId: user.id }, { corretorId: user.id }],
    };
  }

  async list(user: AuthenticatedUser, status?: ProcessoStatus) {
    const tenantId = requireTenantId(user);
    return this.prisma.processo.findMany({
      where: {
        ...this.whereMine(tenantId, user),
        ...(status ? { status } : {}),
      },
      include,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const row = await this.prisma.processo.findFirst({
      where: { id, ...this.whereMine(tenantId, user) },
      include,
    });
    if (!row) throw new NotFoundException('Processo não encontrado.');
    return row;
  }

  async create(dto: CreateProcessoDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, tenantId },
      include: {
        equipe: { select: { gerenteId: true } },
        empreendimento: { select: { id: true } },
      },
    });
    if (!lead) throw new NotFoundException('Lead ou cliente não encontrado.');
    if (isCorretorLike(user.role) && lead.corretorId && lead.corretorId !== user.id) {
      throw new ForbiddenException('Você só pode abrir processo da sua carteira.');
    }
    return this.prisma.processo.create({
      data: {
        tenantId,
        leadId: lead.id,
        autorId: user.id,
        nome: dto.nome?.trim() || lead.nome,
        fonte: dto.fonte?.trim() || lead.origem || '',
        telefone: dto.telefone?.trim() || lead.telefone || '',
        email: dto.email?.trim() || lead.email || '',
        estadoCivil: dto.estadoCivil?.trim() || lead.estadoCivil || '',
        tipoRenda: dto.tipoRenda?.trim() || lead.tipoRenda || '',
        cotista: dto.cotista ?? false,
        dependente: dto.dependente ?? false,
        empreendimentoId:
          dto.empreendimentoId ?? lead.empreendimentoId ?? null,
        corretorId: dto.corretorId ?? lead.corretorId ?? user.id,
        gerenteId: dto.gerenteId ?? lead.equipe?.gerenteId ?? null,
      },
      include,
    });
  }

  async update(id: string, dto: UpdateProcessoDto, user: AuthenticatedUser) {
    const row = await this.findOne(id, user);
    if (row.status !== ProcessoStatus.rascunho && row.status !== ProcessoStatus.reprovado) {
      throw new BadRequestException(
        'Este processo já foi enviado. Aguarde o retorno ou abra outro.',
      );
    }
    if (!this.isGestor(user) && row.autorId !== user.id && row.corretorId !== user.id) {
      throw new ForbiddenException('Sem permissão para editar.');
    }
    return this.prisma.processo.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.fonte !== undefined ? { fonte: dto.fonte.trim() } : {}),
        ...(dto.telefone !== undefined ? { telefone: dto.telefone.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email.trim() } : {}),
        ...(dto.estadoCivil !== undefined
          ? { estadoCivil: dto.estadoCivil.trim() }
          : {}),
        ...(dto.tipoRenda !== undefined ? { tipoRenda: dto.tipoRenda.trim() } : {}),
        ...(dto.cotista !== undefined ? { cotista: dto.cotista } : {}),
        ...(dto.dependente !== undefined ? { dependente: dto.dependente } : {}),
        ...(dto.empreendimentoId !== undefined
          ? { empreendimentoId: dto.empreendimentoId }
          : {}),
        ...(dto.corretorId !== undefined ? { corretorId: dto.corretorId } : {}),
        ...(dto.gerenteId !== undefined ? { gerenteId: dto.gerenteId } : {}),
      },
      include,
    });
  }

  async enviar(id: string, user: AuthenticatedUser) {
    const row = await this.findOne(id, user);
    if (!this.isGestor(user) && row.autorId !== user.id && row.corretorId !== user.id) {
      throw new ForbiddenException('Sem permissão para enviar.');
    }
    if (
      row.status !== ProcessoStatus.rascunho &&
      row.status !== ProcessoStatus.reprovado
    ) {
      throw new BadRequestException('Este processo já foi enviado.');
    }
    return this.prisma.processo.update({
      where: { id },
      data: { status: ProcessoStatus.enviado, enviadoAt: new Date() },
      include,
    });
  }

  async retornar(id: string, dto: RetornoProcessoDto, user: AuthenticatedUser) {
    if (!this.isGestor(user)) {
      throw new ForbiddenException(
        'Apenas gerente ou administrador podem dar retorno.',
      );
    }
    const row = await this.findOne(id, user);
    if (row.status !== ProcessoStatus.enviado) {
      throw new BadRequestException('Só é possível retornar um processo enviado.');
    }
    const resultado =
      dto.resultado === 'aprovado'
        ? ProcessoRetornoResultado.aprovado
        : ProcessoRetornoResultado.reprovado;
    await this.prisma.processoRetorno.create({
      data: {
        processoId: id,
        autorId: user.id,
        resultado,
        texto: dto.texto?.trim() || '',
        arquivoId: dto.arquivoId ?? null,
      },
    });
    return this.prisma.processo.update({
      where: { id },
      data: {
        status:
          resultado === ProcessoRetornoResultado.aprovado
            ? ProcessoStatus.aprovado
            : ProcessoStatus.reprovado,
      },
      include,
    });
  }
}
