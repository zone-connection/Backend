import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OnboardingEtapaStatus,
  OnboardingStatus,
  PlatformContratoTipo,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { isPlatformAdmin, PLATFORM_TENANT_ID } from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOnboardingDto,
  UpdateOnboardingDto,
  UpdateOnboardingEtapaDto,
} from './dto/onboarding.dto';

export const ETAPAS_PADRAO = [
  'Confirmar dados da imobiliária',
  'Confirmar plano e condições contratadas',
  'Validar os acessos e a configuração inicial',
  'Configurar os módulos contratados',
  'Configurar integrações aplicáveis',
  'Realizar treinamento',
  'Validar o funcionamento com a imobiliária',
  'Confirmar a conclusão da implantação',
] as const;

const ABERTOS: OnboardingStatus[] = [
  OnboardingStatus.nao_iniciado,
  OnboardingStatus.em_andamento,
  OnboardingStatus.aguardando_cliente,
  OnboardingStatus.aguardando_equipe,
];

const include = {
  tenant: { select: { id: true, name: true, slug: true, plano: true, status: true, telefone: true, email: true, endereco: true, cidade: true } },
  platformContrato: {
    select: { id: true, codigo: true, tipo: true, status: true, plano: true, valorMensalidade: true },
  },
  responsavel: { select: { id: true, name: true } },
  etapas: { orderBy: { ordem: 'asc' as const } },
} satisfies Prisma.OnboardingInclude;

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(requester: AuthenticatedUser, situacao?: string) {
    this.assertSuperAdmin(requester);
    const hoje = inicioDoDiaBrasil(new Date());
    const where: Prisma.OnboardingWhereInput = {
      tenantId: { not: PLATFORM_TENANT_ID },
    };
    if (situacao === 'concluidas') where.status = OnboardingStatus.concluido;
    else if (situacao === 'atrasadas') {
      where.status = { in: ABERTOS };
      where.prazoPrevisto = { lt: hoje };
    } else if (situacao !== 'todas') {
      where.status = { in: ABERTOS };
    }
    const rows = await this.prisma.onboarding.findMany({
      where,
      include,
      orderBy: { prazoPrevisto: 'asc' },
    });
    return rows.map((row) => this.map(row, hoje));
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    const row = await this.load(id);
    const historico = await this.prisma.onboardingHistorico.findMany({
      where: { onboardingId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { autor: { select: { id: true, name: true } } },
    });
    return { ...this.map(row, inicioDoDiaBrasil(new Date())), historico };
  }

  async create(dto: CreateOnboardingDto, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    if (dto.tenantId === PLATFORM_TENANT_ID) {
      throw new BadRequestException('O tenant interno da plataforma não recebe implantação.');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) throw new NotFoundException('Imobiliária não encontrada.');
    await this.assertResponsavel(dto.responsavelId);
    await this.assertContrato(dto.tenantId, dto.platformContratoId);

    const aberta = await this.prisma.onboarding.findFirst({
      where: { tenantId: dto.tenantId, status: { in: ABERTOS } },
      select: { id: true },
    });
    if (aberta) {
      throw new ConflictException(
        'Já existe uma implantação em aberto para esta imobiliária.',
      );
    }
    const anterior = await this.prisma.onboarding.count({
      where: { tenantId: dto.tenantId },
    });
    if (anterior > 0 && (dto.justificativa?.trim().length ?? 0) < 5) {
      throw new BadRequestException(
        'Informe a justificativa para abrir uma nova implantação.',
      );
    }

    const inicio = parseDia(dto.inicio);
    const prazo = parseDia(dto.prazoPrevisto);
    if (prazo < inicio) {
      throw new BadRequestException('O prazo previsto não pode ser anterior ao início.');
    }

    const row = await this.prisma.onboarding.create({
      data: {
        tenantId: dto.tenantId,
        platformContratoId: dto.platformContratoId ?? null,
        responsavelId: dto.responsavelId ?? null,
        inicio,
        prazoPrevisto: prazo,
        observacao: dto.observacao?.trim() ?? '',
        justificativa: dto.justificativa?.trim() ?? '',
        etapas: {
          create: ETAPAS_PADRAO.map((titulo, index) => ({
            ordem: index + 1,
            titulo,
            obrigatoria: true,
          })),
        },
        historico: {
          create: {
            autorId: requester.id,
            acao: 'criado',
            detalhe: anterior > 0 ? dto.justificativa!.trim() : 'Implantação aberta.',
          },
        },
      },
      include,
    });
    return this.map(row, inicioDoDiaBrasil(new Date()));
  }

  async update(id: string, dto: UpdateOnboardingDto, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    const atual = await this.load(id);
    const status = dto.status ? this.parseStatus(dto.status) : undefined;
    if (dto.responsavelId) await this.assertResponsavel(dto.responsavelId);
    if (status === OnboardingStatus.concluido) {
      this.assertObrigatorias(atual.etapas);
    }
    const row = await this.prisma.onboarding.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(status === OnboardingStatus.concluido ? { concluidoEm: new Date() } : {}),
        ...(status && status !== OnboardingStatus.concluido ? { concluidoEm: null } : {}),
        ...(dto.responsavelId !== undefined ? { responsavelId: dto.responsavelId } : {}),
        ...(dto.prazoPrevisto ? { prazoPrevisto: parseDia(dto.prazoPrevisto) } : {}),
        ...(dto.observacao !== undefined ? { observacao: dto.observacao.trim() } : {}),
      },
      include,
    });
    await this.prisma.onboardingHistorico.create({
      data: {
        onboardingId: id,
        autorId: requester.id,
        acao: 'atualizado',
        detalhe: status ? `Status: ${status}` : 'Dados da implantação atualizados.',
      },
    });
    return this.map(row, inicioDoDiaBrasil(new Date()));
  }

  async updateEtapa(
    id: string,
    etapaId: string,
    dto: UpdateOnboardingEtapaDto,
    requester: AuthenticatedUser,
  ) {
    this.assertSuperAdmin(requester);
    const onboarding = await this.load(id);
    if (
      onboarding.status === OnboardingStatus.concluido ||
      onboarding.status === OnboardingStatus.cancelado
    ) {
      throw new BadRequestException('Implantação encerrada não altera etapas.');
    }
    const etapa = onboarding.etapas.find((item) => item.id === etapaId);
    if (!etapa) throw new NotFoundException('Etapa não encontrada.');
    const status = dto.status ? this.parseEtapaStatus(dto.status) : undefined;
    const updated = await this.prisma.onboardingEtapa.update({
      where: { id: etapaId },
      data: {
        ...(status ? { status } : {}),
        ...(status === OnboardingEtapaStatus.concluida
          ? { concluidaEm: new Date() }
          : status
            ? { concluidaEm: null }
            : {}),
        ...(dto.obrigatoria !== undefined ? { obrigatoria: dto.obrigatoria } : {}),
        ...(dto.pendencia !== undefined ? { pendencia: dto.pendencia.trim() } : {}),
        ...(dto.observacao !== undefined ? { observacao: dto.observacao.trim() } : {}),
        ...(dto.titulo !== undefined ? { titulo: dto.titulo.trim() } : {}),
      },
    });
    if (onboarding.status === OnboardingStatus.nao_iniciado && status === OnboardingEtapaStatus.concluida) {
      await this.prisma.onboarding.update({
        where: { id },
        data: { status: OnboardingStatus.em_andamento },
      });
    }
    await this.prisma.onboardingHistorico.create({
      data: {
        onboardingId: id,
        autorId: requester.id,
        acao: 'etapa',
        detalhe: `${updated.titulo}: ${updated.status}`,
      },
    });
    return this.findOne(id, requester);
  }

  private assertObrigatorias(
    etapas: Array<{ obrigatoria: boolean; status: OnboardingEtapaStatus; titulo: string }>,
  ) {
    const pendentes = etapas.filter(
      (etapa) => etapa.obrigatoria && etapa.status !== OnboardingEtapaStatus.concluida,
    );
    if (pendentes.length > 0) {
      throw new BadRequestException(
        `Ainda há etapas obrigatórias pendentes: ${pendentes.map((e) => e.titulo).join(', ')}.`,
      );
    }
  }

  private async load(id: string) {
    const row = await this.prisma.onboarding.findUnique({ where: { id }, include });
    if (!row || row.tenantId === PLATFORM_TENANT_ID) {
      throw new NotFoundException('Implantação não encontrada.');
    }
    return row;
  }

  private async assertResponsavel(id?: string | null) {
    if (!id) return;
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    if (!user || user.role !== Role.super_admin) {
      throw new BadRequestException('O responsável precisa ser um usuário do super admin.');
    }
  }

  private async assertContrato(tenantId: string, contratoId?: string) {
    if (!contratoId) return;
    const contrato = await this.prisma.platformContrato.findFirst({
      where: { id: contratoId, tenantId, tipo: PlatformContratoTipo.assinatura },
      select: { id: true },
    });
    if (!contrato) {
      throw new BadRequestException('A assinatura informada não pertence a esta imobiliária.');
    }
  }

  private parseStatus(value: string): OnboardingStatus {
    if (!(Object.values(OnboardingStatus) as string[]).includes(value)) {
      throw new BadRequestException('Status de implantação inválido.');
    }
    return value as OnboardingStatus;
  }

  private parseEtapaStatus(value: string): OnboardingEtapaStatus {
    if (!(Object.values(OnboardingEtapaStatus) as string[]).includes(value)) {
      throw new BadRequestException('Status de etapa inválido.');
    }
    return value as OnboardingEtapaStatus;
  }

  private map(
    row: Prisma.OnboardingGetPayload<{ include: typeof include }>,
    hoje: Date,
  ) {
    const obrigatorias = row.etapas.filter((etapa) => etapa.obrigatoria);
    const feitas = obrigatorias.filter(
      (etapa) => etapa.status === OnboardingEtapaStatus.concluida,
    ).length;
    const progresso =
      obrigatorias.length === 0 ? 0 : Math.round((feitas / obrigatorias.length) * 100);
    const atrasado =
      ABERTOS.includes(row.status) && row.prazoPrevisto.getTime() < hoje.getTime();
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantNome: row.tenant.name,
      tenantPlano: row.tenant.plano,
      tenantTelefone: row.tenant.telefone,
      tenantEmail: row.tenant.email,
      tenantEndereco: row.tenant.endereco || row.tenant.cidade,
      platformContratoId: row.platformContratoId,
      contratoCodigo: row.platformContrato?.codigo ?? null,
      contratoStatus: row.platformContrato?.status ?? null,
      responsavelId: row.responsavelId,
      responsavelNome: row.responsavel?.name ?? null,
      inicio: row.inicio.toISOString(),
      prazoPrevisto: row.prazoPrevisto.toISOString(),
      status: row.status,
      observacao: row.observacao,
      justificativa: row.justificativa,
      concluidoEm: row.concluidoEm?.toISOString() ?? null,
      progresso,
      atrasado,
      etapas: row.etapas.map((etapa) => ({
        id: etapa.id,
        ordem: etapa.ordem,
        titulo: etapa.titulo,
        obrigatoria: etapa.obrigatoria,
        status: etapa.status,
        pendencia: etapa.pendencia,
        observacao: etapa.observacao,
        concluidaEm: etapa.concluidaEm?.toISOString() ?? null,
      })),
    };
  }

  private assertSuperAdmin(requester: AuthenticatedUser) {
    if (!isPlatformAdmin(requester)) {
      throw new ForbiddenException('A implantação é exclusiva do super admin.');
    }
  }
}

function parseDia(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

function inicioDoDiaBrasil(agora: Date) {
  const brasil = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(brasil.getUTCFullYear(), brasil.getUTCMonth(), brasil.getUTCDate(), 3, 0, 0),
  );
}
