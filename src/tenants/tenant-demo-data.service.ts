import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AgendamentoAlvo,
  AgendamentoEscopo,
  AgendamentoSolicitacaoStatus,
  AgendamentoStatus,
  AgendamentoTipo,
  AnaliseStatus,
  CatalogType,
  FinanceiroComissaoStatus,
  FinanceiroDespesaNatureza,
  FinanceiroMovimentoTipo,
  FinanceiroParceiroTipo,
  FinanceiroTituloStatus,
  FinanceiroTituloTipo,
  CaptacaoHistoricoTipo,
  CaptacaoImovelTipo,
  FunilEtapaPapel,
  FunilTipo,
  InteresseUsadoStatus,
  MetaEscopo,
  MetaOrigem,
  MetaPeriodo,
  MetaTipo,
  NotificacaoTipo,
  PessoaTipo,
  Prisma,
  ProprietarioPortalStatus,
  PropostaStatus,
  Role,
  TenantPlano,
  TriagemOrigem,
  UserStatus,
  VendaUsadoHistoricoTipo,
  VendaUsadoPropostaStatus,
  VendaUsadoStatus,
  VendaUsadoVisitaStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PLATFORM_TENANT_ID } from '../common/utils/tenant';
import { SALT_ROUNDS } from '../config/security.constants';
import {
  DEFAULT_DOCUMENTACAO_FONTES,
  DEFAULT_DOCUMENTACAO_STATUS1,
  DEFAULT_DOCUMENTACAO_STATUS2,
  DEFAULT_EMPREENDIMENTO_STATUS,
  DEFAULT_EMPREENDIMENTO_TAGS,
  DEFAULT_EMPREENDIMENTO_TIPOS,
  DEFAULT_FUNIL_NAME,
  DEFAULT_FUNNEL_STAGES,
  DEFAULT_MOTIVOS_PERDA,
  funilEtapasCreateData,
} from '../catalog/catalog.defaults';
import { slugify } from '../catalog/catalog.util';
import { isStatusVendido } from '../common/utils/documentacao-status';
import { applyPlanoModules } from './tenant-plan';
import { mergeOperationModules } from './tenant-operation.util';
import {
  DEMO_CAPTATION_IMOVEIS,
  DEMO_CATALOG,
  DEMO_INTERESSADOS_USADOS,
  DEMO_CONSTRUTORAS,
  DEMO_DESPESA_TIPOS,
  DEMO_EMPREENDIMENTOS,
  DEMO_EQUIPES,
  DEMO_FINANCEIRO_PARCEIROS,
  DEMO_LEADS,
  DEMO_LOCALIDADES,
  DEMO_PASSWORD,
  DEMO_RECEBIMENTO_TIPOS,
  DEMO_TREINAMENTO,
  DEMO_TRIAGEM,
  DEMO_USERS,
  demoUserEmail,
  type DemoUserKey,
} from './demo-seed.data';
import { PopulateDemoDataDto } from './dto/populate-demo-data.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export type DemoDataCounts = {
  usuarios: number;
  equipes: number;
  catalogItems: number;
  localidades: number;
  construtoras: number;
  empreendimentos: number;
  leads: number;
  triagens: number;
  documentacoes: number;
  propostas: number;
  analises: number;
  agendamentos: number;
  metas: number;
  notificacoes: number;
  treinamentos: number;
  financeiro: number;
  proprietarios: number;
  imoveis: number;
  captacoes: number;
  interessadosUsados: number;
  vendasUsados: number;
};

type DemoDocumentacaoResumo = {
  id: string;
  nome: string;
  vgv: number;
  vendido: boolean;
  corretorKey: DemoUserKey;
  gerenteKey: DemoUserKey;
  empreendimento: string;
  dataVenda: Date;
  equipeSlot: 1 | 2;
};

export type PopulateDemoDataResult = {
  tenantId: string;
  tenantName: string;
  slug: string;
  limpou: boolean;
  senhaPadrao: string;
  usuariosCriados: { name: string; email: string; role: Role }[];
  /** Extras acrescentados à cota do plano para caber a carga demo. */
  usuariosExtrasLiberados: number;
  counts: DemoDataCounts;
};

/** Gera uma carga completa de dados fictícios em um tenant (demonstração). */
@Injectable()
export class TenantDemoDataService {
  constructor(private readonly prisma: PrismaService) {}

