-- Fundação do módulo de Captação: proprietário → imóvel → captação + histórico.

CREATE TYPE "PessoaTipo" AS ENUM ('fisica', 'juridica');

CREATE TYPE "CaptacaoImovelTipo" AS ENUM (
  'apartamento',
  'casa',
  'terreno',
  'sala_comercial',
  'loja',
  'galpao',
  'fazenda',
  'chacara',
  'outro'
);

CREATE TYPE "CaptacaoHistoricoTipo" AS ENUM (
  'criacao',
  'etapa',
  'responsavel',
  'valor',
  'exclusividade',
  'edicao'
);

CREATE TABLE "proprietarios" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipoPessoa" "PessoaTipo" NOT NULL DEFAULT 'fisica',
  "cpfCnpj" TEXT NOT NULL DEFAULT '',
  "telefone" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "observacoes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "proprietarios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "imoveis" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proprietarioId" TEXT NOT NULL,
  "tipo" "CaptacaoImovelTipo" NOT NULL,
  "cep" TEXT NOT NULL DEFAULT '',
  "logradouro" TEXT NOT NULL DEFAULT '',
  "numero" TEXT NOT NULL DEFAULT '',
  "complemento" TEXT NOT NULL DEFAULT '',
  "bairro" TEXT NOT NULL DEFAULT '',
  "cidade" TEXT NOT NULL DEFAULT '',
  "estado" TEXT NOT NULL DEFAULT '',
  "area" DECIMAL(12,2),
  "areaConstruida" DECIMAL(12,2),
  "quartos" INTEGER,
  "suites" INTEGER,
  "banheiros" INTEGER,
  "vagas" INTEGER,
  "observacoes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "imoveis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "captacoes" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proprietarioId" TEXT NOT NULL,
  "imovelId" TEXT NOT NULL,
  "responsavelId" TEXT NOT NULL,
  "origem" TEXT NOT NULL DEFAULT '',
  "exclusividade" BOOLEAN NOT NULL DEFAULT false,
  "valorPretendido" DECIMAL(14,2),
  "valorAvaliacao" DECIMAL(14,2),
  "funilId" TEXT NOT NULL,
  "funilEtapaId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "captacoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "captacao_historicos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "captacaoId" TEXT NOT NULL,
  "tipo" "CaptacaoHistoricoTipo" NOT NULL,
  "texto" TEXT NOT NULL,
  "autorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "captacao_historicos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proprietarios_tenantId_idx" ON "proprietarios"("tenantId");
CREATE INDEX "proprietarios_tenantId_nome_idx" ON "proprietarios"("tenantId", "nome");

CREATE INDEX "imoveis_tenantId_idx" ON "imoveis"("tenantId");
CREATE INDEX "imoveis_tenantId_proprietarioId_idx" ON "imoveis"("tenantId", "proprietarioId");
CREATE INDEX "imoveis_tenantId_cidade_idx" ON "imoveis"("tenantId", "cidade");
CREATE INDEX "imoveis_tenantId_tipo_idx" ON "imoveis"("tenantId", "tipo");

CREATE INDEX "captacoes_tenantId_idx" ON "captacoes"("tenantId");
CREATE INDEX "captacoes_tenantId_proprietarioId_idx" ON "captacoes"("tenantId", "proprietarioId");
CREATE INDEX "captacoes_tenantId_imovelId_idx" ON "captacoes"("tenantId", "imovelId");
CREATE INDEX "captacoes_tenantId_responsavelId_idx" ON "captacoes"("tenantId", "responsavelId");
CREATE INDEX "captacoes_tenantId_funilEtapaId_idx" ON "captacoes"("tenantId", "funilEtapaId");
CREATE INDEX "captacoes_tenantId_createdAt_idx" ON "captacoes"("tenantId", "createdAt");

CREATE INDEX "captacao_historicos_tenantId_captacaoId_idx" ON "captacao_historicos"("tenantId", "captacaoId");
CREATE INDEX "captacao_historicos_captacaoId_createdAt_idx" ON "captacao_historicos"("captacaoId", "createdAt");

ALTER TABLE "proprietarios" ADD CONSTRAINT "proprietarios_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "imoveis" ADD CONSTRAINT "imoveis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imoveis" ADD CONSTRAINT "imoveis_proprietarioId_fkey" FOREIGN KEY ("proprietarioId") REFERENCES "proprietarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "captacoes" ADD CONSTRAINT "captacoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "captacoes" ADD CONSTRAINT "captacoes_proprietarioId_fkey" FOREIGN KEY ("proprietarioId") REFERENCES "proprietarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "captacoes" ADD CONSTRAINT "captacoes_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "captacoes" ADD CONSTRAINT "captacoes_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "captacoes" ADD CONSTRAINT "captacoes_funilId_fkey" FOREIGN KEY ("funilId") REFERENCES "funis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "captacoes" ADD CONSTRAINT "captacoes_funilEtapaId_fkey" FOREIGN KEY ("funilEtapaId") REFERENCES "funil_etapas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "captacao_historicos" ADD CONSTRAINT "captacao_historicos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "captacao_historicos" ADD CONSTRAINT "captacao_historicos_captacaoId_fkey" FOREIGN KEY ("captacaoId") REFERENCES "captacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "captacao_historicos" ADD CONSTRAINT "captacao_historicos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
