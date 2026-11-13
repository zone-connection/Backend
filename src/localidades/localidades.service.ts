import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { requireTenantId } from "../common/utils/tenant";
import { CreateLocalidadeDto } from "./dto/create-localidade.dto";
import { UpdateLocalidadeDto } from "./dto/update-localidade.dto";

const localidadeSelect = {
  id: true,
  nome: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { construtoras: true } },
} as const;

@Injectable()
export class LocalidadesService {
  constructor(private readonly prisma: PrismaService) {}

  list(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    return this.prisma.localidade.findMany({
      where: { tenantId },
      select: localidadeSelect,
      orderBy: { nome: "asc" },
    });
  }

  async create(dto: CreateLocalidadeDto, requester: AuthenticatedUser) {
    this.assertCanManage(requester);
    const tenantId = requireTenantId(requester);
    const nome = dto.nome.trim();
    const existing = await this.prisma.localidade.findFirst({
      where: { tenantId, nome: { equals: nome, mode: "insensitive" } },
      select: localidadeSelect,
    });
    if (existing) return existing;

    try {
      return await this.prisma.localidade.create({
        data: { tenantId, nome },
        select: localidadeSelect,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException("Já existe uma localidade com esse nome.");
      }
      throw err;
    }
  }

  async update(
    id: string,
    dto: UpdateLocalidadeDto,
    requester: AuthenticatedUser,
  ) {
    this.assertCanManage(requester);
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.localidade.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Localidade não encontrada.");

    if (dto.nome === undefined) {
      return this.prisma.localidade.findFirstOrThrow({
        where: { id, tenantId },
        select: localidadeSelect,
      });
    }

    const nome = dto.nome.trim();
    const duplicate = await this.prisma.localidade.findFirst({
      where: {
        tenantId,
        id: { not: id },
        nome: { equals: nome, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException("Já existe uma localidade com esse nome.");
    }

    try {
      return await this.prisma.localidade.update({
        where: { id },
        data: { nome },
        select: localidadeSelect,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException("Já existe uma localidade com esse nome.");
      }
      throw err;
    }
  }

  async remove(id: string, requester: AuthenticatedUser) {
    this.assertCanManage(requester);
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.localidade.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Localidade não encontrada.");
    await this.prisma.localidade.delete({ where: { id } });
    return { ok: true };
  }

  private assertCanManage(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente &&
      requester.role !== Role.analista &&
      requester.role !== Role.treinee &&
      requester.role !== Role.corretor
    ) {
      throw new ForbiddenException(
        "Apenas administradores, gerentes, analistas, treinees e corretores podem cadastrar localidades.",
      );
    }
  }
}
