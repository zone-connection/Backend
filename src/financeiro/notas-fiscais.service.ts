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

  async list(requester: AuthenticatedUser, q?: string) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const term = (q ?? '').trim();
    const rows = await this.prisma.financeiroNotaFiscal.findMany({
      where: {
        tenantId,
        ...(term
          ? {
              OR: [
                { numero: { contains: term, mode: 'insensitive' } },
                { cliente: { contains: term, mode: 'insensitive' } },
                { corretor: { contains: term, mode: 'insensitive' } },
                { construtora: { contains: term, mode: 'insensitive' } },
                { empreendimento: { contains: term, mode: 'insensitive' } },
                { torreBloco: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
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
    };
  }
}
