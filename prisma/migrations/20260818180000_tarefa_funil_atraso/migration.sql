-- AlterEnum
ALTER TYPE "NotificacaoTipo" ADD VALUE 'tarefa_atrasada';

-- AlterTable
ALTER TABLE "agendamentos" ADD COLUMN "funilStage" TEXT;
