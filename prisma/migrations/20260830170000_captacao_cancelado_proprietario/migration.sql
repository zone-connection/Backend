-- AlterEnum
ALTER TYPE "CaptacaoHistoricoTipo" ADD VALUE 'cancelamento';

-- AlterTable
ALTER TABLE "captacoes" ADD COLUMN "canceladoPeloProprietario" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "captacoes" ADD COLUMN "motivoPerda" TEXT NOT NULL DEFAULT '';
