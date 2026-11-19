import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { resolveFinanceiroTenantId } from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { buildContrachequePdf } from './contracheque-pdf';
import {
  CreateFuncionarioDto,
  LancamentoDto,
  UpdateFuncionarioDto,
} from './dto/funcionario.dto';

export type Lancamento = {
  codigo?: string;
  descricao: string;
  referencia?: string;
  valor: number;
};

const STAFF_ROLES: Role[] = [Role.admin, Role.financeiro, Role.super_admin];

function assertStaff(user: AuthenticatedUser) {
  if (!STAFF_ROLES.includes(user.role)) {
    throw new ForbiddenException(
      'Somente admin e financeiro acessam funcionários.',
    );
  }
}

function money2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizeLancamentos(items?: LancamentoDto[]): Lancamento[] {
  return (items ?? [])
    .map((item) => ({
      codigo: item.codigo?.trim() || undefined,
      descricao: item.descricao.trim(),
      referencia: item.referencia?.trim() || undefined,
      valor: money2(item.valor),
    }))
    .filter((item) => item.descricao.length > 0);
}

function sumLancamentos(items: Lancamento[]) {
  return money2(items.reduce((acc, item) => acc + item.valor, 0));
}

function liquido(bruto: number, beneficios: Lancamento[], descontos: Lancamento[]) {
  return money2(bruto + sumLancamentos(beneficios) - sumLancamentos(descontos));
}

