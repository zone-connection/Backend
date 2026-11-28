import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgendamentoEscopo,
  AgendamentoStatus,
  AgendamentoTipo,
  CreciProcessoStatus,
  Prisma,
  PropostaStatus,
  RhCompromissoTipo,
  RhEtapa,
  RhModeloTipo,
  Role,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import {
  ConverterCandidatoDto,
  CreateCandidatoDto,
  CreateCompromissoDto,
  CreateTreinamentoDto,
  DesligarDto,
  MoverCandidatoDto,
  UpdateCandidatoDto,
} from './dto/rh.dto';

const ENCERRADAS: RhEtapa[] = [RhEtapa.desistente, RhEtapa.reprovado];
const MAX_BYTES = 8 * 1024 * 1024;

const candidatoPublic = {
  id: true,
  nome: true,
  telefone: true,
  email: true,
  creci: true,
  experiencia: true,
  observacoes: true,
  entradaEm: true,
  etapa: true,
  responsavelId: true,
  encerradoEm: true,
  motivoEncerramento: true,
  encerradoPorId: true,
  userId: true,
  contratadoEm: true,
  updatedAt: true,
  responsavel: { select: { id: true, name: true } },
  encerradoPor: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, status: true, avatar: true } },
} satisfies Prisma.RhCandidatoSelect;

function periodo(de?: string, ate?: string) {
  const start = de ? new Date(de) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = ate ? new Date(ate) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException('Período inválido.');
  }
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function arquivoOk(file: Express.Multer.File | undefined) {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Envie um arquivo PDF ou DOCX.');
  }
  if (file.buffer.length > MAX_BYTES) {
    throw new BadRequestException('O arquivo deve ter no máximo 8 MB.');
  }
  const nome = file.originalname.toLowerCase();
  const mime = file.mimetype;
  const pdf = mime === 'application/pdf' || nome.endsWith('.pdf');
  const docx =
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    nome.endsWith('.docx');
  if (!pdf && !docx) {
    throw new BadRequestException('Envie um arquivo PDF ou DOCX.');
  }
  return { mime: pdf ? 'application/pdf' : mime, nomeArquivo: file.originalname };
}

@Injectable()
export class RhService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async painel(user: AuthenticatedUser, de?: string, ate?: string) {
    const tenantId = requireTenantId(user);
    const { start, end } = periodo(de, ate);
    const corretorIds = await this.corretorIds(tenantId);