  async populate(
    tenantId: string,
    dto: PopulateDemoDataDto = {},
  ): Promise<PopulateDemoDataResult> {
    if (tenantId === PLATFORM_TENANT_ID) {
      throw new BadRequestException(
        'O tenant interno da plataforma não recebe dados de demonstração.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        plano: true,
        modules: true,
        maxUsuarios: true,
        usuariosExtras: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

    const limpou = dto.limparAntes === true;
    if (limpou) {
      await this.wipeOperationalData(tenantId, tenant.slug);
    }

    const counts: DemoDataCounts = {
      usuarios: 0,
      equipes: 0,
      catalogItems: 0,
      localidades: 0,
      construtoras: 0,
      empreendimentos: 0,
      leads: 0,
      triagens: 0,
      documentacoes: 0,
      propostas: 0,
      analises: 0,
      agendamentos: 0,
      metas: 0,
      notificacoes: 0,
      treinamentos: 0,
      financeiro: 0,
      proprietarios: 0,
      imoveis: 0,
      captacoes: 0,
      interessadosUsados: 0,
      vendasUsados: 0,
    };

    await this.enableCaptacaoOperations(tenantId, tenant.plano, tenant.modules);

    counts.catalogItems = await this.seedCatalogAndFunil(tenantId);

    const { userIdByKey, adminId, criados } = await this.seedUsers(
      tenantId,
      tenant.slug,
    );
    counts.usuarios = criados.length;
    const usuariosExtrasLiberados = await this.ensureUserQuota(tenantId);

    counts.equipes = await this.seedEquipes(tenantId, userIdByKey);
    await this.seedEquipeFunis(tenantId);

    const localidadeIds = await this.seedLocalidades(tenantId);
    counts.localidades = localidadeIds.length;

    const construtoraIds = await this.seedConstrutoras(tenantId, localidadeIds);
    counts.construtoras = construtoraIds.length;

    const empreendimentoIds = await this.seedEmpreendimentos(
      tenantId,
      construtoraIds,
      localidadeIds,
    );
    counts.empreendimentos = empreendimentoIds.length;

    const equipeIdBySlot = await this.loadEquipeIds(tenantId, userIdByKey);

    const { leadIdByKey, novos } = await this.seedLeads(tenantId, {
      userIdByKey,
      equipeIdBySlot,
      construtoraIds,
      empreendimentoIds,
    });
    counts.leads = novos;

    counts.triagens = await this.seedTriagem(leadIdByKey, userIdByKey);

    const documentacoes = await this.seedDocumentacoes(tenantId, {
      leadIdByKey,
      userIdByKey,
      construtoraIds,
      empreendimentoIds,
      adminId,
    });
    counts.documentacoes = documentacoes.criadas;

    counts.propostas = await this.seedPropostas(tenantId, {
      leadIdByKey,
      userIdByKey,
      construtoraIds,
      empreendimentoIds,
      adminId,
    });

    counts.analises = await this.seedAnalises(tenantId, {
      leadIdByKey,
      userIdByKey,
      adminId,
    });

    counts.agendamentos = await this.seedAgenda(tenantId, {
      leadIdByKey,
      userIdByKey,
      equipeIdBySlot,
      adminId,
    });

    counts.metas = await this.seedMetas(tenantId, userIdByKey, adminId);

    counts.notificacoes = await this.seedNotificacoes(
      tenantId,
      leadIdByKey,
      userIdByKey,
    );

    counts.treinamentos = await this.seedTreinamento(tenantId);

    counts.financeiro = await this.seedFinanceiro(tenantId, {
      documentacoes: documentacoes.docs,
      userIdByKey,
      equipeIdBySlot,
    });

    const captacao = await this.seedCaptacaoEUsados(tenantId, userIdByKey);
    counts.proprietarios = captacao.proprietarios;
    counts.imoveis = captacao.imoveis;
    counts.captacoes = captacao.captacoes;
    counts.interessadosUsados = captacao.interessadosUsados;
    counts.vendasUsados = captacao.vendasUsados;

    return {
      tenantId,
      tenantName: tenant.name,
      slug: tenant.slug,
      limpou,
      senhaPadrao: DEMO_PASSWORD,
      usuariosCriados: criados,
      usuariosExtrasLiberados,
      counts,
    };
  }

  // -------------------------------------------------------------------
  // Limpeza
  // -------------------------------------------------------------------

  /**
   * Apaga dados operacionais do tenant preservando funil, catálogos,
   * conexões, contratos da plataforma e usuários reais (não-demo).
   */
  private async wipeOperationalData(tenantId: string, slug: string) {
    const demoSuffix = `@${slug}.demo`;

    await this.prisma.$transaction(
      async (tx) => {
        // Baixas de contratos da plataforma são preservadas: os ids precisam ser
        // lidos antes de apagar os títulos (a FK vira null no delete).
        const movimentosPreservados = await tx.financeiroMovimento.findMany({
          where: {
            tenantId,
            titulo: {
              OR: [
                { platformContratoId: { not: null } },
                { platformFornecedorContratoId: { not: null } },
              ],
            },
          },
          select: { id: true },
        });

        await tx.financeiroTitulo.deleteMany({
          where: { tenantId, platformContratoId: null, platformFornecedorContratoId: null },
        });
        await tx.financeiroMovimento.deleteMany({
          where: {
            tenantId,
            id: { notIn: movimentosPreservados.map((m) => m.id) },
          },
        });
        await tx.financeiroComissao.deleteMany({ where: { tenantId } });
        await tx.financeiroRecebimento.deleteMany({ where: { tenantId } });
        await tx.financeiroRecebimentoTipo.deleteMany({ where: { tenantId } });
        await tx.financeiroDespesa.deleteMany({ where: { tenantId } });
        await tx.financeiroDespesaTipo.deleteMany({ where: { tenantId } });
        await tx.financeiroParceiro.deleteMany({ where: { tenantId } });

        await tx.vendaUsadoPosVendaPendencia.deleteMany({ where: { tenantId } });
        await tx.vendaUsadoPosVenda.deleteMany({ where: { tenantId } });
        await tx.imovelChaveMovimento.deleteMany({ where: { tenantId } });
        await tx.imovelChave.deleteMany({ where: { tenantId } });
        await tx.vendaUsadoDocumento.deleteMany({ where: { tenantId } });
        await tx.vendaUsadoContrato.deleteMany({ where: { tenantId } });
        await tx.vendaUsadoFechamento.deleteMany({ where: { tenantId } });
        await tx.vendaUsadoProposta.deleteMany({ where: { tenantId } });
        await tx.vendaUsadoVisita.deleteMany({ where: { tenantId } });
        await tx.vendaUsadoNegociacaoMovimento.deleteMany({ where: { tenantId } });
        await tx.vendaUsadoNegociacao.deleteMany({ where: { tenantId } });
        await tx.vendaUsadoVinculo.deleteMany({ where: { tenantId } });
        await tx.vendaUsadoHistorico.deleteMany({ where: { tenantId } });
        await tx.vendaUsado.deleteMany({ where: { tenantId } });
        await tx.interessadoUsado.deleteMany({ where: { tenantId } });
        await tx.captacaoHistorico.deleteMany({ where: { tenantId } });
        await tx.captacao.deleteMany({ where: { tenantId } });
        await tx.proprietarioPortalAcesso.deleteMany({ where: { tenantId } });
        await tx.imovel.deleteMany({ where: { tenantId } });
        await tx.proprietario.deleteMany({ where: { tenantId } });

        await tx.notificacao.deleteMany({ where: { tenantId } });
        await tx.agendamento.deleteMany({ where: { tenantId } });
        await tx.meta.deleteMany({ where: { tenantId } });
        await tx.analise.deleteMany({ where: { tenantId } });
        await tx.proposta.deleteMany({ where: { tenantId } });
        await tx.documentacao.deleteMany({ where: { tenantId } });
        await tx.leadPrazoAdiamento.deleteMany({ where: { tenantId } });
        await tx.lead.deleteMany({ where: { tenantId } });

        await tx.empreendimento.deleteMany({ where: { tenantId } });
        await tx.construtora.deleteMany({ where: { tenantId } });
        await tx.localidade.deleteMany({ where: { tenantId } });

        await tx.treinamentoLink.deleteMany({ where: { tenantId } });
        await tx.treinamentoSecao.deleteMany({ where: { tenantId } });

        await tx.equipe.deleteMany({ where: { tenantId } });
        await tx.user.deleteMany({
          where: { tenantId, email: { endsWith: demoSuffix } },
        });
      },
      { timeout: 120_000, maxWait: 15_000 },
    );
  }

  // -------------------------------------------------------------------
  // Catálogo e funil
  // -------------------------------------------------------------------

  private async seedCatalogAndFunil(tenantId: string): Promise<number> {
    const rows: Prisma.CatalogItemCreateManyInput[] = [];

    for (const stage of DEFAULT_FUNNEL_STAGES) {
      rows.push({
        tenantId,
        type: CatalogType.funil_etapa,
        label: stage.label,
        slug: stage.slug,
        color: stage.color,
        sortOrder: stage.sortOrder,
        active: true,
      });
    }

    const simples: { type: CatalogType; items: readonly { label: string; color: string }[] }[] = [
      ...DEMO_CATALOG,
      { type: CatalogType.motivo_perda, items: DEFAULT_MOTIVOS_PERDA },
      { type: CatalogType.documentacao_fonte, items: DEFAULT_DOCUMENTACAO_FONTES },
      { type: CatalogType.documentacao_status1, items: DEFAULT_DOCUMENTACAO_STATUS1 },
      { type: CatalogType.documentacao_status2, items: DEFAULT_DOCUMENTACAO_STATUS2 },
      { type: CatalogType.empreendimento_tipo, items: DEFAULT_EMPREENDIMENTO_TIPOS },
      { type: CatalogType.empreendimento_status, items: DEFAULT_EMPREENDIMENTO_STATUS },
      { type: CatalogType.empreendimento_tag, items: DEFAULT_EMPREENDIMENTO_TAGS },
    ];

    for (const grupo of simples) {
      grupo.items.forEach((item, index) => {
        rows.push({
          tenantId,
          type: grupo.type,
          label: item.label,
          slug: slugify(item.label),
          color: item.color,
          sortOrder: index,
          active: true,
        });
      });
    }

    const created = await this.prisma.catalogItem.createMany({
      data: rows,
      skipDuplicates: true,
    });

    const funilExistente = await this.prisma.funil.findFirst({
      where: { tenantId },
      select: { id: true },
    });
    if (!funilExistente) {
      await this.prisma.funil.create({
        data: {
          tenantId,
          name: 'Funil padrão',
          tipo: FunilTipo.comercial,
          ativo: true,
          etapas: {
            create: DEFAULT_FUNNEL_STAGES.map((stage) => ({
              label: stage.label,
              slug: stage.slug,
              color: stage.color,
              sortOrder: stage.sortOrder,
              active: true,
              papel: stage.papel
                ? (stage.papel as FunilEtapaPapel)
                : null,
              prazoValor: stage.papel === 'perdido' ? null : 48,
            })),
          },
        },
      });
    }

    for (const tipo of [FunilTipo.captacao, FunilTipo.venda_usados] as const) {
      const exists = await this.prisma.funil.findFirst({
        where: { tenantId, tipo },
        select: { id: true },
      });
      if (exists) continue;
      const baseName = DEFAULT_FUNIL_NAME[tipo];
      const clash = await this.prisma.funil.findUnique({
        where: { tenantId_name: { tenantId, name: baseName } },
        select: { id: true },
      });
      await this.prisma.funil.create({
        data: {
          tenantId,
          name: clash ? `${baseName} (padrão)` : baseName,
          tipo,
          ativo: true,
          etapas: { create: funilEtapasCreateData(tipo) },
        },
      });
    }

    return created.count;
  }

  // -------------------------------------------------------------------
  // Usuários e equipes
  // -------------------------------------------------------------------

  private async seedUsers(tenantId: string, slug: string) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
    const userIdByKey = new Map<DemoUserKey, string>();
    const criados: { name: string; email: string; role: Role }[] = [];

    for (const def of DEMO_USERS) {
      const email = demoUserEmail(slug, def.key);
      const existing = await this.prisma.user.findFirst({
        where: { tenantId, email },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            name: def.name,
            password: passwordHash,
            phone: def.phone,
            whatsapp: def.phone,
            cargo: def.cargo,
            role: def.role,
            status: def.status,
            creci: def.creci ?? null,
            ...(def.creciStatus ? { creciStatus: def.creciStatus } : {}),
            cor: def.cor,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });
        userIdByKey.set(def.key, existing.id);
        continue;
      }

      const user = await this.prisma.user.create({
        data: {
          tenantId,
          name: def.name,
          email,
          password: passwordHash,
          phone: def.phone,
          whatsapp: def.phone,
          cargo: def.cargo,
          role: def.role,
          status: def.status,
          creci: def.creci ?? null,
          ...(def.creciStatus ? { creciStatus: def.creciStatus } : {}),
          cor: def.cor,
        },
        select: { id: true },
      });
      userIdByKey.set(def.key, user.id);
      criados.push({ name: def.name, email, role: def.role });
    }

    const admin = await this.prisma.user.findFirst({
      where: { tenantId, role: Role.admin },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const adminId = admin?.id ?? userIdByKey.get('gerente')!;

    return { userIdByKey, adminId, criados };
  }

  /**
   * Libera usuários extras se a carga demo passou da cota do plano.
   * Retorna quantos extras foram acrescentados (0 = cota já era suficiente).
   */
  private async ensureUserQuota(tenantId: string): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maxUsuarios: true, usuariosExtras: true },
    });
    if (!tenant) return 0;
    const total = await this.prisma.user.count({ where: { tenantId } });
    const limite = tenant.maxUsuarios + tenant.usuariosExtras;
    if (total <= limite) return 0;

    const novosExtras = Math.max(0, total - tenant.maxUsuarios);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { usuariosExtras: novosExtras },
    });
    return novosExtras - tenant.usuariosExtras;
  }

  private async seedEquipes(
    tenantId: string,
    userIdByKey: Map<DemoUserKey, string>,
  ): Promise<number> {
    let criadas = 0;

    for (const def of DEMO_EQUIPES) {
      const gerenteId = userIdByKey.get(def.gerente);
      if (!gerenteId) continue;

      const existing = await this.prisma.equipe.findFirst({
        where: { tenantId, gerenteId },
        select: { id: true },
      });
      const equipeId =
        existing?.id ??
        (
          await this.prisma.equipe.create({
            data: {
              tenantId,
              name: def.name,
              gerenteId,
              status: UserStatus.ativo,
            },
            select: { id: true },
          })
        ).id;
      if (!existing) criadas += 1;

      const membros = DEMO_USERS.filter((u) => u.equipe === def.slot)
        .map((u) => userIdByKey.get(u.key))
        .filter((id): id is string => Boolean(id));
      if (membros.length) {
        await this.prisma.user.updateMany({
          where: { id: { in: membros }, tenantId },
          data: { equipeId },
        });
      }
    }

    return criadas;
  }

  private async enableCaptacaoOperations(
    tenantId: string,
    plano: TenantPlano,
    modules: Prisma.JsonValue,
  ) {
    const current = applyPlanoModules(plano, modules);
    const next = applyPlanoModules(
      plano,
      mergeOperationModules(current, {
        captacao: true,
        imoveisUsados: true,
      }),
    );
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { modules: next as Prisma.InputJsonValue },
    });
  }

  private async seedEquipeFunis(tenantId: string) {
    const equipes = await this.prisma.equipe.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const funis = await this.prisma.funil.findMany({
      where: { tenantId, ativo: true },
      select: { id: true, tipo: true },
    });
    for (const equipe of equipes) {
      for (const funil of funis) {
        await this.prisma.equipeFunil.upsert({
          where: {
            equipeId_tipo: { equipeId: equipe.id, tipo: funil.tipo },
          },
          create: {
            tenantId,
            equipeId: equipe.id,
            funilId: funil.id,
            tipo: funil.tipo,
          },
          update: { funilId: funil.id },
        });
      }
    }
  }

  private async loadFunilComEtapas(tenantId: string, tipo: FunilTipo) {
    return this.prisma.funil.findFirst({
      where: { tenantId, tipo, ativo: true },
      include: {
        etapas: {
          where: { active: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  private async seedCaptacaoEUsados(
    tenantId: string,
    userIdByKey: Map<DemoUserKey, string>,
  ) {
    const counts = {
      proprietarios: 0,
      imoveis: 0,
      captacoes: 0,
      interessadosUsados: 0,
      vendasUsados: 0,
    };
    const funilCaptacao = await this.loadFunilComEtapas(
      tenantId,
      FunilTipo.captacao,
    );
    const funilUsados = await this.loadFunilComEtapas(
      tenantId,
      FunilTipo.venda_usados,
    );
    if (!funilCaptacao?.etapas.length) return counts;

    const etapaCapBySlug = new Map(
      funilCaptacao.etapas.map((e) => [e.slug, e]),
    );
    const etapaUsadoBySlug = new Map(
      (funilUsados?.etapas ?? []).map((e) => [e.slug, e]),
    );
    const fallbackCap = funilCaptacao.etapas[0]!;
    const fallbackUsado = funilUsados?.etapas[0];
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
    const fallbackUser =
      userIdByKey.get('corretor1') ??
      userIdByKey.get('gerente') ??
      (await this.prisma.user.findFirst({
        where: { tenantId, status: UserStatus.ativo },
        select: { id: true },
      }))?.id;
    if (!fallbackUser) return counts;

    const vendaImovelIds: string[] = [];

    for (const def of DEMO_CAPTATION_IMOVEIS) {
      const existente = await this.prisma.proprietario.findFirst({
        where: { tenantId, email: def.email },
        select: { id: true },
      });
      if (existente) continue;

      const responsavelId =
        userIdByKey.get(def.corretor) ?? fallbackUser;
      const etapa =
        etapaCapBySlug.get(def.etapaSlug) ?? fallbackCap;
      const tipoPessoa =
        def.cpfCnpj.replace(/\D/g, '').length > 11
          ? PessoaTipo.juridica
          : PessoaTipo.fisica;

      const proprietario = await this.prisma.proprietario.create({
        data: {
          tenantId,
          nome: def.proprietario,
          tipoPessoa,
          cpfCnpj: def.cpfCnpj,
          telefone: def.telefone,
          email: def.email,
        },
        select: { id: true },
      });
      counts.proprietarios += 1;

      if (def.portal) {
        await this.prisma.proprietarioPortalAcesso.create({
          data: {
            tenantId,
            proprietarioId: proprietario.id,
            password: passwordHash,
            status: ProprietarioPortalStatus.ativo,
          },
        });
      }

      const imovel = await this.prisma.imovel.create({
        data: {
          tenantId,
          proprietarioId: proprietario.id,
          tipo: def.tipo as CaptacaoImovelTipo,
          cep: def.cep,
          logradouro: def.logradouro,
          numero: def.numero,
          bairro: def.bairro,
          cidade: def.cidade,
          estado: def.estado,
          area: def.area,
          quartos: def.quartos ?? null,
          suites: def.suites ?? null,
          banheiros: def.banheiros ?? null,
          vagas: def.vagas ?? null,
          descricao: def.descricao,
        },
        select: { id: true },
      });
      counts.imoveis += 1;

      await this.prisma.captacao.create({
        data: {
          tenantId,
          proprietarioId: proprietario.id,
          imovelId: imovel.id,
          responsavelId,
          origem: def.origem,
          exclusividade: def.exclusivo === true,
          valorPretendido: def.pretendido,
          valorAvaliacao: def.avaliacao,
          funilId: funilCaptacao.id,
          funilEtapaId: etapa.id,
          historicos: {
            create: {
              tenantId,
              tipo: CaptacaoHistoricoTipo.criacao,
              texto: `Captação de demonstração em ${etapa.label}.`,
              autorId: responsavelId,
            },
          },
        },
        select: { id: true },
      });
      counts.captacoes += 1;

      if (def.vendaUsado && funilUsados && fallbackUsado) {
        const etapaVenda =
          etapaUsadoBySlug.get(def.vendaUsado.etapaSlug) ?? fallbackUsado;
        const venda = await this.prisma.vendaUsado.create({
          data: {
            tenantId,
            imovelId: imovel.id,
            responsavelId,
            funilId: funilUsados.id,
            funilEtapaId: etapaVenda.id,
            status: def.vendaUsado.status as VendaUsadoStatus,
            precoVenda: def.vendaUsado.preco,
            observacoes: 'Listagem de demonstração.',
            historicos: {
              create: {
                tenantId,
                tipo: VendaUsadoHistoricoTipo.disponibilizacao,
                texto: `Imóvel disponibilizado no funil de usados (${etapaVenda.label}).`,
                autorId: responsavelId,
              },
            },
          },
          select: { id: true },
        });
        counts.vendasUsados += 1;
        vendaImovelIds.push(venda.id);
      }
    }

    const interessadoIds: string[] = [];
    for (const def of DEMO_INTERESSADOS_USADOS) {
      const jaTem = await this.prisma.interessadoUsado.findFirst({
        where: { tenantId, email: def.email },
        select: { id: true },
      });
      if (jaTem) {
        interessadoIds.push(jaTem.id);
        continue;
      }
      const row = await this.prisma.interessadoUsado.create({
        data: {
          tenantId,
          nome: def.nome,
          telefone: def.telefone,
          email: def.email,
          cidade: def.cidade,
          tipoDesejado: def.tipoDesejado as CaptacaoImovelTipo,
          precoMax: def.precoMax,
          quartosMin: def.quartosMin,
        },
        select: { id: true },
      });
      interessadoIds.push(row.id);
      counts.interessadosUsados += 1;
    }

    const vendas = await this.prisma.vendaUsado.findMany({
      where: { tenantId, id: { in: vendaImovelIds } },
      select: { id: true, responsavelId: true, precoVenda: true },
      orderBy: { createdAt: 'asc' },
    });
    if (vendas[0] && interessadoIds[0]) {
      await this.prisma.vendaUsadoVinculo.upsert({
        where: {
          vendaUsadoId_interessadoId: {
            vendaUsadoId: vendas[0].id,
            interessadoId: interessadoIds[0],
          },
        },
        create: {
          tenantId,
          vendaUsadoId: vendas[0].id,
          interessadoId: interessadoIds[0],
          interesse: InteresseUsadoStatus.interessado,
        },
        update: {},
      });
      await this.prisma.vendaUsadoVisita.create({
        data: {
          tenantId,
          vendaUsadoId: vendas[0].id,
          interessadoId: interessadoIds[0],
          responsavelId: vendas[0].responsavelId,
          dataHora: new Date(Date.now() + DAY_MS),
          status: VendaUsadoVisitaStatus.agendada,
          observacoes: 'Visita de demonstração.',
        },
      });
    }
    if (vendas[1] && interessadoIds[1]) {
      await this.prisma.vendaUsadoVinculo.upsert({
        where: {
          vendaUsadoId_interessadoId: {
            vendaUsadoId: vendas[1].id,
            interessadoId: interessadoIds[1],
          },
        },
        create: {
          tenantId,
          vendaUsadoId: vendas[1].id,
          interessadoId: interessadoIds[1],
          interesse: InteresseUsadoStatus.em_contato,
        },
        update: {},
      });
      await this.prisma.vendaUsadoProposta.create({
        data: {
          tenantId,
          vendaUsadoId: vendas[1].id,
          interessadoId: interessadoIds[1],
          responsavelId: vendas[1].responsavelId,
          valor: vendas[1].precoVenda ?? 900000,
          status: VendaUsadoPropostaStatus.enviada,
          observacoes: 'Proposta de demonstração.',
        },
      });
    }

    return counts;
  }

  private async loadEquipeIds(
    tenantId: string,
    userIdByKey: Map<DemoUserKey, string>,
  ): Promise<Map<1 | 2, string>> {
    const map = new Map<1 | 2, string>();
    for (const def of DEMO_EQUIPES) {
      const gerenteId = userIdByKey.get(def.gerente);
      if (!gerenteId) continue;
      const equipe = await this.prisma.equipe.findFirst({
        where: { tenantId, gerenteId },
        select: { id: true },
      });
      if (equipe) map.set(def.slot, equipe.id);
    }
    return map;
  }

  // -------------------------------------------------------------------
  // Catálogo de imóveis
  // -------------------------------------------------------------------

  private async seedLocalidades(tenantId: string): Promise<string[]> {
    const ids: string[] = [];
    for (const nome of DEMO_LOCALIDADES) {
      const row = await this.prisma.localidade.upsert({
        where: { tenantId_nome: { tenantId, nome } },
        update: {},
        create: { tenantId, nome },
        select: { id: true },
      });
      ids.push(row.id);
    }
    return ids;
  }

  private async seedConstrutoras(
    tenantId: string,
    localidadeIds: string[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const def of DEMO_CONSTRUTORAS) {
      const existing = await this.prisma.construtora.findFirst({
        where: { tenantId, nome: def.nome },
        select: { id: true },
      });
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const row = await this.prisma.construtora.create({
        data: {
          tenantId,
          nome: def.nome,
          cor: def.cor,
          contato: def.contato,
          endereco: def.endereco,
          viabilizadorNome: def.viabilizadorNome,
          viabilizadorContato: def.viabilizadorContato,
          cca: def.cca,
          driveFolderUrl: `https://drive.google.com/demo/${slugify(def.nome)}`,
          localidades: {
            connect: def.localidades
              .map((i) => localidadeIds[i])
              .filter(Boolean)
              .map((id) => ({ id })),
          },
        },
        select: { id: true },
      });
      ids.push(row.id);
    }
    return ids;
  }

  private async seedEmpreendimentos(
    tenantId: string,
    construtoraIds: string[],
    localidadeIds: string[],
  ): Promise<string[]> {
    const now = Date.now();
    const ids: string[] = [];

    for (const def of DEMO_EMPREENDIMENTOS) {
      const externalKey = `demo-${slugify(def.nome)}`;
      const previsao =
        def.previsaoMesesFrente > 0
          ? new Date(now + def.previsaoMesesFrente * 30 * DAY_MS)
          : null;

      const row = await this.prisma.empreendimento.upsert({
        where: { tenantId_externalKey: { tenantId, externalKey } },
        update: {},
        create: {
          tenantId,
          nome: def.nome,
          cor: def.cor,
          construtoraId: construtoraIds[def.construtora] ?? null,
          localidadeId: localidadeIds[def.localidade] ?? null,
          cidade: def.cidade,
          endereco: def.endereco,
          tipo: def.tipo,
          status: def.status,
          previsaoEntrega: previsao,
          tags: def.tags,
          observacao: def.observacao,
          quartos: def.quartos || null,
          banheiros: def.banheiros || null,
          areaM2: def.areaM2,
          externalKey,
          ativo: def.ativo ?? true,
        },
        select: { id: true },
      });
      ids.push(row.id);
    }

    return ids;
  }

  // -------------------------------------------------------------------
  // Leads
  // -------------------------------------------------------------------

  private async seedLeads(
    tenantId: string,
    ctx: {
      userIdByKey: Map<DemoUserKey, string>;
      equipeIdBySlot: Map<1 | 2, string>;
      construtoraIds: string[];
      empreendimentoIds: string[];
    },
  ): Promise<{ leadIdByKey: Map<string, string>; novos: number }> {
    const now = Date.now();
    const leadIdByKey = new Map<string, string>();

    // Só reaproveita contatos que batem em e-mail E nome — evita escrever
    // triagem/documentação/proposta em cima de um lead real do cliente.
    const existentes = await this.prisma.lead.findMany({
      where: {
        tenantId,
        email: { in: DEMO_LEADS.map((l) => l.email) },
        nome: { in: DEMO_LEADS.map((l) => l.nome) },
      },
      select: { id: true, email: true, nome: true },
    });
    const idByEmail = new Map(
      existentes.map((l) => [`${l.email}|${l.nome}`, l.id]),
    );

    const data: Prisma.LeadCreateManyInput[] = [];

    for (const def of DEMO_LEADS) {
      const jaExiste = idByEmail.get(`${def.email}|${def.nome}`);
      if (jaExiste) {
        leadIdByKey.set(def.key, jaExiste);
        continue;
      }

      const id = randomUUID();
      const criadoEm = new Date(now - def.diasAtras * DAY_MS);
      const stageEnteredAt = new Date(
        now - Math.min(def.diasAtras, 3) * DAY_MS,
      );
      const prazoDueAt = def.overdue
        ? new Date(now - 6 * HOUR_MS)
        : def.alerta
          ? new Date(now + 4 * HOUR_MS)
          : new Date(now + 2 * DAY_MS);
      const perdidoAt = def.perda
        ? new Date(now - Math.max(1, def.diasAtras - 2) * DAY_MS)
        : null;

      data.push({
        id,
        tenantId,
        tipo: def.tipo,
        nome: def.nome,
        telefone: def.telefone,
        email: def.email,
        origem: def.origem,
        interesse: def.interesse,
        cidade: def.cidade,
        bairro: def.bairro,
        stage: def.stage,
        prioridade: def.prioridade,
        renda: def.renda ?? null,
        tipoRenda: def.tipoRenda ?? null,
        estadoCivil: def.estadoCivil ?? null,
        tags: def.tags,
        corretorId: def.corretor
          ? (ctx.userIdByKey.get(def.corretor) ?? null)
          : null,
        equipeId: def.equipe ? (ctx.equipeIdBySlot.get(def.equipe) ?? null) : null,
        construtoraId:
          def.construtora !== undefined
            ? (ctx.construtoraIds[def.construtora] ?? null)
            : null,
        empreendimentoId:
          def.empreendimento !== undefined
            ? (ctx.empreendimentoIds[def.empreendimento] ?? null)
            : null,
        stageEnteredAt,
        lastMovementAt: stageEnteredAt,
        lastStageChangeAt: stageEnteredAt,
        prazoDueAt: def.perda ? null : prazoDueAt,
        alertaProximoAt: def.alerta ? new Date(now - HOUR_MS) : null,
        perdidoAt,
        motivoPerda: def.perda?.motivo ?? null,
        perdidoPorId: def.perda
          ? (ctx.userIdByKey.get(def.perda.por) ?? null)
          : null,
        createdAt: criadoEm,
        updatedAt: perdidoAt ?? stageEnteredAt,
      });
      leadIdByKey.set(def.key, id);
    }

    if (data.length) {
      await this.prisma.lead.createMany({ data });
    }

    return { leadIdByKey, novos: data.length };
  }

  private async seedTriagem(
    leadIdByKey: Map<string, string>,
    userIdByKey: Map<DemoUserKey, string>,
  ): Promise<number> {
    const now = Date.now();
    const data: Prisma.TriagemEventCreateManyInput[] = [];

    const leadIds = DEMO_TRIAGEM.map((t) => leadIdByKey.get(t.lead)).filter(
      (id): id is string => Boolean(id),
    );
    const comTriagem = new Set(
      (
        await this.prisma.triagemEvent.findMany({
          where: { leadId: { in: leadIds } },
          select: { leadId: true },
        })
      ).map((t) => t.leadId),
    );

    for (const def of DEMO_TRIAGEM) {
      const leadId = leadIdByKey.get(def.lead);
      const autorId = userIdByKey.get(def.autor);
      if (!leadId || !autorId || comTriagem.has(leadId)) continue;
      data.push({
        leadId,
        autorId,
        texto: def.texto,
        stageAnterior: def.stageAnterior ?? null,
        stageNovo: def.stageNovo ?? null,
        origem: def.stageNovo ? TriagemOrigem.funil : TriagemOrigem.manual,
        createdAt: new Date(now - def.diasAtras * DAY_MS),
      });
    }

    if (data.length) {
      await this.prisma.triagemEvent.createMany({ data });
    }
    return data.length;
  }

  // -------------------------------------------------------------------
  // Documentação / propostas / análises
  // -------------------------------------------------------------------

  private async seedDocumentacoes(
    tenantId: string,
    ctx: {
      leadIdByKey: Map<string, string>;
      userIdByKey: Map<DemoUserKey, string>;
      construtoraIds: string[];
      empreendimentoIds: string[];
      adminId: string;
    },
  ): Promise<{ docs: DemoDocumentacaoResumo[]; criadas: number }> {
    const now = Date.now();

    const defs: {
      lead: string;
      corretor: DemoUserKey;
      gerente: DemoUserKey;
      equipeSlot: 1 | 2;
      construtora: number;
      empreendimento: number;
      empreendimentoNome: string;
      status1: string;
      status2: string;
      fonte: string;
      vgv: number;
      diasAtras: number;
      temEntrada: boolean;
      valorEntrada?: number;
      temFgts: boolean;
      valorFgts?: number;
      temDependente: boolean;
      obs: string;
    }[] = [
      {
        lead: 'marcelo',
        corretor: 'corretor2',
        gerente: 'gerente',
        equipeSlot: 1,
        construtora: 2,
        empreendimento: 4,
        empreendimentoNome: 'Residencial Candeias Vida',
        status1: 'Aprovado',
        status2: 'Vendido',
        fonte: 'Campanha',
        vgv: 285000,
        diasAtras: 16,
        temEntrada: true,
        valorEntrada: 20000,
        temFgts: true,
        valorFgts: 18000,
        temDependente: true,
        obs: 'Venda aprovada na Caixa, assinatura concluída.',
      },
      {
        lead: 'helena',
        corretor: 'corretor3',
        gerente: 'gerente2',
        equipeSlot: 2,
        construtora: 1,
        empreendimento: 1,
        empreendimentoNome: 'Edifício Casa Forte Prime',
        status1: 'Aprovado',
        status2: 'Vendido',
        fonte: 'Indicação',
        vgv: 890000,
        diasAtras: 20,
        temEntrada: true,
        valorEntrada: 90000,
        temFgts: false,
        temDependente: false,
        obs: 'Alto padrão, financiamento bancário aprovado.',
      },
      {
        lead: 'leticia',
        corretor: 'corretor1',
        gerente: 'gerente',
        equipeSlot: 1,
        construtora: 1,
        empreendimento: 1,
        empreendimentoNome: 'Edifício Casa Forte Prime',
        status1: 'Aprovado c/ restrição',
        status2: 'Andamento',
        fonte: 'Indicação',
        vgv: 745000,
        diasAtras: 10,
        temEntrada: true,
        valorEntrada: 60000,
        temFgts: true,
        valorFgts: 25000,
        temDependente: false,
        obs: 'Restrição menor no SPC, aguardando regularização.',
      },
      {
        lead: 'thiago',
        corretor: 'corretor4',
        gerente: 'gerente2',
        equipeSlot: 2,
        construtora: 3,
        empreendimento: 2,
        empreendimentoNome: 'Porto Beach Residence',
        status1: 'Em análise',
        status2: 'Andamento',
        fonte: 'Lead próprio',
        vgv: 520000,
        diasAtras: 4,
        temEntrada: true,
        valorEntrada: 50000,
        temFgts: true,
        valorFgts: 32000,
        temDependente: false,
        obs: 'Documentação enviada ao CCA, aguardando parecer.',
      },
      {
        lead: 'icaro',
        corretor: 'corretor1',
        gerente: 'gerente',
        equipeSlot: 1,
        construtora: 0,
        empreendimento: 0,
        empreendimentoNome: 'Reserva Boa Viagem',
        status1: 'Em análise',
        status2: 'Bacen',
        fonte: 'Lista',
        vgv: 615000,
        diasAtras: 6,
        temEntrada: false,
        temFgts: true,
        valorFgts: 40000,
        temDependente: true,
        obs: 'Consulta Bacen em andamento.',
      },
    ];

    const leadIds = defs
      .map((d) => ctx.leadIdByKey.get(d.lead))
      .filter((id): id is string => Boolean(id));
    const existentes = await this.prisma.documentacao.findMany({
      where: { tenantId, leadId: { in: leadIds } },
      select: {
        id: true,
        leadId: true,
        nome: true,
        vgv: true,
        status2: true,
        dataVenda: true,
        createdAt: true,
      },
    });
    const existentePorLead = new Map(existentes.map((d) => [d.leadId, d]));

    const criadas: Prisma.DocumentacaoCreateManyInput[] = [];
    const resumo: DemoDocumentacaoResumo[] = [];

    for (const def of defs) {
      const leadId = ctx.leadIdByKey.get(def.lead);
      if (!leadId) continue;
      const leadDef = DEMO_LEADS.find((l) => l.key === def.lead);
      if (!leadDef) continue;

      // Documentação já existente entra no resumo para que as comissões
      // sejam geradas mesmo em uma segunda execução sem limpeza.
      const existente = existentePorLead.get(leadId);
      if (existente) {
        resumo.push({
          id: existente.id,
          nome: existente.nome,
          vgv: existente.vgv ?? def.vgv,
          vendido: isStatusVendido(existente.status2),
          corretorKey: def.corretor,
          gerenteKey: def.gerente,
          empreendimento: def.empreendimentoNome,
          dataVenda: existente.dataVenda ?? existente.createdAt,
          equipeSlot: def.equipeSlot,
        });
        continue;
      }

      const id = randomUUID();
      const dataAnalise = new Date(now - (def.diasAtras + 3) * DAY_MS);
      const dataVenda = new Date(now - def.diasAtras * DAY_MS);
      const vendido = def.status2 === 'Vendido';

      criadas.push({
        id,
        tenantId,
        leadId,
        autorId: ctx.userIdByKey.get(def.corretor) ?? ctx.adminId,
        tipoContato: leadDef.tipo,
        stageSituacao: leadDef.stage,
        nome: leadDef.nome,
        construtoraId: ctx.construtoraIds[def.construtora] ?? null,
        empreendimentoId: ctx.empreendimentoIds[def.empreendimento] ?? null,
        fonte: def.fonte,
        status1: def.status1,
        status2: def.status2,
        corretorId: ctx.userIdByKey.get(def.corretor) ?? null,
        gerenteId: ctx.userIdByKey.get(def.gerente) ?? null,
        dataAnalise,
        dataVenda: vendido ? dataVenda : null,
        vgv: def.vgv,
        obs: def.obs,
        temEntrada: def.temEntrada,
        valorEntrada: def.valorEntrada ?? null,
        temFgts: def.temFgts,
        valorFgts: def.valorFgts ?? null,
        temDependente: def.temDependente,
        createdAt: dataAnalise,
        updatedAt: dataVenda,
      });

      resumo.push({
        id,
        nome: leadDef.nome,
        vgv: def.vgv,
        vendido,
        corretorKey: def.corretor,
        gerenteKey: def.gerente,
        empreendimento: def.empreendimentoNome,
        dataVenda,
        equipeSlot: def.equipeSlot,
      });
    }

    if (criadas.length) {
      await this.prisma.documentacao.createMany({ data: criadas });
    }

    return { docs: resumo, criadas: criadas.length };
  }

  private async seedPropostas(
    tenantId: string,
    ctx: {
      leadIdByKey: Map<string, string>;
      userIdByKey: Map<DemoUserKey, string>;
      construtoraIds: string[];
      empreendimentoIds: string[];
      adminId: string;
    },
  ): Promise<number> {
    const now = Date.now();
    const ano = new Date().getFullYear();

    const defs: {
      lead: string;
      corretor: DemoUserKey;
      construtora: number;
      empreendimento: number;
      unidade: string;
      valor: number;
      entrada: number;
      fgts?: number;
      mcmv?: number;
      financiamento: number;
      desconto?: number;
      status: PropostaStatus;
      diasAtras: number;
      observacao: string;
    }[] = [
      {
        lead: 'patricia',
        corretor: 'corretor3',
        construtora: 1,
        empreendimento: 1,
        unidade: 'Torre A — 1204',
        valor: 745000,
        entrada: 70000,
        financiamento: 600000,
        desconto: 15000,
        status: PropostaStatus.enviada,
        diasAtras: 7,
        observacao: 'Proposta enviada por e-mail, validade de 10 dias.',
      },
      {
        lead: 'bruno',
        corretor: 'corretor4',
        construtora: 4,
        empreendimento: 3,
        unidade: 'Quadra C — Lote 18',
        valor: 195000,
        entrada: 30000,
        financiamento: 150000,
        status: PropostaStatus.negociacao,
        diasAtras: 5,
        observacao: 'Cliente pediu revisão das parcelas intercaladas.',
      },
      {
        lead: 'icaro',
        corretor: 'corretor1',
        construtora: 0,
        empreendimento: 0,
        unidade: 'Torre Única — 802',
        valor: 615000,
        entrada: 55000,
        fgts: 40000,
        financiamento: 500000,
        status: PropostaStatus.aceita,
        diasAtras: 9,
        observacao: 'Proposta aceita, seguindo para documentação.',
      },
      {
        lead: 'nilo',
        corretor: 'corretor1',
        construtora: 3,
        empreendimento: 2,
        unidade: 'Bloco Mar — 305 e 306',
        valor: 980000,
        entrada: 120000,
        financiamento: 800000,
        status: PropostaStatus.rascunho,
        diasAtras: 2,
        observacao: 'Rascunho para 2 unidades — aguardando tabela atualizada.',
      },
      {
        lead: 'camila',
        corretor: 'corretor3',
        construtora: 2,
        empreendimento: 4,
        unidade: 'Bloco 2 — 104',
        valor: 268000,
        entrada: 12000,
        mcmv: 55000,
        financiamento: 200000,
        status: PropostaStatus.recusada,
        diasAtras: 12,
        observacao: 'Recusada — cliente achou a parcela alta.',
      },
    ];

    const leadIds = defs
      .map((d) => ctx.leadIdByKey.get(d.lead))
      .filter((id): id is string => Boolean(id));
    const jaTem = new Set(
      (
        await this.prisma.proposta.findMany({
          where: { tenantId, leadId: { in: leadIds } },
          select: { leadId: true },
        })
      ).map((p) => p.leadId),
    );

    const codigosUsados = new Set(
      (
        await this.prisma.proposta.findMany({
          where: { tenantId },
          select: { codigo: true },
        })
      ).map((p) => p.codigo),
    );
    let sequencia = 1;
    const proximoCodigo = () => {
      let codigo = `PROP-${ano}-${String(sequencia).padStart(4, '0')}`;
      while (codigosUsados.has(codigo)) {
        sequencia += 1;
        codigo = `PROP-${ano}-${String(sequencia).padStart(4, '0')}`;
      }
      codigosUsados.add(codigo);
      sequencia += 1;
      return codigo;
    };
    const data: Prisma.PropostaCreateManyInput[] = [];

    for (const def of defs) {
      const leadId = ctx.leadIdByKey.get(def.lead);
      if (!leadId || jaTem.has(leadId)) continue;
      const leadDef = DEMO_LEADS.find((l) => l.key === def.lead);
      if (!leadDef) continue;

      const criadoEm = new Date(now - def.diasAtras * DAY_MS);
      const codigo = proximoCodigo();

      data.push({
        tenantId,
        codigo,
        leadId,
        clienteNome: leadDef.nome,
        clienteTelefone: leadDef.telefone,
        clienteEmail: leadDef.email,
        clienteEstadoCivil: leadDef.estadoCivil ?? null,
        clienteRenda: leadDef.renda ?? null,
        clienteCidadeResidencial: leadDef.cidade,
        clienteBairroResidencial: leadDef.bairro,
        clienteUfResidencial: 'PE',
        clienteProfissao: leadDef.tipoRenda ?? null,
        construtoraId: ctx.construtoraIds[def.construtora] ?? null,
        empreendimentoId: ctx.empreendimentoIds[def.empreendimento] ?? null,
        unidade: def.unidade,
        corretorId: ctx.userIdByKey.get(def.corretor) ?? null,
        autorId: ctx.userIdByKey.get(def.corretor) ?? ctx.adminId,
        valor: def.valor,
        entrada: def.entrada,
        preChaves: [5000, 5000, 5000],
        posChaves: [3000, 3000],
        intercaladas: [12000],
        fgts: def.fgts ?? null,
        mcmv: def.mcmv ?? null,
        financiamento: def.financiamento,
        desconto: def.desconto ?? null,
        status: def.status,
        validade: new Date(criadoEm.getTime() + 10 * DAY_MS),
        enviadaEm:
          def.status === PropostaStatus.rascunho ? null : criadoEm,
        observacao: def.observacao,
        createdAt: criadoEm,
        updatedAt: criadoEm,
      });
    }

    if (data.length) {
      await this.prisma.proposta.createMany({ data });
    }
    return data.length;
  }

  private async seedAnalises(
    tenantId: string,
    ctx: {
      leadIdByKey: Map<string, string>;
      userIdByKey: Map<DemoUserKey, string>;
      adminId: string;
    },
  ): Promise<number> {
    const now = Date.now();

    const defs: {
      lead: string;
      autor: DemoUserKey;
      status: AnaliseStatus;
      parecer?: string;
      analista?: DemoUserKey;
      diasAtras: number;
      temFgts: boolean;
      valorFgts?: number;
      temEntrada: boolean;
      valorEntrada?: number;
    }[] = [
      {
        lead: 'thiago',
        autor: 'corretor4',
        status: AnaliseStatus.em_analise,
        analista: 'analista',
        diasAtras: 4,
        temFgts: true,
        valorFgts: 32000,
        temEntrada: true,
        valorEntrada: 50000,
      },
      {
        lead: 'diego',
        autor: 'corretor4',
        status: AnaliseStatus.pendente,
        diasAtras: 2,
        temFgts: false,
        temEntrada: true,
        valorEntrada: 25000,
      },
      {
        lead: 'icaro',
        autor: 'corretor1',
        status: AnaliseStatus.aprovado,
        analista: 'analista',
        parecer: 'Renda comprovada, aprovado até R$ 620 mil.',
        diasAtras: 6,
        temFgts: true,
        valorFgts: 40000,
        temEntrada: false,
      },
      {
        lead: 'otavio',
        autor: 'corretor2',
        status: AnaliseStatus.reprovado,
        analista: 'analista',
        parecer: 'Comprometimento de renda acima do limite do banco.',
        diasAtras: 19,
        temFgts: false,
        temEntrada: false,
      },
    ];

    let criadas = 0;

    for (const def of defs) {
      const leadId = ctx.leadIdByKey.get(def.lead);
      if (!leadId) continue;
      const leadDef = DEMO_LEADS.find((l) => l.key === def.lead);
      if (!leadDef) continue;

      const existing = await this.prisma.analise.findUnique({
        where: { leadId },
        select: { id: true },
      });
      if (existing) continue;

      const criadoEm = new Date(now - def.diasAtras * DAY_MS);
      await this.prisma.analise.create({
        data: {
          tenantId,
          leadId,
          autorId: ctx.userIdByKey.get(def.autor) ?? ctx.adminId,
          analistaId: def.analista
            ? (ctx.userIdByKey.get(def.analista) ?? null)
            : null,
          tipoContato: leadDef.tipo,
          stageSituacao: leadDef.stage,
          nome: leadDef.nome,
          telefone: leadDef.telefone,
          email: leadDef.email,
          origem: leadDef.origem,
          interesse: leadDef.interesse,
          cidade: leadDef.cidade,
          bairro: leadDef.bairro,
          prioridade: leadDef.prioridade,
          renda: leadDef.renda ?? null,
          tags: leadDef.tags,
          temFgts: def.temFgts,
          valorFgts: def.valorFgts ?? null,
          temEntrada: def.temEntrada,
          valorEntrada: def.valorEntrada ?? null,
          status: def.status,
          parecer: def.parecer ?? null,
          createdAt: criadoEm,
          updatedAt: criadoEm,
        },
      });
      criadas += 1;
    }

    return criadas;
  }

  // -------------------------------------------------------------------
  // Agenda, metas e notificações
  // -------------------------------------------------------------------

  private async seedAgenda(
    tenantId: string,
    ctx: {
      leadIdByKey: Map<string, string>;
      userIdByKey: Map<DemoUserKey, string>;
      equipeIdBySlot: Map<1 | 2, string>;
      adminId: string;
    },
  ): Promise<number> {
    const now = Date.now();
    const at = (dias: number, hora: number) => {
      const d = new Date(now + dias * DAY_MS);
      d.setHours(hora, 0, 0, 0);
      return d;
    };

    const defs: {
      titulo: string;
      lead?: string;
      autor: DemoUserKey | 'admin';
      atribuidoPara?: DemoUserKey;
      tipo: AgendamentoTipo;
      status: AgendamentoStatus;
      escopo: AgendamentoEscopo;
      solicitacao: AgendamentoSolicitacaoStatus;
      alvoTipo?: AgendamentoAlvo;
      alvoEquipeSlot?: 1 | 2;
      alvoGerente?: DemoUserKey;
      dias: number;
      hora: number;
      duracaoHoras: number;
      local?: string;
      observacoes?: string;
      aprovadoPor?: DemoUserKey;
      motivoRecusa?: string;
    }[] = [
      {
        titulo: 'Visita — Reserva Boa Viagem',
        lead: 'juliana',
        autor: 'corretor1',
        tipo: AgendamentoTipo.visita,
        status: AgendamentoStatus.agendado,
        escopo: AgendamentoEscopo.com_gerente,
        solicitacao: AgendamentoSolicitacaoStatus.aprovada,
        aprovadoPor: 'gerente',
        dias: 1,
        hora: 10,
        duracaoHoras: 1,
        local: 'Stand de vendas — Boa Viagem',
        observacoes: 'Levar tabela impressa e simulação da Caixa.',
      },
      {
        titulo: 'Visita — Porto Beach Residence',
        lead: 'thiago',
        autor: 'corretor4',
        tipo: AgendamentoTipo.visita,
        status: AgendamentoStatus.agendado,
        escopo: AgendamentoEscopo.com_gerente,
        solicitacao: AgendamentoSolicitacaoStatus.pendente,
        dias: 2,
        hora: 15,
        duracaoHoras: 2,
        local: 'Porto de Galinhas — decorado',
      },
      {
        titulo: 'Reunião de alinhamento com o gerente',
        lead: 'bruno',
        autor: 'corretor4',
        tipo: AgendamentoTipo.reuniao,
        status: AgendamentoStatus.agendado,
        escopo: AgendamentoEscopo.com_gerente,
        solicitacao: AgendamentoSolicitacaoStatus.recusada,
        aprovadoPor: 'gerente2',
        motivoRecusa: 'Horário conflita com o plantão do sábado.',
        dias: 3,
        hora: 9,
        duracaoHoras: 1,
      },
      {
        titulo: 'Ligar para retomar contato',
        lead: 'renata',
        autor: 'corretor3',
        tipo: AgendamentoTipo.ligacao,
        status: AgendamentoStatus.agendado,
        escopo: AgendamentoEscopo.pessoal,
        solicitacao: AgendamentoSolicitacaoStatus.nenhuma,
        dias: 0,
        hora: 17,
        duracaoHoras: 1,
      },
      {
        titulo: 'Enviar documentos ao CCA',
        lead: 'leticia',
        autor: 'gerente',
        atribuidoPara: 'corretor1',
        tipo: AgendamentoTipo.tarefa,
        status: AgendamentoStatus.agendado,
        escopo: AgendamentoEscopo.pessoal,
        solicitacao: AgendamentoSolicitacaoStatus.nenhuma,
        dias: -1,
        hora: 11,
        duracaoHoras: 1,
        observacoes: 'Tarefa atrasada — cobrar retorno hoje.',
      },
      {
        titulo: 'Visita realizada — Casa Forte Prime',
        lead: 'patricia',
        autor: 'corretor3',
        tipo: AgendamentoTipo.visita,
        status: AgendamentoStatus.concluido,
        escopo: AgendamentoEscopo.com_gerente,
        solicitacao: AgendamentoSolicitacaoStatus.aprovada,
        aprovadoPor: 'gerente2',
        dias: -4,
        hora: 14,
        duracaoHoras: 2,
        local: 'Casa Forte',
      },
      {
        titulo: 'Visita cancelada pelo cliente',
        lead: 'camila',
        autor: 'corretor3',
        tipo: AgendamentoTipo.visita,
        status: AgendamentoStatus.cancelado,
        escopo: AgendamentoEscopo.pessoal,
        solicitacao: AgendamentoSolicitacaoStatus.nenhuma,
        dias: -2,
        hora: 16,
        duracaoHoras: 1,
      },
      {
        titulo: 'Reunião geral de resultados',
        autor: 'admin',
        tipo: AgendamentoTipo.reuniao,
        status: AgendamentoStatus.agendado,
        escopo: AgendamentoEscopo.pessoal,
        solicitacao: AgendamentoSolicitacaoStatus.nenhuma,
        alvoTipo: AgendamentoAlvo.todos,
        dias: 4,
        hora: 9,
        duracaoHoras: 2,
        local: 'Auditório da matriz',
        observacoes: 'Fechamento do mês e metas do próximo ciclo.',
      },
      {
        titulo: 'Treinamento da Equipe Atlântico',
        autor: 'admin',
        tipo: AgendamentoTipo.reuniao,
        status: AgendamentoStatus.agendado,
        escopo: AgendamentoEscopo.pessoal,
        solicitacao: AgendamentoSolicitacaoStatus.nenhuma,
        alvoTipo: AgendamentoAlvo.equipe,
        alvoEquipeSlot: 1,
        dias: 6,
        hora: 14,
        duracaoHoras: 3,
      },
      {
        titulo: 'Alinhamento com gerentes',
        autor: 'admin',
        tipo: AgendamentoTipo.reuniao,
        status: AgendamentoStatus.agendado,
        escopo: AgendamentoEscopo.pessoal,
        solicitacao: AgendamentoSolicitacaoStatus.nenhuma,
        alvoTipo: AgendamentoAlvo.gerentes,
        dias: 5,
        hora: 8,
        duracaoHoras: 1,
      },
      {
        titulo: 'Bloqueio — plantão de vendas',
        autor: 'gerente',
        tipo: AgendamentoTipo.bloqueio,
        status: AgendamentoStatus.agendado,
        escopo: AgendamentoEscopo.pessoal,
        solicitacao: AgendamentoSolicitacaoStatus.nenhuma,
        dias: 7,
        hora: 8,
        duracaoHoras: 6,
        local: 'Stand Candeias',
      },
    ];

    const jaExistentes = new Set(
      (
        await this.prisma.agendamento.findMany({
          where: { tenantId, titulo: { in: defs.map((d) => d.titulo) } },
          select: { titulo: true },
        })
      ).map((a) => a.titulo),
    );

    const data: Prisma.AgendamentoCreateManyInput[] = [];

    for (const def of defs) {
      if (jaExistentes.has(def.titulo)) continue;
      const autorId =
        def.autor === 'admin'
          ? ctx.adminId
          : (ctx.userIdByKey.get(def.autor) ?? ctx.adminId);
      const startsAt = at(def.dias, def.hora);

      data.push({
        tenantId,
        leadId: def.lead ? (ctx.leadIdByKey.get(def.lead) ?? null) : null,
        autorId,
        atribuidoParaId: def.atribuidoPara
          ? (ctx.userIdByKey.get(def.atribuidoPara) ?? null)
          : null,
        titulo: def.titulo,
        tipo: def.tipo,
        status: def.status,
        escopo: def.escopo,
        solicitacaoStatus: def.solicitacao,
        alvoTipo: def.alvoTipo ?? AgendamentoAlvo.nenhum,
        alvoEquipeId: def.alvoEquipeSlot
          ? (ctx.equipeIdBySlot.get(def.alvoEquipeSlot) ?? null)
          : null,
        alvoGerenteId: def.alvoGerente
          ? (ctx.userIdByKey.get(def.alvoGerente) ?? null)
          : null,
        startsAt,
        endsAt: new Date(startsAt.getTime() + def.duracaoHoras * HOUR_MS),
        local: def.local ?? null,
        observacoes: def.observacoes ?? null,
        aprovadoPorId: def.aprovadoPor
          ? (ctx.userIdByKey.get(def.aprovadoPor) ?? null)
          : null,
        aprovadoAt: def.aprovadoPor
          ? new Date(startsAt.getTime() - DAY_MS)
          : null,
        motivoRecusa: def.motivoRecusa ?? null,
      });
    }

    if (data.length) {
      await this.prisma.agendamento.createMany({ data });
    }
    return data.length;
  }

  private async seedMetas(
    tenantId: string,
    userIdByKey: Map<DemoUserKey, string>,
    adminId: string,
  ): Promise<number> {
    const agora = new Date();
    const inicioMes = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1),
    );
    const fimMes = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1),
    );
    const inicioTrimestre = new Date(
      Date.UTC(agora.getUTCFullYear(), Math.floor(agora.getUTCMonth() / 3) * 3, 1),
    );
    const fimTrimestre = new Date(
      Date.UTC(
        agora.getUTCFullYear(),
        Math.floor(agora.getUTCMonth() / 3) * 3 + 3,
        1,
      ),
    );

    const defs: Prisma.MetaCreateManyInput[] = [
      {
        tenantId,
        escopo: MetaEscopo.corretor,
        corretorId: userIdByKey.get('corretor1') ?? null,
        criadorId: userIdByKey.get('corretor1') ?? adminId,
        origem: MetaOrigem.pessoal,
        tipo: MetaTipo.vendas,
        periodo: MetaPeriodo.mensal,
        valor: 3,
        inicio: inicioMes,
        fim: fimMes,
      },
      {
        tenantId,
        escopo: MetaEscopo.corretor,
        corretorId: userIdByKey.get('corretor2') ?? null,
        criadorId: userIdByKey.get('gerente') ?? adminId,
        origem: MetaOrigem.gerente,
        tipo: MetaTipo.documentacoes,
        periodo: MetaPeriodo.mensal,
        valor: 6,
        inicio: inicioMes,
        fim: fimMes,
      },
      {
        tenantId,
        escopo: MetaEscopo.corretor,
        corretorId: userIdByKey.get('corretor3') ?? null,
        criadorId: userIdByKey.get('gerente2') ?? adminId,
        origem: MetaOrigem.gerente,
        tipo: MetaTipo.vgv,
        periodo: MetaPeriodo.mensal,
        valor: 1200000,
        inicio: inicioMes,
        fim: fimMes,
      },
      {
        tenantId,
        escopo: MetaEscopo.gerente,
        gerenteId: userIdByKey.get('gerente') ?? null,
        criadorId: adminId,
        origem: MetaOrigem.admin,
        tipo: MetaTipo.vendas,
        periodo: MetaPeriodo.mensal,
        valor: 12,
        inicio: inicioMes,
        fim: fimMes,
      },
      {
        tenantId,
        escopo: MetaEscopo.imobiliaria,
        criadorId: adminId,
        origem: MetaOrigem.admin,
        tipo: MetaTipo.vgv,
        periodo: MetaPeriodo.trimestral,
        valor: 12000000,
        inicio: inicioTrimestre,
        fim: fimTrimestre,
      },
    ];

    const existentes = await this.prisma.meta.count({ where: { tenantId } });
    if (existentes > 0) return 0;

    const created = await this.prisma.meta.createMany({
      data: defs.filter(
        (m) => m.escopo === MetaEscopo.imobiliaria || m.corretorId || m.gerenteId,
      ),
    });
    return created.count;
  }

  private async seedNotificacoes(
    tenantId: string,
    leadIdByKey: Map<string, string>,
    userIdByKey: Map<DemoUserKey, string>,
  ): Promise<number> {
    const now = Date.now();
    const existentes = await this.prisma.notificacao.count({
      where: { tenantId },
    });
    if (existentes > 0) return 0;

    const defs: {
      user: DemoUserKey;
      tipo: NotificacaoTipo;
      titulo: string;
      corpo: string;
      lead?: string;
      lida: boolean;
      horasAtras: number;
    }[] = [
      {
        user: 'corretor1',
        tipo: NotificacaoTipo.analise_resultado,
        titulo: 'Análise aprovada',
        corpo: 'A análise de Ícaro Bezerra foi aprovada até R$ 620 mil.',
        lead: 'icaro',
        lida: false,
        horasAtras: 5,
      },
      {
        user: 'gerente2',
        tipo: NotificacaoTipo.agenda_solicitacao,
        titulo: 'Nova solicitação de visita',
        corpo: 'Rafael Nunes solicitou visita ao Porto Beach Residence.',
        lead: 'thiago',
        lida: false,
        horasAtras: 3,
      },
      {
        user: 'corretor4',
        tipo: NotificacaoTipo.agenda_resposta,
        titulo: 'Solicitação recusada',
        corpo: 'A reunião com o gerente foi recusada: horário conflitante.',
        lead: 'bruno',
        lida: true,
        horasAtras: 26,
      },
      {
        user: 'corretor1',
        tipo: NotificacaoTipo.agenda_atribuicao,
        titulo: 'Nova tarefa atribuída',
        corpo: 'Camila Borges atribuiu: enviar documentos ao CCA.',
        lead: 'leticia',
        lida: false,
        horasAtras: 30,
      },
      {
        user: 'corretor3',
        tipo: NotificacaoTipo.lead_prazo_ultrapassado,
        titulo: 'Prazo da etapa ultrapassado',
        corpo: 'Renata Lins está há mais tempo que o previsto em Qualificação.',
        lead: 'renata',
        lida: false,
        horasAtras: 6,
      },
      {
        user: 'corretor2',
        tipo: NotificacaoTipo.tarefa_atrasada,
        titulo: 'Tarefa atrasada',
        corpo: 'Você tem 1 tarefa vencida na agenda de hoje.',
        lida: false,
        horasAtras: 2,
      },
      {
        user: 'corretor1',
        tipo: NotificacaoTipo.agenda_lembrete_1d,
        titulo: 'Visita amanhã às 10h',
        corpo: 'Visita com Juliana Mendes no stand de Boa Viagem.',
        lead: 'juliana',
        lida: false,
        horasAtras: 1,
      },
    ];

    const data: Prisma.NotificacaoCreateManyInput[] = [];
    for (const def of defs) {
      const userId = userIdByKey.get(def.user);
      if (!userId) continue;
      data.push({
        tenantId,
        userId,
        tipo: def.tipo,
        titulo: def.titulo,
        corpo: def.corpo,
        lida: def.lida,
        leadId: def.lead ? (leadIdByKey.get(def.lead) ?? null) : null,
        createdAt: new Date(now - def.horasAtras * HOUR_MS),
      });
    }

    if (data.length) {
      await this.prisma.notificacao.createMany({ data });
    }
    return data.length;
  }

  private async seedTreinamento(tenantId: string): Promise<number> {
    const existentes = await this.prisma.treinamentoSecao.count({
      where: { tenantId },
    });
    if (existentes > 0) return 0;

    let total = 0;
    for (const [index, secao] of DEMO_TREINAMENTO.entries()) {
      const raiz = await this.prisma.treinamentoSecao.create({
        data: {
          tenantId,
          titulo: secao.titulo,
          sortOrder: index,
          links: {
            create: secao.links.map((link, i) => ({
              tenantId,
              titulo: link.titulo,
              url: link.url,
              sortOrder: i,
            })),
          },
        },
        select: { id: true },
      });
      total += 1 + secao.links.length;

      for (const [j, filho] of (secao.filhos ?? []).entries()) {
        await this.prisma.treinamentoSecao.create({
          data: {
            tenantId,
            parentId: raiz.id,
            titulo: filho.titulo,
            sortOrder: j,
            links: {
              create: filho.links.map((link, i) => ({
                tenantId,
                titulo: link.titulo,
                url: link.url,
                sortOrder: i,
              })),
            },
          },
        });
        total += 1 + filho.links.length;
      }
    }

    return total;
  }

  // -------------------------------------------------------------------
  // Financeiro
  // -------------------------------------------------------------------

  private async seedFinanceiro(
    tenantId: string,
    ctx: {
      documentacoes: DemoDocumentacaoResumo[];
      userIdByKey: Map<DemoUserKey, string>;
      equipeIdBySlot: Map<1 | 2, string>;
    },
  ): Promise<number> {
    const now = new Date();
    let total = 0;

    // Categorias
    const categorias: Prisma.FinanceiroCategoriaCreateManyInput[] = [
      ...['Comissão de venda', 'Taxa de corretagem', 'Consultoria', 'Outras receitas'].map(
        (nome) => ({
          tenantId,
          nome,
          tipo: FinanceiroMovimentoTipo.entrada,
        }),
      ),
      ...[
        'Aluguel',
        'Folha de pagamento',
        'Marketing digital',
        'Software / SaaS',
        'Impostos',
        'Comissão corretor',
        'Despesas gerais',
        'Energia / utilidades',
      ].map((nome) => ({
        tenantId,
        nome,
        tipo: FinanceiroMovimentoTipo.saida,
      })),
    ];
    total += (
      await this.prisma.financeiroCategoria.createMany({
        data: categorias,
        skipDuplicates: true,
      })
    ).count;

    // Parceiros
    const parceiroIdByNome = new Map<string, string>();
    for (const def of DEMO_FINANCEIRO_PARCEIROS) {
      const existing = await this.prisma.financeiroParceiro.findFirst({
        where: { tenantId, nome: def.nome },
        select: { id: true },
      });
      if (existing) {
        parceiroIdByNome.set(def.nome, existing.id);
        continue;
      }
      const row = await this.prisma.financeiroParceiro.create({
        data: {
          tenantId,
          nome: def.nome,
          documento: def.documento,
          tipo: def.tipo as FinanceiroParceiroTipo,
          email: def.email,
          telefone: def.telefone,
          cidade: def.cidade,
          ativo: true,
        },
        select: { id: true },
      });
      parceiroIdByNome.set(def.nome, row.id);
      total += 1;
    }

    // Tipos de despesa e lançamentos dos últimos 3 meses
    for (const def of DEMO_DESPESA_TIPOS) {
      const tipo = await this.prisma.financeiroDespesaTipo.upsert({
        where: {
          tenantId_nome_natureza: {
            tenantId,
            nome: def.nome,
            natureza: def.natureza as FinanceiroDespesaNatureza,
          },
        },
        update: {},
        create: {
          tenantId,
          nome: def.nome,
          natureza: def.natureza as FinanceiroDespesaNatureza,
          orcadoMensal: def.orcadoMensal,
        },
        select: { id: true },
      });

      for (let mesAtras = 2; mesAtras >= 0; mesAtras -= 1) {
        const data = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - mesAtras, 8),
        );
        const competencia = `${data.getUTCFullYear()}-${String(
          data.getUTCMonth() + 1,
        ).padStart(2, '0')}`;
        const descricao = `${def.nome} — ${competencia}`;

        const existe = await this.prisma.financeiroDespesa.findFirst({
          where: { tenantId, tipoId: tipo.id, competencia },
          select: { id: true },
        });
        if (existe) continue;

        const variacao = 1 + (mesAtras - 1) * 0.06;
        await this.prisma.financeiroDespesa.create({
          data: {
            tenantId,
            tipoId: tipo.id,
            descricao,
            valor: Math.round(def.orcadoMensal * variacao),
            data,
            competencia,
            recorrente: def.natureza !== 'variavel',
            observacao: '',
          },
        });
        total += 1;
      }
    }

    // Tipos de recebimento e lançamentos
    for (const def of DEMO_RECEBIMENTO_TIPOS) {
      const tipo = await this.prisma.financeiroRecebimentoTipo.upsert({
        where: {
          tenantId_nome_natureza: {
            tenantId,
            nome: def.nome,
            natureza: def.natureza as FinanceiroDespesaNatureza,
          },
        },
        update: {},
        create: {
          tenantId,
          nome: def.nome,
          natureza: def.natureza as FinanceiroDespesaNatureza,
          orcadoMensal: def.orcadoMensal,
        },
        select: { id: true },
      });

      for (let mesAtras = 2; mesAtras >= 0; mesAtras -= 1) {
        const data = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - mesAtras, 12),
        );
        const competencia = `${data.getUTCFullYear()}-${String(
          data.getUTCMonth() + 1,
        ).padStart(2, '0')}`;

        const existe = await this.prisma.financeiroRecebimento.findFirst({
          where: { tenantId, tipoId: tipo.id, competencia },
          select: { id: true },
        });
        if (existe) continue;

        await this.prisma.financeiroRecebimento.create({
          data: {
            tenantId,
            tipoId: tipo.id,
            descricao: `${def.nome} — ${competencia}`,
            valor: Math.round(def.orcadoMensal * (1 + (1 - mesAtras) * 0.08)),
            data,
            competencia,
            recorrente: def.natureza !== 'variavel',
            observacao: '',
          },
        });
        total += 1;
      }
    }

    // Títulos a receber / a pagar
    const titulosDefs: {
      tipo: FinanceiroTituloTipo;
      descricao: string;
      parceiro: string;
      categoria: string;
      centro: string;
      valor: number;
      diasVencimento: number;
      status: FinanceiroTituloStatus;
      parcela?: string;
    }[] = [
      {
        tipo: FinanceiroTituloTipo.receber,
        descricao: 'Comissão — Residencial Candeias Vida (Marcelo Tavares)',
        parceiro: 'Construtora Moura Dubeux (repasse)',
        categoria: 'Comissão de venda',
        centro: '',
        valor: 14250,
        diasVencimento: 12,
        status: FinanceiroTituloStatus.aberto,
        parcela: '1/2',
      },
      {
        tipo: FinanceiroTituloTipo.receber,
        descricao: 'Comissão — Casa Forte Prime (Helena Castro)',
        parceiro: 'Construtora Moura Dubeux (repasse)',
        categoria: 'Comissão de venda',
        centro: '',
        valor: 44500,
        diasVencimento: -6,
        status: FinanceiroTituloStatus.atrasado,
        parcela: '1/1',
      },
      {
        tipo: FinanceiroTituloTipo.receber,
        descricao: 'Consultoria de carteira — Imobiliária Parceira Norte',
        parceiro: 'Imobiliária Parceira Norte',
        categoria: 'Consultoria',
        centro: '',
        valor: 6000,
        diasVencimento: -20,
        status: FinanceiroTituloStatus.pago,
        parcela: '1/1',
      },
      {
        tipo: FinanceiroTituloTipo.pagar,
        descricao: 'Campanha de mídia paga — mês corrente',
        parceiro: 'Agência Criativa Marketing',
        categoria: 'Marketing digital',
        centro: 'Marketing digital',
        valor: 15000,
        diasVencimento: 8,
        status: FinanceiroTituloStatus.aberto,
        parcela: '1/3',
      },
      {
        tipo: FinanceiroTituloTipo.pagar,
        descricao: 'Aluguel da sede — mês corrente',
        parceiro: 'Coworking Empresarial Recife',
        categoria: 'Aluguel',
        centro: 'Aluguel e condomínio',
        valor: 9500,
        diasVencimento: 4,
        status: FinanceiroTituloStatus.aberto,
        parcela: '1/12',
      },
      {
        tipo: FinanceiroTituloTipo.pagar,
        descricao: 'Honorários contábeis',
        parceiro: 'Contabilidade Souza & Filhos',
        categoria: 'Despesas gerais',
        centro: 'Despesas gerais',
        valor: 2400,
        diasVencimento: -3,
        status: FinanceiroTituloStatus.atrasado,
        parcela: '1/12',
      },
      {
        tipo: FinanceiroTituloTipo.pagar,
        descricao: 'Assinaturas de software (CRM, e-mail, assinatura digital)',
        parceiro: 'Agência Criativa Marketing',
        categoria: 'Software / SaaS',
        centro: 'Software / SaaS',
        valor: 3200,
        diasVencimento: -15,
        status: FinanceiroTituloStatus.pago,
        parcela: '1/12',
      },
    ];

    const tituloDescricoes = titulosDefs.map((t) => t.descricao);
    const titulosExistentes = new Set(
      (
        await this.prisma.financeiroTitulo.findMany({
          where: { tenantId, descricao: { in: tituloDescricoes } },
          select: { descricao: true },
        })
      ).map((t) => t.descricao),
    );

    const movimentos: Prisma.FinanceiroMovimentoCreateManyInput[] = [];

    for (const def of titulosDefs) {
      if (titulosExistentes.has(def.descricao)) continue;
      const vencimento = new Date(now.getTime() + def.diasVencimento * DAY_MS);
      const pago = def.status === FinanceiroTituloStatus.pago;
      const tituloId = randomUUID();

      await this.prisma.financeiroTitulo.create({
        data: {
          id: tituloId,
          tenantId,
          tipo: def.tipo,
          descricao: def.descricao,
          parceiroId: parceiroIdByNome.get(def.parceiro) ?? null,
          parceiroNome: def.parceiro,
          categoria: def.categoria,
          centro: def.centro,
          vencimento,
          dataPagamento: pago ? vencimento : null,
          valor: def.valor,
          status: def.status,
          parcela: def.parcela ?? '',
        },
      });
      total += 1;

      if (pago) {
        movimentos.push({
          tenantId,
          data: vencimento,
          descricao: `Baixa — ${def.descricao}`,
          parceiroId: parceiroIdByNome.get(def.parceiro) ?? null,
          parceiroNome: def.parceiro,
          categoria: def.categoria,
          centro: def.centro,
          tipo:
            def.tipo === FinanceiroTituloTipo.receber
              ? FinanceiroMovimentoTipo.entrada
              : FinanceiroMovimentoTipo.saida,
          valor: def.valor,
          status: FinanceiroTituloStatus.pago,
          formaPagamento: 'PIX',
          tituloId,
        });
      }
    }

    // Movimentos avulsos (caixa do dia a dia)
    const avulsos: Prisma.FinanceiroMovimentoCreateManyInput[] = [
      {
        tenantId,
        data: new Date(now.getTime() - 2 * DAY_MS),
        descricao: 'Taxa de corretagem — assessoria documental',
        parceiroNome: 'Imobiliária Parceira Norte',
        parceiroId: parceiroIdByNome.get('Imobiliária Parceira Norte') ?? null,
        categoria: 'Taxa de corretagem',
        centro: '',
        tipo: FinanceiroMovimentoTipo.entrada,
        valor: 3800,
        status: FinanceiroTituloStatus.pago,
        formaPagamento: 'Transferência',
      },
      {
        tenantId,
        data: new Date(now.getTime() - 5 * DAY_MS),
        descricao: 'Energia elétrica da sede',
        parceiroNome: 'Coworking Empresarial Recife',
        parceiroId: parceiroIdByNome.get('Coworking Empresarial Recife') ?? null,
        categoria: 'Energia / utilidades',
        centro: 'Energia / utilidades',
        tipo: FinanceiroMovimentoTipo.saida,
        valor: 2740,
        status: FinanceiroTituloStatus.pago,
        formaPagamento: 'Boleto',
      },
      {
        tenantId,
        data: new Date(now.getTime() - 9 * DAY_MS),
        descricao: 'Folha de pagamento — equipe administrativa',
        parceiroNome: '',
        categoria: 'Folha de pagamento',
        centro: 'Folha de pagamento',
        tipo: FinanceiroMovimentoTipo.saida,
        valor: 42000,
        status: FinanceiroTituloStatus.pago,
        formaPagamento: 'Transferência',
      },
      {
        tenantId,
        data: new Date(now.getTime() + 3 * DAY_MS),
        descricao: 'Previsão de repasse de comissão',
        parceiroNome: 'Construtora Moura Dubeux (repasse)',
        parceiroId:
          parceiroIdByNome.get('Construtora Moura Dubeux (repasse)') ?? null,
        categoria: 'Comissão de venda',
        centro: '',
        tipo: FinanceiroMovimentoTipo.entrada,
        valor: 22300,
        status: FinanceiroTituloStatus.aberto,
        formaPagamento: '',
      },
    ];

    const movimentoDescricoes = [...movimentos, ...avulsos].map(
      (m) => m.descricao,
    );
    const movimentosExistentes = new Set(
      (
        await this.prisma.financeiroMovimento.findMany({
          where: { tenantId, descricao: { in: movimentoDescricoes } },
          select: { descricao: true },
        })
      ).map((m) => m.descricao),
    );

    const movimentosParaCriar = [...movimentos, ...avulsos].filter(
      (m) => !movimentosExistentes.has(m.descricao),
    );
    if (movimentosParaCriar.length) {
      total += (
        await this.prisma.financeiroMovimento.createMany({
          data: movimentosParaCriar,
        })
      ).count;
    }

    // Comissões das vendas concluídas
    total += await this.seedComissoes(tenantId, ctx);

    return total;
  }

  private async seedComissoes(
    tenantId: string,
    ctx: {
      documentacoes: DemoDocumentacaoResumo[];
      userIdByKey: Map<DemoUserKey, string>;
      equipeIdBySlot: Map<1 | 2, string>;
    },
  ): Promise<number> {
    const vendidas = ctx.documentacoes.filter((d) => d.vendido);
    if (!vendidas.length) return 0;

    const existentes = new Set(
      (
        await this.prisma.financeiroComissao.findMany({
          where: {
            tenantId,
            documentacaoId: { in: vendidas.map((d) => d.id) },
          },
          select: { documentacaoId: true },
        })
      ).map((c) => c.documentacaoId),
    );

    const percentuais = {
      imobiliaria: 5,
      tributos: 12,
      corretor: 40,
      gerente: 10,
      caixa: 30,
      socios: 20,
    };

    const statuses = [
      FinanceiroComissaoStatus.pendente,
      FinanceiroComissaoStatus.liberada,
    ];

    const data: Prisma.FinanceiroComissaoCreateManyInput[] = [];

    vendidas.forEach((doc, index) => {
      if (existentes.has(doc.id)) return;
      const corretorId = ctx.userIdByKey.get(doc.corretorKey);
      if (!corretorId) return;

      const dec = (value: number) => new Prisma.Decimal(value.toFixed(2));
      const vgv = dec(doc.vgv);
      const comissaoBruta = dec((doc.vgv * percentuais.imobiliaria) / 100);
      const valorTributos = dec(
        (Number(comissaoBruta) * percentuais.tributos) / 100,
      );
      const comissaoLiquida = dec(
        Number(comissaoBruta) - Number(valorTributos),
      );
      const fatia = (percent: number) =>
        dec((Number(comissaoLiquida) * percent) / 100);

      const corretorNome =
        DEMO_USERS.find((u) => u.key === doc.corretorKey)?.name ?? 'Corretor';
      const gerenteNome =
        DEMO_USERS.find((u) => u.key === doc.gerenteKey)?.name ?? '';

      data.push({
        tenantId,
        documentacaoId: doc.id,
        corretorId,
        gerenteId: ctx.userIdByKey.get(doc.gerenteKey) ?? null,
        equipeId: ctx.equipeIdBySlot.get(doc.equipeSlot) ?? null,
        corretor: corretorNome,
        gerente: gerenteNome,
        equipe:
          DEMO_EQUIPES.find((e) => e.slot === doc.equipeSlot)?.name ?? '',
        empreendimento: doc.empreendimento,
        cliente: doc.nome,
        dataVenda: doc.dataVenda,
        dataPrevistaRecebimento: new Date(
          doc.dataVenda.getTime() + 30 * DAY_MS,
        ),
        vgv,
        percentualImobiliaria: dec(percentuais.imobiliaria),
        comissaoBruta,
        percentualTributos: dec(percentuais.tributos),
        valorTributos,
        comissaoLiquida,
        percentualCorretor: dec(percentuais.corretor),
        valorCorretor: fatia(percentuais.corretor),
        percentualGerente: dec(percentuais.gerente),
        valorGerente: fatia(percentuais.gerente),
        percentualCaixa: dec(percentuais.caixa),
        valorCaixa: fatia(percentuais.caixa),
        percentualSocios: dec(percentuais.socios),
        valorSocios: fatia(percentuais.socios),
        status: statuses[index % statuses.length],
      });
    });

    if (!data.length) return 0;
    const created = await this.prisma.financeiroComissao.createMany({ data });
    return created.count;
  }
}
