-- CreateEnum
CREATE TYPE "AgendamentoRecurrenceFreq" AS ENUM ('unica', 'semanal', 'mensal');

-- AlterEnum
ALTER TYPE "AgendamentoTipo" ADD VALUE 'bloqueio';

-- AlterEnum
ALTER TYPE "NotificacaoTipo" ADD VALUE 'agenda_atribuicao';

-- AlterTable
ALTER TABLE "agendamentos"
  ADD COLUMN "atribuidoParaId" TEXT,
  ADD COLUMN "seriesId" TEXT,
  ADD COLUMN "recurrenceFreq" "AgendamentoRecurrenceFreq" NOT NULL DEFAULT 'unica',
  ADD COLUMN "recurrenceDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "recurrenceUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "agendamentos_atribuidoParaId_idx" ON "agendamentos"("atribuidoParaId");

-- CreateIndex
CREATE INDEX "agendamentos_seriesId_idx" ON "agendamentos"("seriesId");

-- AddForeignKey
ALTER TABLE "agendamentos"
  ADD CONSTRAINT "agendamentos_atribuidoParaId_fkey"
  FOREIGN KEY ("atribuidoParaId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