    const [
      emProcesso,
      entrevistas,
      contratacoes,
      ativos,
      encerrados,
      vendasAvulsas,
      propostasAceitas,
      fechamentos,
      proximos,
      parados,
      recentes,
    ] = await Promise.all([
      this.prisma.rhCandidato.count({
        where: { tenantId, etapa: { notIn: [...ENCERRADAS, RhEtapa.ativo] } },
      }),
      this.prisma.agendamento.count({
        where: {
          tenantId,
          rhTipo: RhCompromissoTipo.entrevista,
          status: AgendamentoStatus.agendado,
          startsAt: { gte: new Date() },
        },
      }),
      this.prisma.rhCandidato.count({
        where: { tenantId, contratadoEm: { gte: start, lte: end } },
      }),
      this.prisma.user.count({
        where: { tenantId, role: Role.corretor, status: UserStatus.ativo },
      }),
      this.prisma.rhCandidato.count({
        where: {
          tenantId,
          etapa: { in: ENCERRADAS },
          encerradoEm: { gte: start, lte: end },
        },
      }),
      this.prisma.cadastroVenda.count({
        where: {
          tenantId,
          corretorId: { in: corretorIds },
          dataVenda: { gte: start, lte: end },
        },
      }),
      this.prisma.proposta.count({
        where: {
          tenantId,
          corretorId: { in: corretorIds },
          status: PropostaStatus.aceita,
          updatedAt: { gte: start, lte: end },
        },
      }),
      this.prisma.vendaUsadoFechamento.count({
        where: {
          tenantId,
          responsavelId: { in: corretorIds },
          concluidoAt: { gte: start, lte: end },
        },
      }),
      this.prisma.agendamento.findMany({
        where: {
          tenantId,
          rhTipo: { not: null },
          status: AgendamentoStatus.agendado,
          startsAt: { gte: new Date() },
        },
        orderBy: { startsAt: 'asc' },
        take: 6,
        select: {
          id: true,
          titulo: true,
          startsAt: true,
          rhTipo: true,
          rhCandidato: { select: { id: true, nome: true } },
          rhUser: { select: { id: true, name: true } },
        },
      }),
      this.prisma.rhCandidato.findMany({
        where: {
          tenantId,
          etapa: { notIn: [...ENCERRADAS, RhEtapa.ativo] },
          updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { updatedAt: 'asc' },
        take: 6,
        select: { id: true, nome: true, etapa: true, updatedAt: true },
      }),
      this.prisma.rhCandidato.findMany({
        where: { tenantId, contratadoEm: { not: null } },
        orderBy: { contratadoEm: 'desc' },
        take: 6,
        select: {
          id: true,
          nome: true,
          contratadoEm: true,
          user: { select: { id: true, name: true } },
        },
      }),
    ]);

    const porCorretor = await this.desempenho(tenantId, corretorIds, start, end);

    return {
      periodo: { de: start.toISOString(), ate: end.toISOString() },
      indicadores: {
        emProcesso,
        entrevistas,
        contratacoes,
        corretoresAtivos: ativos,
        encerrados,
        vendas: vendasAvulsas + propostasAceitas + fechamentos,
      },
      proximos,
      parados,
      contratacoesRecentes: recentes,
      desempenho: porCorretor,
    };
  }

  listCandidatos(user: AuthenticatedUser, etapa?: RhEtapa) {
    const tenantId = requireTenantId(user);
    return this.prisma.rhCandidato.findMany({
      where: { tenantId, ...(etapa ? { etapa } : {}) },
      orderBy: { updatedAt: 'desc' },
      select: candidatoPublic,
    });
  }

  async candidato(user: AuthenticatedUser, id: string) {
    const row = await this.findCandidato(user, id);
    const [historico, documentos, treinamentos, agenda] = await Promise.all([
      this.prisma.rhCandidatoHistorico.findMany({
        where: { candidatoId: id },
        orderBy: { createdAt: 'desc' },
        include: { autor: { select: { id: true, name: true } } },
      }),
      this.prisma.rhDocumento.findMany({
        where: { candidatoId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          nome: true,
          nomeArquivo: true,
          mime: true,
          createdAt: true,
          autor: { select: { name: true } },
        },
      }),
      this.prisma.rhTreinamento.findMany({
        where: { candidatoId: id },
        orderBy: { data: 'desc' },
      }),
      this.prisma.agendamento.findMany({
        where: { rhCandidatoId: id },
        orderBy: { startsAt: 'desc' },
        select: {
          id: true,
          titulo: true,
          startsAt: true,
          status: true,
          rhTipo: true,
          observacoes: true,
        },
      }),
    ]);
    return { ...row, historico, documentos, treinamentos, agenda };
  }

