import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinanceiroTituloStatus,
  FinanceiroTituloTipo,
  PlatformContratoStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { PLATFORM_TENANT_ID } from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { BaixarParcelaDto } from './dto/baixar-parcela.dto';
import { CreatePlatformContratoComTitulosDto } from './dto/create-platform-contrato-com-titulos.dto';
import { CreatePlatformContratoDto } from './dto/create-platform-contrato.dto';
import { UpdatePlatformContratoDto } from './dto/update-platform-contrato.dto';

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const dim = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const day = Math.min(d || 1, dim);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function dividirValor(valor: number, quantidade: number): number[] {
  const centavos = Math.round(valor * 100);
  const base = Math.floor(centavos / quantidade);
  const resto = centavos - base * quantidade;
  return Array.from(
    { length: quantidade },
    (_, index) => (base + (index < resto ? 1 : 0)) / 100,
  );
}

const BRASIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function isoDateOnly(d: Date): string {
  const brasil = new Date(d.getTime() - BRASIL_UTC_OFFSET_MS);
  const y = brasil.getUTCFullYear();
  const m = String(brasil.getUTCMonth() + 1).padStart(2, '0');
  const day = String(brasil.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDayStart(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + BRASIL_UTC_OFFSET_MS);
}

const contratoInclude = {
  tenant: { select: { id: true, name: true, slug: true, plano: true } },
  parcelas: { orderBy: { numero: 'asc' as const } },
} satisfies Prisma.PlatformContratoInclude;

@Injectable()
export class PlatformContratosService {
  constructor(private readonly prisma: PrismaService) {}

  list(requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    return this.prisma.platformContrato
      .findMany({
        where: { tenantId: { not: PLATFORM_TENANT_ID } },
        include: contratoInclude,
        orderBy: { createdAt: 'desc' },
      })
      .then((rows) => rows.map((r) => this.mapContrato(r)));
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    const row = await this.prisma.platformContrato.findUnique({
      where: { id },
      include: contratoInclude,
    });
    if (!row || row.tenantId === PLATFORM_TENANT_ID) {
      throw new NotFoundException('Contrato não encontrado.');
    }
    return this.mapContrato(row);
  }

  async create(dto: CreatePlatformContratoDto, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    await this.ensureTenant(dto.tenantId);
    if (dto.tipo === 'assinatura' && !dto.plano) {
      throw new BadRequestException(
        'Informe o plano da assinatura (solo, bronze, prata ou ouro).',
      );
    }

    const codigo = await this.nextCodigo();
    const parcelas = dto.parcelas ?? [];
    const valorAdesao = dto.valorAdesao ?? 0;
    const valorMensalidade = dto.valorMensalidade ?? 0;

    const row = await this.prisma.platformContrato.create({
      data: {
        tenantId: dto.tenantId,
        codigo,
        titulo: dto.titulo.trim(),
        tipo: dto.tipo,
        plano: dto.tipo === 'assinatura' ? (dto.plano ?? null) : null,
        valor: dto.valor,
        valorAdesao,
        valorMensalidade,
        dataInicio: parseDayStart(dto.dataInicio),
        vencimento: dto.vencimento ? parseDayStart(dto.vencimento) : null,
        status: dto.status ?? PlatformContratoStatus.proposta,
        observacao: dto.observacao?.trim() || '',
        parcelas:
          parcelas.length > 0
            ? {
                create: parcelas.map((p) => ({
                  numero: p.numero,
                  valor: p.valor,
                  vencimento: parseDayStart(p.vencimento),
                })),
              }
            : undefined,
      },
      include: contratoInclude,
    });
    return this.mapContrato(row);
  }

  /**
   * Cria contrato + parcelas de adesão + mensalidades no financeiro da plataforma.
   */
  async createComTitulos(
    dto: CreatePlatformContratoComTitulosDto,
    requester: AuthenticatedUser,
  ) {
    this.assertSuperAdmin(requester);
    await this.ensureTenant(dto.tenantId);
    if (dto.tipo === 'assinatura' && !dto.plano) {
      throw new BadRequestException(
        'Informe o plano da assinatura (solo, bronze, prata ou ouro).',
      );
    }

    const valorAdesao = dto.valorAdesao;
    const valorMensalidade = dto.valorMensalidade;
    const qtdAdesao = dto.qtdParcelasAdesao ?? 1;
    const qtdMensalidades = dto.qtdMensalidades;
    const parcelasAdesao = dividirValor(valorAdesao, qtdAdesao);
    const valorTotal = valorAdesao + valorMensalidade * qtdMensalidades;
    const vencimentoBase = dto.vencimento.slice(0, 10);
    const categoria = dto.categoria?.trim() || 'Assinatura';
    const parceiroNome =
      dto.parceiroNome?.trim() ||
      (await this.resolveParceiroNome(dto.parceiroId));
    const codigo = await this.nextCodigo();
    const grupoParcelasId = randomUUID();

    const parcelasContrato = [
      ...parcelasAdesao.map((valor, i) => ({
        numero: i + 1,
        valor,
        vencimento: parseDayStart(addMonthsIso(vencimentoBase, i)),
      })),
      ...Array.from({ length: qtdMensalidades }, (_, i) => ({
        numero: qtdAdesao + i + 1,
        valor: valorMensalidade,
        vencimento: parseDayStart(addMonthsIso(vencimentoBase, i)),
      })),
    ];

    const result = await this.prisma.$transaction(async (tx) => {
      const contrato = await tx.platformContrato.create({
        data: {
          tenantId: dto.tenantId,
          codigo,
          titulo: dto.titulo.trim(),
          tipo: dto.tipo,
          plano: dto.tipo === 'assinatura' ? (dto.plano ?? null) : null,
          valor: valorTotal,
          valorAdesao,
          valorMensalidade,
          dataInicio: parseDayStart(dto.dataInicio),
          vencimento: parseDayStart(vencimentoBase),
          status: dto.status ?? PlatformContratoStatus.ativo,
          observacao: dto.observacao?.trim() || '',
          parcelas: { create: parcelasContrato },
        },
        include: contratoInclude,
      });

      const titulosData = [
        ...parcelasAdesao.map((valor, i) => ({
          tenantId: PLATFORM_TENANT_ID,
          tipo: FinanceiroTituloTipo.receber,
          descricao: `${dto.titulo.trim()} — Adesão`,
          parceiroId: dto.parceiroId || null,
          parceiroNome,
          categoria,
          centro: '',
          vencimento: parseDayStart(addMonthsIso(vencimentoBase, i)),
          valor,
          status: FinanceiroTituloStatus.aberto,
          parcela:
            qtdAdesao === 1 ? 'Adesão' : `Adesão ${i + 1}/${qtdAdesao}`,
          grupoParcelasId,
          platformContratoId: contrato.id,
        })),
        ...Array.from({ length: qtdMensalidades }, (_, i) => ({
          tenantId: PLATFORM_TENANT_ID,
          tipo: FinanceiroTituloTipo.receber,
          descricao: `${dto.titulo.trim()} — Mensalidade`,
          parceiroId: dto.parceiroId || null,
          parceiroNome,
          categoria,
          centro: '',
          vencimento: parseDayStart(addMonthsIso(vencimentoBase, i)),
          valor: valorMensalidade,
          status: FinanceiroTituloStatus.aberto,
          parcela: `Mensalidade ${i + 1}/${qtdMensalidades}`,
          grupoParcelasId,
          platformContratoId: contrato.id,
        })),
      ];

      await tx.financeiroTitulo.createMany({ data: titulosData });

      const titulos = await tx.financeiroTitulo.findMany({
        where: { grupoParcelasId },
        orderBy: { vencimento: 'asc' },
      });

      return { contrato, titulos };
    });

    return {
      ...this.mapContrato(result.contrato),
      grupoParcelasId,
      titulos: result.titulos.map((t) => ({
        id: t.id,
        descricao: t.descricao,
        parcela: t.parcela,
        valor: t.valor,
        vencimento: isoDateOnly(t.vencimento),
        status: t.status,
        platformContratoId: t.platformContratoId,
      })),
    };
  }

  async update(
    id: string,
    dto: UpdatePlatformContratoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertSuperAdmin(requester);
    const existing = await this.findRawOrFail(id);
    if (dto.tenantId) await this.ensureTenant(dto.tenantId);

    const tipo = dto.tipo ?? existing.tipo;
    const plano =
      dto.plano !== undefined
        ? dto.plano
        : tipo === 'assinatura'
          ? existing.plano
          : null;
    if (tipo === 'assinatura' && !plano) {
      throw new BadRequestException(
        'Informe o plano da assinatura (solo, bronze, prata ou ouro).',
      );
    }

    const hasPaidParcela = existing.parcelas.some(
      (p) => p.status === FinanceiroTituloStatus.pago,
    );
    if (dto.parcelas && hasPaidParcela) {
      throw new BadRequestException(
        'Não é possível redefinir parcelas: já há parcelas pagas.',
      );
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.parcelas) {
        await tx.platformContratoParcela.deleteMany({
          where: { contratoId: id },
        });
      }
      return tx.platformContrato.update({
        where: { id },
        data: {
          ...(dto.tenantId !== undefined ? { tenantId: dto.tenantId } : {}),
          ...(dto.titulo !== undefined ? { titulo: dto.titulo.trim() } : {}),
          ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
          plano: tipo === 'assinatura' ? plano : null,
          ...(dto.valor !== undefined ? { valor: dto.valor } : {}),
          ...(dto.valorAdesao !== undefined
            ? { valorAdesao: dto.valorAdesao }
            : {}),
          ...(dto.valorMensalidade !== undefined
            ? { valorMensalidade: dto.valorMensalidade }
            : {}),
          ...(dto.dataInicio !== undefined
            ? { dataInicio: parseDayStart(dto.dataInicio) }
            : {}),
          ...(dto.vencimento !== undefined
            ? {
                vencimento: dto.vencimento
                  ? parseDayStart(dto.vencimento)
                  : null,
              }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.observacao !== undefined
            ? { observacao: dto.observacao.trim() }
            : {}),
          ...(dto.parcelas
            ? {
                parcelas: {
                  create: dto.parcelas.map((p) => ({
                    numero: p.numero,
                    valor: p.valor,
                    vencimento: parseDayStart(p.vencimento),
                  })),
                },
              }
            : {}),
        },
        include: contratoInclude,
      });
    });
    return this.mapContrato(row);
  }

  async remove(id: string, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    await this.findRawOrFail(id);
    await this.prisma.platformContrato.delete({ where: { id } });
    return { ok: true };
  }

  async baixarParcela(
    contratoId: string,
    parcelaId: string,
    dto: BaixarParcelaDto,
    requester: AuthenticatedUser,
  ) {
    this.assertSuperAdmin(requester);
    await this.findRawOrFail(contratoId);
    const parcela = await this.prisma.platformContratoParcela.findFirst({
      where: { id: parcelaId, contratoId },
    });
    if (!parcela) throw new NotFoundException('Parcela não encontrada.');
    if (parcela.status === FinanceiroTituloStatus.pago) {
      throw new BadRequestException('Parcela já está paga.');
    }
    if (parcela.status === FinanceiroTituloStatus.cancelado) {
      throw new BadRequestException('Parcela cancelada.');
    }

    await this.prisma.platformContratoParcela.update({
      where: { id: parcelaId },
      data: {
        status: FinanceiroTituloStatus.pago,
        dataPagamento: parseDayStart(dto.dataPagamento),
        formaPagamento: dto.formaPagamento?.trim() || '',
      },
    });
    return this.findOne(contratoId, requester);
  }

  private async nextCodigo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CONT-${year}-`;
    const last = await this.prisma.platformContrato.findFirst({
      where: { codigo: { startsWith: prefix } },
      orderBy: { codigo: 'desc' },
      select: { codigo: true },
    });
    const seq = last ? Number(last.codigo.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async ensureTenant(tenantId: string) {
    if (tenantId === PLATFORM_TENANT_ID) {
      throw new BadRequestException(
        'Selecione uma imobiliária cliente (não o tenant interno).',
      );
    }
    const count = await this.prisma.tenant.count({ where: { id: tenantId } });
    if (count === 0) throw new NotFoundException('Imobiliária não encontrada.');
  }

  private async resolveParceiroNome(parceiroId?: string) {
    if (!parceiroId) return '';
    const p = await this.prisma.financeiroParceiro.findFirst({
      where: { id: parceiroId, tenantId: PLATFORM_TENANT_ID },
      select: { nome: true },
    });
    return p?.nome ?? '';
  }

  private async findRawOrFail(id: string) {
    const row = await this.prisma.platformContrato.findUnique({
      where: { id },
      include: { parcelas: true },
    });
    if (!row || row.tenantId === PLATFORM_TENANT_ID) {
      throw new NotFoundException('Contrato não encontrado.');
    }
    return row;
  }

  private mapContrato(
    row: Prisma.PlatformContratoGetPayload<{ include: typeof contratoInclude }>,
  ) {
    const parcelas = row.parcelas.map((p) => ({
      id: p.id,
      numero: p.numero,
      valor: p.valor,
      vencimento: isoDateOnly(p.vencimento),
      status: p.status,
      dataPagamento: p.dataPagamento ? isoDateOnly(p.dataPagamento) : null,
      formaPagamento: p.formaPagamento,
    }));
    const pago = parcelas
      .filter((p) => p.status === 'pago')
      .reduce((s, p) => s + p.valor, 0);
    const aberto = parcelas
      .filter((p) => p.status === 'aberto' || p.status === 'atrasado')
      .reduce((s, p) => s + p.valor, 0);

    return {
      id: row.id,
      codigo: row.codigo,
      titulo: row.titulo,
      tipo: row.tipo,
      plano: row.plano,
      valor: row.valor,
      valorAdesao: row.valorAdesao,
      valorMensalidade: row.valorMensalidade,
      dataInicio: isoDateOnly(row.dataInicio),
      vencimento: row.vencimento ? isoDateOnly(row.vencimento) : null,
      status: row.status,
      observacao: row.observacao,
      tenantId: row.tenantId,
      tenantNome: row.tenant.name,
      tenantSlug: row.tenant.slug,
      tenantPlano: row.tenant.plano,
      parcelas,
      qtdParcelas: parcelas.length,
      valorPago: pago,
      valorAberto: aberto,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private assertSuperAdmin(requester: AuthenticatedUser) {
    if (requester.role !== Role.super_admin) {
      throw new ForbiddenException(
        'Contratos da plataforma são exclusivos do super admin.',
      );
    }
  }
}
