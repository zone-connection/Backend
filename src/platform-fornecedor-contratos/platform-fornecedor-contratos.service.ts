import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FinanceiroTituloStatus,
  FinanceiroTituloTipo,
  Role,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveFinanceiroTenantId } from '../common/utils/tenant';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlatformFornecedorContratoDto } from './dto/create-platform-fornecedor-contrato.dto';

function addMonths(iso: string, months: number) {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}

function splitValue(value: number, count: number) {
  const cents = Math.round(value * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, index) =>
    (base + (index < remainder ? 1 : 0)) / 100,
  );
}

@Injectable()
export class PlatformFornecedorContratosService {
  constructor(private readonly prisma: PrismaService) {}

  async createComTitulos(
    dto: CreatePlatformFornecedorContratoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const tituloTipo =
      dto.tipo === FinanceiroTituloTipo.receber
        ? FinanceiroTituloTipo.receber
        : FinanceiroTituloTipo.pagar;

    const parceiro = await this.prisma.financeiroParceiro.findFirst({
      where: { id: dto.parceiroId, tenantId, ativo: true },
    });
    if (!parceiro) {
      throw new NotFoundException(
        tituloTipo === FinanceiroTituloTipo.receber
          ? 'Parceiro não encontrado.'
          : 'Fornecedor não encontrado.',
      );
    }

    const adesaoCount = dto.valorAdesao > 0 ? dto.qtdParcelasAdesao ?? 1 : 0;
    const adhesionValues = adesaoCount ? splitValue(dto.valorAdesao, adesaoCount) : [];
    const vencimento = dto.vencimento.slice(0, 10);
    const grupoParcelasId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const contrato = await tx.platformFornecedorContrato.create({
        data: {
          codigo: `FOR-${Date.now()}`,
          titulo: dto.titulo.trim(),
          parceiroId: parceiro.id,
          centro: dto.centro.trim(),
          valorAdesao: dto.valorAdesao,
          valorMensalidade: dto.valorMensalidade,
          qtdMensalidades: dto.qtdMensalidades,
          dataInicio: new Date(dto.dataInicio),
          vencimento: new Date(vencimento),
          observacao: dto.observacao?.trim() ?? '',
        },
      });

      const parcelas = [
        ...adhesionValues.map((valor, index) => ({
          numero: index + 1,
          descricao: 'Adesão',
          valor,
          vencimento: new Date(addMonths(vencimento, index)),
        })),
        ...Array.from({ length: dto.qtdMensalidades }, (_, index) => ({
          numero: adesaoCount + index + 1,
          descricao: 'Mensalidade',
          valor: dto.valorMensalidade,
          vencimento: new Date(addMonths(vencimento, index)),
        })),
      ];

      await tx.platformFornecedorContratoParcela.createMany({
        data: parcelas.map((parcela) => ({ ...parcela, contratoId: contrato.id })),
      });
      const categoria = dto.centro.trim();
      await tx.financeiroTitulo.createMany({
        data: parcelas.map((parcela) => ({
          tenantId,
          tipo: tituloTipo,
          descricao: `${dto.titulo.trim()} — ${parcela.descricao}`,
          parceiroId: parceiro.id,
          parceiroNome: parceiro.nome,
          categoria,
          centro: tituloTipo === FinanceiroTituloTipo.pagar ? categoria : '',
          vencimento: parcela.vencimento,
          valor: parcela.valor,
          status: FinanceiroTituloStatus.aberto,
          parcela: `${parcela.descricao} ${parcela.numero}/${parcelas.length}`,
          grupoParcelasId,
          platformFornecedorContratoId: contrato.id,
        })),
      });
      return contrato;
    });
  }

  list(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    return this.prisma.platformFornecedorContrato.findMany({
      where: { parceiro: { tenantId } },
      include: { parceiro: true, parcelas: { orderBy: { numero: 'asc' } } },
      orderBy: { vencimento: 'asc' },
    });
  }

  private assertAccess(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.super_admin
    ) {
      throw new ForbiddenException(
        'Somente administradores gerenciam contratos financeiros.',
      );
    }
  }
}
