-- Implantação vinculada ao tenant existente. Não altera cadastros nem financeiro.
CREATE TYPE "OnboardingStatus" AS ENUM ('nao_iniciado', 'em_andamento', 'aguardando_cliente', 'aguardando_equipe', 'concluido', 'cancelado');
CREATE TYPE "OnboardingEtapaStatus" AS ENUM ('pendente', 'concluida');

CREATE TABLE "onboardings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "platformContratoId" TEXT,
  "responsavelId" TEXT,
  "inicio" TIMESTAMP(3) NOT NULL,
  "prazoPrevisto" TIMESTAMP(3) NOT NULL,
  "status" "OnboardingStatus" NOT NULL DEFAULT 'nao_iniciado',
  "observacao" TEXT NOT NULL DEFAULT '',
  "justificativa" TEXT NOT NULL DEFAULT '',
  "concluidoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "onboardings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onboarding_etapas" (
  "id" TEXT NOT NULL,
  "onboardingId" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL,
  "titulo" TEXT NOT NULL,
  "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
  "status" "OnboardingEtapaStatus" NOT NULL DEFAULT 'pendente',
  "pendencia" TEXT NOT NULL DEFAULT '',
  "observacao" TEXT NOT NULL DEFAULT '',
  "concluidaEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "onboarding_etapas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onboarding_historicos" (
  "id" TEXT NOT NULL,
  "onboardingId" TEXT NOT NULL,
  "autorId" TEXT,
  "acao" TEXT NOT NULL,
  "detalhe" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_historicos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_etapas_onboardingId_ordem_key" ON "onboarding_etapas"("onboardingId", "ordem");
CREATE INDEX "onboardings_tenantId_status_idx" ON "onboardings"("tenantId", "status");
CREATE INDEX "onboardings_responsavelId_idx" ON "onboardings"("responsavelId");
CREATE INDEX "onboardings_prazoPrevisto_idx" ON "onboardings"("prazoPrevisto");
CREATE INDEX "onboarding_etapas_onboardingId_idx" ON "onboarding_etapas"("onboardingId");
CREATE INDEX "onboarding_historicos_onboardingId_createdAt_idx" ON "onboarding_historicos"("onboardingId", "createdAt");

-- Uma implantação aberta por imobiliária. Concluída ou cancelada libera um novo ciclo.
CREATE UNIQUE INDEX "onboardings_tenant_aberto_key" ON "onboardings"("tenantId")
WHERE "status" NOT IN ('concluido', 'cancelado');

ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_platformContratoId_fkey" FOREIGN KEY ("platformContratoId") REFERENCES "platform_contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onboarding_etapas" ADD CONSTRAINT "onboarding_etapas_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_historicos" ADD CONSTRAINT "onboarding_historicos_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_historicos" ADD CONSTRAINT "onboarding_historicos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
