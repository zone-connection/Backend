-- AlterTable
ALTER TABLE "imoveis" ADD COLUMN "tipoEmpreendimento" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "imoveis" ADD COLUMN "aptsPorAndar" INTEGER;

-- AlterTable
ALTER TABLE "imoveis" ADD COLUMN "andares" INTEGER;

-- AlterTable
ALTER TABLE "imoveis" ADD COLUMN "torres" INTEGER;