function parseOptionalDate(value?: string) {
  if (!value?.trim()) return null;
  const date = new Date(`${value.trim().slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calcBases(
  bruto: number,
  beneficios: Lancamento[],
  descontos: Lancamento[],
) {
  const vencimentos = money2(bruto + sumLancamentos(beneficios));
  const inss = descontos.find((item) => /inss|i\.n\.s\.s/i.test(item.descricao));
  const salarioContrInss = vencimentos;
  const baseFgts = vencimentos;
  return {
    salarioBase: bruto,
    salarioContrInss,
    baseFgts,
    fgtsMes: money2(baseFgts * 0.08),
    baseIrpf: money2(Math.max(0, salarioContrInss - (inss?.valor ?? 0))),
  };
}

function parseLancamentos(raw: Prisma.JsonValue): Lancamento[] {
  if (!Array.isArray(raw)) return [];
  const items: Lancamento[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as {
      codigo?: unknown;
      descricao?: unknown;
      referencia?: unknown;
      valor?: unknown;
    };
    const descricao = String(row.descricao ?? '').trim();
    if (!descricao) continue;
    const parsed: Lancamento = {
      descricao,
      valor: money2(Number(row.valor)),
    };
    const codigo = String(row.codigo ?? '').trim();
    const referencia = String(row.referencia ?? '').trim();
    if (codigo) parsed.codigo = codigo;
    if (referencia) parsed.referencia = referencia;
    items.push(parsed);
  }
  return items;
}

function competenciaAtual() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return { year, month, day, date: new Date(Date.UTC(year, month - 1, day)) };
}

function competenciaLabel(mes: number, ano: number) {
  const nome = new Date(Date.UTC(ano, mes - 1, 1)).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

@Injectable()
export class FuncionariosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(requester: AuthenticatedUser) {
    assertStaff(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const rows = await this.prisma.funcionario.findMany({
      where: { tenantId },
      orderBy: { nome: 'asc' },
      include: {
        contracheques: {
          orderBy: [{ competenciaAno: 'desc' }, { competenciaMes: 'desc' }],
          take: 2,
        },
      },
    });
    return rows.map((row) => this.toListItem(row));
  }

  async get(id: string, requester: AuthenticatedUser) {
    return this.toDetail(await this.findOwned(id, requester));
  }

  async create(dto: CreateFuncionarioDto, requester: AuthenticatedUser) {
    assertStaff(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const empresa = await this.resolveEmpresa(tenantId, dto.empresa);
    const beneficios = normalizeLancamentos(dto.beneficios);
    const descontos = normalizeLancamentos(dto.descontos);
    const created = await this.prisma.funcionario.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        cargo: dto.cargo.trim(),
        empresa,
        codigo: dto.codigo?.trim() ?? '',
        dataAdmissao: parseOptionalDate(dto.dataAdmissao),
        cbo: dto.cbo?.trim() ?? '',
        status: dto.status ?? UserStatus.ativo,
        salarioBruto: money2(dto.salarioBruto),
        beneficios,
        descontos,
        observacoes: dto.observacoes?.trim() ?? '',
      },
      include: { contracheques: true },
    });
    return this.toListItem(created);
  }

  async update(
    id: string,
    dto: UpdateFuncionarioDto,
    requester: AuthenticatedUser,
  ) {
    const current = await this.findOwned(id, requester);
    const empresa = await this.resolveEmpresa(current.tenantId, dto.empresa);
    const updated = await this.prisma.funcionario.update({
      where: { id },
      data: {
        nome: dto.nome.trim(),
        cargo: dto.cargo.trim(),
        empresa,
        codigo: dto.codigo?.trim() ?? '',
        dataAdmissao: parseOptionalDate(dto.dataAdmissao),
        cbo: dto.cbo?.trim() ?? '',
        status: dto.status ?? current.status,
        salarioBruto: money2(dto.salarioBruto),
        beneficios: normalizeLancamentos(dto.beneficios),
        descontos: normalizeLancamentos(dto.descontos),
        observacoes: dto.observacoes?.trim() ?? '',
      },
      include: {
        contracheques: {
          orderBy: [{ competenciaAno: 'desc' }, { competenciaMes: 'desc' }],
          take: 2,
        },
      },
    });
    return this.toListItem(updated);
  }

  async remove(id: string, requester: AuthenticatedUser) {
    await this.findOwned(id, requester);
    await this.prisma.funcionario.delete({ where: { id } });
  }

  async historico(id: string, requester: AuthenticatedUser) {
    const funcionario = await this.findOwned(id, requester);
    const items = await this.prisma.contracheque.findMany({
      where: { funcionarioId: funcionario.id },
      orderBy: [{ competenciaAno: 'desc' }, { competenciaMes: 'desc' }],
    });
    return items.map((item, index) => {
      const prev = items[index + 1];
      return {
        id: item.id,
        competenciaMes: item.competenciaMes,
        competenciaAno: item.competenciaAno,
        competenciaLabel: competenciaLabel(
          item.competenciaMes,
          item.competenciaAno,
        ),
        salarioBruto: item.salarioBruto,
        salarioLiquido: item.salarioLiquido,
        dataPagamento: item.dataPagamento.toISOString().slice(0, 10),
        variacaoLiquido:
          prev != null
            ? money2(item.salarioLiquido - prev.salarioLiquido)
            : null,
      };
    });
  }

  async emitirPdf(id: string, requester: AuthenticatedUser) {
    const funcionario = await this.findOwned(id, requester);
    const { year, month, date } = competenciaAtual();
    const beneficios = parseLancamentos(funcionario.beneficios);
    const descontos = parseLancamentos(funcionario.descontos);
    const salarioBruto = money2(funcionario.salarioBruto);
    const totalVencimentos = money2(salarioBruto + sumLancamentos(beneficios));
    const totalDescontos = sumLancamentos(descontos);
    const salarioLiquido = liquido(salarioBruto, beneficios, descontos);
    const bases = calcBases(salarioBruto, beneficios, descontos);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: funcionario.tenantId },
      select: { documento: true, endereco: true, cidade: true },
    });

    const snapshot = await this.prisma.contracheque.upsert({
      where: {
        funcionarioId_competenciaMes_competenciaAno: {
          funcionarioId: funcionario.id,
          competenciaMes: month,
          competenciaAno: year,
        },
      },
      create: {
        tenantId: funcionario.tenantId,
        funcionarioId: funcionario.id,
        competenciaMes: month,
        competenciaAno: year,
        nomeSnapshot: funcionario.nome,
        cargoSnapshot: funcionario.cargo,
        empresaSnapshot: funcionario.empresa,
        codigoSnapshot: funcionario.codigo,
        cboSnapshot: funcionario.cbo,
        admissaoSnapshot: funcionario.dataAdmissao,
        salarioBruto,
        beneficios,
        descontos,
        salarioLiquido,
        dataPagamento: date,
        observacoes: funcionario.observacoes,
      },
      update: {
        nomeSnapshot: funcionario.nome,
        cargoSnapshot: funcionario.cargo,
        empresaSnapshot: funcionario.empresa,
        codigoSnapshot: funcionario.codigo,
        cboSnapshot: funcionario.cbo,
        admissaoSnapshot: funcionario.dataAdmissao,
        salarioBruto,
        beneficios,
        descontos,
        salarioLiquido,
        dataPagamento: date,
        observacoes: funcionario.observacoes,
      },
    });

    const endereco = [tenant?.endereco, tenant?.cidade]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' — ');
    const buffer = await buildContrachequePdf({
      empresa: snapshot.empresaSnapshot,
      endereco,
      cnpj: tenant?.documento?.trim() || undefined,
      nome: snapshot.nomeSnapshot,
      cargo: snapshot.cargoSnapshot,
      codigo: snapshot.codigoSnapshot,
      cbo: snapshot.cboSnapshot,
      admissaoLabel: snapshot.admissaoSnapshot
        ? snapshot.admissaoSnapshot.toLocaleDateString('pt-BR', {
            timeZone: 'UTC',
          })
        : '',
      competenciaLabel: competenciaLabel(month, year),
      dataPagamentoLabel: date.toLocaleDateString('pt-BR', {
        timeZone: 'UTC',
      }),
      salarioBruto,
      beneficios,
      descontos,
      salarioLiquido,
      totalVencimentos,
      totalDescontos,
      ...bases,
      observacoes: snapshot.observacoes,
    });

    const safe = funcionario.nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    return {
      buffer,
      filename: `contracheque-${safe || 'funcionario'}-${year}-${String(month).padStart(2, '0')}.pdf`,
    };
  }

  private async findOwned(id: string, requester: AuthenticatedUser) {
    assertStaff(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.funcionario.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Funcionário não encontrado.');
    return row;
  }

  private async resolveEmpresa(tenantId: string, empresa?: string) {
    const typed = empresa?.trim();
    if (typed) return typed;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    return tenant?.name?.trim() || 'Imobiliária';
  }

  private toListItem(row: {
    id: string;
    nome: string;
    cargo: string;
    empresa: string;
    codigo: string;
    dataAdmissao: Date | null;
    cbo: string;
    status: UserStatus;
    salarioBruto: number;
    beneficios: Prisma.JsonValue;
    descontos: Prisma.JsonValue;
    observacoes: string;
    updatedAt: Date;
    contracheques?: Array<{
      salarioLiquido: number;
      competenciaMes: number;
      competenciaAno: number;
    }>;
  }) {
    const beneficios = parseLancamentos(row.beneficios);
    const descontos = parseLancamentos(row.descontos);
    const salarioBruto = money2(row.salarioBruto);
    const last = row.contracheques?.[0];
    const prev = row.contracheques?.[1];
    return {
      id: row.id,
      nome: row.nome,
      cargo: row.cargo,
      empresa: row.empresa,
      codigo: row.codigo,
      dataAdmissao: row.dataAdmissao
        ? row.dataAdmissao.toISOString().slice(0, 10)
        : null,
      cbo: row.cbo,
      status: row.status,
      salarioBruto,
      beneficios,
      descontos,
      observacoes: row.observacoes,
      salarioLiquido: liquido(salarioBruto, beneficios, descontos),
      updatedAt: row.updatedAt.toISOString(),
      ultimaCompetencia: last
        ? competenciaLabel(last.competenciaMes, last.competenciaAno)
        : null,
      variacaoLiquido:
        last && prev ? money2(last.salarioLiquido - prev.salarioLiquido) : null,
    };
  }

  private toDetail(row: {
    id: string;
    nome: string;
    cargo: string;
    empresa: string;
    codigo: string;
    dataAdmissao: Date | null;
    cbo: string;
    status: UserStatus;
    salarioBruto: number;
    beneficios: Prisma.JsonValue;
    descontos: Prisma.JsonValue;
    observacoes: string;
    updatedAt: Date;
  }) {
    return this.toListItem({ ...row, contracheques: [] });
  }
}
