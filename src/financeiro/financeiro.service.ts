import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FinanceiroComissaoStatus,
  FinanceiroDespesaNatureza,
  FinanceiroMovimentoTipo,
  FinanceiroParceiroTipo,
  FinanceiroTituloStatus,
  FinanceiroTituloTipo,
  Prisma,
  Role,
} from "@prisma/client";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import {
  isStatusVendido,
  status2VendidoWhere,
} from "../common/utils/documentacao-status";
import { resolveFinanceiroTenantId } from "../common/utils/tenant";
import { isCorretorLike } from "../common/utils/roles";
import { hasUserModule } from "../common/utils/user-permissions";
import { DocumentacaoService } from "../documentacao/documentacao.service";
import { LeadsService } from "../leads/leads.service";
import { PrismaService } from "../prisma/prisma.service";
import { BaixarTituloDto } from "./dto/baixar-titulo.dto";
import { CreateCategoriaDto } from "./dto/create-categoria.dto";
import { CreateComissaoDto } from "./dto/create-comissao.dto";
import { CreateComissaoVendaAvulsaDto } from "./dto/create-comissao-venda-avulsa.dto";
import { CreateDespesaDto } from "./dto/create-despesa.dto";
import { CreateDespesaTipoDto } from "./dto/create-despesa-tipo.dto";
import { CreateMovimentoDto } from "./dto/create-movimento.dto";
import { CreateParceiroDto } from "./dto/create-parceiro.dto";
import { CreateRecebimentoDto } from "./dto/create-recebimento.dto";
import { CreateRecebimentoTipoDto } from "./dto/create-recebimento-tipo.dto";
import { CreateTituloDto } from "./dto/create-titulo.dto";
import { CreateTitulosParceladoDto } from "./dto/create-titulos-parcelado.dto";
import {
  FluxoGranularidade,
  QueryFluxoCaixaDto,
} from "./dto/query-fluxo-caixa.dto";
import { QueryVisaoGeralDto } from "./dto/query-visao-geral.dto";
import { UpdateCategoriaDto } from "./dto/update-categoria.dto";
import { UpdateDespesaDto } from "./dto/update-despesa.dto";
import { UpdateComissaoDto } from "./dto/update-comissao.dto";
import { UpdateDespesaTipoDto } from "./dto/update-despesa-tipo.dto";
import { UpdateMovimentoDto } from "./dto/update-movimento.dto";
import { UpdateParceiroDto } from "./dto/update-parceiro.dto";
import { UpdateRecebimentoDto } from "./dto/update-recebimento.dto";
import { UpdateRecebimentoTipoDto } from "./dto/update-recebimento-tipo.dto";
import { UpdateTituloDto } from "./dto/update-titulo.dto";
import { UpdateTitulosGrupoDto } from "./dto/update-titulos-grupo.dto";
import { RenovarDespesasDto } from "./dto/renovar-despesas.dto";
import { RenovarRecebimentosDto } from "./dto/renovar-recebimentos.dto";
import { randomUUID } from "crypto";

const MESES_CURTOS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

const BRASIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function placeholderClientPhone(seed: string): string {
  const base = `${Date.now()}${seed}`
    .replace(/\D/g, "")
    .slice(-8)
    .padStart(8, "0");
  return `(81) 9${base.slice(0, 4)}-${base.slice(4)}`;
}

function competenciaFromIsoDate(iso: string): string {
  return iso.slice(0, 7);
}

