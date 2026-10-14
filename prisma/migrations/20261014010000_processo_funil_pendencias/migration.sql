-- CreateEnum
CREATE TYPE "ProcessoEtapa" AS ENUM (
  'nova_avaliacao',
  'retrabalho',
  'analise',
  'bacen',
  'spc_serasa',
  'pendencia_documentacional',
  'aguardando_qv',
  'reprovado',
  'condicionado',
  'aprovado',
  'em_reserva'
);

-- CreateEnum
CREATE TYPE "ProcessoPendenciaStatus" AS ENUM ('aberta', 'reenviada', 'encerrada');

-- AlterEnum
ALTER TYPE "NotificacaoTipo" ADD VALUE 'processo_pendencia';
ALTER TYPE "NotificacaoTipo" ADD VALUE 'processo_reenvio';

-- AlterTable
ALTER TABLE "processos" ADD COLUMN "etapa" "ProcessoEtapa" NOT NULL DEFAULT 'nova_avaliacao';

UPDATE "processos" SET "etapa" = 'nova_avaliacao' WHERE "status" = 'rascunho';
UPDATE "processos" SET "etapa" = 'analise' WHERE "status" = 'enviado';
UPDATE "processos" SET "etapa" = 'aprovado' WHERE "status" = 'aprovado';
UPDATE "processos" SET "etapa" = 'reprovado' WHERE "status" = 'reprovado';

CREATE INDEX "processos_tenantId_etapa_idx" ON "processos"("tenantId", "etapa");

-- CreateTable
CREATE TABLE "processo_pendencias" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "textoComplementar" TEXT NOT NULL DEFAULT '',
    "arquivoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ProcessoPendenciaStatus" NOT NULL DEFAULT 'aberta',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processo_pendencias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processo_pendencia_correcoes" (
    "id" TEXT NOT NULL,
    "pendenciaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "comentario" TEXT NOT NULL DEFAULT '',
    "arquivoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processo_pendencia_correcoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processo_movimentos" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "deEtapa" "ProcessoEtapa",
    "paraEtapa" "ProcessoEtapa" NOT NULL,
    "observacao" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processo_movimentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "processo_pendencias_processoId_idx" ON "processo_pendencias"("processoId");
CREATE INDEX "processo_pendencia_correcoes_pendenciaId_idx" ON "processo_pendencia_correcoes"("pendenciaId");
CREATE INDEX "processo_movimentos_processoId_idx" ON "processo_movimentos"("processoId");

ALTER TABLE "processo_pendencias" ADD CONSTRAINT "processo_pendencias_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processo_pendencias" ADD CONSTRAINT "processo_pendencias_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processo_pendencia_correcoes" ADD CONSTRAINT "processo_pendencia_correcoes_pendenciaId_fkey" FOREIGN KEY ("pendenciaId") REFERENCES "processo_pendencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processo_pendencia_correcoes" ADD CONSTRAINT "processo_pendencia_correcoes_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processo_movimentos" ADD CONSTRAINT "processo_movimentos_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processo_movimentos" ADD CONSTRAINT "processo_movimentos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
