-- AlterTable
ALTER TABLE "imoveis" ADD COLUMN "descricao" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "imoveis" ADD COLUMN "comodidadesUnidade" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "imoveis" ADD COLUMN "comodidadesCondominio" TEXT[] DEFAULT ARRAY[]::TEXT[];