function competenciaAtualBrasil(): string {
  const brasil = new Date(Date.now() - BRASIL_UTC_OFFSET_MS);
  const y = brasil.getUTCFullYear();
  const m = String(brasil.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function dataFromCompetencia(competencia: string, day = 1): Date {
  const [ys, ms] = competencia.split("-");
  const y = Number(ys);
  const m = Number(ms);
  return new Date(Date.UTC(y, m - 1, day) + BRASIL_UTC_OFFSET_MS);
}

const DEFAULT_DESPESA_CATEGORIAS = ["Estrutural", "Marketing", "Operacional"];

const DEFAULT_CATEGORIAS_ENTRADA = [
  "Comissão de venda",
  "Taxa de corretagem",
  "Consultoria",
  "Outras receitas",
];

const DEFAULT_CATEGORIAS_SAIDA = [
  "Aluguel",
  "Folha de pagamento",
  "Marketing digital",
  "Software / SaaS",
  "Impostos",
  "Comissão corretor",
  "Despesas gerais",
  "Energia / utilidades",
];

function isoDateOnly(d: Date): string {
  const brasil = new Date(d.getTime() - BRASIL_UTC_OFFSET_MS);
  const y = brasil.getUTCFullYear();
  const m = String(brasil.getUTCMonth() + 1).padStart(2, "0");
  const day = String(brasil.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymBrasil(d: Date): string {
  return isoDateOnly(d).slice(0, 7);
}

function noPeriodoVisao(d: Date, ano: number, mes?: number): boolean {
  const ym = ymBrasil(d);
  if (mes == null) return ym.startsWith(`${ano}-`);
  return ym === `${ano}-${String(mes).padStart(2, "0")}`;
}

function slackBoundsVisao(ano: number, mes?: number) {
  // Folga de 3h para datas gravadas em UTC-3 (início/fim do mês no Brasil).
  if (mes == null) {
    return {
      gte: new Date(Date.UTC(ano, 0, 1) - BRASIL_UTC_OFFSET_MS),
      lt: new Date(Date.UTC(ano + 1, 0, 1) + BRASIL_UTC_OFFSET_MS),
    };
  }
  return {
    gte: new Date(Date.UTC(ano, mes - 1, 1) - BRASIL_UTC_OFFSET_MS),
    lt: new Date(Date.UTC(ano, mes, 1) + BRASIL_UTC_OFFSET_MS),
  };
}

function parseDayStart(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + BRASIL_UTC_OFFSET_MS);
}

function parseDayEnd(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1) + BRASIL_UTC_OFFSET_MS);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const MESES_PARCELA = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

function mesParcelaLabel(iso: string) {
  const [year, month] = iso.slice(0, 7).split("-").map(Number);
  if (!year || !month) return iso.slice(0, 7);
  return `${MESES_PARCELA[month - 1]}/${String(year).slice(2)}`;
}

const RECORRENCIA_HORIZONTE_MESES = 120;

function todayIsoBrasil(): string {
  return isoDateOnly(new Date());
}

function startOfMonthIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function endOfMonthIso(iso: string): string {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** Segunda-feira da semana ISO (semana começa na segunda). */
function startOfWeekIso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0=dom
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isoWeekKey(iso: string): {
  chave: string;
  inicio: string;
  fim: string;
} {
  const inicio = startOfWeekIso(iso);
  const fim = addDaysIso(inicio, 6);
  const [y, m, d] = inicio.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // ISO week number
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((thursday.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getUTCDay() + 6) % 7)) /
        7,
    );
  const year = thursday.getUTCFullYear();
  return {
    chave: `${year}-W${String(week).padStart(2, "0")}`,
    inicio,
    fim,
  };
}

function quarterKey(iso: string): {
  chave: string;
  inicio: string;
  fim: string;
} {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const inicio = `${y}-${String(startMonth).padStart(2, "0")}-01`;
  const fim = endOfMonthIso(`${y}-${String(endMonth).padStart(2, "0")}-01`);
  return { chave: `${y}-Q${q}`, inicio, fim };
}

type FluxoEvento = {
  data: string;
  tipo: "entrada" | "saida";
  valor: number;
  natureza: "realizado" | "previsto";
  origem: "titulo" | "movimento" | "comissao";
  id: string;
  descricao: string;
  parceiro: string;
  categoria: string;
  centro: string;
  status: string;
  contrato?: boolean;
};

@Injectable()
export class FinanceiroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
    private readonly documentacaoService: DocumentacaoService,
  ) {}

  // ─── Parceiros ───────────────────────────────────────────────

  listParceiros(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const fornecedorOnly = requester.role === Role.super_admin;
    return Promise.all([
      this.prisma.financeiroParceiro.findMany({
        where: {
          tenantId,
          ...(fornecedorOnly
            ? {
                tipo: {
                  in: [
                    FinanceiroParceiroTipo.fornecedor,
                    FinanceiroParceiroTipo.ambos,
                  ],
                },
              }
            : {}),
        },
        orderBy: { nome: "asc" },
      }),
      this.prisma.financeiroMovimento.findMany({
        where: {
          tenantId,
          parceiroId: { not: null },
          status: {
            in: [
              FinanceiroTituloStatus.aberto,
              FinanceiroTituloStatus.atrasado,
            ],
          },
        },
        select: { parceiroId: true, tipo: true, valor: true },
      }),
    ]).then(([rows, movimentos]) => {
      const saldoByParceiro = this.sumSaldoPorParceiro(movimentos);
      return rows.map((r) =>
        this.mapParceiro({
          ...r,
          saldoAberto: saldoByParceiro.get(r.id) ?? 0,
        }),
      );
    });
  }

  async createParceiro(dto: CreateParceiroDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const tipo =
      requester.role === Role.super_admin
        ? FinanceiroParceiroTipo.fornecedor
        : dto.tipo;
    const row = await this.prisma.financeiroParceiro.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        documento: dto.documento.trim(),
        tipo,
        email: dto.email?.trim() || null,
        telefone: dto.telefone?.trim() || null,
        cidade: dto.cidade?.trim() || null,
        imobiliaria: dto.imobiliaria?.trim() || "",
        saldoAberto: 0,
        ativo: dto.ativo ?? true,
      },
    });
    return this.mapParceiro(row);
  }

  async updateParceiro(
    id: string,
    dto: UpdateParceiroDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    await this.findParceiroOrFail(id, requester);
    const tipoOverride =
      requester.role === Role.super_admin
        ? FinanceiroParceiroTipo.fornecedor
        : dto.tipo;
    const row = await this.prisma.financeiroParceiro.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.documento !== undefined
          ? { documento: dto.documento.trim() }
          : {}),
        ...(tipoOverride !== undefined ? { tipo: tipoOverride } : {}),
        ...(dto.email !== undefined
          ? { email: dto.email?.trim() || null }
          : {}),
        ...(dto.telefone !== undefined
          ? { telefone: dto.telefone?.trim() || null }
          : {}),
        ...(dto.cidade !== undefined
          ? { cidade: dto.cidade?.trim() || null }
          : {}),
        ...(dto.imobiliaria !== undefined
          ? { imobiliaria: dto.imobiliaria?.trim() || "" }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
    });
    await this.recalcSaldoParceiro(tenantId, id);
    const saldo =
      (
        await this.prisma.financeiroParceiro.findFirst({
          where: { id, tenantId },
          select: { saldoAberto: true },
        })
      )?.saldoAberto ?? 0;
    return this.mapParceiro({ ...row, saldoAberto: saldo });
  }

  async removeParceiro(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    await this.findParceiroOrFail(id, requester);
    await this.prisma.financeiroParceiro.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Categorias ──────────────────────────────────────────────

  async listCategorias(
    requester: AuthenticatedUser,
    tipo?: FinanceiroMovimentoTipo,
  ) {
    this.assertAccess(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    await this.ensureDefaultCategorias(tenantId);
    const rows = await this.prisma.financeiroCategoria.findMany({
      where: {
        tenantId,
        ...(tipo ? { tipo } : {}),
      },
      orderBy: [{ tipo: "asc" }, { nome: "asc" }],
    });
    return rows.map((r) => this.mapCategoria(r));
  }

  async createCategoria(dto: CreateCategoriaDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const nome = dto.nome.trim();
    try {
      const row = await this.prisma.financeiroCategoria.create({
        data: {
          tenantId,
          nome,
          tipo: dto.tipo,
          ativo: dto.ativo ?? true,
        },
      });
      return this.mapCategoria(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new BadRequestException(
          "Já existe uma categoria com este nome neste tipo.",
        );
      }
      throw err;
    }
  }

  async updateCategoria(
    id: string,
    dto: UpdateCategoriaDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    await this.findCategoriaOrFail(id, requester);
    try {
      const row = await this.prisma.financeiroCategoria.update({
        where: { id },
        data: {
          ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
          ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
          ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
        },
      });
      return this.mapCategoria(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new BadRequestException(
          "Já existe uma categoria com este nome neste tipo.",
        );
      }
      throw err;
    }
  }

  async removeCategoria(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    await this.findCategoriaOrFail(id, requester);
    await this.prisma.financeiroCategoria.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Resumo analítico:
   * - entrada → Centro de recebimentos
   * - saída → Centro de despesas
   * - sem tipo → ambos (nomes unificados)
   */
  async resumoCategorias(
    requester: AuthenticatedUser,
    opts?: {
      periodo?: "mes" | "trimestre" | "ano" | "tudo";
      tipo?: FinanceiroMovimentoTipo;
    },
  ) {
    this.assertAccess(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    await this.ensureDefaultDespesaCategorias(tenantId);
    await this.ensureDefaultRecebimentoCategorias(tenantId);
    await this.cleanupReceitaTiposFromDespesas(tenantId);
    await this.unifyCentroIntoCategoria(tenantId);

    const periodo = opts?.periodo ?? "mes";
    const { gte, lt } = this.periodoDateBounds(periodo);
    const dataFilter =
      gte || lt
        ? {
            ...(gte ? { gte } : {}),
            ...(lt ? { lt } : {}),
          }
        : undefined;

    const useRecebimentos =
      !opts?.tipo || opts.tipo === FinanceiroMovimentoTipo.entrada;
    const useDespesas =
      !opts?.tipo || opts.tipo === FinanceiroMovimentoTipo.saida;

    const [recebimentoTipos, despesaTipos, movimentos, titulosAbertos] =
      await Promise.all([
        useRecebimentos
          ? this.prisma.financeiroRecebimentoTipo.findMany({
              where: { tenantId },
              orderBy: [{ nome: "asc" }, { natureza: "asc" }],
            })
          : Promise.resolve([]),
        useDespesas
          ? this.prisma.financeiroDespesaTipo.findMany({
              where: { tenantId, ativo: true },
              orderBy: [{ nome: "asc" }, { natureza: "asc" }],
            })
          : Promise.resolve([]),
        this.prisma.financeiroMovimento.findMany({
          where: {
            tenantId,
            status: { not: FinanceiroTituloStatus.cancelado },
            ...(opts?.tipo ? { tipo: opts.tipo } : {}),
            ...(dataFilter ? { data: dataFilter } : {}),
          },
          select: { categoria: true, centro: true, tipo: true, valor: true },
        }),
        this.prisma.financeiroTitulo.findMany({
          where: {
            tenantId,
            status: {
              in: [
                FinanceiroTituloStatus.aberto,
                FinanceiroTituloStatus.atrasado,
              ],
            },
            ...(opts?.tipo
              ? {
                  tipo:
                    opts.tipo === FinanceiroMovimentoTipo.entrada
                      ? FinanceiroTituloTipo.receber
                      : FinanceiroTituloTipo.pagar,
                }
              : {}),
            ...(dataFilter ? { vencimento: dataFilter } : {}),
          },
          select: { categoria: true, centro: true, tipo: true, valor: true },
        }),
      ]);

    const tipos = [
      ...recebimentoTipos.map((t) => ({
        ...t,
        _origem: "recebimento" as const,
      })),
      ...despesaTipos.map((t) => ({ ...t, _origem: "despesa" as const })),
    ];

    type Acc = {
      nome: string;
      total: number;
      quantidade: number;
      emAberto: number;
      qtdAberto: number;
      totalEntradas: number;
      totalSaidas: number;
    };
    const realized = new Map<string, Acc>();
    const norm = (nome: string) => nome.trim().toLowerCase();
    const resolveNome = (categoria: string, centro: string) => {
      const cat = categoria?.trim() || "";
      const cen = centro?.trim() || "";
      return cat || cen || "Sem categoria";
    };
    const ensureAcc = (nome: string) => {
      const key = norm(nome);
      const cur = realized.get(key);
      if (cur) return cur;
      const created: Acc = {
        nome,
        total: 0,
        quantidade: 0,
        emAberto: 0,
        qtdAberto: 0,
        totalEntradas: 0,
        totalSaidas: 0,
      };
      realized.set(key, created);
      return created;
    };

    for (const m of movimentos) {
      const nome = resolveNome(m.categoria, m.centro);
      const cur = ensureAcc(nome);
      cur.total += m.valor;
      cur.quantidade += 1;
      if (m.tipo === FinanceiroMovimentoTipo.entrada)
        cur.totalEntradas += m.valor;
      else cur.totalSaidas += m.valor;
    }
    for (const t of titulosAbertos) {
      const nome = resolveNome(t.categoria, t.centro);
      const cur = ensureAcc(nome);
      cur.emAberto += t.valor;
      cur.qtdAberto += 1;
    }

    // Cadastro único: um registro por nome (prioriza tipo ativo).
    const byName = new Map<
      string,
      {
        id: string;
        nome: string;
        ativo: boolean;
        createdAt: string;
        natureza: FinanceiroDespesaNatureza;
      }
    >();
    for (const t of tipos) {
      const key = norm(t.nome);
      const prev = byName.get(key);
      if (!prev) {
        byName.set(key, {
          id: t.id,
          nome: t.nome,
          ativo: t.ativo,
          createdAt: t.createdAt.toISOString(),
          natureza: t.natureza,
        });
        continue;
      }
      if (!prev.ativo && t.ativo) {
        byName.set(key, {
          id: t.id,
          nome: t.nome,
          ativo: t.ativo,
          createdAt: t.createdAt.toISOString(),
          natureza: t.natureza,
        });
      }
    }

    const pickTotal = (acc: {
      total: number;
      totalEntradas: number;
      totalSaidas: number;
    }) =>
      opts?.tipo === FinanceiroMovimentoTipo.entrada
        ? acc.totalEntradas
        : opts?.tipo === FinanceiroMovimentoTipo.saida
          ? acc.totalSaidas
          : acc.total;

    const emptyTotals = {
      total: 0,
      totalEntradas: 0,
      totalSaidas: 0,
      quantidade: 0,
      emAberto: 0,
      qtdAberto: 0,
    };

    const rows = [...byName.values()].map((c) => {
      const acc = realized.get(norm(c.nome)) ?? emptyTotals;
      return {
        id: c.id,
        nome: c.nome,
        tipo: opts?.tipo ?? null,
        natureza: c.natureza,
        ativo: c.ativo,
        createdAt: c.createdAt,
        total: pickTotal(acc),
        totalEntradas: acc.totalEntradas,
        totalSaidas: acc.totalSaidas,
        quantidade: acc.quantidade,
        emAberto: acc.emAberto,
        qtdAberto: acc.qtdAberto,
        percentual: 0,
      };
    });

    // Nomes só em lançamentos (órfãos).
    for (const [key, acc] of realized) {
      if (byName.has(key)) continue;
      rows.push({
        id: "",
        nome: acc.nome,
        tipo: opts?.tipo ?? null,
        natureza: FinanceiroDespesaNatureza.variavel,
        ativo: true,
        createdAt: "",
        total: pickTotal(acc),
        totalEntradas: acc.totalEntradas,
        totalSaidas: acc.totalSaidas,
        quantidade: acc.quantidade,
        emAberto: acc.emAberto,
        qtdAberto: acc.qtdAberto,
        percentual: 0,
      });
    }

    const totalEntradas = rows.reduce((s, r) => s + r.totalEntradas, 0);
    const totalSaidas = rows.reduce((s, r) => s + r.totalSaidas, 0);
    const baseTotal =
      opts?.tipo === FinanceiroMovimentoTipo.entrada
        ? totalEntradas
        : opts?.tipo === FinanceiroMovimentoTipo.saida
          ? totalSaidas
          : totalEntradas + totalSaidas;

    for (const r of rows) {
      r.percentual =
        baseTotal > 0 ? Number(((r.total / baseTotal) * 100).toFixed(1)) : 0;
    }

    rows.sort(
      (a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"),
    );

    return {
      periodo,
      totalEntradas,
      totalSaidas,
      categorias: rows,
    };
  }

  // ─── Movimentos ──────────────────────────────────────────────

  listMovimentos(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    return this.prisma.financeiroMovimento
      .findMany({
        where: { tenantId },
        orderBy: { data: "desc" },
      })
      .then((rows) => rows.map((r) => this.mapMovimento(r)));
  }

  async createMovimento(dto: CreateMovimentoDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const parceiroNome = await this.resolveParceiroNome(
      tenantId,
      dto.parceiroId,
      dto.parceiroNome,
    );
    const label = dto.categoria.trim() || dto.centro?.trim() || "";
    const categoria =
      dto.tipo === FinanceiroMovimentoTipo.entrada ? label : label;
    const centro = dto.tipo === FinanceiroMovimentoTipo.saida ? label : "";
    const natureza = this.resolveDespesaNatureza(
      dto.tipo === FinanceiroMovimentoTipo.saida,
      dto.natureza,
    );
    const row = await this.prisma.financeiroMovimento.create({
      data: {
        tenantId,
        data: parseDayStart(dto.data),
        descricao: dto.descricao.trim(),
        parceiroId: dto.parceiroId || null,
        parceiroNome,
        categoria,
        centro,
        natureza,
        tipo: dto.tipo,
        valor: dto.valor,
        status: dto.status ?? FinanceiroTituloStatus.aberto,
        formaPagamento: dto.formaPagamento?.trim() || "",
      },
    });
    await this.recalcSaldoParceiro(tenantId, row.parceiroId);
    return this.mapMovimento(row);
  }

  async updateMovimento(
    id: string,
    dto: UpdateMovimentoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const existing = await this.findMovimentoOrFail(id, requester);
    const tenantId = resolveFinanceiroTenantId(requester);

    let parceiroId = existing.parceiroId;
    let parceiroNome = existing.parceiroNome;

    if (dto.parceiroId !== undefined || dto.parceiroNome !== undefined) {
      const nextId =
        dto.parceiroId === undefined ? existing.parceiroId : dto.parceiroId;
      parceiroId = nextId || null;
      parceiroNome = await this.resolveParceiroNome(
        tenantId,
        nextId || undefined,
        dto.parceiroNome ?? undefined,
      );
    }

    const row = await this.prisma.financeiroMovimento.update({
      where: { id },
      data: {
        ...(dto.data !== undefined ? { data: parseDayStart(dto.data) } : {}),
        ...(dto.descricao !== undefined
          ? { descricao: dto.descricao.trim() }
          : {}),
        ...(dto.parceiroId !== undefined || dto.parceiroNome !== undefined
          ? { parceiroId, parceiroNome }
          : {}),
        ...(dto.categoria !== undefined || dto.centro !== undefined
          ? (() => {
              const tipoMov = dto.tipo ?? existing.tipo;
              const label =
                (dto.categoria !== undefined
                  ? dto.categoria.trim()
                  : undefined) ??
                (dto.centro !== undefined ? dto.centro?.trim() || "" : "") ??
                "";
              return tipoMov === FinanceiroMovimentoTipo.saida
                ? { categoria: label, centro: label }
                : { categoria: label, centro: "" };
            })()
          : {}),
        ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
        ...(dto.valor !== undefined ? { valor: dto.valor } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.formaPagamento !== undefined
          ? { formaPagamento: dto.formaPagamento?.trim() || "" }
          : {}),
        ...(dto.natureza !== undefined
          ? {
              natureza: this.resolveDespesaNatureza(
                (dto.tipo ?? existing.tipo) === FinanceiroMovimentoTipo.saida,
                dto.natureza,
              ),
            }
          : {}),
      },
    });

    const parceiroIds = new Set<string>();
    if (existing.parceiroId) parceiroIds.add(existing.parceiroId);
    if (row.parceiroId) parceiroIds.add(row.parceiroId);
    for (const pid of parceiroIds) {
      await this.recalcSaldoParceiro(tenantId, pid);
    }

    return this.mapMovimento(row);
  }

  async removeMovimento(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const existing = await this.findMovimentoOrFail(id, requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    await this.prisma.financeiroMovimento.delete({ where: { id } });
    await this.recalcSaldoParceiro(tenantId, existing.parceiroId);
    return { ok: true };
  }

  // ─── Títulos ─────────────────────────────────────────────────

  async listTitulos(
    requester: AuthenticatedUser,
    tipo?: FinanceiroTituloTipo,
    grupoParcelasId?: string,
    origem?: "normal" | "contrato" | "comissao" | "sem_comissao",
  ) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    await this.syncComissoesParaTitulos(tenantId);
    try {
      await this.extendIndeterminateRecurrences(tenantId);
    } catch {
      // Não bloqueia a listagem se a renovação falhar.
    }
    return this.prisma.financeiroTitulo
      .findMany({
        where: {
          tenantId,
          ...(tipo ? { tipo } : {}),
          ...(grupoParcelasId ? { grupoParcelasId } : {}),
          ...(origem === "contrato"
            ? {
                OR: [
                  { platformContratoId: { not: null } },
                  { platformFornecedorContratoId: { not: null } },
                ],
              }
            : origem === "comissao"
              ? { comissaoId: { not: null } }
              : origem === "sem_comissao"
                ? { comissaoId: null }
                : origem === "normal"
                ? {
                    platformContratoId: null,
                    platformFornecedorContratoId: null,
                    comissaoId: null,
                  }
                : {}),
        },
        include: { movimento: { select: { formaPagamento: true } } },
        orderBy: { vencimento: "asc" },
      })
      .then((rows) => rows.map((r) => this.mapTitulo(r)));
  }

  async createTitulo(dto: CreateTituloDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const parceiroNome = await this.resolveParceiroNome(
      tenantId,
      dto.parceiroId,
      dto.parceiroNome,
    );
    const status = dto.status ?? FinanceiroTituloStatus.aberto;
    const vencimento = parseDayStart(dto.vencimento);
    const jaPago = status === FinanceiroTituloStatus.pago;
    const descricao = dto.descricao.trim();
    const { categoria, centro } = this.resolveTituloCategoriaCentro(
      dto.tipo,
      dto.categoria,
      dto.centro,
    );
    const natureza = this.resolveDespesaNatureza(
      dto.tipo === FinanceiroTituloTipo.pagar,
      dto.natureza,
    );
    const parceiroId = dto.parceiroId || null;

    const row = await this.prisma.$transaction(async (tx) => {
      const titulo = await tx.financeiroTitulo.create({
        data: {
          tenantId,
          tipo: dto.tipo,
          descricao,
          parceiroId,
          parceiroNome,
          categoria,
          centro,
          natureza,
          vencimento,
          valor: dto.valor,
          status,
          parcela: dto.parcela?.trim() || "",
          ...(dto.platformContratoId
            ? { platformContratoId: dto.platformContratoId }
            : {}),
          ...(jaPago ? { dataPagamento: vencimento } : {}),
        },
      });

      if (jaPago) {
        const tipoMov =
          dto.tipo === FinanceiroTituloTipo.receber
            ? FinanceiroMovimentoTipo.entrada
            : FinanceiroMovimentoTipo.saida;
        await tx.financeiroMovimento.create({
          data: {
            tenantId,
            data: vencimento,
            descricao,
            parceiroId,
            parceiroNome,
            categoria: categoria || "Título",
            centro,
            natureza,
            tipo: tipoMov,
            valor: dto.valor,
            status: FinanceiroTituloStatus.pago,
            formaPagamento: "",
            tituloId: titulo.id,
          },
        });
      }

      return titulo;
    });

    if (jaPago) {
      await this.recalcSaldoParceiro(tenantId, parceiroId);
    }

    return this.mapTitulo(row);
  }

  async createTitulosParcelado(
    dto: CreateTitulosParceladoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    if (!dto.parcelas?.length || dto.parcelas.length < 2) {
      throw new BadRequestException("Informe ao menos 2 parcelas.");
    }
    for (const p of dto.parcelas) {
      if (!Number.isFinite(p.valor) || p.valor <= 0) {
        throw new BadRequestException(
          "Todas as parcelas precisam de valor maior que zero.",
        );
      }
    }
    const parceiroNome = await this.resolveParceiroNome(
      tenantId,
      dto.parceiroId,
      dto.parceiroNome,
    );
    const grupoParcelasId = randomUUID();
    const n = dto.parcelas.length;
    const descricao = dto.descricao.trim();
    const { categoria, centro } = this.resolveTituloCategoriaCentro(
      dto.tipo,
      dto.categoria,
      dto.centro,
    );
    const natureza = this.resolveDespesaNatureza(
      dto.tipo === FinanceiroTituloTipo.pagar,
      dto.natureza,
    );

    const rows = await this.prisma.$transaction(
      dto.parcelas.map((p, i) =>
        this.prisma.financeiroTitulo.create({
          data: {
            tenantId,
            tipo: dto.tipo,
            descricao,
            parceiroId: dto.parceiroId || null,
            parceiroNome,
            categoria,
            centro,
            natureza,
            vencimento: parseDayStart(p.vencimento),
            valor: p.valor,
            status: FinanceiroTituloStatus.aberto,
            parcela: dto.indeterminado
              ? mesParcelaLabel(isoDateOnly(parseDayStart(p.vencimento)))
              : `${i + 1}/${n}`,
            grupoParcelasId,
            recorrenciaIndeterminada: Boolean(dto.indeterminado),
            ...(dto.platformContratoId
              ? { platformContratoId: dto.platformContratoId }
              : {}),
          },
        }),
      ),
    );

    return rows.map((r) => this.mapTitulo(r));
  }

  /** Mantém anos à frente nas contas mensais sem data de término. */
  private async extendIndeterminateRecurrences(tenantId: string) {
    const grupos = await this.prisma.financeiroTitulo.findMany({
      where: {
        tenantId,
        recorrenciaIndeterminada: true,
        grupoParcelasId: { not: null },
      },
      distinct: ["grupoParcelasId"],
      select: { grupoParcelasId: true },
    });
    if (grupos.length === 0) return;

    const horizonte = addMonthsIso(
      todayIsoBrasil(),
      RECORRENCIA_HORIZONTE_MESES,
    );

    for (const { grupoParcelasId } of grupos) {
      if (!grupoParcelasId) continue;
      const titulos = await this.prisma.financeiroTitulo.findMany({
        where: { tenantId, grupoParcelasId },
        orderBy: { vencimento: "desc" },
      });
      const ultimo = titulos[0];
      if (!ultimo) continue;
      const existentes = new Set(
        titulos.map((titulo) => isoDateOnly(titulo.vencimento)),
      );
      let cursor = isoDateOnly(ultimo.vencimento);
      const novos: Prisma.FinanceiroTituloCreateManyInput[] = [];
      while (cursor < horizonte) {
        cursor = addMonthsIso(cursor, 1);
        if (existentes.has(cursor) || cursor > horizonte) continue;
        novos.push({
          tenantId,
          tipo: ultimo.tipo,
          descricao: ultimo.descricao,
          parceiroId: ultimo.parceiroId,
          parceiroNome: ultimo.parceiroNome,
          categoria: ultimo.categoria,
          centro: ultimo.centro,
          natureza: ultimo.natureza,
          vencimento: parseDayStart(cursor),
          valor: ultimo.valor,
          status: FinanceiroTituloStatus.aberto,
          parcela: mesParcelaLabel(cursor),
          grupoParcelasId,
          recorrenciaIndeterminada: true,
          platformContratoId: ultimo.platformContratoId,
          platformFornecedorContratoId: ultimo.platformFornecedorContratoId,
        });
      }
      if (novos.length > 0) {
        await this.prisma.financeiroTitulo.createMany({ data: novos });
      }
    }
  }

  async updateTitulo(
    id: string,
    dto: UpdateTituloDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const existing = await this.findTituloOrFail(id, requester);
    const tenantId = resolveFinanceiroTenantId(requester);

    if (
      dto.status === FinanceiroTituloStatus.pago &&
      existing.status !== FinanceiroTituloStatus.pago
    ) {
      throw new BadRequestException(
        "Use a baixa para marcar o título como pago.",
      );
    }

    let parceiroId = existing.parceiroId;
    let parceiroNome = existing.parceiroNome;
    if (dto.parceiroId !== undefined || dto.parceiroNome !== undefined) {
      const nextId =
        dto.parceiroId === undefined ? existing.parceiroId : dto.parceiroId;
      parceiroId = nextId || null;
      parceiroNome = await this.resolveParceiroNome(
        tenantId,
        nextId || undefined,
        dto.parceiroNome ?? undefined,
      );
    }

    const nextStatus = dto.status ?? existing.status;
    const estornar =
      existing.status === FinanceiroTituloStatus.pago &&
      nextStatus !== FinanceiroTituloStatus.pago;

    const row = await this.prisma.$transaction(async (tx) => {
      if (estornar) {
        await tx.financeiroMovimento.deleteMany({ where: { tituloId: id } });
      }

      const updated = await tx.financeiroTitulo.update({
        where: { id },
        data: {
          ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
          ...(dto.descricao !== undefined
            ? { descricao: dto.descricao.trim() }
            : {}),
          ...(dto.parceiroId !== undefined || dto.parceiroNome !== undefined
            ? { parceiroId, parceiroNome }
            : {}),
          ...(dto.categoria !== undefined || dto.centro !== undefined
            ? this.resolveTituloCategoriaCentro(
                dto.tipo ?? existing.tipo,
                dto.categoria !== undefined
                  ? dto.categoria
                  : existing.categoria,
                dto.centro !== undefined ? dto.centro : existing.centro,
              )
            : {}),
          ...(dto.vencimento !== undefined
            ? { vencimento: parseDayStart(dto.vencimento) }
            : {}),
          ...(dto.valor !== undefined ? { valor: dto.valor } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.parcela !== undefined
            ? { parcela: dto.parcela?.trim() || "" }
            : {}),
          ...(dto.natureza !== undefined
            ? {
                natureza: this.resolveDespesaNatureza(
                  (dto.tipo ?? existing.tipo) === FinanceiroTituloTipo.pagar,
                  dto.natureza,
                ),
              }
            : {}),
          ...(estornar ? { dataPagamento: null } : {}),
        },
      });

      if (!estornar && nextStatus === FinanceiroTituloStatus.pago) {
        const tipoMov =
          updated.tipo === FinanceiroTituloTipo.receber
            ? FinanceiroMovimentoTipo.entrada
            : FinanceiroMovimentoTipo.saida;
        await tx.financeiroMovimento.updateMany({
          where: { tituloId: id },
          data: {
            descricao: updated.descricao,
            parceiroId: updated.parceiroId,
            parceiroNome: updated.parceiroNome,
            categoria: updated.categoria || "Título",
            centro:
              updated.tipo === FinanceiroTituloTipo.pagar
                ? updated.centro || updated.categoria || "Título"
                : "",
            natureza: updated.natureza,
            tipo: tipoMov,
            valor: updated.valor,
          },
        });
      }

      return updated;
    });

    const parceiroIds = new Set<string>();
    if (existing.parceiroId) parceiroIds.add(existing.parceiroId);
    if (row.parceiroId) parceiroIds.add(row.parceiroId);
    for (const pid of parceiroIds) {
      await this.recalcSaldoParceiro(tenantId, pid);
    }

    if (estornar && existing.comissaoId) {
      await this.sincronizarStatusComissaoPelosTitulos(
        existing.comissaoId,
        tenantId,
      );
    }

    return this.mapTitulo(row);
  }

  async updateTitulosGrupo(
    grupoParcelasId: string,
    dto: UpdateTitulosGrupoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const rows = await this.prisma.financeiroTitulo.findMany({
      where: { tenantId, grupoParcelasId },
      orderBy: { vencimento: "asc" },
    });
    if (rows.length === 0) {
      throw new NotFoundException("Grupo de parcelas não encontrado.");
    }

    let sharedParceiroId: string | null | undefined;
    let sharedParceiroNome: string | undefined;
    if (dto.parceiroId !== undefined || dto.parceiroNome !== undefined) {
      const nextId =
        dto.parceiroId === undefined ? rows[0].parceiroId : dto.parceiroId;
      sharedParceiroId = nextId || null;
      sharedParceiroNome = await this.resolveParceiroNome(
        tenantId,
        nextId || undefined,
        dto.parceiroNome ?? undefined,
      );
    }

    const parcelaUpdates = new Map(
      (dto.parcelas ?? []).map((p) => [p.id, p] as const),
    );
    for (const item of parcelaUpdates.values()) {
      const found = rows.find((r) => r.id === item.id);
      if (!found) {
        throw new BadRequestException(
          "Uma ou mais parcelas não pertencem a este grupo.",
        );
      }
      if (
        item.status === FinanceiroTituloStatus.pago &&
        found.status !== FinanceiroTituloStatus.pago
      ) {
        throw new BadRequestException(
          "Use a baixa para marcar parcela como paga.",
        );
      }
    }

    const sharedData: Prisma.FinanceiroTituloUpdateManyMutationInput = {
      ...(dto.descricao !== undefined
        ? { descricao: dto.descricao.trim() }
        : {}),
      ...(sharedParceiroId !== undefined
        ? {
            parceiroId: sharedParceiroId,
            parceiroNome: sharedParceiroNome ?? "",
          }
        : {}),
      ...(dto.categoria !== undefined || dto.centro !== undefined
        ? this.resolveTituloCategoriaCentro(
            rows[0]?.tipo ?? FinanceiroTituloTipo.receber,
            dto.categoria,
            dto.centro,
          )
        : {}),
      ...(dto.natureza !== undefined
        ? {
            natureza: this.resolveDespesaNatureza(
              (rows[0]?.tipo ?? FinanceiroTituloTipo.receber) ===
                FinanceiroTituloTipo.pagar,
              dto.natureza,
            ),
          }
        : {}),
    };

    const hasShared = Object.keys(sharedData).length > 0;
    const parceiroIds = new Set(
      rows.map((r) => r.parceiroId).filter((id): id is string => Boolean(id)),
    );
    if (sharedParceiroId) parceiroIds.add(sharedParceiroId);

    await this.prisma.$transaction(async (tx) => {
      if (hasShared) {
        await tx.financeiroTitulo.updateMany({
          where: { tenantId, grupoParcelasId },
          data: sharedData,
        });
      }

      for (const row of rows) {
        const item = parcelaUpdates.get(row.id);
        if (!item && !hasShared) continue;

        const nextStatus = item?.status ?? row.status;
        const estornar =
          row.status === FinanceiroTituloStatus.pago &&
          nextStatus !== FinanceiroTituloStatus.pago;

        if (estornar) {
          await tx.financeiroMovimento.deleteMany({
            where: { tituloId: row.id },
          });
        }

        const updated = await tx.financeiroTitulo.update({
          where: { id: row.id },
          data: {
            ...(item?.vencimento !== undefined
              ? { vencimento: parseDayStart(item.vencimento) }
              : {}),
            ...(item?.valor !== undefined ? { valor: item.valor } : {}),
            ...(item?.status !== undefined ? { status: item.status } : {}),
            ...(estornar ? { dataPagamento: null } : {}),
          },
        });

        if (!estornar && updated.status === FinanceiroTituloStatus.pago) {
          const tipoMov =
            updated.tipo === FinanceiroTituloTipo.receber
              ? FinanceiroMovimentoTipo.entrada
              : FinanceiroMovimentoTipo.saida;
          await tx.financeiroMovimento.updateMany({
            where: { tituloId: row.id },
            data: {
              descricao: updated.descricao,
              parceiroId: updated.parceiroId,
              parceiroNome: updated.parceiroNome,
              categoria: updated.categoria || "Título",
              centro: updated.categoria || "Título",
              natureza: updated.natureza,
              tipo: tipoMov,
              valor: updated.valor,
            },
          });
        }
      }
    });

    const updated = await this.prisma.financeiroTitulo.findMany({
      where: { tenantId, grupoParcelasId },
      include: { movimento: { select: { formaPagamento: true } } },
      orderBy: { vencimento: "asc" },
    });

    for (const pid of parceiroIds) {
      await this.recalcSaldoParceiro(tenantId, pid);
    }

    return {
      updated: rows.length,
      skippedPago: 0,
      titulos: updated.map((r) => this.mapTitulo(r)),
    };
  }

  async removeTitulo(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const existing = await this.findTituloOrFail(id, requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const parceiroId = existing.parceiroId;

    // Remove movimento de baixa junto, para zerar KPIs / fluxo de caixa.
    await this.prisma.$transaction(async (tx) => {
      await tx.financeiroMovimento.deleteMany({ where: { tituloId: id } });
      await tx.financeiroTitulo.delete({ where: { id } });
    });

    await this.recalcSaldoParceiro(tenantId, parceiroId);
    return { ok: true };
  }

  async removeTitulosGrupo(
    grupoParcelasId: string,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const rows = await this.prisma.financeiroTitulo.findMany({
      where: { tenantId, grupoParcelasId },
      select: { id: true, parceiroId: true },
    });
    if (rows.length === 0) {
      throw new NotFoundException("Grupo de parcelas não encontrado.");
    }

    const ids = rows.map((r) => r.id);
    const parceiroIds = new Set(
      rows.map((r) => r.parceiroId).filter((id): id is string => Boolean(id)),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.financeiroMovimento.deleteMany({
        where: { tituloId: { in: ids } },
      });
      await tx.financeiroTitulo.deleteMany({
        where: { tenantId, grupoParcelasId },
      });
    });

    for (const pid of parceiroIds) {
      await this.recalcSaldoParceiro(tenantId, pid);
    }

    return { ok: true, deleted: rows.length };
  }

  async baixarTitulo(
    id: string,
    dto: BaixarTituloDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const existing = await this.findTituloOrFail(id, requester);
    if (existing.status === FinanceiroTituloStatus.pago) {
      throw new BadRequestException("Título já está baixado.");
    }
    if (existing.status === FinanceiroTituloStatus.cancelado) {
      throw new BadRequestException("Título cancelado não pode ser baixado.");
    }
    const tenantId = resolveFinanceiroTenantId(requester);
    const dataPagamento = parseDayStart(dto.dataPagamento);
    const tipoMov =
      existing.tipo === FinanceiroTituloTipo.receber
        ? FinanceiroMovimentoTipo.entrada
        : FinanceiroMovimentoTipo.saida;

    const [titulo] = await this.prisma.$transaction([
      this.prisma.financeiroTitulo.update({
        where: { id },
        data: {
          status: FinanceiroTituloStatus.pago,
          dataPagamento,
        },
      }),
      this.prisma.financeiroMovimento.create({
        data: {
          tenantId,
          data: dataPagamento,
          descricao: existing.descricao,
          parceiroId: existing.parceiroId,
          parceiroNome: existing.parceiroNome,
          categoria: existing.categoria || "Título",
          centro: existing.centro,
          natureza: existing.natureza,
          tipo: tipoMov,
          valor: existing.valor,
          status: FinanceiroTituloStatus.pago,
          formaPagamento: dto.formaPagamento?.trim() || "",
          tituloId: existing.id,
        },
      }),
    ]);

    await this.recalcSaldoParceiro(tenantId, existing.parceiroId);
    if (existing.comissaoId) {
      await this.sincronizarStatusComissaoPelosTitulos(
        existing.comissaoId,
        tenantId,
      );
    }
    return this.mapTitulo(titulo);
  }

  // ─── Comissões ───────────────────────────────────────────────

  async listVendasElegiveis(requester: AuthenticatedUser) {
    this.assertComissaoAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const corretorSelect = {
      id: true,
      name: true,
      equipeId: true,
      equipe: {
        select: {
          name: true,
          gerenteId: true,
          gerente: { select: { name: true } },
        },
      },
    } as const;
    const rows = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        vgv: { gt: 0 },
        AND: [status2VendidoWhere()],
      },
      include: {
        corretor: { select: corretorSelect },
        lead: { select: { corretor: { select: corretorSelect } } },
        gerente: { select: { id: true, name: true } },
        empreendimento: { select: { nome: true } },
      },
      orderBy: [{ dataVenda: "desc" }, { createdAt: "desc" }],
    });
    return (
      rows
        .filter((row) => isStatusVendido(row.status2))
        .map((row) => {
          const corretor = row.corretor ?? row.lead.corretor;
          return {
            documentacaoId: row.id,
            cliente: row.nome,
            empreendimento: row.empreendimento?.nome ?? "",
            dataVenda: isoDateOnly(row.dataVenda ?? row.createdAt),
            vgv: row.vgv!,
            corretorId: corretor?.id ?? null,
            corretor: corretor?.name ?? "",
            equipeId: corretor?.equipeId ?? null,
            equipe: corretor?.equipe?.name ?? "",
            gerenteId: row.gerente?.id ?? corretor?.equipe?.gerenteId ?? null,
            gerente: row.gerente?.name ?? corretor?.equipe?.gerente.name ?? "",
          };
        })
        // createComissao exige corretor — não oferece venda sem dono.
        .filter((row) => Boolean(row.corretorId))
    );
  }

  async listComissoes(requester: AuthenticatedUser) {
    this.assertComissaoAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const where: Prisma.FinanceiroComissaoWhereInput = { tenantId };
    if (isCorretorLike(requester.role)) where.corretorId = requester.id;
    if (requester.role === Role.gerente) {
      // Inclui comissão sem equipe (equipeId null) se o gerente estiver no snapshot.
      where.OR = [
        { equipeRegistro: { gerenteId: requester.id } },
        { gerenteId: requester.id },
      ];
    }
    if (requester.role === Role.admin || requester.role === Role.super_admin) {
      await this.syncComissoesParaTitulos(tenantId);
    }
    const rows = await this.prisma.financeiroComissao.findMany({
      where,
      orderBy: { dataVenda: "desc" },
    });
    return rows.map((row) => this.mapComissao(row, requester));
  }

  async createComissao(dto: CreateComissaoDto, requester: AuthenticatedUser) {
    this.assertComissaoWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const corretorSelect = {
      id: true,
      name: true,
      equipeId: true,
      equipe: {
        select: {
          name: true,
          gerenteId: true,
          gerente: { select: { name: true } },
        },
      },
    } as const;
    const doc = await this.prisma.documentacao.findFirst({
      where: { id: dto.documentacaoId, tenantId },
      include: {
        corretor: { select: corretorSelect },
        lead: { select: { corretor: { select: corretorSelect } } },
        gerente: { select: { id: true, name: true } },
        empreendimento: { select: { nome: true } },
      },
    });
    if (!doc || !isStatusVendido(doc.status2) || !doc.vgv || doc.vgv <= 0) {
      throw new BadRequestException("Documentação não é uma venda elegível.");
    }
    const corretor = doc.corretor ?? doc.lead.corretor;
    if (!corretor) {
      throw new BadRequestException("A documentação precisa ter um corretor.");
    }
    const gerenteId = doc.gerente?.id ?? corretor.equipe?.gerenteId ?? null;
    const gerenteNome =
      doc.gerente?.name ?? corretor.equipe?.gerente.name ?? "";
    const values = this.calculateComissao(doc.vgv, dto);
    const premiacao = this.calculatePremiacao(dto);
    const row = await this.prisma.financeiroComissao.create({
      data: {
        tenantId,
        documentacaoId: doc.id,
        corretorId: corretor.id,
        gerenteId,
        equipeId: corretor.equipeId,
        corretor: corretor.name,
        gerente: gerenteNome,
        equipe: corretor.equipe?.name ?? "",
        empreendimento: doc.empreendimento?.nome ?? "",
        cliente: doc.nome,
        dataVenda: doc.dataVenda ?? doc.createdAt,
        dataPrevistaRecebimento: parseDayStart(dto.dataPrevistaRecebimento),
        status: dto.status ?? FinanceiroComissaoStatus.pendente,
        ...values,
        ...premiacao,
      },
    });
    await this.syncTitulosDaComissao(row);
    return this.mapComissao(row, requester);
  }

  async createTituloComissao(
    dto: CreateComissaoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const comissao = await this.createComissao(dto, requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const titulos = await this.listTitulosDaComissao(comissao.id, tenantId);
    return { comissao, titulos };
  }

  async createComissaoComVendaAvulsa(
    dto: CreateComissaoVendaAvulsaDto,
    requester: AuthenticatedUser,
  ) {
    this.assertComissaoWrite(requester);
    const clienteNome = dto.clienteNome.trim();
    const lead = await this.leadsService.create(
      {
        tipo: "cliente",
        nome: clienteNome,
        telefone: placeholderClientPhone(clienteNome),
        email: `cliente.${Date.now().toString(36)}@pendente.local`,
        origem: "Comissão",
        interesse: "Comprar",
        cidade: "",
        bairro: "",
        corretorId: dto.corretorId,
      },
      requester,
    );
    const doc = await this.documentacaoService.create(
      {
        leadId: lead.id,
        nome: clienteNome,
        fonte: "Comissão",
        status1: "Aprovado",
        status2: "Vendido",
        corretorId: dto.corretorId,
        construtoraId: dto.construtoraId || null,
        empreendimentoId: dto.empreendimentoId || null,
        dataVenda: dto.dataVenda,
        vgv: dto.vgv,
      },
      requester,
    );
    return this.createComissao(
      {
        documentacaoId: doc.id,
        dataPrevistaRecebimento: dto.dataPrevistaRecebimento,
        percentualImobiliaria: dto.percentualImobiliaria,
        percentualTributos: dto.percentualTributos,
        percentualCorretor: dto.percentualCorretor,
        percentualGerente: dto.percentualGerente,
        percentualCaixa: dto.percentualCaixa,
        percentualSocios: dto.percentualSocios,
        status: dto.status,
        valorPremiacao: dto.valorPremiacao,
        percentualPremiacaoCorretor: dto.percentualPremiacaoCorretor,
        percentualPremiacaoImposto: dto.percentualPremiacaoImposto,
        percentualPremiacaoImobiliaria: dto.percentualPremiacaoImobiliaria,
        percentualPremiacaoGerente: dto.percentualPremiacaoGerente,
      },
      requester,
    );
  }

  async createTituloComissaoAvulsa(
    dto: CreateComissaoVendaAvulsaDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const comissao = await this.createComissaoComVendaAvulsa(dto, requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const titulos = await this.listTitulosDaComissao(comissao.id, tenantId);
    return { comissao, titulos };
  }

  async updateComissao(
    id: string,
    dto: UpdateComissaoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertComissaoWrite(requester);
    const existing = await this.findComissaoOrFail(id, requester);
    const percentages = {
      percentualImobiliaria:
        dto.percentualImobiliaria ?? Number(existing.percentualImobiliaria),
      percentualTributos:
        dto.percentualTributos ?? Number(existing.percentualTributos),
      percentualCorretor:
        dto.percentualCorretor ?? Number(existing.percentualCorretor),
      percentualGerente:
        dto.percentualGerente ?? Number(existing.percentualGerente),
      percentualCaixa: dto.percentualCaixa ?? Number(existing.percentualCaixa),
      percentualSocios:
        dto.percentualSocios ?? Number(existing.percentualSocios),
    };
    const values = this.calculateComissao(Number(existing.vgv), percentages);
    const premiacao = this.calculatePremiacao({
      valorPremiacao: dto.valorPremiacao ?? Number(existing.valorPremiacao),
      percentualPremiacaoCorretor:
        dto.percentualPremiacaoCorretor ??
        Number(existing.percentualPremiacaoCorretor),
      percentualPremiacaoImposto:
        dto.percentualPremiacaoImposto ??
        Number(existing.percentualPremiacaoImposto),
      percentualPremiacaoImobiliaria:
        dto.percentualPremiacaoImobiliaria ??
        Number(existing.percentualPremiacaoImobiliaria),
      percentualPremiacaoGerente:
        dto.percentualPremiacaoGerente ??
        Number(existing.percentualPremiacaoGerente),
    });
    const row = await this.prisma.financeiroComissao.update({
      where: { id },
      data: {
        ...values,
        ...premiacao,
        ...(dto.dataPrevistaRecebimento
          ? {
              dataPrevistaRecebimento: parseDayStart(
                dto.dataPrevistaRecebimento,
              ),
            }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    if (
      existing.status === FinanceiroComissaoStatus.paga &&
      row.status !== FinanceiroComissaoStatus.paga
    ) {
      await this.reabrirTitulosDaComissao(row.id, row.tenantId);
    }
    await this.syncTitulosDaComissao(row);
    return this.mapComissao(row, requester);
  }

  async removeComissao(id: string, requester: AuthenticatedUser) {
    this.assertComissaoWrite(requester);
    const existing = await this.findComissaoOrFail(id, requester);
    await this.removeTitulosDaComissao(existing.id, existing.tenantId);
    await this.prisma.financeiroComissao.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Resumos ─────────────────────────────────────────────────

  async visaoGeral(
    requester: AuthenticatedUser,
    query: QueryVisaoGeralDto = {},
  ) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const now = new Date();
    const brasil = new Date(now.getTime() - BRASIL_UTC_OFFSET_MS);
    const y = query.ano ?? brasil.getUTCFullYear();
    const mesFiltro =
      query.mes != null && Number(query.mes) >= 1 && Number(query.mes) <= 12
        ? Number(query.mes)
        : undefined;
    const bounds = slackBoundsVisao(y, mesFiltro);
    const mesAnt =
      mesFiltro != null
        ? mesFiltro === 1
          ? 12
          : mesFiltro - 1
        : undefined;
    const anoAnt = mesFiltro != null ? (mesFiltro === 1 ? y - 1 : y) : y - 1;
    const boundsAnt = slackBoundsVisao(anoAnt, mesAnt);

    await this.syncComissoesParaTitulos(tenantId).catch(() => undefined);

    const [movJanela, movJanelaAnt, titulosReceber, titulosPagar, movAbertosParceiro, comissoesJanela] =
      await Promise.all([
        this.prisma.financeiroMovimento.findMany({
          where: {
            tenantId,
            data: { gte: bounds.gte, lt: bounds.lt },
            status: { not: FinanceiroTituloStatus.cancelado },
          },
        }),
        this.prisma.financeiroMovimento.findMany({
          where: {
            tenantId,
            data: { gte: boundsAnt.gte, lt: boundsAnt.lt },
            status: { not: FinanceiroTituloStatus.cancelado },
          },
        }),
        this.prisma.financeiroTitulo.findMany({
          where: {
            tenantId,
            tipo: FinanceiroTituloTipo.receber,
            status: {
              in: [
                FinanceiroTituloStatus.aberto,
                FinanceiroTituloStatus.atrasado,
              ],
            },
            vencimento: { gte: bounds.gte, lt: bounds.lt },
            comissaoId: null,
          },
        }),
        this.prisma.financeiroTitulo.findMany({
          where: {
            tenantId,
            tipo: FinanceiroTituloTipo.pagar,
            status: {
              in: [
                FinanceiroTituloStatus.aberto,
                FinanceiroTituloStatus.atrasado,
              ],
            },
            vencimento: { gte: bounds.gte, lt: bounds.lt },
          },
        }),
        this.prisma.financeiroMovimento.findMany({
          where: {
            tenantId,
            parceiroId: { not: null },
            status: {
              in: [
                FinanceiroTituloStatus.aberto,
                FinanceiroTituloStatus.atrasado,
              ],
            },
          },
          select: { tipo: true, valor: true },
        }),
        this.prisma.financeiroTitulo.findMany({
          where: {
            tenantId,
            tipo: FinanceiroTituloTipo.receber,
            comissaoId: { not: null },
            status: {
              in: [
                FinanceiroTituloStatus.aberto,
                FinanceiroTituloStatus.atrasado,
              ],
            },
            vencimento: { gte: bounds.gte, lt: bounds.lt },
          },
          orderBy: [{ valor: "desc" }, { vencimento: "asc" }],
        }),
      ]);

    const movMes = movJanela.filter((r) =>
      noPeriodoVisao(r.data, y, mesFiltro),
    );
    const movAnt = movJanelaAnt.filter((r) =>
      noPeriodoVisao(r.data, anoAnt, mesAnt),
    );
    const aReceberValor = titulosReceber
      .filter((t) => noPeriodoVisao(t.vencimento, y, mesFiltro))
      .reduce((s, t) => s + t.valor, 0);
    const aPagarValor = titulosPagar
      .filter((t) => noPeriodoVisao(t.vencimento, y, mesFiltro))
      .reduce((s, t) => s + t.valor, 0);
    const comissoesAReceberMes = comissoesJanela.filter((t) =>
      noPeriodoVisao(t.vencimento, y, mesFiltro),
    );

    const sumTipo = (
      rows: { tipo: FinanceiroMovimentoTipo; valor: number }[],
      tipo: FinanceiroMovimentoTipo,
    ) => rows.filter((r) => r.tipo === tipo).reduce((s, r) => s + r.valor, 0);

    const receitasMes = sumTipo(movMes, FinanceiroMovimentoTipo.entrada);
    const despesasMes = sumTipo(movMes, FinanceiroMovimentoTipo.saida);
    const receitasAnt = sumTipo(movAnt, FinanceiroMovimentoTipo.entrada);
    const despesasAnt = sumTipo(movAnt, FinanceiroMovimentoTipo.saida);
    const resultadoMes = receitasMes - despesasMes;
    const resultadoAnt = receitasAnt - despesasAnt;
    const resolvedNatureza = await this.despesaNaturezaResolver(tenantId);
    const sumNatureza = (
      rows: {
        tipo: FinanceiroMovimentoTipo;
        valor: number;
        centro: string;
        categoria: string;
        natureza: FinanceiroDespesaNatureza | null;
      }[],
      bucket: "fixa" | "variavel" | "outros",
    ) =>
      rows
        .filter((r) => r.tipo === FinanceiroMovimentoTipo.saida)
        .filter(
          (r) => this.classifyDespesaBucket(resolvedNatureza(r)) === bucket,
        )
        .reduce((s, r) => s + r.valor, 0);
    const despesasFixaMes = sumNatureza(movMes, "fixa");
    const despesasVariavelMes = sumNatureza(movMes, "variavel");
    const despesasOutrosMes = sumNatureza(movMes, "outros");

    const mapPipelineItem = (row: (typeof movMes)[number]) => ({
      id: row.id,
      descricao: row.descricao,
      valor: row.valor,
      data: isoDateOnly(row.data),
      centro: row.centro || row.categoria || "",
      parceiro: row.parceiroNome,
      status: row.status,
    });
    const saidasMes = movMes.filter(
      (r) => r.tipo === FinanceiroMovimentoTipo.saida,
    );
    const comissoesAReceberMesValor = comissoesAReceberMes.reduce(
      (s, t) => s + t.valor,
      0,
    );
    const despesasPipeline = {
      fixas: saidasMes
        .filter((r) => this.classifyDespesaBucket(resolvedNatureza(r)) === "fixa")
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 40)
        .map(mapPipelineItem),
      variaveis: saidasMes
        .filter(
          (r) => this.classifyDespesaBucket(resolvedNatureza(r)) === "variavel",
        )
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 40)
        .map(mapPipelineItem),
      outros: saidasMes
        .filter(
          (r) => this.classifyDespesaBucket(resolvedNatureza(r)) === "outros",
        )
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 40)
        .map(mapPipelineItem),
      comissoes: comissoesAReceberMes.slice(0, 40).map((row) => ({
        id: row.id,
        descricao: row.descricao,
        valor: row.valor,
        data: isoDateOnly(row.vencimento),
        centro: row.centro || row.categoria || "",
        parceiro: row.parceiroNome,
        status: row.status,
        comissaoId: row.comissaoId,
      })),
    };

    const evolucao = (atual: number, anterior: number): number | null => {
      if (anterior === 0) return atual === 0 ? 0 : null;
      return Number((((atual - anterior) / anterior) * 100).toFixed(1));
    };

    const mesesResumo = await this.buildMesesResumo(tenantId, y);
    const saldoAtual = movAbertosParceiro.reduce((acc, m) => {
      return m.tipo === FinanceiroMovimentoTipo.entrada
        ? acc + m.valor
        : acc - m.valor;
    }, 0);
    // Centros de despesa/recebimento são exclusivos da imobiliária.
    const centros =
      requester.role === Role.super_admin
        ? []
        : await this.buildCentros(tenantId);

    return {
      kpis: {
        saldoAtual,
        receitasMes,
        despesasMes,
        despesasFixaMes,
        despesasVariavelMes,
        despesasOutrosMes,
        comissoesAReceberMes: comissoesAReceberMesValor,
        aReceber: aReceberValor,
        aPagar: aPagarValor,
        resultadoMes,
        evolucaoReceitas: evolucao(receitasMes, receitasAnt),
        evolucaoDespesas: evolucao(despesasMes, despesasAnt),
        evolucaoResultado: evolucao(resultadoMes, resultadoAnt),
      },
      mesesResumo,
      centros,
      despesasPipeline,
    };
  }

  async fluxoCaixa(requester: AuthenticatedUser, query: QueryFluxoCaixaDto) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const granularidade: FluxoGranularidade = query.granularidade ?? "dia";
    const today = todayIsoBrasil();
    const from = query.from?.slice(0, 10) ?? startOfMonthIso(today);
    const to = query.to?.slice(0, 10) ?? endOfMonthIso(today);
    if (from > to) {
      throw new BadRequestException("Data inicial maior que a final.");
    }

    const eventos = await this.collectFluxoEventos(tenantId, from, to);
    const buckets = this.buildFluxoBuckets(from, to, granularidade);

    type Acc = {
      entradasRealizadas: number;
      saidasRealizadas: number;
      entradasPrevistas: number;
      saidasPrevistas: number;
    };
    const byKey = new Map<string, Acc>();
    for (const b of buckets) {
      byKey.set(b.chave, {
        entradasRealizadas: 0,
        saidasRealizadas: 0,
        entradasPrevistas: 0,
        saidasPrevistas: 0,
      });
    }

    for (const ev of eventos) {
      const meta = this.bucketMetaForDate(ev.data, granularidade);
      const acc = byKey.get(meta.chave);
      if (!acc) continue;
      if (ev.natureza === "realizado") {
        if (ev.tipo === "entrada") acc.entradasRealizadas += ev.valor;
        else acc.saidasRealizadas += ev.valor;
      } else {
        if (ev.tipo === "entrada") acc.entradasPrevistas += ev.valor;
        else acc.saidasPrevistas += ev.valor;
      }
    }

    let saldoRealizado = 0;
    let saldoProjetado = 0;
    return buckets.map((b) => {
      const v = byKey.get(b.chave)!;
      const liquidoReal = v.entradasRealizadas - v.saidasRealizadas;
      const liquidoPrev = v.entradasPrevistas - v.saidasPrevistas;
      saldoRealizado += liquidoReal;
      saldoProjetado += liquidoReal + liquidoPrev;
      return {
        chave: b.chave,
        label: b.label,
        inicio: b.inicio,
        fim: b.fim,
        entradasRealizadas: v.entradasRealizadas,
        saidasRealizadas: v.saidasRealizadas,
        entradasPrevistas: v.entradasPrevistas,
        saidasPrevistas: v.saidasPrevistas,
        saldoRealizado,
        saldoProjetado,
        // Compat com UI antiga / gráficos simples
        dia: b.chave,
        entradas: v.entradasRealizadas + v.entradasPrevistas,
        saidas: v.saidasRealizadas + v.saidasPrevistas,
        saldo: saldoProjetado,
      };
    });
  }

  async fluxoCaixaItens(
    requester: AuthenticatedUser,
    from?: string,
    to?: string,
  ) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const today = todayIsoBrasil();
    const start = from?.slice(0, 10) ?? today;
    const end = to?.slice(0, 10) ?? start;
    const eventos = await this.collectFluxoEventos(tenantId, start, end);
    return eventos.sort((a, b) => a.data.localeCompare(b.data));
  }

  async centrosDespesa(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    return this.buildCentros(tenantId);
  }

  // ─── Tipos de despesa (fixa / variável) ─────────────────────

  async listDespesaTipos(
    requester: AuthenticatedUser,
    natureza?: FinanceiroDespesaNatureza,
  ) {
    this.assertAccess(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    await this.ensureDefaultDespesaCategorias(tenantId);
    await this.cleanupReceitaTiposFromDespesas(tenantId);
    await this.unifyCentroIntoCategoria(tenantId);
    const competencia = competenciaAtualBrasil();
    const { gte, lt } = this.competenciaDateBounds(competencia);
    const rows = await this.prisma.financeiroDespesaTipo.findMany({
      where: {
        tenantId,
        ...(natureza ? { natureza } : {}),
      },
      include: {
        _count: { select: { despesas: true } },
        despesas: {
          where: {
            ativo: true,
            OR: [{ competencia }, { competencia: "", data: { gte, lt } }],
          },
          select: { valor: true },
        },
      },
      orderBy: [{ natureza: "asc" }, { nome: "asc" }],
    });
    return rows.map((r) => this.mapDespesaTipo(r));
  }

  async createDespesaTipo(
    dto: CreateDespesaTipoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const nome = dto.nome.trim();
    try {
      const row = await this.prisma.financeiroDespesaTipo.create({
        data: {
          tenantId,
          nome,
          natureza: dto.natureza,
          orcadoMensal: dto.orcadoMensal ?? 0,
          ativo: dto.ativo ?? true,
        },
        include: {
          _count: { select: { despesas: true } },
          despesas: { where: { ativo: true }, select: { valor: true } },
        },
      });
      return this.mapDespesaTipo(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new BadRequestException(
          "Já existe um tipo com este nome nesta natureza.",
        );
      }
      throw err;
    }
  }

  async updateDespesaTipo(
    id: string,
    dto: UpdateDespesaTipoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    await this.findDespesaTipoOrFail(id, requester);
    try {
      const row = await this.prisma.financeiroDespesaTipo.update({
        where: { id },
        data: {
          ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
          ...(dto.natureza !== undefined ? { natureza: dto.natureza } : {}),
          ...(dto.orcadoMensal !== undefined
            ? { orcadoMensal: dto.orcadoMensal }
            : {}),
          ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
        },
        include: {
          _count: { select: { despesas: true } },
          despesas: { where: { ativo: true }, select: { valor: true } },
        },
      });
      return this.mapDespesaTipo(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new BadRequestException(
          "Já existe um tipo com este nome nesta natureza.",
        );
      }
      throw err;
    }
  }

  async removeDespesaTipo(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    await this.findDespesaTipoOrFail(id, requester);
    await this.prisma.financeiroDespesaTipo.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Despesas ────────────────────────────────────────────────

  listDespesas(
    requester: AuthenticatedUser,
    natureza?: FinanceiroDespesaNatureza,
  ) {
    this.assertAccess(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    return this.prisma.financeiroDespesa
      .findMany({
        where: {
          tenantId,
          ...(natureza ? { tipo: { natureza } } : {}),
        },
        include: {
          tipo: { select: { id: true, nome: true, natureza: true } },
        },
        orderBy: { data: "desc" },
      })
      .then((rows) => rows.map((r) => this.mapDespesa(r)));
  }

  async createDespesa(dto: CreateDespesaDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const tipo = await this.findDespesaTipoOrFail(dto.tipoId, requester);
    if (!tipo.ativo) {
      throw new BadRequestException("Tipo de despesa inativo.");
    }
    const competencia =
      dto.competencia?.trim() || competenciaFromIsoDate(dto.data);
    const recorrentePadrao =
      tipo.natureza === FinanceiroDespesaNatureza.fixa ||
      tipo.natureza === FinanceiroDespesaNatureza.fixa_variavel;
    const recorrente = dto.recorrente ?? recorrentePadrao;
    if (recorrente && tipo.natureza === FinanceiroDespesaNatureza.variavel) {
      throw new BadRequestException(
        "Despesas variáveis não podem ser marcadas como recorrentes.",
      );
    }
    const row = await this.prisma.financeiroDespesa.create({
      data: {
        tenantId,
        tipoId: dto.tipoId,
        descricao: dto.descricao.trim(),
        valor: dto.valor,
        data: parseDayStart(dto.data),
        competencia,
        recorrente,
        observacao: dto.observacao?.trim() || "",
        ativo: dto.ativo ?? true,
      },
      include: {
        tipo: { select: { id: true, nome: true, natureza: true } },
      },
    });
    return this.mapDespesa(row);
  }

  async updateDespesa(
    id: string,
    dto: UpdateDespesaDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    const existing = await this.findDespesaOrFail(id, requester);
    let tipoNatureza = existing.tipo.natureza;
    if (dto.tipoId) {
      const tipo = await this.findDespesaTipoOrFail(dto.tipoId, requester);
      if (!tipo.ativo) {
        throw new BadRequestException("Tipo de despesa inativo.");
      }
      tipoNatureza = tipo.natureza;
    }
    if (
      dto.recorrente === true &&
      tipoNatureza === FinanceiroDespesaNatureza.variavel
    ) {
      throw new BadRequestException(
        "Despesas variáveis não podem ser marcadas como recorrentes.",
      );
    }
    const dataIso =
      dto.data !== undefined
        ? dto.data.slice(0, 10)
        : isoDateOnly(existing.data);
    const competencia =
      dto.competencia?.trim() ||
      (dto.data !== undefined ? competenciaFromIsoDate(dataIso) : undefined);
    const row = await this.prisma.financeiroDespesa.update({
      where: { id },
      data: {
        ...(dto.tipoId !== undefined ? { tipoId: dto.tipoId } : {}),
        ...(dto.descricao !== undefined
          ? { descricao: dto.descricao.trim() }
          : {}),
        ...(dto.valor !== undefined ? { valor: dto.valor } : {}),
        ...(dto.data !== undefined ? { data: parseDayStart(dto.data) } : {}),
        ...(competencia !== undefined ? { competencia } : {}),
        ...(dto.recorrente !== undefined ? { recorrente: dto.recorrente } : {}),
        ...(dto.observacao !== undefined
          ? { observacao: dto.observacao.trim() }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
      include: {
        tipo: { select: { id: true, nome: true, natureza: true } },
      },
    });
    return this.mapDespesa(row);
  }

  async removeDespesa(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    await this.findDespesaOrFail(id, requester);
    await this.prisma.financeiroDespesa.delete({ where: { id } });
    return { ok: true };
  }

  async renovarDespesasMes(
    dto: RenovarDespesasDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const competencia = dto.competencia.trim();
    const [y, m] = competencia.split("-").map(Number);
    if (!y || !m) {
      throw new BadRequestException("Competência inválida.");
    }

    const raizes = await this.prisma.financeiroDespesa.findMany({
      where: {
        tenantId,
        ativo: true,
        recorrente: true,
        origemId: null,
        tipo: {
          natureza: {
            in: [
              FinanceiroDespesaNatureza.fixa,
              FinanceiroDespesaNatureza.fixa_variavel,
            ],
          },
        },
      },
      include: {
        tipo: { select: { id: true, nome: true, natureza: true, ativo: true } },
      },
      orderBy: { data: "desc" },
    });

    const criadas = [];
    let ignoradas = 0;

    for (const raiz of raizes) {
      if (!raiz.tipo.ativo) {
        ignoradas += 1;
        continue;
      }
      const serieIds = { OR: [{ id: raiz.id }, { origemId: raiz.id }] };
      const jaExiste = await this.prisma.financeiroDespesa.findFirst({
        where: {
          tenantId,
          competencia,
          ...serieIds,
        },
        select: { id: true },
      });
      if (jaExiste) {
        ignoradas += 1;
        continue;
      }

      const ultima = await this.prisma.financeiroDespesa.findFirst({
        where: { tenantId, ...serieIds },
        orderBy: [{ competencia: "desc" }, { data: "desc" }],
      });
      const template = ultima ?? raiz;
      const day = Math.min(
        Number(isoDateOnly(template.data).slice(8, 10)) || 1,
        28,
      );
      const row = await this.prisma.financeiroDespesa.create({
        data: {
          tenantId,
          tipoId: template.tipoId,
          descricao: template.descricao,
          valor: template.valor,
          data: dataFromCompetencia(competencia, day),
          competencia,
          recorrente: true,
          origemId: raiz.id,
          observacao: template.observacao,
          ativo: true,
        },
        include: {
          tipo: { select: { id: true, nome: true, natureza: true } },
        },
      });
      criadas.push(this.mapDespesa(row));
    }

    return {
      competencia,
      criadas: criadas.length,
      ignoradas,
      despesas: criadas,
    };
  }

  // ─── Tipos de recebimento ────────────────────────────────────

  async listRecebimentoTipos(
    requester: AuthenticatedUser,
    natureza?: FinanceiroDespesaNatureza,
  ) {
    this.assertAccess(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    await this.ensureDefaultRecebimentoCategorias(tenantId);
    const competencia = competenciaAtualBrasil();
    const { gte, lt } = this.competenciaDateBounds(competencia);
    const rows = await this.prisma.financeiroRecebimentoTipo.findMany({
      where: {
        tenantId,
        ...(natureza ? { natureza } : {}),
      },
      include: {
        _count: { select: { recebimentos: true } },
        recebimentos: {
          where: {
            ativo: true,
            OR: [{ competencia }, { competencia: "", data: { gte, lt } }],
          },
          select: { valor: true },
        },
      },
      orderBy: [{ natureza: "asc" }, { nome: "asc" }],
    });
    return rows.map((r) => this.mapRecebimentoTipo(r));
  }

  async createRecebimentoTipo(
    dto: CreateRecebimentoTipoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const nome = dto.nome.trim();
    try {
      const row = await this.prisma.financeiroRecebimentoTipo.create({
        data: {
          tenantId,
          nome,
          natureza: dto.natureza,
          orcadoMensal: dto.orcadoMensal ?? 0,
          ativo: dto.ativo ?? true,
        },
        include: {
          _count: { select: { recebimentos: true } },
          recebimentos: { where: { ativo: true }, select: { valor: true } },
        },
      });
      return this.mapRecebimentoTipo(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new BadRequestException(
          "Já existe um tipo com este nome nesta natureza.",
        );
      }
      throw err;
    }
  }

  async updateRecebimentoTipo(
    id: string,
    dto: UpdateRecebimentoTipoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    await this.findRecebimentoTipoOrFail(id, requester);
    try {
      const row = await this.prisma.financeiroRecebimentoTipo.update({
        where: { id },
        data: {
          ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
          ...(dto.natureza !== undefined ? { natureza: dto.natureza } : {}),
          ...(dto.orcadoMensal !== undefined
            ? { orcadoMensal: dto.orcadoMensal }
            : {}),
          ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
        },
        include: {
          _count: { select: { recebimentos: true } },
          recebimentos: { where: { ativo: true }, select: { valor: true } },
        },
      });
      return this.mapRecebimentoTipo(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new BadRequestException(
          "Já existe um tipo com este nome nesta natureza.",
        );
      }
      throw err;
    }
  }

  async removeRecebimentoTipo(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    await this.findRecebimentoTipoOrFail(id, requester);
    await this.prisma.financeiroRecebimentoTipo.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Recebimentos ────────────────────────────────────────────

  listRecebimentos(
    requester: AuthenticatedUser,
    natureza?: FinanceiroDespesaNatureza,
  ) {
    this.assertAccess(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    return this.prisma.financeiroRecebimento
      .findMany({
        where: {
          tenantId,
          ...(natureza ? { tipo: { natureza } } : {}),
        },
        include: {
          tipo: { select: { id: true, nome: true, natureza: true } },
        },
        orderBy: { data: "desc" },
      })
      .then((rows) => rows.map((r) => this.mapRecebimento(r)));
  }

  async createRecebimento(
    dto: CreateRecebimentoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const tipo = await this.findRecebimentoTipoOrFail(dto.tipoId, requester);
    if (!tipo.ativo) {
      throw new BadRequestException("Tipo de recebimento inativo.");
    }
    const competencia =
      dto.competencia?.trim() || competenciaFromIsoDate(dto.data);
    const recorrentePadrao =
      tipo.natureza === FinanceiroDespesaNatureza.fixa ||
      tipo.natureza === FinanceiroDespesaNatureza.fixa_variavel;
    const recorrente = dto.recorrente ?? recorrentePadrao;
    if (recorrente && tipo.natureza === FinanceiroDespesaNatureza.variavel) {
      throw new BadRequestException(
        "Recebimentos variáveis não podem ser marcados como recorrentes.",
      );
    }
    const row = await this.prisma.financeiroRecebimento.create({
      data: {
        tenantId,
        tipoId: dto.tipoId,
        descricao: dto.descricao.trim(),
        valor: dto.valor,
        data: parseDayStart(dto.data),
        competencia,
        recorrente,
        observacao: dto.observacao?.trim() || "",
        ativo: dto.ativo ?? true,
      },
      include: {
        tipo: { select: { id: true, nome: true, natureza: true } },
      },
    });
    return this.mapRecebimento(row);
  }

  async updateRecebimento(
    id: string,
    dto: UpdateRecebimentoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    const existing = await this.findRecebimentoOrFail(id, requester);
    let tipoNatureza = existing.tipo.natureza;
    if (dto.tipoId) {
      const tipo = await this.findRecebimentoTipoOrFail(dto.tipoId, requester);
      if (!tipo.ativo) {
        throw new BadRequestException("Tipo de recebimento inativo.");
      }
      tipoNatureza = tipo.natureza;
    }
    if (
      dto.recorrente === true &&
      tipoNatureza === FinanceiroDespesaNatureza.variavel
    ) {
      throw new BadRequestException(
        "Recebimentos variáveis não podem ser marcados como recorrentes.",
      );
    }
    const dataIso =
      dto.data !== undefined
        ? dto.data.slice(0, 10)
        : isoDateOnly(existing.data);
    const competencia =
      dto.competencia?.trim() ||
      (dto.data !== undefined ? competenciaFromIsoDate(dataIso) : undefined);
    const row = await this.prisma.financeiroRecebimento.update({
      where: { id },
      data: {
        ...(dto.tipoId !== undefined ? { tipoId: dto.tipoId } : {}),
        ...(dto.descricao !== undefined
          ? { descricao: dto.descricao.trim() }
          : {}),
        ...(dto.valor !== undefined ? { valor: dto.valor } : {}),
        ...(dto.data !== undefined ? { data: parseDayStart(dto.data) } : {}),
        ...(competencia !== undefined ? { competencia } : {}),
        ...(dto.recorrente !== undefined ? { recorrente: dto.recorrente } : {}),
        ...(dto.observacao !== undefined
          ? { observacao: dto.observacao.trim() }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
      include: {
        tipo: { select: { id: true, nome: true, natureza: true } },
      },
    });
    return this.mapRecebimento(row);
  }

  async removeRecebimento(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    await this.findRecebimentoOrFail(id, requester);
    await this.prisma.financeiroRecebimento.delete({ where: { id } });
    return { ok: true };
  }

  async renovarRecebimentosMes(
    dto: RenovarRecebimentosDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    this.assertTenantCentrosModule(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const competencia = dto.competencia.trim();
    const [y, m] = competencia.split("-").map(Number);
    if (!y || !m) {
      throw new BadRequestException("Competência inválida.");
    }

    const raizes = await this.prisma.financeiroRecebimento.findMany({
      where: {
        tenantId,
        ativo: true,
        recorrente: true,
        origemId: null,
        tipo: {
          natureza: {
            in: [
              FinanceiroDespesaNatureza.fixa,
              FinanceiroDespesaNatureza.fixa_variavel,
            ],
          },
        },
      },
      include: {
        tipo: { select: { id: true, nome: true, natureza: true, ativo: true } },
      },
      orderBy: { data: "desc" },
    });

    const criadas = [];
    let ignoradas = 0;

    for (const raiz of raizes) {
      if (!raiz.tipo.ativo) {
        ignoradas += 1;
        continue;
      }
      const serieIds = { OR: [{ id: raiz.id }, { origemId: raiz.id }] };
      const jaExiste = await this.prisma.financeiroRecebimento.findFirst({
        where: {
          tenantId,
          competencia,
          ...serieIds,
        },
        select: { id: true },
      });
      if (jaExiste) {
        ignoradas += 1;
        continue;
      }

      const ultima = await this.prisma.financeiroRecebimento.findFirst({
        where: { tenantId, ...serieIds },
        orderBy: [{ competencia: "desc" }, { data: "desc" }],
      });
      const template = ultima ?? raiz;
      const day = Math.min(
        Number(isoDateOnly(template.data).slice(8, 10)) || 1,
        28,
      );
      const row = await this.prisma.financeiroRecebimento.create({
        data: {
          tenantId,
          tipoId: template.tipoId,
          descricao: template.descricao,
          valor: template.valor,
          data: dataFromCompetencia(competencia, day),
          competencia,
          recorrente: true,
          origemId: raiz.id,
          observacao: template.observacao,
          ativo: true,
        },
        include: {
          tipo: { select: { id: true, nome: true, natureza: true } },
        },
      });
      criadas.push(this.mapRecebimento(row));
    }

    return {
      competencia,
      criadas: criadas.length,
      ignoradas,
      recebimentos: criadas,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private resolveTituloCategoriaCentro(
    tipo: FinanceiroTituloTipo | string,
    categoria?: string | null,
    centro?: string | null,
  ) {
    const cat = categoria?.trim() || "";
    const cen = centro?.trim() || "";
    if (tipo === FinanceiroTituloTipo.pagar) {
      const label = cen || cat;
      return { categoria: label, centro: label };
    }
    const label = cat || cen;
    return { categoria: label, centro: "" };
  }

  /** Títulos a pagar e saídas: só fixa ou variável. Receitas ficam sem natureza. */
  private resolveDespesaNatureza(
    isDespesa: boolean,
    natureza?: FinanceiroDespesaNatureza | null,
  ): FinanceiroDespesaNatureza | null {
    if (!isDespesa) return null;
    if (natureza === FinanceiroDespesaNatureza.fixa) {
      return FinanceiroDespesaNatureza.fixa;
    }
    return FinanceiroDespesaNatureza.variavel;
  }

  private async despesaNaturezaResolver(tenantId: string) {
    const tipos = await this.prisma.financeiroDespesaTipo.findMany({
      where: { tenantId, ativo: true },
      select: { nome: true, natureza: true },
    });
    const byCentro = new Map<string, FinanceiroDespesaNatureza | "ambiguous">();
    for (const tipo of tipos) {
      const key = tipo.nome.trim().toLowerCase();
      const atual = byCentro.get(key);
      if (!atual) byCentro.set(key, tipo.natureza);
      else if (atual !== tipo.natureza) byCentro.set(key, "ambiguous");
    }
    return (row: {
      centro: string;
      categoria: string;
      natureza: FinanceiroDespesaNatureza | null;
    }): FinanceiroDespesaNatureza | null => {
      if (row.natureza) return row.natureza;
      const key = (row.centro || row.categoria).trim().toLowerCase();
      const found = byCentro.get(key);
      return found && found !== "ambiguous" ? found : null;
    };
  }

  private classifyDespesaBucket(
    natureza: FinanceiroDespesaNatureza | null,
  ): "fixa" | "variavel" | "outros" {
    if (natureza === FinanceiroDespesaNatureza.fixa) return "fixa";
    if (
      natureza === FinanceiroDespesaNatureza.variavel ||
      natureza === FinanceiroDespesaNatureza.fixa_variavel
    ) {
      return "variavel";
    }
    return "outros";
  }

  private async buildMesesResumo(tenantId: string, ano: number) {
    const resolvedNatureza = await this.despesaNaturezaResolver(tenantId);
    const inicioJanela = new Date(Date.UTC(ano, 0, 1) - BRASIL_UTC_OFFSET_MS);
    const fimJanela = new Date(Date.UTC(ano + 1, 0, 1) + BRASIL_UTC_OFFSET_MS);
    const [comissoesAberto, titulosAbertos, movimentos] = await Promise.all([
      this.prisma.financeiroTitulo.findMany({
        where: {
          tenantId,
          tipo: FinanceiroTituloTipo.receber,
          comissaoId: { not: null },
          status: {
            in: [
              FinanceiroTituloStatus.aberto,
              FinanceiroTituloStatus.atrasado,
            ],
          },
          vencimento: { gte: inicioJanela, lt: fimJanela },
        },
        select: { valor: true, vencimento: true },
      }),
      this.prisma.financeiroTitulo.findMany({
        where: {
          tenantId,
          status: {
            in: [
              FinanceiroTituloStatus.aberto,
              FinanceiroTituloStatus.atrasado,
            ],
          },
          vencimento: { gte: inicioJanela, lt: fimJanela },
        },
        select: {
          tipo: true,
          valor: true,
          vencimento: true,
          comissaoId: true,
        },
      }),
      this.prisma.financeiroMovimento.findMany({
        where: {
          tenantId,
          status: { not: FinanceiroTituloStatus.cancelado },
          data: { gte: inicioJanela, lt: fimJanela },
        },
      }),
    ]);
    const somarPorMes = (
      items: { valor: number; vencimento?: Date; data?: Date }[],
      campo: "vencimento" | "data",
    ) => {
      const map = new Map<string, number>();
      for (const item of items) {
        const d = campo === "vencimento" ? item.vencimento : item.data;
        if (!d) continue;
        const key = isoDateOnly(d).slice(0, 7);
        if (!key.startsWith(`${ano}-`)) continue;
        map.set(key, (map.get(key) ?? 0) + item.valor);
      }
      return map;
    };
    const comissaoPorMes = somarPorMes(comissoesAberto, "vencimento");
    const aReceberPorMes = somarPorMes(
      titulosAbertos.filter(
        (t) => t.tipo === FinanceiroTituloTipo.receber && t.comissaoId == null,
      ),
      "vencimento",
    );
    const aPagarPorMes = somarPorMes(
      titulosAbertos.filter((t) => t.tipo === FinanceiroTituloTipo.pagar),
      "vencimento",
    );
    const movPorMes = new Map<string, typeof movimentos>();
    for (const row of movimentos) {
      const key = isoDateOnly(row.data).slice(0, 7);
      if (!key.startsWith(`${ano}-`)) continue;
      const list = movPorMes.get(key) ?? [];
      list.push(row);
      movPorMes.set(key, list);
    }

    return MESES_CURTOS.map((mes, m) => {
      const key = `${ano}-${String(m + 1).padStart(2, "0")}`;
      const rows = movPorMes.get(key) ?? [];
      const saidas = rows.filter(
        (r) => r.tipo === FinanceiroMovimentoTipo.saida,
      );
      return {
        mes,
        receitas: rows
          .filter((r) => r.tipo === FinanceiroMovimentoTipo.entrada)
          .reduce((s, r) => s + r.valor, 0),
        despesas: saidas.reduce((s, r) => s + r.valor, 0),
        variaveis: saidas
          .filter(
            (r) =>
              this.classifyDespesaBucket(resolvedNatureza(r)) === "variavel",
          )
          .reduce((s, r) => s + r.valor, 0),
        fixas: saidas
          .filter(
            (r) => this.classifyDespesaBucket(resolvedNatureza(r)) === "fixa",
          )
          .reduce((s, r) => s + r.valor, 0),
        comissoesAReceber: comissaoPorMes.get(key) ?? 0,
        aReceber: aReceberPorMes.get(key) ?? 0,
        aPagar: aPagarPorMes.get(key) ?? 0,
      };
    });
  }

  private async buildCentros(tenantId: string) {
    await this.ensureDefaultDespesaCategorias(tenantId);
    const competencia = competenciaAtualBrasil();
    const { gte, lt } = this.competenciaDateBounds(competencia);
    const tipos = await this.prisma.financeiroDespesaTipo.findMany({
      where: { tenantId, ativo: true },
      include: {
        despesas: {
          where: {
            ativo: true,
            OR: [{ competencia }, { competencia: "", data: { gte, lt } }],
          },
          select: { valor: true },
        },
      },
      orderBy: { nome: "asc" },
    });

    if (tipos.length > 0) {
      // Agrega por nome de categoria (soma naturezas do mesmo centro).
      const byName = new Map<
        string,
        {
          centro: string;
          natureza: FinanceiroDespesaNatureza | null;
          orcado: number;
          realizado: number;
        }
      >();
      for (const t of tipos) {
        const realizado = t.despesas.reduce((s, d) => s + d.valor, 0);
        const cur = byName.get(t.nome);
        if (cur) {
          cur.orcado += t.orcadoMensal;
          cur.realizado += realizado;
          if (cur.natureza !== t.natureza) cur.natureza = null;
        } else {
          byName.set(t.nome, {
            centro: t.nome,
            natureza: t.natureza,
            orcado: t.orcadoMensal,
            realizado,
          });
        }
      }
      return [...byName.values()]
        .map((c) => ({
          ...c,
          percentual: c.orcado
            ? (c.realizado / c.orcado) * 100
            : c.realizado > 0
              ? 100
              : 0,
        }))
        .filter((c) => c.realizado > 0 || c.orcado > 0)
        .sort((a, b) => b.realizado - a.realizado);
    }

    const rows = await this.prisma.financeiroMovimento.findMany({
      where: {
        tenantId,
        tipo: FinanceiroMovimentoTipo.saida,
        status: { not: FinanceiroTituloStatus.cancelado },
        data: { gte, lt },
      },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = r.centro || "Sem centro";
      map.set(key, (map.get(key) ?? 0) + r.valor);
    }
    return [...map.entries()]
      .map(([centro, realizado]) => ({
        centro,
        natureza: null as string | null,
        orcado: realizado,
        realizado,
        percentual: 100,
      }))
      .sort((a, b) => b.realizado - a.realizado);
  }

  private competenciaDateBounds(competencia: string) {
    const [ys, ms] = competencia.split("-").map(Number);
    const gte = new Date(Date.UTC(ys, ms - 1, 1) + BRASIL_UTC_OFFSET_MS);
    const lt = new Date(Date.UTC(ys, ms, 1) + BRASIL_UTC_OFFSET_MS);
    return { gte, lt };
  }

  private periodoDateBounds(periodo: "mes" | "trimestre" | "ano" | "tudo") {
    if (periodo === "tudo") return {} as { gte?: Date; lt?: Date };
    const today = todayIsoBrasil();
    const y = Number(today.slice(0, 4));
    const m = Number(today.slice(5, 7));
    if (periodo === "mes") {
      return {
        gte: new Date(Date.UTC(y, m - 1, 1) + BRASIL_UTC_OFFSET_MS),
        lt: new Date(Date.UTC(y, m, 1) + BRASIL_UTC_OFFSET_MS),
      };
    }
    if (periodo === "trimestre") {
      const qStart = Math.floor((m - 1) / 3) * 3;
      return {
        gte: new Date(Date.UTC(y, qStart, 1) + BRASIL_UTC_OFFSET_MS),
        lt: new Date(Date.UTC(y, qStart + 3, 1) + BRASIL_UTC_OFFSET_MS),
      };
    }
    return {
      gte: new Date(Date.UTC(y, 0, 1) + BRASIL_UTC_OFFSET_MS),
      lt: new Date(Date.UTC(y + 1, 0, 1) + BRASIL_UTC_OFFSET_MS),
    };
  }

  private async ensureDefaultCategorias(tenantId: string) {
    const count = await this.prisma.financeiroCategoria.count({
      where: { tenantId },
    });
    if (count > 0) return;
    await this.prisma.financeiroCategoria.createMany({
      data: [
        ...DEFAULT_CATEGORIAS_ENTRADA.map((nome) => ({
          tenantId,
          nome,
          tipo: FinanceiroMovimentoTipo.entrada,
          ativo: true,
        })),
        ...DEFAULT_CATEGORIAS_SAIDA.map((nome) => ({
          tenantId,
          nome,
          tipo: FinanceiroMovimentoTipo.saida,
          ativo: true,
        })),
      ],
      skipDuplicates: true,
    });
  }

  private async findCategoriaOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroCategoria.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException("Categoria não encontrada.");
    return row;
  }

  private async ensureDefaultDespesaCategorias(tenantId: string) {
    const count = await this.prisma.financeiroDespesaTipo.count({
      where: { tenantId },
    });
    if (count === 0) {
      const naturezas: FinanceiroDespesaNatureza[] = [
        FinanceiroDespesaNatureza.fixa,
        FinanceiroDespesaNatureza.fixa_variavel,
        FinanceiroDespesaNatureza.variavel,
      ];
      await this.prisma.financeiroDespesaTipo.createMany({
        data: naturezas.flatMap((natureza) =>
          DEFAULT_DESPESA_CATEGORIAS.map((nome) => ({
            tenantId,
            nome,
            natureza,
            orcadoMensal: 0,
            ativo: true,
          })),
        ),
        skipDuplicates: true,
      });
    }
  }

  private async ensureDefaultRecebimentoCategorias(tenantId: string) {
    const count = await this.prisma.financeiroRecebimentoTipo.count({
      where: { tenantId },
    });
    if (count === 0) {
      await this.prisma.financeiroRecebimentoTipo.createMany({
        data: DEFAULT_CATEGORIAS_ENTRADA.map((nome) => ({
          tenantId,
          nome,
          natureza: FinanceiroDespesaNatureza.variavel,
          orcadoMensal: 0,
          ativo: true,
        })),
        skipDuplicates: true,
      });
    }

    // Nomes órfãos de títulos a receber → tipos de recebimento.
    const titulos = await this.prisma.financeiroTitulo.findMany({
      where: {
        tenantId,
        tipo: FinanceiroTituloTipo.receber,
        categoria: { not: "" },
      },
      select: { categoria: true },
      distinct: ["categoria"],
    });
    const nomes = titulos.map((t) => t.categoria.trim()).filter(Boolean);
    if (nomes.length === 0) return;
    await this.prisma.financeiroRecebimentoTipo.createMany({
      data: nomes.map((nome) => ({
        tenantId,
        nome,
        natureza: FinanceiroDespesaNatureza.variavel,
        orcadoMensal: 0,
        ativo: true,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Remove/desativa tipos de receita legados do Centro de despesas.
   */
  private async cleanupReceitaTiposFromDespesas(tenantId: string) {
    const legacyReceita = new Set(
      DEFAULT_CATEGORIAS_ENTRADA.map((n) => n.trim().toLowerCase()),
    );
    const rows = await this.prisma.financeiroDespesaTipo.findMany({
      where: { tenantId },
      include: { _count: { select: { despesas: true } } },
    });
    for (const row of rows) {
      if (!legacyReceita.has(row.nome.trim().toLowerCase())) continue;
      if (row._count.despesas === 0) {
        await this.prisma.financeiroDespesaTipo.delete({
          where: { id: row.id },
        });
      } else if (row.ativo) {
        await this.prisma.financeiroDespesaTipo.update({
          where: { id: row.id },
          data: { ativo: false },
        });
      }
    }
  }

  /**
   * Unifica rótulos:
   * - pagar/saída: categoria = centro (centro de custo)
   * - receber/entrada: categoria preenchida, centro vazio
   * Órfãos de saída → despesa-tipos; órfãos de entrada → recebimento-tipos.
   */
  private async unifyCentroIntoCategoria(tenantId: string) {
    const [titulos, movimentos] = await Promise.all([
      this.prisma.financeiroTitulo.findMany({
        where: {
          tenantId,
          OR: [{ centro: { not: "" } }, { categoria: { not: "" } }],
        },
        select: { id: true, tipo: true, categoria: true, centro: true },
      }),
      this.prisma.financeiroMovimento.findMany({
        where: {
          tenantId,
          OR: [{ centro: { not: "" } }, { categoria: { not: "" } }],
        },
        select: { id: true, tipo: true, categoria: true, centro: true },
      }),
    ]);

    const nomesDespesa = new Set<string>();
    const nomesRecebimento = new Set<string>();
    const tituloUpdates: { id: string; categoria: string; centro: string }[] =
      [];
    for (const t of titulos) {
      const resolved = this.resolveTituloCategoriaCentro(
        t.tipo,
        t.categoria,
        t.centro,
      );
      if (!resolved.categoria && !resolved.centro) continue;
      if (t.tipo === FinanceiroTituloTipo.pagar) {
        if (resolved.centro) nomesDespesa.add(resolved.centro);
      } else if (resolved.categoria) {
        nomesRecebimento.add(resolved.categoria);
      }
      if (t.categoria !== resolved.categoria || t.centro !== resolved.centro) {
        tituloUpdates.push({
          id: t.id,
          categoria: resolved.categoria,
          centro: resolved.centro,
        });
      }
    }

    const movUpdates: { id: string; categoria: string; centro: string }[] = [];
    for (const m of movimentos) {
      const cat = m.categoria?.trim() || "";
      const cen = m.centro?.trim() || "";
      const isSaida = m.tipo === FinanceiroMovimentoTipo.saida;
      const resolved = isSaida
        ? { categoria: cen || cat, centro: cen || cat }
        : { categoria: cat || cen, centro: "" };
      if (!resolved.categoria && !resolved.centro) continue;
      if (isSaida) {
        if (resolved.centro) nomesDespesa.add(resolved.centro);
      } else if (resolved.categoria) {
        nomesRecebimento.add(resolved.categoria);
      }
      if (cat !== resolved.categoria || cen !== resolved.centro) {
        movUpdates.push({
          id: m.id,
          categoria: resolved.categoria,
          centro: resolved.centro,
        });
      }
    }

    if (tituloUpdates.length || movUpdates.length) {
      await this.prisma.$transaction([
        ...tituloUpdates.map((u) =>
          this.prisma.financeiroTitulo.update({
            where: { id: u.id },
            data: { categoria: u.categoria, centro: u.centro },
          }),
        ),
        ...movUpdates.map((u) =>
          this.prisma.financeiroMovimento.update({
            where: { id: u.id },
            data: { categoria: u.categoria, centro: u.centro },
          }),
        ),
      ]);
    }

    if (nomesDespesa.size > 0) {
      await this.prisma.financeiroDespesaTipo.createMany({
        data: [...nomesDespesa].map((nome) => ({
          tenantId,
          nome,
          natureza: FinanceiroDespesaNatureza.variavel,
          orcadoMensal: 0,
          ativo: true,
        })),
        skipDuplicates: true,
      });
    }
    if (nomesRecebimento.size > 0) {
      await this.prisma.financeiroRecebimentoTipo.createMany({
        data: [...nomesRecebimento].map((nome) => ({
          tenantId,
          nome,
          natureza: FinanceiroDespesaNatureza.variavel,
          orcadoMensal: 0,
          ativo: true,
        })),
        skipDuplicates: true,
      });
    }
  }

  private async findMovimentoOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroMovimento.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException("Movimento não encontrado.");
    return row;
  }

  private async findTituloOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroTitulo.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException("Título não encontrado.");
    return row;
  }

  private async collectFluxoEventos(
    tenantId: string,
    from: string,
    to: string,
  ): Promise<FluxoEvento[]> {
    await this.extendIndeterminateRecurrences(tenantId).catch(() => undefined);
    await this.syncComissoesParaTitulos(tenantId).catch(() => undefined);
    const fromDate = parseDayStart(from);
    const toExclusive = parseDayEnd(to);

    const [movimentos, titulos] = await Promise.all([
      this.prisma.financeiroMovimento.findMany({
        where: {
          tenantId,
          status: { not: FinanceiroTituloStatus.cancelado },
          data: { gte: fromDate, lt: toExclusive },
        },
        include: {
          titulo: { select: { comissaoId: true, tipo: true } },
        },
      }),
      this.prisma.financeiroTitulo.findMany({
        where: {
          tenantId,
          status: {
            in: [
              FinanceiroTituloStatus.aberto,
              FinanceiroTituloStatus.atrasado,
            ],
          },
          vencimento: { gte: fromDate, lt: toExclusive },
          // Contas a pagar de comissão ficam só no módulo Comissão.
          NOT: {
            AND: [
              { comissaoId: { not: null } },
              { tipo: FinanceiroTituloTipo.pagar },
            ],
          },
        },
      }),
    ]);

    const eventos: FluxoEvento[] = [];

    for (const m of movimentos) {
      if (
        m.titulo?.comissaoId &&
        m.titulo.tipo === FinanceiroTituloTipo.pagar
      ) {
        continue;
      }
      const natureza =
        m.status === FinanceiroTituloStatus.pago ? "realizado" : "previsto";
      eventos.push({
        data: isoDateOnly(m.data),
        tipo: m.tipo === FinanceiroMovimentoTipo.entrada ? "entrada" : "saida",
        valor: m.valor,
        natureza,
        origem: "movimento",
        id: m.id,
        descricao: m.descricao,
        parceiro: m.parceiroNome,
        categoria: m.categoria,
        centro: m.centro,
        status: m.status,
      });
    }

    for (const t of titulos) {
      eventos.push({
        data: isoDateOnly(t.vencimento),
        tipo: t.tipo === FinanceiroTituloTipo.receber ? "entrada" : "saida",
        valor: t.valor,
        natureza: "previsto",
        origem: "titulo",
        id: t.id,
        descricao: t.parcela
          ? `${t.descricao} (${t.parcela})`
          : t.descricao,
        parceiro: t.parceiroNome,
        categoria: t.categoria,
        centro: t.centro,
        status: t.status,
        contrato: Boolean(t.platformContratoId || t.platformFornecedorContratoId),
      });
    }

    return eventos;
  }

  private bucketMetaForDate(
    iso: string,
    granularidade: FluxoGranularidade,
  ): { chave: string; inicio: string; fim: string; label: string } {
    if (granularidade === "dia") {
      const [y, m, d] = iso.split("-").map(Number);
      const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(
        "pt-BR",
        {
          timeZone: "UTC",
          day: "2-digit",
          month: "2-digit",
        },
      );
      return { chave: iso, inicio: iso, fim: iso, label };
    }
    if (granularidade === "semana") {
      const w = isoWeekKey(iso);
      return {
        ...w,
        label: `${w.inicio.slice(8)}/${w.inicio.slice(5, 7)} – ${w.fim.slice(8)}/${w.fim.slice(5, 7)}`,
      };
    }
    if (granularidade === "mes") {
      const inicio = startOfMonthIso(iso);
      const fim = endOfMonthIso(iso);
      const m = Number(iso.slice(5, 7)) - 1;
      const y = iso.slice(0, 4);
      return {
        chave: iso.slice(0, 7),
        inicio,
        fim,
        label: `${MESES_CURTOS[m]}/${y}`,
      };
    }
    const q = quarterKey(iso);
    return {
      ...q,
      label: q.chave.replace("-", " "),
    };
  }

  private buildFluxoBuckets(
    from: string,
    to: string,
    granularidade: FluxoGranularidade,
  ) {
    const seen = new Set<string>();
    const buckets: {
      chave: string;
      label: string;
      inicio: string;
      fim: string;
    }[] = [];

    let cursor = from;
    while (cursor <= to) {
      const meta = this.bucketMetaForDate(cursor, granularidade);
      if (!seen.has(meta.chave)) {
        seen.add(meta.chave);
        buckets.push({
          chave: meta.chave,
          label: meta.label,
          inicio: meta.inicio,
          fim: meta.fim,
        });
      }
      if (granularidade === "dia") {
        cursor = addDaysIso(cursor, 1);
      } else if (granularidade === "semana") {
        cursor = addDaysIso(meta.fim, 1);
      } else if (granularidade === "mes") {
        const [y, m] = meta.inicio.split("-").map(Number);
        cursor = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
      } else {
        cursor = addDaysIso(meta.fim, 1);
      }
      if (buckets.length > 400) break;
    }
    return buckets;
  }

  private async findParceiroOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroParceiro.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException("Parceiro não encontrado.");
    return row;
  }

  private async findDespesaTipoOrFail(
    id: string,
    requester: AuthenticatedUser,
  ) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroDespesaTipo.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException("Tipo de despesa não encontrado.");
    return row;
  }

  private async findDespesaOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroDespesa.findFirst({
      where: { id, tenantId },
      include: {
        tipo: { select: { id: true, nome: true, natureza: true, ativo: true } },
      },
    });
    if (!row) throw new NotFoundException("Despesa não encontrada.");
    return row;
  }

  private async findRecebimentoTipoOrFail(
    id: string,
    requester: AuthenticatedUser,
  ) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroRecebimentoTipo.findFirst({
      where: { id, tenantId },
    });
    if (!row) {
      throw new NotFoundException("Tipo de recebimento não encontrado.");
    }
    return row;
  }

  private async findRecebimentoOrFail(
    id: string,
    requester: AuthenticatedUser,
  ) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroRecebimento.findFirst({
      where: { id, tenantId },
      include: {
        tipo: { select: { id: true, nome: true, natureza: true, ativo: true } },
      },
    });
    if (!row) throw new NotFoundException("Recebimento não encontrado.");
    return row;
  }

  private async resolveParceiroNome(
    tenantId: string,
    parceiroId?: string,
    fallback?: string,
  ) {
    if (parceiroId) {
      const p = await this.prisma.financeiroParceiro.findFirst({
        where: { id: parceiroId, tenantId },
        select: { nome: true },
      });
      if (!p) throw new NotFoundException("Parceiro não encontrado.");
      return p.nome;
    }
    return fallback?.trim() || "";
  }

  /**
   * Saldo aberto = soma dos lançamentos em aberto/atrasado do parceiro.
   * Entrada soma (+); saída subtrai (−). Pago/cancelado não entra.
   */
  private sumSaldoPorParceiro(
    movimentos: {
      parceiroId: string | null;
      tipo: FinanceiroMovimentoTipo | string;
      valor: number;
    }[],
  ) {
    const map = new Map<string, number>();
    for (const m of movimentos) {
      if (!m.parceiroId) continue;
      const cur = map.get(m.parceiroId) ?? 0;
      map.set(
        m.parceiroId,
        m.tipo === FinanceiroMovimentoTipo.entrada
          ? cur + m.valor
          : cur - m.valor,
      );
    }
    return map;
  }

  private async recalcSaldoParceiro(
    tenantId: string,
    parceiroId: string | null | undefined,
  ) {
    if (!parceiroId) return;

    const movimentos = await this.prisma.financeiroMovimento.findMany({
      where: {
        tenantId,
        parceiroId,
        status: {
          in: [FinanceiroTituloStatus.aberto, FinanceiroTituloStatus.atrasado],
        },
      },
      select: { tipo: true, valor: true },
    });

    const saldoAberto = movimentos.reduce((acc, m) => {
      return m.tipo === FinanceiroMovimentoTipo.entrada
        ? acc + m.valor
        : acc - m.valor;
    }, 0);

    await this.prisma.financeiroParceiro.updateMany({
      where: { id: parceiroId, tenantId },
      data: { saldoAberto },
    });
  }

  private mapCategoria(row: {
    id: string;
    nome: string;
    tipo: FinanceiroMovimentoTipo;
    ativo: boolean;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      nome: row.nome,
      tipo: row.tipo,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapParceiro(row: {
    id: string;
    nome: string;
    documento: string;
    tipo: string;
    email: string | null;
    telefone: string | null;
    cidade: string | null;
    imobiliaria?: string | null;
    saldoAberto: number;
    ativo: boolean;
  }) {
    return {
      id: row.id,
      nome: row.nome,
      documento: row.documento,
      tipo: row.tipo,
      email: row.email ?? "",
      telefone: row.telefone ?? "",
      cidade: row.cidade ?? "",
      imobiliaria: row.imobiliaria ?? "",
      saldoAberto: row.saldoAberto,
      ativo: row.ativo,
    };
  }

  private mapDespesaTipo(row: {
    id: string;
    nome: string;
    natureza: FinanceiroDespesaNatureza;
    orcadoMensal: number;
    ativo: boolean;
    createdAt: Date;
    _count?: { despesas: number };
    despesas?: { valor: number }[];
  }) {
    const realizado = (row.despesas ?? []).reduce((s, d) => s + d.valor, 0);
    return {
      id: row.id,
      nome: row.nome,
      natureza: row.natureza,
      orcadoMensal: row.orcadoMensal,
      realizado,
      qtdDespesas: row._count?.despesas ?? row.despesas?.length ?? 0,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapDespesa(row: {
    id: string;
    tipoId: string;
    descricao: string;
    valor: number;
    data: Date;
    competencia?: string | null;
    recorrente?: boolean;
    origemId?: string | null;
    observacao: string;
    ativo: boolean;
    createdAt: Date;
    tipo: { id: string; nome: string; natureza: FinanceiroDespesaNatureza };
  }) {
    return {
      id: row.id,
      tipoId: row.tipoId,
      tipoNome: row.tipo.nome,
      natureza: row.tipo.natureza,
      descricao: row.descricao,
      valor: row.valor,
      data: isoDateOnly(row.data),
      competencia:
        row.competencia?.trim() ||
        competenciaFromIsoDate(isoDateOnly(row.data)),
      recorrente: row.recorrente ?? false,
      origemId: row.origemId ?? null,
      observacao: row.observacao,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapRecebimentoTipo(row: {
    id: string;
    nome: string;
    natureza: FinanceiroDespesaNatureza;
    orcadoMensal: number;
    ativo: boolean;
    createdAt: Date;
    _count?: { recebimentos: number };
    recebimentos?: { valor: number }[];
  }) {
    const realizado = (row.recebimentos ?? []).reduce((s, d) => s + d.valor, 0);
    return {
      id: row.id,
      nome: row.nome,
      natureza: row.natureza,
      orcadoMensal: row.orcadoMensal,
      realizado,
      qtdDespesas: row._count?.recebimentos ?? row.recebimentos?.length ?? 0,
      qtdRecebimentos:
        row._count?.recebimentos ?? row.recebimentos?.length ?? 0,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapRecebimento(row: {
    id: string;
    tipoId: string;
    descricao: string;
    valor: number;
    data: Date;
    competencia?: string | null;
    recorrente?: boolean;
    origemId?: string | null;
    observacao: string;
    ativo: boolean;
    createdAt: Date;
    tipo: { id: string; nome: string; natureza: FinanceiroDespesaNatureza };
  }) {
    return {
      id: row.id,
      tipoId: row.tipoId,
      tipoNome: row.tipo.nome,
      natureza: row.tipo.natureza,
      descricao: row.descricao,
      valor: row.valor,
      data: isoDateOnly(row.data),
      competencia:
        row.competencia?.trim() ||
        competenciaFromIsoDate(isoDateOnly(row.data)),
      recorrente: row.recorrente ?? false,
      origemId: row.origemId ?? null,
      observacao: row.observacao,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapMovimento(row: {
    id: string;
    data: Date;
    descricao: string;
    parceiroId: string | null;
    parceiroNome: string;
    categoria: string;
    centro: string;
    tipo: string;
    valor: number;
    status: string;
    formaPagamento: string;
    tituloId?: string | null;
    natureza?: FinanceiroDespesaNatureza | null;
  }) {
    return {
      id: row.id,
      data: isoDateOnly(row.data),
      descricao: row.descricao,
      parceiroId: row.parceiroId,
      parceiro: row.parceiroNome,
      categoria: row.categoria,
      centro: row.centro,
      tipo: row.tipo,
      valor: row.valor,
      status: row.status,
      formaPagamento: row.formaPagamento,
      tituloId: row.tituloId ?? null,
      natureza: row.natureza ?? null,
    };
  }

  private mapTitulo(row: {
    id: string;
    tipo: string;
    descricao: string;
    parceiroId: string | null;
    parceiroNome: string;
    categoria: string;
    centro: string;
    vencimento: Date;
    dataPagamento?: Date | null;
    valor: number;
    status: string;
    parcela: string;
    grupoParcelasId?: string | null;
    recorrenciaIndeterminada?: boolean;
    platformContratoId?: string | null;
    platformFornecedorContratoId?: string | null;
    comissaoId?: string | null;
    comissaoPapel?: string | null;
    natureza?: FinanceiroDespesaNatureza | null;
    movimento?: { formaPagamento: string } | null;
  }) {
    return {
      id: row.id,
      tipo: row.tipo,
      descricao: row.descricao,
      parceiroId: row.parceiroId,
      parceiro: row.parceiroNome,
      categoria: row.categoria,
      centro: row.centro,
      vencimento: isoDateOnly(row.vencimento),
      dataPagamento: row.dataPagamento ? isoDateOnly(row.dataPagamento) : null,
      valor: row.valor,
      status: row.status,
      parcela: row.parcela,
      grupoParcelasId: row.grupoParcelasId ?? null,
      recorrenciaIndeterminada: row.recorrenciaIndeterminada ?? false,
      platformContratoId:
        row.platformContratoId ?? row.platformFornecedorContratoId ?? null,
      comissaoId: row.comissaoId ?? null,
      comissaoPapel: row.comissaoPapel ?? null,
      natureza: row.natureza ?? null,
      formaPagamento: row.movimento?.formaPagamento || "",
    };
  }

  private async listTitulosDaComissao(comissaoId: string, tenantId: string) {
    const rows = await this.prisma.financeiroTitulo.findMany({
      where: { tenantId, comissaoId },
      include: { movimento: { select: { formaPagamento: true } } },
      orderBy: { vencimento: "asc" },
    });
    return rows.map((row) => this.mapTitulo(row));
  }

  private mapComissao(
    row: Prisma.FinanceiroComissaoGetPayload<Record<string, never>>,
    requester: AuthenticatedUser,
  ) {
    const result = {
      ...row,
      dataVenda: isoDateOnly(row.dataVenda),
      dataPrevistaRecebimento: isoDateOnly(row.dataPrevistaRecebimento),
      vgv: Number(row.vgv),
      percentualImobiliaria: Number(row.percentualImobiliaria),
      comissaoBruta: Number(row.comissaoBruta),
      percentualTributos: Number(row.percentualTributos),
      valorTributos: Number(row.valorTributos),
      comissaoLiquida: Number(row.comissaoLiquida),
      percentualCorretor: Number(row.percentualCorretor),
      valorCorretor: Number(row.valorCorretor),
      percentualGerente: Number(row.percentualGerente),
      valorGerente: Number(row.valorGerente),
      percentualCaixa: Number(row.percentualCaixa),
      valorCaixa: Number(row.valorCaixa),
      percentualSocios: Number(row.percentualSocios),
      valorSocios: Number(row.valorSocios),
      valorPremiacao: Number(row.valorPremiacao),
      percentualPremiacaoCorretor: Number(row.percentualPremiacaoCorretor),
      valorPremiacaoCorretor: Number(row.valorPremiacaoCorretor),
      percentualPremiacaoImposto: Number(row.percentualPremiacaoImposto),
      valorPremiacaoImposto: Number(row.valorPremiacaoImposto),
      percentualPremiacaoImobiliaria: Number(
        row.percentualPremiacaoImobiliaria,
      ),
      valorPremiacaoImobiliaria: Number(row.valorPremiacaoImobiliaria),
      percentualPremiacaoGerente: Number(row.percentualPremiacaoGerente),
      valorPremiacaoGerente: Number(row.valorPremiacaoGerente),
      valorPremiacaoRestante: Number(row.valorPremiacaoRestante),
    };
    if (isCorretorLike(requester.role)) {
      const {
        percentualTributos: _percentualTributos,
        valorTributos: _valorTributos,
        comissaoLiquida: _comissaoLiquida,
        percentualGerente: _percentualGerente,
        valorGerente: _valorGerente,
        percentualCaixa: _percentualCaixa,
        valorCaixa: _valorCaixa,
        percentualSocios: _percentualSocios,
        valorSocios: _valorSocios,
        percentualPremiacaoImobiliaria: _percentualPremiacaoImobiliaria,
        valorPremiacaoImobiliaria: _valorPremiacaoImobiliaria,
        percentualPremiacaoGerente: _percentualPremiacaoGerente,
        valorPremiacaoGerente: _valorPremiacaoGerente,
        percentualPremiacaoImposto: _percentualPremiacaoImposto,
        valorPremiacaoImposto: _valorPremiacaoImposto,
        valorPremiacaoRestante: _valorPremiacaoRestante,
        ...corretorResult
      } = result;
      return corretorResult;
    }
    if (requester.role === Role.gerente) {
      const {
        percentualCaixa: _percentualCaixa,
        valorCaixa: _valorCaixa,
        percentualSocios: _percentualSocios,
        valorSocios: _valorSocios,
        percentualPremiacaoImobiliaria: _percentualPremiacaoImobiliaria,
        valorPremiacaoImobiliaria: _valorPremiacaoImobiliaria,
        ...publicResult
      } = result;
      return publicResult;
    }
    return result;
  }

  private calculateComissao(
    vgv: number,
    input: {
      percentualImobiliaria: number;
      percentualTributos: number;
      percentualCorretor: number;
      percentualGerente: number;
      percentualCaixa: number;
      percentualSocios: number;
    },
  ) {
    const splitTotal =
      input.percentualCorretor +
      input.percentualGerente +
      input.percentualCaixa +
      input.percentualSocios;
    if (Math.abs(splitTotal - 100) > 0.0001) {
      throw new BadRequestException(
        "Os percentuais da comissão líquida devem somar 100%.",
      );
    }
    const decimal = (value: number) => new Prisma.Decimal(value.toString());
    const percent = (value: number) => decimal(value).div(100);
    const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2);
    const vgvDecimal = money(decimal(vgv));
    const comissaoBruta = money(
      vgvDecimal.mul(percent(input.percentualImobiliaria)),
    );
    const valorTributos = money(
      comissaoBruta.mul(percent(input.percentualTributos)),
    );
    const comissaoLiquida = money(comissaoBruta.minus(valorTributos));
    const valorCorretor = money(
      comissaoLiquida.mul(percent(input.percentualCorretor)),
    );
    const valorGerente = money(
      comissaoLiquida.mul(percent(input.percentualGerente)),
    );
    const valorCaixa = money(
      comissaoLiquida.mul(percent(input.percentualCaixa)),
    );
    // O último split absorve eventual centavo residual do arredondamento.
    const valorSocios = money(
      comissaoLiquida
        .minus(valorCorretor)
        .minus(valorGerente)
        .minus(valorCaixa),
    );
    return {
      vgv: vgvDecimal,
      percentualImobiliaria: input.percentualImobiliaria,
      comissaoBruta,
      percentualTributos: input.percentualTributos,
      valorTributos,
      comissaoLiquida,
      percentualCorretor: input.percentualCorretor,
      valorCorretor,
      percentualGerente: input.percentualGerente,
      valorGerente,
      percentualCaixa: input.percentualCaixa,
      valorCaixa,
      percentualSocios: input.percentualSocios,
      valorSocios,
    };
  }

  private calculatePremiacao(input: {
    valorPremiacao?: number;
    percentualPremiacaoCorretor?: number;
    percentualPremiacaoImposto?: number;
    percentualPremiacaoImobiliaria?: number;
    percentualPremiacaoGerente?: number;
  }) {
    const decimal = (value: number) => new Prisma.Decimal(value.toString());
    const percent = (value: number) => decimal(value).div(100);
    const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2);
    let restante = money(
      decimal(Math.max(0, Number(input.valorPremiacao) || 0)),
    );
    const total = restante;
    const percCorretor = Number(input.percentualPremiacaoCorretor) || 0;
    const percImposto = Number(input.percentualPremiacaoImposto) || 0;
    const percImobiliaria = Number(input.percentualPremiacaoImobiliaria) || 0;
    const percGerente = Number(input.percentualPremiacaoGerente) || 0;

    const valorPremiacaoCorretor = money(restante.mul(percent(percCorretor)));
    restante = money(restante.minus(valorPremiacaoCorretor));

    const valorPremiacaoImposto = money(restante.mul(percent(percImposto)));
    restante = money(restante.minus(valorPremiacaoImposto));

    const valorPremiacaoImobiliaria = money(
      restante.mul(percent(percImobiliaria)),
    );
    restante = money(restante.minus(valorPremiacaoImobiliaria));

    const valorPremiacaoGerente = money(restante.mul(percent(percGerente)));
    restante = money(restante.minus(valorPremiacaoGerente));

    return {
      valorPremiacao: total,
      percentualPremiacaoCorretor: percCorretor,
      valorPremiacaoCorretor,
      percentualPremiacaoImposto: percImposto,
      valorPremiacaoImposto,
      percentualPremiacaoImobiliaria: percImobiliaria,
      valorPremiacaoImobiliaria,
      percentualPremiacaoGerente: percGerente,
      valorPremiacaoGerente,
      valorPremiacaoRestante: restante,
    };
  }

  private comissaoTituloDescricao(
    row: { cliente: string; empreendimento: string },
    papelLabel: string,
  ) {
    const cliente = row.cliente.trim() || "Cliente";
    const emp = row.empreendimento.trim();
    const base = emp ? `${cliente} — ${emp}` : cliente;
    return `Comissão · ${papelLabel} — ${base}`;
  }

  private pecasFinanceirasDaComissao(row: {
    corretor: string;
    gerente: string;
    cliente: string;
    empreendimento: string;
    valorCaixa: Prisma.Decimal | number;
    valorSocios: Prisma.Decimal | number;
    valorCorretor: Prisma.Decimal | number;
    valorGerente: Prisma.Decimal | number;
    valorTributos: Prisma.Decimal | number;
    valorPremiacaoCorretor?: Prisma.Decimal | number;
    valorPremiacaoImposto?: Prisma.Decimal | number;
    valorPremiacaoImobiliaria?: Prisma.Decimal | number;
    valorPremiacaoGerente?: Prisma.Decimal | number;
  }) {
    const money = (value: Prisma.Decimal | number | undefined) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };
    const pecas: Array<{
      papel: string;
      label: string;
      tipo: FinanceiroTituloTipo;
      valor: number;
      categoria: string;
      centro: string;
      parceiroNome: string;
    }> = [
      {
        papel: "caixa",
        label: "Caixa da imobiliária",
        tipo: FinanceiroTituloTipo.receber,
        valor: money(row.valorCaixa),
        categoria: "Comissão — Caixa",
        centro: "",
        parceiroNome: "Caixa da imobiliária",
      },
      {
        papel: "socios",
        label: "Sócios",
        tipo: FinanceiroTituloTipo.receber,
        valor: money(row.valorSocios),
        categoria: "Comissão — Sócios",
        centro: "",
        parceiroNome: "Sócios",
      },
      {
        papel: "corretor",
        label: "Corretor",
        tipo: FinanceiroTituloTipo.pagar,
        valor: money(row.valorCorretor),
        categoria: "Comissão corretor",
        centro: "Comissão corretor",
        parceiroNome: row.corretor.trim() || "Corretor",
      },
      {
        papel: "gerente",
        label: "Gerente",
        tipo: FinanceiroTituloTipo.pagar,
        valor: money(row.valorGerente),
        categoria: "Comissão gerente",
        centro: "Comissão gerente",
        parceiroNome: row.gerente.trim() || "Gerente",
      },
      {
        papel: "tributos",
        label: "Tributos",
        tipo: FinanceiroTituloTipo.pagar,
        valor: money(row.valorTributos),
        categoria: "Impostos",
        centro: "Impostos",
        parceiroNome: "Tributos",
      },
      {
        papel: "premiacao_corretor",
        label: "Premiação corretor",
        tipo: FinanceiroTituloTipo.pagar,
        valor: money(row.valorPremiacaoCorretor),
        categoria: "Premiação corretor",
        centro: "Premiação corretor",
        parceiroNome: row.corretor.trim() || "Corretor",
      },
      {
        papel: "premiacao_imposto",
        label: "Premiação imposto",
        tipo: FinanceiroTituloTipo.pagar,
        valor: money(row.valorPremiacaoImposto),
        categoria: "Premiação — Imposto",
        centro: "Impostos",
        parceiroNome: "Imposto",
      },
      {
        papel: "premiacao_imobiliaria",
        label: "Premiação imobiliária",
        tipo: FinanceiroTituloTipo.receber,
        valor: money(row.valorPremiacaoImobiliaria),
        categoria: "Premiação — Imobiliária",
        centro: "",
        parceiroNome: "Imobiliária",
      },
      {
        papel: "premiacao_gerente",
        label: "Premiação gerente",
        tipo: FinanceiroTituloTipo.pagar,
        valor: money(row.valorPremiacaoGerente),
        categoria: "Premiação gerente",
        centro: "Premiação gerente",
        parceiroNome: row.gerente.trim() || "Gerente",
      },
    ];
    return pecas.filter((p) => p.valor >= 0.01);
  }

  private async syncComissoesParaTitulos(tenantId: string) {
    const rows = await this.prisma.financeiroComissao.findMany({
      where: {
        tenantId,
        OR: [
          { status: FinanceiroComissaoStatus.paga },
          { titulos: { none: {} } },
        ],
      },
    });
    for (const row of rows) {
      await this.syncTitulosDaComissao(row);
    }
  }

  private movimentoDaPecaComissao(
    peca: {
      tipo: FinanceiroTituloTipo;
      valor: number;
      categoria: string;
      centro: string;
      parceiroNome: string;
    },
    descricao: string,
    tenantId: string,
    tituloId: string,
    data: Date,
  ) {
    return {
      tenantId,
      data,
      descricao,
      parceiroNome: peca.parceiroNome,
      categoria: peca.categoria,
      centro: peca.centro,
      tipo:
        peca.tipo === FinanceiroTituloTipo.receber
          ? FinanceiroMovimentoTipo.entrada
          : FinanceiroMovimentoTipo.saida,
      valor: peca.valor,
      status: FinanceiroTituloStatus.pago,
      natureza:
        peca.tipo === FinanceiroTituloTipo.pagar
          ? FinanceiroDespesaNatureza.variavel
          : null,
      formaPagamento: "",
      tituloId,
    };
  }

  private async syncTitulosDaComissao(row: {
    id: string;
    tenantId: string;
    corretor: string;
    gerente: string;
    cliente: string;
    empreendimento: string;
    dataVenda: Date;
    dataPrevistaRecebimento: Date;
    valorCaixa: Prisma.Decimal | number;
    valorSocios: Prisma.Decimal | number;
    valorCorretor: Prisma.Decimal | number;
    valorGerente: Prisma.Decimal | number;
    valorTributos: Prisma.Decimal | number;
    valorPremiacaoCorretor?: Prisma.Decimal | number;
    valorPremiacaoImposto?: Prisma.Decimal | number;
    valorPremiacaoImobiliaria?: Prisma.Decimal | number;
    valorPremiacaoGerente?: Prisma.Decimal | number;
    status: FinanceiroComissaoStatus;
  }) {
    const pecas = this.pecasFinanceirasDaComissao(row);
    const keep = new Set(pecas.map((p) => p.papel));
    const existing = await this.prisma.financeiroTitulo.findMany({
      where: { tenantId: row.tenantId, comissaoId: row.id },
      include: { movimento: true },
    });

    for (const titulo of existing) {
      if (!titulo.comissaoPapel || !keep.has(titulo.comissaoPapel)) {
        await this.prisma.$transaction(async (tx) => {
          await tx.financeiroMovimento.deleteMany({
            where: { tituloId: titulo.id },
          });
          await tx.financeiroTitulo.delete({ where: { id: titulo.id } });
        });
      }
    }

    const comissaoPaga = row.status === FinanceiroComissaoStatus.paga;
    const dataPagamentoDefault = parseDayStart(todayIsoBrasil());
    const vencimento = row.dataPrevistaRecebimento ?? row.dataVenda;
    const restantes = await this.prisma.financeiroTitulo.findMany({
      where: { tenantId: row.tenantId, comissaoId: row.id },
      include: { movimento: true },
    });
    const byPapel = new Map(restantes.map((t) => [t.comissaoPapel, t]));

    for (const peca of pecas) {
      const descricao = this.comissaoTituloDescricao(row, peca.label);
      const atual = byPapel.get(peca.papel);
      if (atual && atual.tipo !== peca.tipo) {
        await this.prisma.$transaction(async (tx) => {
          await tx.financeiroMovimento.deleteMany({
            where: { tituloId: atual.id },
          });
          await tx.financeiroTitulo.delete({ where: { id: atual.id } });
        });
        byPapel.delete(peca.papel);
      }

      const current = byPapel.get(peca.papel);
      const jaPago = current?.status === FinanceiroTituloStatus.pago;
      const deveEstarPago = comissaoPaga || jaPago;
      const dataPagamento = deveEstarPago
        ? (current?.dataPagamento ?? dataPagamentoDefault)
        : null;

      if (current) {
        await this.prisma.financeiroTitulo.update({
          where: { id: current.id },
          data: {
            descricao,
            parceiroNome: peca.parceiroNome,
            categoria: peca.categoria,
            centro: peca.centro,
            valor: peca.valor,
            vencimento,
            status: deveEstarPago
              ? FinanceiroTituloStatus.pago
              : current.status === FinanceiroTituloStatus.cancelado ||
                  current.status === FinanceiroTituloStatus.atrasado
                ? current.status
                : FinanceiroTituloStatus.aberto,
            dataPagamento,
            comissaoPapel: peca.papel,
            natureza:
              peca.tipo === FinanceiroTituloTipo.pagar
                ? FinanceiroDespesaNatureza.variavel
                : null,
          },
        });
        if (deveEstarPago) {
          if (current.movimento) {
            await this.prisma.financeiroMovimento.update({
              where: { id: current.movimento.id },
              data: {
                descricao,
                valor: peca.valor,
                categoria: peca.categoria,
                centro: peca.centro,
                parceiroNome: peca.parceiroNome,
                natureza:
                  peca.tipo === FinanceiroTituloTipo.pagar
                    ? FinanceiroDespesaNatureza.variavel
                    : null,
                tipo:
                  peca.tipo === FinanceiroTituloTipo.receber
                    ? FinanceiroMovimentoTipo.entrada
                    : FinanceiroMovimentoTipo.saida,
              },
            });
          } else {
            await this.prisma.financeiroMovimento.create({
              data: this.movimentoDaPecaComissao(
                peca,
                descricao,
                row.tenantId,
                current.id,
                dataPagamento ?? dataPagamentoDefault,
              ),
            });
          }
        } else if (current.movimento) {
          await this.prisma.financeiroMovimento.delete({
            where: { id: current.movimento.id },
          });
        }
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        const titulo = await tx.financeiroTitulo.create({
          data: {
            tenantId: row.tenantId,
            tipo: peca.tipo,
            descricao,
            parceiroNome: peca.parceiroNome,
            categoria: peca.categoria,
            centro: peca.centro,
            vencimento,
            dataPagamento: comissaoPaga ? dataPagamentoDefault : null,
            valor: peca.valor,
            status: comissaoPaga
              ? FinanceiroTituloStatus.pago
              : FinanceiroTituloStatus.aberto,
            parcela: "",
            comissaoId: row.id,
            comissaoPapel: peca.papel,
            natureza:
              peca.tipo === FinanceiroTituloTipo.pagar
                ? FinanceiroDespesaNatureza.variavel
                : null,
          },
        });
        if (comissaoPaga) {
          await tx.financeiroMovimento.create({
            data: this.movimentoDaPecaComissao(
              peca,
              descricao,
              row.tenantId,
              titulo.id,
              dataPagamentoDefault,
            ),
          });
        }
      });
    }
  }

  private async reabrirTitulosDaComissao(
    comissaoId: string,
    tenantId: string,
  ) {
    const titulos = await this.prisma.financeiroTitulo.findMany({
      where: { tenantId, comissaoId },
      select: { id: true },
    });
    if (titulos.length === 0) return;
    const ids = titulos.map((t) => t.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.financeiroMovimento.deleteMany({
        where: { tituloId: { in: ids } },
      });
      await tx.financeiroTitulo.updateMany({
        where: { id: { in: ids } },
        data: {
          status: FinanceiroTituloStatus.aberto,
          dataPagamento: null,
        },
      });
    });
  }

  private async sincronizarStatusComissaoPelosTitulos(
    comissaoId: string,
    tenantId: string,
  ) {
    const comissao = await this.prisma.financeiroComissao.findFirst({
      where: { id: comissaoId, tenantId },
    });
    if (!comissao) return;
    const titulos = await this.prisma.financeiroTitulo.findMany({
      where: { tenantId, comissaoId },
      select: { status: true, tipo: true },
    });
    const receber = titulos.filter(
      (t) => t.tipo === FinanceiroTituloTipo.receber,
    );
    const receberTodosPagos =
      receber.length > 0 &&
      receber.every((t) => t.status === FinanceiroTituloStatus.pago);

    if (receberTodosPagos && comissao.status !== FinanceiroComissaoStatus.paga) {
      const row = await this.prisma.financeiroComissao.update({
        where: { id: comissaoId },
        data: { status: FinanceiroComissaoStatus.paga },
      });
      await this.syncTitulosDaComissao(row);
      return;
    }

    if (!receberTodosPagos && comissao.status === FinanceiroComissaoStatus.paga) {
      await this.prisma.financeiroComissao.update({
        where: { id: comissaoId },
        data: { status: FinanceiroComissaoStatus.pendente },
      });
    }
  }

  private async removeTitulosDaComissao(comissaoId: string, tenantId: string) {
    const titulos = await this.prisma.financeiroTitulo.findMany({
      where: { tenantId, comissaoId },
      select: { id: true },
    });
    if (titulos.length === 0) return;
    const ids = titulos.map((t) => t.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.financeiroMovimento.deleteMany({
        where: { tituloId: { in: ids } },
      });
      await tx.financeiroTitulo.deleteMany({
        where: { id: { in: ids } },
      });
    });
  }

  private async findComissaoOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroComissao.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException("Comissão não encontrada.");
    return row;
  }

  private assertComissaoAccess(requester: AuthenticatedUser) {
    if (
      requester.role === Role.admin ||
      requester.role === Role.gerente ||
      requester.role === Role.corretor ||
      requester.role === Role.treinee ||
      requester.role === Role.super_admin ||
      requester.role === Role.financeiro ||
      hasUserModule(requester.role, requester.permissions, "comissao") ||
      hasUserModule(requester.role, requester.permissions, "financeiro")
    ) {
      return;
    }
    throw new ForbiddenException("Você não possui acesso às comissões.");
  }

  private assertComissaoWrite(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.super_admin &&
      requester.role !== Role.financeiro
    ) {
      throw new ForbiddenException(
        "Somente administradores gerenciam comissões.",
      );
    }
  }

  private assertAccess(requester: AuthenticatedUser) {
    if (
      requester.role === Role.admin ||
      requester.role === Role.gerente ||
      requester.role === Role.super_admin ||
      requester.role === Role.financeiro ||
      hasUserModule(requester.role, requester.permissions, "financeiro")
    ) {
      return;
    }
    throw new ForbiddenException(
      "Módulo financeiro disponível para admin, gerente, financeiro e super admin.",
    );
  }

  private assertWrite(requester: AuthenticatedUser) {
    this.assertAccess(requester);
  }

  /** Centro de despesas / recebimentos: só imobiliária (não plataforma). */
  private assertTenantCentrosModule(requester: AuthenticatedUser) {
    if (requester.role === Role.super_admin) {
      throw new ForbiddenException(
        "Centro de despesas e centro de recebimentos não estão disponíveis na plataforma.",
      );
    }
  }
}
