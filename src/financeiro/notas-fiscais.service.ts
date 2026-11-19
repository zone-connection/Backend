import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { resolveFinanceiroTenantId } from '../common/utils/tenant';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';

export type NotaFiscalInput = {
  numero?: string;
  cliente?: string;
  vgv?: string | number | null;
  corretor?: string;
  construtora?: string;
  empreendimento?: string;
  torreBloco?: string;
  dataEmissao?: string | null;
};

@Injectable()
export class NotasFiscaisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async list(
    requester: AuthenticatedUser,
    query: {
      q?: string;
      periodo?: 'mes' | 'trimestre' | 'ano' | 'tudo';
      de?: string;
      ate?: string;
      corretor?: string;
      construtora?: string;
      empreendimento?: string;
      arquivo?: 'com' | 'sem';
    } = {},
  ) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const term = (query.q ?? '').trim();
    const emissao = this.emissaoRange(query.periodo, query.de, query.ate);
    const vgvTerm = term.replace(/\./g, '').replace(',', '.');
    const vgvNumero = /^\d+(\.\d+)?$/.test(vgvTerm)
      ? new Prisma.Decimal(vgvTerm)
      : null;
    const rows = await this.prisma.financeiroNotaFiscal.findMany({
      where: {
        tenantId,
        ...(query.corretor?.trim()
          ? { corretor: query.corretor.trim() }
          : {}),
        ...(query.construtora?.trim()
          ? { construtora: query.construtora.trim() }
          : {}),
        ...(query.empreendimento?.trim()
          ? { empreendimento: query.empreendimento.trim() }
          : {}),
        ...(query.arquivo === 'com' ? { NOT: { arquivoUrl: '' } } : {}),
        ...(query.arquivo === 'sem' ? { arquivoUrl: '' } : {}),
        ...(emissao ? { dataEmissao: emissao } : {}),
        ...(term
          ? {
              OR: [
                { numero: { contains: term, mode: 'insensitive' } },
                { cliente: { contains: term, mode: 'insensitive' } },
                { corretor: { contains: term, mode: 'insensitive' } },
                { construtora: { contains: term, mode: 'insensitive' } },
                { empreendimento: { contains: term, mode: 'insensitive' } },
                { torreBloco: { contains: term, mode: 'insensitive' } },
                ...(vgvNumero ? [{ vgv: vgvNumero }] : []),
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { comissoes: true } } },
    });
    return rows.map((row) => this.toDto(row));
  }

  async opcoes(requester: AuthenticatedUser) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const rows = await this.prisma.financeiroNotaFiscal.findMany({
      where: { tenantId },
      select: { corretor: true, construtora: true, empreendimento: true },
    });
    const unique = (values: string[]) =>
      [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, 'pt-BR'),
      );
    return {
      corretores: unique(rows.map((row) => row.corretor)),
      construtoras: unique(rows.map((row) => row.construtora)),
      empreendimentos: unique(rows.map((row) => row.empreendimento)),
    };
  }

  private emissaoRange(
    periodo?: 'mes' | 'trimestre' | 'ano' | 'tudo',
    de?: string,
    ate?: string,
  ): Prisma.DateTimeFilter | undefined {
    const now = new Date();
    let gte: Date | undefined;
    let lte: Date | undefined;
    if (periodo && periodo !== 'tudo') {
      const year = now.getFullYear();
      const month = now.getMonth();
      if (periodo === 'mes') {
        gte = new Date(year, month, 1);
        lte = new Date(year, month + 1, 0, 23, 59, 59, 999);
      } else if (periodo === 'trimestre') {
        const startMonth = Math.floor(month / 3) * 3;
        gte = new Date(year, startMonth, 1);
        lte = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
      } else {
        gte = new Date(year, 0, 1);
        lte = new Date(year, 11, 31, 23, 59, 59, 999);
      }
    }
    if (de) {
      const from = new Date(`${de}T00:00:00`);
      gte = gte && gte > from ? gte : from;
    }
    if (ate) {
      const to = new Date(`${ate}T23:59:59.999`);
      lte = lte && lte < to ? lte : to;
    }
    if (!gte && !lte) return undefined;
    return {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }

  async create(
    requester: AuthenticatedUser,
    input: NotaFiscalInput,
    file?: Express.Multer.File,
  ) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const numero = (input.numero ?? '').trim();
    if (!numero) {
      throw new BadRequestException('Informe o número da NF.');
    }
    const arquivo = await this.storeFile(tenantId, file);
    const row = await this.prisma.financeiroNotaFiscal.create({
      data: {
        tenantId,
        numero,
        ...this.fields(input),
        ...arquivo,
      },
    });
    return this.toDto(row);
  }

  async update(
    id: string,
    requester: AuthenticatedUser,
    input: NotaFiscalInput,
    file?: Express.Multer.File,
  ) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const current = await this.prisma.financeiroNotaFiscal.findFirst({
      where: { id, tenantId },
    });
    if (!current) throw new NotFoundException('Nota fiscal não encontrada.');
    const numero = (input.numero ?? current.numero).trim();
    if (!numero) throw new BadRequestException('Informe o número da NF.');
    const arquivo = await this.storeFile(tenantId, file);
    const row = await this.prisma.financeiroNotaFiscal.update({
      where: { id },
      data: {
        numero,
        ...this.fields(input),
        ...(file ? arquivo : {}),
      },
    });
    return this.toDto(row);
  }

  private fields(input: NotaFiscalInput) {
    const vgvRaw = input.vgv;
    const vgv =
      vgvRaw === undefined || vgvRaw === null || vgvRaw === ''
        ? undefined
        : new Prisma.Decimal(String(vgvRaw).replace(',', '.'));
    return {
      ...(input.cliente !== undefined ? { cliente: input.cliente.trim() } : {}),
      ...(input.corretor !== undefined
        ? { corretor: input.corretor.trim() }
        : {}),
      ...(input.construtora !== undefined
        ? { construtora: input.construtora.trim() }
        : {}),
      ...(input.empreendimento !== undefined
        ? { empreendimento: input.empreendimento.trim() }
        : {}),
      ...(input.torreBloco !== undefined
        ? { torreBloco: input.torreBloco.trim() }
        : {}),
      ...(vgv !== undefined && !vgv.isNaN() ? { vgv } : {}),
      ...(input.dataEmissao
        ? { dataEmissao: new Date(`${input.dataEmissao.slice(0, 10)}T12:00:00`) }
        : {}),
    };
  }

  private async storeFile(tenantId: string, file?: Express.Multer.File) {
    if (!file) {
      return { arquivoUrl: '', arquivoNome: '', arquivoPublicId: '' };
    }
    const uploaded = await this.media.uploadRaw({
      buffer: file.buffer,
      mimetype: file.mimetype,
      filename: file.originalname,
      folder: `crm/${tenantId}/notas-fiscais`,
    });
    return {
      arquivoUrl: uploaded.url,
      arquivoNome: file.originalname,
      arquivoPublicId: uploaded.publicId,
    };
  }

  private toDto(row: {
    id: string;
    numero: string;
    cliente: string;
    vgv: Prisma.Decimal | null;
    corretor: string;
    construtora: string;
    empreendimento: string;
    torreBloco: string;
    dataEmissao: Date | null;
    arquivoUrl: string;
    arquivoNome: string;
    _count?: { comissoes: number };
  }) {
    return {
      id: row.id,
      numero: row.numero,
      cliente: row.cliente,
      vgv: row.vgv == null ? null : Number(row.vgv),
      corretor: row.corretor,
      construtora: row.construtora,
      empreendimento: row.empreendimento,
      torreBloco: row.torreBloco,
      dataEmissao: row.dataEmissao
        ? row.dataEmissao.toISOString().slice(0, 10)
        : null,
      arquivoUrl: row.arquivoUrl,
      arquivoNome: row.arquivoNome,
      vinculada: (row._count?.comissoes ?? 0) > 0,
    };
  }
}
