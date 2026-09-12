-- AlterTable
ALTER TABLE "funcionarios" ADD COLUMN "codigo" TEXT NOT NULL DEFAULT '';
ALTER TABLE "funcionarios" ADD COLUMN "dataAdmissao" TIMESTAMP(3);
ALTER TABLE "funcionarios" ADD COLUMN "cbo" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "contracheques" ADD COLUMN "codigoSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "contracheques" ADD COLUMN "cboSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "contracheques" ADD COLUMN "admissaoSnapshot" TIMESTAMP(3);