  async criarCandidato(user: AuthenticatedUser, dto: CreateCandidatoDto) {
    const tenantId = requireTenantId(user);
    const created = await this.prisma.rhCandidato.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        telefone: dto.telefone?.trim() ?? '',
        email: dto.email?.trim().toLowerCase() ?? '',
        creci: dto.creci?.trim() || null,
        experiencia: dto.experiencia?.trim() ?? '',
        observacoes: dto.observacoes?.trim() ?? '',
        entradaEm: dto.entradaEm ? new Date(dto.entradaEm) : new Date(),
        responsavelId: dto.responsavelId ?? user.id,
        etapa: RhEtapa.novo,
        historico: {
          create: {
            tenantId,
            paraEtapa: RhEtapa.novo,
            autorId: user.id,
            motivo: 'Entrada no processo seletivo',
          },
        },
      },
      select: candidatoPublic,
    });
    return created;
  }

  async atualizarCandidato(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateCandidatoDto,
  ) {
    await this.findCandidato(user, id);
    return this.prisma.rhCandidato.update({
      where: { id },
      data: {
        nome: dto.nome?.trim(),
        telefone: dto.telefone?.trim(),
        email: dto.email?.trim().toLowerCase(),
        creci: dto.creci === undefined ? undefined : dto.creci.trim() || null,
        experiencia: dto.experiencia?.trim(),
        observacoes: dto.observacoes?.trim(),
        entradaEm: dto.entradaEm ? new Date(dto.entradaEm) : undefined,
        responsavelId: dto.responsavelId,
      },
      select: candidatoPublic,
    });
  }

  async mover(user: AuthenticatedUser, id: string, dto: MoverCandidatoDto) {
    const tenantId = requireTenantId(user);
    const atual = await this.findCandidato(user, id);
    if (ENCERRADAS.includes(dto.etapa) && !dto.motivo?.trim()) {
      throw new BadRequestException('Informe o motivo do encerramento.');
    }
    if (dto.etapa === RhEtapa.ativo && !atual.userId) {
      throw new BadRequestException(
        'Converta o candidato em usuário antes de marcá-lo como ativo.',
      );
    }
    const encerra = ENCERRADAS.includes(dto.etapa);
    const updated = await this.prisma.rhCandidato.update({
      where: { id },
      data: {
        etapa: dto.etapa,
        encerradoEm: encerra ? new Date() : null,
        motivoEncerramento: encerra ? dto.motivo!.trim() : '',
        encerradoPorId: encerra ? user.id : null,
        historico: {
          create: {
            tenantId,
            deEtapa: atual.etapa,
            paraEtapa: dto.etapa,
            motivo: dto.motivo?.trim() ?? '',
            autorId: user.id,
          },
        },
      },
      select: candidatoPublic,
    });
    return updated;
  }

  async converter(user: AuthenticatedUser, id: string, dto: ConverterCandidatoDto) {
    const tenantId = requireTenantId(user);
    const candidato = await this.findCandidato(user, id);
    if (candidato.userId) {
      throw new ConflictException('Este candidato já está vinculado a um usuário.');
    }
    const email = (dto.email ?? candidato.email).trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Informe o e-mail para criar o acesso.');
    }
    const existente = await this.prisma.user.findFirst({
      where: { tenantId, email },
      select: { id: true, role: true },
    });
    let userId = existente?.id;
    let criado = false;
    if (!userId) {
      const novo = await this.users.create(
        {
          name: candidato.nome,
          email,
          password: dto.password,
          phone: candidato.telefone || undefined,
          creci: candidato.creci ?? undefined,
          creciStatus: candidato.creci
            ? CreciProcessoStatus.creci_recebido
            : CreciProcessoStatus.nao_iniciado,
          role: Role.corretor,
          status: UserStatus.ativo,
        },
        user,
      );
      userId = novo.id;
      criado = true;
    }
    const agora = new Date();
    const vinculado = await this.prisma.rhCandidato.update({
      where: { id },
      data: {
        userId,
        email,
        etapa: RhEtapa.integracao,
        contratadoEm: agora,
        historico: {
          create: {
            tenantId,
            deEtapa: candidato.etapa,
            paraEtapa: RhEtapa.integracao,
            motivo: criado
              ? 'Convertido em usuário do CRM'
              : 'Vinculado a usuário já existente',
            autorId: user.id,
          },
        },
      },
      select: candidatoPublic,
    });
    return { candidato: vinculado, usuarioCriado: criado };
  }

  async equipe(user: AuthenticatedUser, situacao?: string) {
    const tenantId = requireTenantId(user);
    const desligados = situacao === 'desligados';
    const corretores = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: Role.corretor,
        status: desligados ? UserStatus.inativo : UserStatus.ativo,
        ...(desligados ? { desligadoEm: { not: null } } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        creci: true,
        avatar: true,
        status: true,
        createdAt: true,
        desligadoEm: true,
        desligamentoMotivo: true,
      },
    });
    const ids = corretores.map((c) => c.id);
    const vinculos = await this.prisma.rhCandidato.findMany({
      where: { tenantId, userId: { in: ids } },
      select: { userId: true, contratadoEm: true, id: true },
    });
    const porUser = new Map(vinculos.map((v) => [v.userId, v]));
    const inicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const vendas = await this.desempenho(tenantId, ids, inicio, new Date());
    const porVenda = new Map(vendas.map((v) => [v.userId, v.vendas]));
    return corretores.map((c) => ({
      ...c,
      candidatoId: porUser.get(c.id)?.id ?? null,
      contratadoEm: porUser.get(c.id)?.contratadoEm ?? c.createdAt,
      vendasNoMes: porVenda.get(c.id) ?? 0,
    }));
  }

  async ficha(user: AuthenticatedUser, userId: string) {
    const tenantId = requireTenantId(user);
    const corretor = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, role: Role.corretor },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        whatsapp: true,
        creci: true,
        cpf: true,
        avatar: true,
        status: true,
        createdAt: true,
        desligadoEm: true,
        desligamentoMotivo: true,
        desligadoPor: { select: { id: true, name: true } },
      },
    });
    if (!corretor) throw new NotFoundException('Corretor não encontrado.');
    const candidato = await this.prisma.rhCandidato.findFirst({
      where: { tenantId, userId },
      select: candidatoPublic,
    });
    const [documentos, treinamentos, agenda, vendas, historico] = await Promise.all([
      this.prisma.rhDocumento.findMany({
        where: { tenantId, OR: [{ userId }, ...(candidato ? [{ candidatoId: candidato.id }] : [])] },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          nome: true,
          nomeArquivo: true,
          mime: true,
          createdAt: true,
          autor: { select: { name: true } },
        },
      }),
      this.prisma.rhTreinamento.findMany({
        where: { tenantId, OR: [{ userId }, ...(candidato ? [{ candidatoId: candidato.id }] : [])] },
        orderBy: { data: 'desc' },
      }),
      this.prisma.agendamento.findMany({
        where: {
          tenantId,
          OR: [{ rhUserId: userId }, ...(candidato ? [{ rhCandidatoId: candidato.id }] : [])],
        },
        orderBy: { startsAt: 'desc' },
        take: 30,
        select: {
          id: true,
          titulo: true,
          startsAt: true,
          status: true,
          rhTipo: true,
          observacoes: true,
        },
      }),
      this.vendasDoCorretor(tenantId, userId),
      candidato
        ? this.prisma.rhCandidatoHistorico.findMany({
            where: { candidatoId: candidato.id },
            orderBy: { createdAt: 'desc' },
            include: { autor: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ]);
    return { corretor, candidato, documentos, treinamentos, agenda, vendas, historico };
  }

  async desligar(user: AuthenticatedUser, userId: string, dto: DesligarDto) {
    const tenantId = requireTenantId(user);
    const corretor = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, role: Role.corretor },
    });
    if (!corretor) throw new NotFoundException('Corretor não encontrado.');
    if (corretor.status === UserStatus.inativo && corretor.desligadoEm) {
      throw new ConflictException('Este corretor já está desligado.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.inativo,
        desligadoEm: new Date(),
        desligamentoMotivo: dto.motivo.trim(),
        desligadoPorId: user.id,
        hashedRefreshToken: null,
      },
    });
    return { ok: true };
  }

  async encerrados(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const [desistentes, reprovados, desligados] = await Promise.all([
      this.prisma.rhCandidato.findMany({
        where: { tenantId, etapa: RhEtapa.desistente },
        orderBy: { encerradoEm: 'desc' },
        select: candidatoPublic,
      }),
      this.prisma.rhCandidato.findMany({
        where: { tenantId, etapa: RhEtapa.reprovado },
        orderBy: { encerradoEm: 'desc' },
        select: candidatoPublic,
      }),
      this.equipe(user, 'desligados'),
    ]);
    return { desistentes, reprovados, desligados };
  }

  criarTreinamento(user: AuthenticatedUser, dto: CreateTreinamentoDto) {
    const tenantId = requireTenantId(user);
    if (!dto.candidatoId && !dto.userId) {
      throw new BadRequestException('Vincule o treinamento a um candidato ou corretor.');
    }
    return this.prisma.rhTreinamento.create({
      data: {
        tenantId,
        titulo: dto.titulo.trim(),
        data: new Date(dto.data),
        observacoes: dto.observacoes?.trim() ?? '',
        candidatoId: dto.candidatoId,
        userId: dto.userId,
        autorId: user.id,
      },
    });
  }

  async agenda(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    return this.prisma.agendamento.findMany({
      where: { tenantId, rhTipo: { not: null } },
      orderBy: { startsAt: 'asc' },
      take: 200,
      select: {
        id: true,
        titulo: true,
        startsAt: true,
        endsAt: true,
        status: true,
        rhTipo: true,
        observacoes: true,
        rhCandidato: { select: { id: true, nome: true } },
        rhUser: { select: { id: true, name: true } },
      },
    });
  }

  async criarCompromisso(user: AuthenticatedUser, dto: CreateCompromissoDto) {
    const tenantId = requireTenantId(user);
    if (!dto.candidatoId && !dto.userId) {
      throw new BadRequestException('Vincule o compromisso a um candidato ou corretor.');
    }
    if (dto.candidatoId) await this.findCandidato(user, dto.candidatoId);
    return this.prisma.agendamento.create({
      data: {
        tenantId,
        autorId: user.id,
        titulo: dto.titulo.trim(),
        tipo: AgendamentoTipo.reuniao,
        status: AgendamentoStatus.agendado,
        escopo: AgendamentoEscopo.pessoal,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        observacoes: dto.observacoes?.trim() ?? '',
        rhTipo: dto.tipo,
        rhCandidatoId: dto.candidatoId,
        rhUserId: dto.userId,
      },
      select: { id: true, titulo: true, startsAt: true, rhTipo: true },
    });
  }

  async uploadDocumento(
    user: AuthenticatedUser,
    file: Express.Multer.File | undefined,
    nome: string,
    candidatoId?: string,
    userId?: string,
  ) {
    const tenantId = requireTenantId(user);
    if (!candidatoId && !userId) {
      throw new BadRequestException('Vincule o documento a um candidato ou corretor.');
    }
    const meta = arquivoOk(file);
    if (candidatoId) await this.findCandidato(user, candidatoId);
    return this.prisma.rhDocumento.create({
      data: {
        tenantId,
        nome: nome.trim(),
        mime: meta.mime,
        nomeArquivo: meta.nomeArquivo,
        conteudo: new Uint8Array(file!.buffer),
        candidatoId,
        userId,
        autorId: user.id,
      },
      select: { id: true, nome: true, nomeArquivo: true, createdAt: true },
    });
  }

  async baixarDocumento(user: AuthenticatedUser, id: string) {
    const tenantId = requireTenantId(user);
    const doc = await this.prisma.rhDocumento.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    return doc;
  }

  async uploadModelo(
    user: AuthenticatedUser,
    file: Express.Multer.File | undefined,
    tipo: RhModeloTipo,
    nome: string,
  ) {
    const tenantId = requireTenantId(user);
    const meta = arquivoOk(file);
    return this.prisma.rhModeloContrato.create({
      data: {
        tenantId,
        tipo,
        nome: nome.trim(),
        mime: meta.mime,
        nomeArquivo: meta.nomeArquivo,
        conteudo: new Uint8Array(file!.buffer),
        autorId: user.id,
      },
      select: { id: true, tipo: true, nome: true, nomeArquivo: true, createdAt: true },
    });
  }

  listModelos(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    return this.prisma.rhModeloContrato.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, tipo: true, nome: true, nomeArquivo: true, createdAt: true },
    });
  }

  async baixarModelo(user: AuthenticatedUser, id: string) {
    const tenantId = requireTenantId(user);
    const doc = await this.prisma.rhModeloContrato.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException('Modelo não encontrado.');
    return doc;
  }

  private async findCandidato(user: AuthenticatedUser, id: string) {
    const tenantId = requireTenantId(user);
    const row = await this.prisma.rhCandidato.findFirst({
      where: { id, tenantId },
      select: candidatoPublic,
    });
    if (!row) throw new NotFoundException('Candidato não encontrado.');
    return row;
  }

  private async corretorIds(tenantId: string) {
    const rows = await this.prisma.user.findMany({
      where: { tenantId, role: Role.corretor },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async desempenho(
    tenantId: string,
    ids: string[],
    start: Date,
    end: Date,
  ) {
    if (ids.length === 0) return [];
    const [avulsas, propostas, fechamentos, users] = await Promise.all([
      this.prisma.cadastroVenda.groupBy({
        by: ['corretorId'],
        where: {
          tenantId,
          corretorId: { in: ids },
          dataVenda: { gte: start, lte: end },
        },
        _count: { _all: true },
      }),
      this.prisma.proposta.groupBy({
        by: ['corretorId'],
        where: {
          tenantId,
          corretorId: { in: ids },
          status: PropostaStatus.aceita,
          updatedAt: { gte: start, lte: end },
        },
        _count: { _all: true },
      }),
      this.prisma.vendaUsadoFechamento.groupBy({
        by: ['responsavelId'],
        where: {
          tenantId,
          responsavelId: { in: ids },
          concluidoAt: { gte: start, lte: end },
        },
        _count: { _all: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      }),
    ]);
    const totals = new Map<string, number>();
    for (const row of avulsas) {
      if (!row.corretorId) continue;
      totals.set(row.corretorId, (totals.get(row.corretorId) ?? 0) + row._count._all);
    }
    for (const row of propostas) {
      if (!row.corretorId) continue;
      totals.set(row.corretorId, (totals.get(row.corretorId) ?? 0) + row._count._all);
    }
    for (const row of fechamentos) {
      totals.set(
        row.responsavelId,
        (totals.get(row.responsavelId) ?? 0) + row._count._all,
      );
    }
    return users
      .map((u) => ({ userId: u.id, nome: u.name, vendas: totals.get(u.id) ?? 0 }))
      .sort((a, b) => b.vendas - a.vendas)
      .slice(0, 8);
  }

  private async vendasDoCorretor(tenantId: string, userId: string) {
    const [avulsas, propostas, fechamentos] = await Promise.all([
      this.prisma.cadastroVenda.findMany({
        where: { tenantId, corretorId: userId },
        orderBy: { dataVenda: 'desc' },
        take: 20,
        select: { id: true, clienteNome: true, dataVenda: true, vgv: true },
      }),
      this.prisma.proposta.findMany({
        where: { tenantId, corretorId: userId },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { id: true, status: true, updatedAt: true, codigo: true, clienteNome: true },
      }),
      this.prisma.vendaUsadoFechamento.findMany({
        where: { tenantId, responsavelId: userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, status: true, concluidoAt: true, createdAt: true },
      }),
    ]);
    return { avulsas, propostas, fechamentos };
  }
}
