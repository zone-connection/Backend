ALTER TABLE "documentacoes" ADD COLUMN "origem" TEXT NOT NULL DEFAULT 'lancamento';
ALTER TABLE "documentacoes" ADD COLUMN "proprietarioId" TEXT;
ALTER TABLE "documentacoes" ADD COLUMN "interessadoId" TEXT;
ALTER TABLE "documentacoes" ADD COLUMN "matricula" TEXT NOT NULL DEFAULT '';
