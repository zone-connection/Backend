CREATE TYPE "ApiWebhookEntregaEstado" AS ENUM ('pendente', 'entregue', 'falhou', 'cancelada');

CREATE TABLE "api_webhook_destinos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "aplicacaoId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "segredoCifrado" TEXT NOT NULL,
  "eventos" TEXT[] NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "desativadoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "api_webhook_destinos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_webhook_eventos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL,
  "processadoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_webhook_eventos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_webhook_entregas" (
  "id" TEXT NOT NULL,
  "eventoId" TEXT NOT NULL,
  "destinoId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "estado" "ApiWebhookEntregaEstado" NOT NULL DEFAULT 'pendente',
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "proximaTentativaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reservadoAte" TIMESTAMP(3),
  "ultimoHttp" INTEGER,
  "ultimoErro" TEXT NOT NULL DEFAULT '',
  "ultimaTentativaEm" TIMESTAMP(3),
  "concluidaEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "api_webhook_entregas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_webhook_tentativas" (
  "id" TEXT NOT NULL,
  "entregaId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "httpStatus" INTEGER,
  "duracaoMs" INTEGER,
  "sucesso" BOOLEAN NOT NULL,
  "erro" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_webhook_tentativas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "api_webhook_destinos_tenantId_aplicacaoId_idx" ON "api_webhook_destinos"("tenantId", "aplicacaoId");
CREATE INDEX "api_webhook_eventos_processadoEm_createdAt_idx" ON "api_webhook_eventos"("processadoEm", "createdAt");
CREATE INDEX "api_webhook_eventos_tenantId_occurredAt_idx" ON "api_webhook_eventos"("tenantId", "occurredAt");
CREATE UNIQUE INDEX "api_webhook_entregas_eventoId_destinoId_key" ON "api_webhook_entregas"("eventoId", "destinoId");
CREATE INDEX "api_webhook_entregas_estado_proximaTentativaEm_idx" ON "api_webhook_entregas"("estado", "proximaTentativaEm");
CREATE INDEX "api_webhook_entregas_reservadoAte_idx" ON "api_webhook_entregas"("reservadoAte");
CREATE INDEX "api_webhook_entregas_tenantId_destinoId_idx" ON "api_webhook_entregas"("tenantId", "destinoId");
CREATE INDEX "api_webhook_tentativas_entregaId_numero_idx" ON "api_webhook_tentativas"("entregaId", "numero");

ALTER TABLE "api_webhook_destinos" ADD CONSTRAINT "api_webhook_destinos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_webhook_destinos" ADD CONSTRAINT "api_webhook_destinos_aplicacaoId_fkey" FOREIGN KEY ("aplicacaoId") REFERENCES "api_aplicacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_webhook_eventos" ADD CONSTRAINT "api_webhook_eventos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_webhook_entregas" ADD CONSTRAINT "api_webhook_entregas_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "api_webhook_eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_webhook_entregas" ADD CONSTRAINT "api_webhook_entregas_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "api_webhook_destinos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_webhook_tentativas" ADD CONSTRAINT "api_webhook_tentativas_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "api_webhook_entregas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
