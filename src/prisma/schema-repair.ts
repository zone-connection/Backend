import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';
import { ensureLembretesPessoaisSchema } from '../lembretes/lembretes.schema';

const logger = new Logger('SchemaRepair');

export function isMissingDatabaseObject(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      err.code === 'P2021' ||
      err.code === 'P2022' ||
      err.code === 'P2010'
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return /does not exist|não existe|Unknown (?:column|table|arg)|column .* does not exist/i.test(
    message,
  );
}

const POS_VENDA_STATEMENTS = [
  `ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'concluido'`,
  `ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'aprovado'`,
  `ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'reprovado'`,
  `ALTER TYPE "FunilTipo" ADD VALUE IF NOT EXISTS 'pos_venda'`,
  `
    ALTER TABLE "vendas_usado"
      ADD COLUMN IF NOT EXISTS "posVendaRecusadoEm" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "posVendaRecusadoPorId" TEXT
  `,
  `
    ALTER TABLE "venda_usado_pos_vendas"
      ADD COLUMN IF NOT EXISTS "funilId" TEXT,
      ADD COLUMN IF NOT EXISTS "funilEtapaId" TEXT,
      ADD COLUMN IF NOT EXISTS "encaminhadoEm" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "encaminhadoPorId" TEXT,
      ADD COLUMN IF NOT EXISTS "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "lastStageChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "lastMovementAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "prazoDueAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "alertaProximoAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vendas_usado_posVendaRecusadoPorId_fkey'
      ) THEN
        ALTER TABLE "vendas_usado"
          ADD CONSTRAINT "vendas_usado_posVendaRecusadoPorId_fkey"
          FOREIGN KEY ("posVendaRecusadoPorId") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'venda_usado_pos_vendas_funilId_fkey'
      ) THEN
        ALTER TABLE "venda_usado_pos_vendas"
          ADD CONSTRAINT "venda_usado_pos_vendas_funilId_fkey"
          FOREIGN KEY ("funilId") REFERENCES "funis"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'venda_usado_pos_vendas_funilEtapaId_fkey'
      ) THEN
        ALTER TABLE "venda_usado_pos_vendas"
          ADD CONSTRAINT "venda_usado_pos_vendas_funilEtapaId_fkey"
          FOREIGN KEY ("funilEtapaId") REFERENCES "funil_etapas"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'venda_usado_pos_vendas_encaminhadoPorId_fkey'
      ) THEN
        ALTER TABLE "venda_usado_pos_vendas"
          ADD CONSTRAINT "venda_usado_pos_vendas_encaminhadoPorId_fkey"
          FOREIGN KEY ("encaminhadoPorId") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$
  `,
  `CREATE INDEX IF NOT EXISTS "venda_usado_pos_vendas_tenantId_funilEtapaId_idx"
     ON "venda_usado_pos_vendas"("tenantId", "funilEtapaId")`,
  `CREATE INDEX IF NOT EXISTS "venda_usado_pos_vendas_tenantId_responsavelId_idx"
     ON "venda_usado_pos_vendas"("tenantId", "responsavelId")`,
];

export async function ensurePosVendaSchema(prisma: PrismaService) {
  for (const sql of POS_VENDA_STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
  }
}

const ROLETA_STATEMENTS = [
  `ALTER TYPE "LeadFilaEventoTipo" ADD VALUE IF NOT EXISTS 'redistribuicao'`,
  `
    ALTER TABLE "leads"
      ADD COLUMN IF NOT EXISTS "roletaAtribuidoAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "roletaPrazoAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "roletaRedistribuido" BOOLEAN NOT NULL DEFAULT false
  `,
  `CREATE INDEX IF NOT EXISTS "leads_roletaPrazoAt_idx" ON "leads"("roletaPrazoAt")`,
  `
    ALTER TABLE "lead_fila_configs"
      ADD COLUMN IF NOT EXISTS "redistribuirMinutos" INTEGER NOT NULL DEFAULT 0
  `,
];

