-- CreateTable
CREATE TABLE "funcionarios" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "empresa" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ativo',
    "salarioBruto" DOUBLE PRECISION NOT NULL,
    "beneficios" JSONB NOT NULL,
    "descontos" JSONB NOT NULL,
    "observacoes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funcionarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracheques" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "funcionarioId" TEXT NOT NULL,
    "competenciaMes" INTEGER NOT NULL,
    "competenciaAno" INTEGER NOT NULL,
    "nomeSnapshot" TEXT NOT NULL,
    "cargoSnapshot" TEXT NOT NULL,
    "empresaSnapshot" TEXT NOT NULL,
    "salarioBruto" DOUBLE PRECISION NOT NULL,
    "beneficios" JSONB NOT NULL,
    "descontos" JSONB NOT NULL,
    "salarioLiquido" DOUBLE PRECISION NOT NULL,
    "dataPagamento" TIMESTAMP(3) NOT NULL,
    "observacoes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracheques_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "funcionarios_tenantId_nome_idx" ON "funcionarios"("tenantId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "contracheques_funcionarioId_competenciaMes_competenciaAno_key" ON "contracheques"("funcionarioId", "competenciaMes", "competenciaAno");

-- CreateIndex
CREATE INDEX "contracheques_tenantId_competenciaAno_competenciaMes_idx" ON "contracheques"("tenantId", "competenciaAno", "competenciaMes");

-- AddForeignKey
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracheques" ADD CONSTRAINT "contracheques_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracheques" ADD CONSTRAINT "contracheques_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
