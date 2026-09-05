-- Fundação da venda de imóveis usados: operação no Imovel da captação + interessados.

CREATE TYPE "VendaUsadoStatus" AS ENUM ('disponivel', 'reservado', 'vendido', 'indisponivel');
CREATE TYPE "InteresseUsadoStatus" AS ENUM ('novo', 'em_contato', 'interessado', 'sem_interesse', 'descartado');
CREATE TYPE "VendaUsadoHistoricoTipo" AS ENUM (
  'disponibilizacao',
  'responsavel',
  'status',
  'preco',
  'etapa',
  'interessado_vinculo',
  'interessado_remocao',
  'edicao'
);

CREATE TABLE "interessados_usado" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "telefone" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "observacoes" TEXT NOT NULL DEFAULT '',
  "tipoDesejado" "CaptacaoImovelTipo",
  "cidade" TEXT NOT NULL DEFAULT '',
  "bairros" TEXT NOT NULL DEFAULT '',
  "precoMin" DECIMAL(14,2),
  "precoMax" DECIMAL(14,2),
  "quartosMin" INTEGER,
  "banheirosMin" INTEGER,
  "vagasMin" INTEGER,
  "areaMin" DECIMAL(12,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "interessados_usado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vendas_usado" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "imovelId" TEXT NOT NULL,
  "responsavelId" TEXT NOT NULL,
  "funilId" TEXT NOT NULL,
  "funilEtapaId" TEXT NOT NULL,
  "status" "VendaUsadoStatus" NOT NULL DEFAULT 'disponivel',
  "precoVenda" DECIMAL(14,2),
  "dataDisponibilizacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "observacoes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vendas_usado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venda_usado_vinculos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vendaUsadoId" TEXT NOT NULL,
  "interessadoId" TEXT NOT NULL,
  "interesse" "InteresseUsadoStatus" NOT NULL DEFAULT 'novo',
  "observacoes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venda_usado_vinculos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venda_usado_historicos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vendaUsadoId" TEXT NOT NULL,
  "tipo" "VendaUsadoHistoricoTipo" NOT NULL,
  "texto" TEXT NOT NULL,
  "autorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "venda_usado_historicos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendas_usado_imovelId_key" ON "vendas_usado"("imovelId");
CREATE INDEX "interessados_usado_tenantId_idx" ON "interessados_usado"("tenantId");
CREATE INDEX "interessados_usado_tenantId_nome_idx" ON "interessados_usado"("tenantId", "nome");
CREATE INDEX "vendas_usado_tenantId_idx" ON "vendas_usado"("tenantId");
CREATE INDEX "vendas_usado_tenantId_status_idx" ON "vendas_usado"("tenantId", "status");
CREATE INDEX "vendas_usado_tenantId_responsavelId_idx" ON "vendas_usado"("tenantId", "responsavelId");
CREATE INDEX "vendas_usado_tenantId_funilEtapaId_idx" ON "vendas_usado"("tenantId", "funilEtapaId");
CREATE UNIQUE INDEX "venda_usado_vinculos_vendaUsadoId_interessadoId_key" ON "venda_usado_vinculos"("vendaUsadoId", "interessadoId");
CREATE INDEX "venda_usado_vinculos_tenantId_idx" ON "venda_usado_vinculos"("tenantId");
CREATE INDEX "venda_usado_vinculos_tenantId_interessadoId_idx" ON "venda_usado_vinculos"("tenantId", "interessadoId");
CREATE INDEX "venda_usado_historicos_tenantId_vendaUsadoId_idx" ON "venda_usado_historicos"("tenantId", "vendaUsadoId");
CREATE INDEX "venda_usado_historicos_vendaUsadoId_createdAt_idx" ON "venda_usado_historicos"("vendaUsadoId", "createdAt");

ALTER TABLE "interessados_usado" ADD CONSTRAINT "interessados_usado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendas_usado" ADD CONSTRAINT "vendas_usado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendas_usado" ADD CONSTRAINT "vendas_usado_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendas_usado" ADD CONSTRAINT "vendas_usado_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendas_usado" ADD CONSTRAINT "vendas_usado_funilId_fkey" FOREIGN KEY ("funilId") REFERENCES "funis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendas_usado" ADD CONSTRAINT "vendas_usado_funilEtapaId_fkey" FOREIGN KEY ("funilEtapaId") REFERENCES "funil_etapas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venda_usado_vinculos" ADD CONSTRAINT "venda_usado_vinculos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_vinculos" ADD CONSTRAINT "venda_usado_vinculos_vendaUsadoId_fkey" FOREIGN KEY ("vendaUsadoId") REFERENCES "vendas_usado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_vinculos" ADD CONSTRAINT "venda_usado_vinculos_interessadoId_fkey" FOREIGN KEY ("interessadoId") REFERENCES "interessados_usado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venda_usado_historicos" ADD CONSTRAINT "venda_usado_historicos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_historicos" ADD CONSTRAINT "venda_usado_historicos_vendaUsadoId_fkey" FOREIGN KEY ("vendaUsadoId") REFERENCES "vendas_usado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_historicos" ADD CONSTRAINT "venda_usado_historicos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