export async function ensureRoletaSchema(prisma: PrismaService) {
  for (const sql of ROLETA_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      logger.warn(
        `Trecho da roleta não aplicado: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

const OPERACAO_STATEMENTS = [
  `
    DO $$ BEGIN
      CREATE TYPE "TriagemOrigem" AS ENUM ('funil', 'manual', 'retrabalho', 'caca_lead');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `,
  `ALTER TYPE "TriagemOrigem" ADD VALUE IF NOT EXISTS 'retrabalho'`,
  `ALTER TYPE "TriagemOrigem" ADD VALUE IF NOT EXISTS 'caca_lead'`,
  `
    CREATE TABLE IF NOT EXISTS "triagem_events" (
      "id" TEXT NOT NULL,
      "leadId" TEXT NOT NULL,
      "autorId" TEXT NOT NULL,
      "texto" TEXT NOT NULL,
      "textoAnterior" TEXT,
      "stageAnterior" TEXT,
      "stageNovo" TEXT,
      "origem" "TriagemOrigem" NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "editedAt" TIMESTAMP(3),
      CONSTRAINT "triagem_events_pkey" PRIMARY KEY ("id")
    )
  `,
  `
    DO $$ BEGIN
      ALTER TABLE "triagem_events"
        ADD CONSTRAINT "triagem_events_leadId_fkey"
        FOREIGN KEY ("leadId") REFERENCES "leads"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `,
  `
    DO $$ BEGIN
      ALTER TABLE "triagem_events"
        ADD CONSTRAINT "triagem_events_autorId_fkey"
        FOREIGN KEY ("autorId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `,
  `CREATE INDEX IF NOT EXISTS "triagem_events_leadId_idx" ON "triagem_events"("leadId")`,
  `CREATE INDEX IF NOT EXISTS "triagem_events_autorId_idx" ON "triagem_events"("autorId")`,
  `CREATE INDEX IF NOT EXISTS "triagem_events_createdAt_idx" ON "triagem_events"("createdAt")`,
  `
    ALTER TABLE "triagem_events"
      ADD COLUMN IF NOT EXISTS "textoAnterior" TEXT,
      ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3)
  `,
  `
    DO $$ BEGIN
      CREATE TYPE "AgendamentoRecurrenceFreq" AS ENUM ('unica', 'semanal', 'mensal');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `,
  `
    ALTER TABLE "agendamentos"
      ADD COLUMN IF NOT EXISTS "atribuidoParaId" TEXT,
      ADD COLUMN IF NOT EXISTS "seriesId" TEXT,
      ADD COLUMN IF NOT EXISTS "recurrenceFreq" "AgendamentoRecurrenceFreq" NOT NULL DEFAULT 'unica',
      ADD COLUMN IF NOT EXISTS "recurrenceDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      ADD COLUMN IF NOT EXISTS "recurrenceUntil" TIMESTAMP(3)
  `,
  `ALTER TYPE "AgendamentoTipo" ADD VALUE IF NOT EXISTS 'bloqueio'`,
  `ALTER TYPE "AgendamentoTipo" ADD VALUE IF NOT EXISTS 'retirada_chave'`,
  `
    ALTER TABLE "agendamentos"
      ADD COLUMN IF NOT EXISTS "funilStage" TEXT,
      ADD COLUMN IF NOT EXISTS "contaAtraso" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "origemTarefa" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "empreendimentoId" TEXT,
      ADD COLUMN IF NOT EXISTS "muralChaveId" TEXT,
      ADD COLUMN IF NOT EXISTS "chaveRetiradaEm" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "imovelId" TEXT,
      ADD COLUMN IF NOT EXISTS "toleranciaAtiva" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "bloqueadoAte" TIMESTAMP(3)
  `,
  `
    ALTER TABLE "leads"
      ADD COLUMN IF NOT EXISTS "convertedTenantId" TEXT,
      ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "conversionSlug" TEXT,
      ADD COLUMN IF NOT EXISTS "conversionLock" TEXT,
      ADD COLUMN IF NOT EXISTS "conversionLockedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "lastTriagemAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "lastTarefaAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "lastAtividadeAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "lastMovementAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "prazoDueAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "alertaProximoAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "prazoAdiado" BOOLEAN NOT NULL DEFAULT false
  `,
  `CREATE UNIQUE INDEX IF NOT EXISTS "leads_convertedTenantId_key" ON "leads"("convertedTenantId")`,
  `
    DO $$ BEGIN
      ALTER TABLE "leads"
        ADD CONSTRAINT "leads_convertedTenantId_fkey"
        FOREIGN KEY ("convertedTenantId") REFERENCES "tenants"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `,
];

export async function ensureOperacaoSchema(prisma: PrismaService) {
  for (const sql of OPERACAO_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      logger.warn(
        `Trecho de histórico/atividade não aplicado: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

const CENTRAIS_STATEMENTS = [
  `DO $$ BEGIN CREATE TYPE "OnboardingStatus" AS ENUM ('nao_iniciado', 'em_andamento', 'aguardando_cliente', 'aguardando_equipe', 'concluido', 'cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "OnboardingEtapaStatus" AS ENUM ('pendente', 'concluida'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "onboardings" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "platformContratoId" TEXT, "responsavelId" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL, "prazoPrevisto" TIMESTAMP(3) NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'nao_iniciado',
    "observacao" TEXT NOT NULL DEFAULT '', "justificativa" TEXT NOT NULL DEFAULT '',
    "concluidoEm" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "onboardings_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "onboarding_etapas" (
    "id" TEXT NOT NULL, "onboardingId" TEXT NOT NULL, "ordem" INTEGER NOT NULL, "titulo" TEXT NOT NULL,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true, "status" "OnboardingEtapaStatus" NOT NULL DEFAULT 'pendente',
    "pendencia" TEXT NOT NULL DEFAULT '', "observacao" TEXT NOT NULL DEFAULT '', "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "onboarding_etapas_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "onboarding_historicos" (
    "id" TEXT NOT NULL, "onboardingId" TEXT NOT NULL, "autorId" TEXT, "acao" TEXT NOT NULL,
    "detalhe" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "onboarding_historicos_pkey" PRIMARY KEY ("id"))`,
  `DO $$ BEGIN CREATE TYPE "SuportePrioridade" AS ENUM ('baixa', 'normal', 'alta', 'urgente'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "SuporteStatus" AS ENUM ('aberto', 'em_atendimento', 'aguardando_cliente', 'aguardando_equipe', 'resolvido', 'fechado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "suporte_chamados" (
    "id" TEXT NOT NULL, "codigo" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "titulo" TEXT NOT NULL, "descricao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL, "prioridade" "SuportePrioridade" NOT NULL DEFAULT 'normal',
    "status" "SuporteStatus" NOT NULL DEFAULT 'aberto', "responsavelId" TEXT, "prazoEm" TIMESTAMP(3),
    "resolvidoEm" TIMESTAMP(3), "fechadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suporte_chamados_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "suporte_mensagens" (
    "id" TEXT NOT NULL, "chamadoId" TEXT NOT NULL, "autorId" TEXT, "texto" TEXT NOT NULL,
    "interna" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "suporte_mensagens_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "suporte_historicos" (
    "id" TEXT NOT NULL, "chamadoId" TEXT NOT NULL, "autorId" TEXT, "acao" TEXT NOT NULL,
    "detalhe" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "suporte_historicos_pkey" PRIMARY KEY ("id"))`,
  `DO $$ BEGIN CREATE TYPE "MelhoriaCategoria" AS ENUM ('funcionalidade_nova', 'melhoria_existente', 'usabilidade', 'integracao'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "MelhoriaPrioridade" AS ENUM ('baixa', 'normal', 'alta', 'urgente'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "MelhoriaStatus" AS ENUM ('recebida', 'em_avaliacao', 'aprovada', 'planejada', 'em_desenvolvimento', 'entregue', 'recusada', 'arquivada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "melhoria_solicitacoes" (
    "id" TEXT NOT NULL, "codigo" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "titulo" TEXT NOT NULL, "descricao" TEXT NOT NULL,
    "categoria" "MelhoriaCategoria" NOT NULL, "prioridade" "MelhoriaPrioridade" NOT NULL DEFAULT 'normal',
    "status" "MelhoriaStatus" NOT NULL DEFAULT 'recebida', "responsavelId" TEXT,
    "justificativaDecisao" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "melhoria_solicitacoes_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "melhoria_comentarios" (
    "id" TEXT NOT NULL, "solicitacaoId" TEXT NOT NULL, "autorId" TEXT, "texto" TEXT NOT NULL,
    "interna" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "melhoria_comentarios_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "melhoria_historicos" (
    "id" TEXT NOT NULL, "solicitacaoId" TEXT NOT NULL, "autorId" TEXT, "acao" TEXT NOT NULL,
    "detalhe" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "melhoria_historicos_pkey" PRIMARY KEY ("id"))`,
];

export async function ensureCentraisSchema(prisma: PrismaService) {
  for (const sql of CENTRAIS_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      logger.warn(
        `Trecho de implantação/suporte/melhorias não aplicado: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

export async function ensureRuntimeSchema(prisma: PrismaService) {
  try {
    await ensureRoletaSchema(prisma);
  } catch (err) {
    logger.error(
      'Não foi possível alinhar o schema da roleta.',
      err instanceof Error ? err.stack : err,
    );
  }
  try {
    await ensurePosVendaSchema(prisma);
  } catch (err) {
    logger.error(
      'Não foi possível alinhar o schema de pós-venda.',
      err instanceof Error ? err.stack : err,
    );
  }
  try {
    await ensureOperacaoSchema(prisma);
  } catch (err) {
    logger.error(
      'Não foi possível alinhar o schema de histórico e atividade.',
      err instanceof Error ? err.stack : err,
    );
  }
  try {
    await ensureCentraisSchema(prisma);
  } catch (err) {
    logger.error(
      'Não foi possível alinhar implantação, suporte e melhorias.',
      err instanceof Error ? err.stack : err,
    );
  }
  try {
    await ensureLembretesPessoaisSchema(prisma);
  } catch (err) {
    logger.error(
      'Não foi possível alinhar o schema de lembretes.',
      err instanceof Error ? err.stack : err,
    );
  }
}
