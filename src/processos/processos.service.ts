import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ProcessoEtapa,
  ProcessoPendenciaStatus,
  ProcessoRetornoResultado,
  ProcessoStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { isCorretorLike } from '../common/utils/roles';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import {
  CreateCorrecaoPendenciaDto,
  CreatePendenciaProcessoDto,
  CreateProcessoDto,
  MoverEtapaProcessoDto,
  RetornoProcessoDto,
  UpdateProcessoDto,
} from './dto/create-processo.dto';

const include = {
  lead: { select: { id: true, nome: true, tipo: true } },
  autor: { select: { id: true, name: true } },
  corretor: { select: { id: true, name: true } },
  gerente: { select: { id: true, name: true } },
  empreendimento: { select: { id: true, nome: true } },
  retornos: {
    orderBy: { createdAt: 'desc' as const },
    include: { autor: { select: { id: true, name: true } } },
  },
  pendencias: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      autor: { select: { id: true, name: true } },
      correcoes: {
        orderBy: { createdAt: 'desc' as const },
        include: { autor: { select: { id: true, name: true } } },
      },
    },
  },
  movimentos: {
    orderBy: { createdAt: 'desc' as const },
    include: { autor: { select: { id: true, name: true } } },
    take: 80,
  },
};

const ETAPAS_EDITAVEIS: ProcessoEtapa[] = [
  ProcessoEtapa.nova_avaliacao,
  ProcessoEtapa.retrabalho,
];

