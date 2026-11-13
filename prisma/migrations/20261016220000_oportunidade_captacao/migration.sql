CREATE TYPE "OportunidadeCaptacaoStatus" AS ENUM ('aberta', 'convertida', 'perdida');

CREATE TABLE "oportunidades_captacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "localizacao" TEXT NOT NULL,
    "proprietarioNome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL DEFAULT '',
    "tipo" "CaptacaoImovelTipo" NOT NULL DEFAULT 'outro',
    "valorPretendido" DECIMAL(14,2),
    "origem" TEXT NOT NULL DEFAULT '',
    "responsavelId" TEXT NOT NULL,
    "proximaAcao" TEXT NOT NULL DEFAULT '',
    "proximaAcaoEm" TIMESTAMP(3),
    "status" "OportunidadeCaptacaoStatus" NOT NULL DEFAULT 'aberta',
    "motivoPerda" TEXT NOT NULL DEFAULT '',
    "captacaoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oportunidades_captacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oportunidades_captacao_captacaoId_key" ON "oportunidades_captacao"("captacaoId");
CREATE INDEX "oportunidades_captacao_tenantId_status_idx" ON "oportunidades_captacao"("tenantId", "status");
CREATE INDEX "oportunidades_captacao_tenantId_responsavelId_idx" ON "oportunidades_captacao"("tenantId", "responsavelId");

ALTER TABLE "oportunidades_captacao" ADD CONSTRAINT "oportunidades_captacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oportunidades_captacao" ADD CONSTRAINT "oportunidades_captacao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "oportunidades_captacao" ADD CONSTRAINT "oportunidades_captacao_captacaoId_fkey" FOREIGN KEY ("captacaoId") REFERENCES "captacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
