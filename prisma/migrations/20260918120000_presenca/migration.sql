-- CreateEnum
CREATE TYPE "PresencaNatureza" AS ENUM ('presente', 'meio_periodo', 'falta', 'falta_justificada');

-- CreateTable
CREATE TABLE "presenca_tipos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "natureza" "PresencaNatureza" NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#64748b',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presenca_tipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presenca_lancamentos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "tipoId" TEXT NOT NULL,
    "observacao" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presenca_lancamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "presenca_tipos_tenantId_ativo_idx" ON "presenca_tipos"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "presenca_lancamentos_tenantId_userId_data_key" ON "presenca_lancamentos"("tenantId", "userId", "data");

-- CreateIndex
CREATE INDEX "presenca_lancamentos_tenantId_data_idx" ON "presenca_lancamentos"("tenantId", "data");

-- CreateIndex
CREATE INDEX "presenca_lancamentos_userId_data_idx" ON "presenca_lancamentos"("userId", "data");

-- AddForeignKey
ALTER TABLE "presenca_tipos" ADD CONSTRAINT "presenca_tipos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presenca_lancamentos" ADD CONSTRAINT "presenca_lancamentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presenca_lancamentos" ADD CONSTRAINT "presenca_lancamentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presenca_lancamentos" ADD CONSTRAINT "presenca_lancamentos_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "presenca_tipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