@Injectable()
export class ProcessosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  private isGestor(user: AuthenticatedUser) {
    const role = String(user.role);
    return (
      role === Role.admin ||
      role === Role.gerente ||
      role === Role.super_admin
    );
  }

  private canAnalisar(user: AuthenticatedUser) {
    return this.isGestor(user) || String(user.role) === Role.analista;
  }

  private whereMine(tenantId: string, user: AuthenticatedUser) {
    if (this.canAnalisar(user)) return { tenantId };
    return {
      tenantId,
      OR: [{ autorId: user.id }, { corretorId: user.id }],
    };
  }

  private statusFromEtapa(etapa: ProcessoEtapa): ProcessoStatus {
    if (etapa === ProcessoEtapa.aprovado) return ProcessoStatus.aprovado;
    if (etapa === ProcessoEtapa.reprovado) return ProcessoStatus.reprovado;
    if (
      etapa === ProcessoEtapa.nova_avaliacao ||
      etapa === ProcessoEtapa.retrabalho
    ) {
      return ProcessoStatus.rascunho;
    }
    return ProcessoStatus.enviado;
  }

  private isEditavel(etapa: ProcessoEtapa, status: ProcessoStatus) {
    return (
      ETAPAS_EDITAVEIS.includes(etapa) ||
      status === ProcessoStatus.rascunho ||
      status === ProcessoStatus.reprovado
    );
  }

  private destinatariosEnvio(row: {
    autorId: string;
    corretorId: string | null;
  }) {
    return [...new Set([row.autorId, row.corretorId].filter(Boolean))] as string[];
  }

  async list(user: AuthenticatedUser, status?: ProcessoStatus) {
    const tenantId = requireTenantId(user);
    return this.prisma.processo.findMany({
      where: {
        ...this.whereMine(tenantId, user),
        ...(status ? { status } : {}),
      },
      include,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const row = await this.prisma.processo.findFirst({
      where: { id, ...this.whereMine(tenantId, user) },
      include,
    });
    if (!row) throw new NotFoundException('Processo não encontrado.');
    return row;
  }

  async create(dto: CreateProcessoDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, tenantId },
      include: {
        equipe: { select: { gerenteId: true } },
        empreendimento: { select: { id: true } },
      },
    });
    if (!lead) throw new NotFoundException('Lead ou cliente não encontrado.');
    if (isCorretorLike(user.role) && lead.corretorId && lead.corretorId !== user.id) {
      throw new ForbiddenException('Você só pode abrir processo da sua carteira.');
    }
    const created = await this.prisma.processo.create({
      data: {
        tenantId,
        leadId: lead.id,
        autorId: user.id,
        nome: dto.nome?.trim() || lead.nome,
        fonte: dto.fonte?.trim() || lead.origem || '',
        telefone: dto.telefone?.trim() || lead.telefone || '',
        email: dto.email?.trim() || lead.email || '',
        estadoCivil: dto.estadoCivil?.trim() || lead.estadoCivil || '',
        tipoRenda: dto.tipoRenda?.trim() || lead.tipoRenda || '',
        cotista: dto.cotista ?? false,
        dependente: dto.dependente ?? false,
        empreendimentoId:
          dto.empreendimentoId ?? lead.empreendimentoId ?? null,
        corretorId: dto.corretorId ?? lead.corretorId ?? user.id,
        gerenteId: dto.gerenteId ?? lead.equipe?.gerenteId ?? null,
        status: ProcessoStatus.rascunho,
        etapa: ProcessoEtapa.nova_avaliacao,
        movimentos: {
          create: {
            autorId: user.id,
            deEtapa: null,
            paraEtapa: ProcessoEtapa.nova_avaliacao,
            observacao: 'Processo cadastrado',
          },
        },
      },
      include,
    });
    return created;
  }

  async update(id: string, dto: UpdateProcessoDto, user: AuthenticatedUser) {
    const row = await this.findOne(id, user);
    if (!this.isEditavel(row.etapa, row.status)) {
      throw new BadRequestException(
        'Este processo já está em análise. Aguarde o retrabalho ou o retorno.',
      );
    }
    if (!this.isGestor(user) && row.autorId !== user.id && row.corretorId !== user.id) {
      throw new ForbiddenException('Sem permissão para editar.');
    }
    return this.prisma.processo.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.fonte !== undefined ? { fonte: dto.fonte.trim() } : {}),
        ...(dto.telefone !== undefined ? { telefone: dto.telefone.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email.trim() } : {}),
        ...(dto.estadoCivil !== undefined
          ? { estadoCivil: dto.estadoCivil.trim() }
          : {}),
        ...(dto.tipoRenda !== undefined ? { tipoRenda: dto.tipoRenda.trim() } : {}),
        ...(dto.cotista !== undefined ? { cotista: dto.cotista } : {}),
        ...(dto.dependente !== undefined ? { dependente: dto.dependente } : {}),
        ...(dto.empreendimentoId !== undefined
          ? { empreendimentoId: dto.empreendimentoId }
          : {}),
        ...(dto.corretorId !== undefined ? { corretorId: dto.corretorId } : {}),
        ...(dto.gerenteId !== undefined ? { gerenteId: dto.gerenteId } : {}),
      },
      include,
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    const row = await this.findOne(id, user);
    const owner =
      this.isGestor(user) ||
      row.autorId === user.id ||
      row.corretorId === user.id;
    if (!owner) {
      throw new ForbiddenException('Sem permissão para excluir.');
    }
    if (!this.isGestor(user) && !this.isEditavel(row.etapa, row.status)) {
      throw new BadRequestException(
        'Só é possível excluir rascunho, retrabalho ou processo reprovado.',
      );
    }
    await this.prisma.processo.delete({ where: { id } });
    return { ok: true };
  }

  async enviar(id: string, user: AuthenticatedUser) {
    const row = await this.findOne(id, user);
    if (!this.isGestor(user) && row.autorId !== user.id && row.corretorId !== user.id) {
      throw new ForbiddenException('Sem permissão para enviar.');
    }
    if (
      row.etapa !== ProcessoEtapa.nova_avaliacao &&
      row.etapa !== ProcessoEtapa.retrabalho &&
      row.status !== ProcessoStatus.rascunho &&
      row.status !== ProcessoStatus.reprovado
    ) {
      throw new BadRequestException('Este processo já está em análise.');
    }
    return this.prisma.processo.update({
      where: { id },
      data: {
        status: ProcessoStatus.enviado,
        etapa: ProcessoEtapa.analise,
        enviadoAt: new Date(),
        movimentos: {
          create: {
            autorId: user.id,
            deEtapa: row.etapa,
            paraEtapa: ProcessoEtapa.analise,
            observacao: 'Enviado para análise',
          },
        },
      },
      include,
    });
  }

  async retornar(id: string, dto: RetornoProcessoDto, user: AuthenticatedUser) {
    if (!this.canAnalisar(user)) {
      throw new ForbiddenException(
        'Apenas gerente, administrador ou analista podem dar retorno.',
      );
    }
    const row = await this.findOne(id, user);
    if (
      row.etapa === ProcessoEtapa.nova_avaliacao ||
      row.etapa === ProcessoEtapa.retrabalho
    ) {
      throw new BadRequestException('Só é possível retornar um processo em análise.');
    }
    const resultado =
      dto.resultado === 'aprovado'
        ? ProcessoRetornoResultado.aprovado
        : ProcessoRetornoResultado.reprovado;
    const etapa =
      resultado === ProcessoRetornoResultado.aprovado
        ? ProcessoEtapa.aprovado
        : ProcessoEtapa.reprovado;
    await this.prisma.processoRetorno.create({
      data: {
        processoId: id,
        autorId: user.id,
        resultado,
        texto: dto.texto?.trim() || '',
        arquivoId: dto.arquivoId ?? null,
      },
    });
    return this.prisma.processo.update({
      where: { id },
      data: {
        status:
          resultado === ProcessoRetornoResultado.aprovado
            ? ProcessoStatus.aprovado
            : ProcessoStatus.reprovado,
        etapa,
        movimentos: {
          create: {
            autorId: user.id,
            deEtapa: row.etapa,
            paraEtapa: etapa,
            observacao: dto.texto?.trim() || `Retorno: ${resultado}`,
          },
        },
      },
      include,
    });
  }

  async moverEtapa(id: string, dto: MoverEtapaProcessoDto, user: AuthenticatedUser) {
    if (!this.canAnalisar(user)) {
      throw new ForbiddenException(
        'Somente gerente, administrador ou analista podem mover o funil.',
      );
    }
    if (dto.etapa === ProcessoEtapa.pendencia_documentacional) {
      throw new BadRequestException(
        'Para pendência documentacional, registre a solicitação de correção.',
      );
    }
    const row = await this.findOne(id, user);
    if (row.etapa === dto.etapa) return row;
    return this.prisma.processo.update({
      where: { id },
      data: {
        etapa: dto.etapa,
        status: this.statusFromEtapa(dto.etapa),
        movimentos: {
          create: {
            autorId: user.id,
            deEtapa: row.etapa,
            paraEtapa: dto.etapa,
            observacao: dto.observacao?.trim() || 'Movimentação no funil',
          },
        },
      },
      include,
    });
  }

  async criarPendencia(
    id: string,
    dto: CreatePendenciaProcessoDto,
    user: AuthenticatedUser,
  ) {
    if (!this.canAnalisar(user)) {
      throw new ForbiddenException(
        'Somente gerente, administrador ou analista podem solicitar pendência.',
      );
    }
    const titulo = dto.titulo?.trim();
    if (!titulo) throw new BadRequestException('Informe o título da pendência.');
    const descricao = dto.descricao?.trim() || '';
    const textoComplementar = dto.textoComplementar?.trim() || '';
    const arquivoIds = dto.arquivoIds ?? [];
    if (!descricao && arquivoIds.length === 0) {
      throw new BadRequestException(
        'Informe a descrição, anexe arquivos ou ambos.',
      );
    }
    const row = await this.findOne(id, user);
    await this.prisma.$transaction(async (tx) => {
      await tx.processoPendencia.create({
        data: {
          processoId: id,
          autorId: user.id,
          titulo,
          descricao,
          textoComplementar,
          arquivoIds,
          status: ProcessoPendenciaStatus.aberta,
        },
      });
      await tx.processoMovimento.createMany({
        data: [
          {
            processoId: id,
            autorId: user.id,
            deEtapa: row.etapa,
            paraEtapa: ProcessoEtapa.pendencia_documentacional,
            observacao: `Pendência: ${titulo}`,
          },
          {
            processoId: id,
            autorId: user.id,
            deEtapa: ProcessoEtapa.pendencia_documentacional,
            paraEtapa: ProcessoEtapa.retrabalho,
            observacao: 'Retorno automático para retrabalho',
          },
        ],
      });
      await tx.processo.update({
        where: { id },
        data: {
          etapa: ProcessoEtapa.retrabalho,
          status: ProcessoStatus.rascunho,
        },
      });
    });
    const autorNome = user.name || 'Análise';
    const destinos = this.destinatariosEnvio(row).filter((uid) => uid !== user.id);
    await Promise.all(
      destinos.map((userId) =>
        this.notificacoes.createProcessoPendencia({
          userId,
          leadId: row.leadId,
          processoNome: row.nome,
          tituloPendencia: titulo,
          autorNome,
        }),
      ),
    );
    return this.findOne(id, user);
  }

  async criarCorrecao(
    processoId: string,
    pendenciaId: string,
    dto: CreateCorrecaoPendenciaDto,
    user: AuthenticatedUser,
  ) {
    const row = await this.findOne(processoId, user);
    if (row.etapa !== ProcessoEtapa.retrabalho) {
      throw new BadRequestException(
        'As correções só podem ser enviadas na etapa Retrabalho.',
      );
    }
    if (
      !this.isGestor(user) &&
      row.autorId !== user.id &&
      row.corretorId !== user.id
    ) {
      throw new ForbiddenException('Sem permissão para corrigir este processo.');
    }
    const pendencia = row.pendencias.find((p) => p.id === pendenciaId);
    if (!pendencia) throw new NotFoundException('Pendência não encontrada.');
    const comentario = dto.comentario?.trim() || '';
    const arquivoIds = dto.arquivoIds ?? [];
    if (!comentario && arquivoIds.length === 0) {
      throw new BadRequestException(
        'Envie um comentário, documentos corrigidos ou ambos.',
      );
    }
    await this.prisma.processoPendenciaCorrecao.create({
      data: {
        pendenciaId,
        autorId: user.id,
        comentario,
        arquivoIds,
      },
    });
    return this.findOne(processoId, user);
  }

  async reenviar(id: string, user: AuthenticatedUser) {
    const row = await this.findOne(id, user);
    if (
      !this.isGestor(user) &&
      row.autorId !== user.id &&
      row.corretorId !== user.id
    ) {
      throw new ForbiddenException('Sem permissão para reenviar.');
    }
    if (row.etapa !== ProcessoEtapa.retrabalho) {
      throw new BadRequestException(
        'Só é possível reenviar um processo em Retrabalho.',
      );
    }
    const abertas = row.pendencias.filter(
      (p) => p.status === ProcessoPendenciaStatus.aberta,
    );
    const semCorrecao = abertas.filter((p) => p.correcoes.length === 0);
    if (abertas.length > 0 && semCorrecao.length === abertas.length) {
      throw new BadRequestException(
        'Registre a correção (comentário ou arquivos) antes de reenviar.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      if (abertas.length > 0) {
        await tx.processoPendencia.updateMany({
          where: { id: { in: abertas.map((p) => p.id) } },
          data: { status: ProcessoPendenciaStatus.reenviada },
        });
      }
      await tx.processo.update({
        where: { id },
        data: {
          etapa: ProcessoEtapa.analise,
          status: ProcessoStatus.enviado,
          enviadoAt: new Date(),
          movimentos: {
            create: {
              autorId: user.id,
              deEtapa: ProcessoEtapa.retrabalho,
              paraEtapa: ProcessoEtapa.analise,
              observacao: 'Reenvio após correção',
            },
          },
        },
      });
    });
    const destinos = new Set<string>();
    if (row.gerenteId) destinos.add(row.gerenteId);
    for (const p of row.pendencias) destinos.add(p.autorId);
    destinos.delete(user.id);
    await Promise.all(
      [...destinos].map((userId) =>
        this.notificacoes.createProcessoReenvio({
          userId,
          leadId: row.leadId,
          processoNome: row.nome,
          autorNome: user.name || 'Corretor',
        }),
      ),
    );
    return this.findOne(id, user);
  }
}
