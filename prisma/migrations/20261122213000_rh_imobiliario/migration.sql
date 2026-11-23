ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'rh';

CREATE TYPE "RhEtapa" AS ENUM (
  'novo',
  'em_contato',
  'entrevista',
  'aprovado',
  'integracao',
  'ativo',
  'desistente',
  'reprovado'
);

CREATE TYPE "RhModeloTipo" AS ENUM ('com_creci', 'sem_creci');

CREATE TYPE "RhCompromissoTipo" AS ENUM (
  'entrevista',
  'retorno',
  'reuniao',
  'documentos',
  'assinatura',
  'treinamento',
  'avaliacao'
);

ALTER TABLE "users"
  ADD COLUMN "desligadoEm" TIMESTAMP(3),
  ADD COLUMN "desligamentoMotivo" TEXT,
  ADD COLUMN "desligadoPorId" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_desligadoPorId_fkey"
  FOREIGN KEY ("desligadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "rh_candidatos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "telefone" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "creci" TEXT,
  "experiencia" TEXT NOT NULL DEFAULT '',
  "observacoes" TEXT NOT NULL DEFAULT '',
  "entradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "etapa" "RhEtapa" NOT NULL DEFAULT 'novo',
  "responsavelId" TEXT,
  "encerradoEm" TIMESTAMP(3),
  "motivoEncerramento" TEXT NOT NULL DEFAULT '',
  "encerradoPorId" TEXT,
  "userId" TEXT,
  "contratadoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rh_candidatos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rh_candidatos_userId_key" ON "rh_candidatos"("userId");
CREATE INDEX "rh_candidatos_tenantId_etapa_idx" ON "rh_candidatos"("tenantId", "etapa");
CREATE INDEX "rh_candidatos_tenantId_entradaEm_idx" ON "rh_candidatos"("tenantId", "entradaEm");

ALTER TABLE "rh_candidatos"
  ADD CONSTRAINT "rh_candidatos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rh_candidatos_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "rh_candidatos_encerradoPorId_fkey" FOREIGN KEY ("encerradoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "rh_candidatos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "rh_candidato_historicos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "candidatoId" TEXT NOT NULL,
  "deEtapa" "RhEtapa",
  "paraEtapa" "RhEtapa" NOT NULL,
  "motivo" TEXT NOT NULL DEFAULT '',
  "autorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rh_candidato_historicos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rh_candidato_historicos_candidatoId_createdAt_idx" ON "rh_candidato_historicos"("candidatoId", "createdAt");

ALTER TABLE "rh_candidato_historicos"
  ADD CONSTRAINT "rh_candidato_historicos_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "rh_candidatos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rh_candidato_historicos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "rh_treinamentos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "data" TIMESTAMP(3) NOT NULL,
  "observacoes" TEXT NOT NULL DEFAULT '',
  "candidatoId" TEXT,
  "userId" TEXT,
  "autorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rh_treinamentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rh_treinamentos_tenantId_data_idx" ON "rh_treinamentos"("tenantId", "data");
CREATE INDEX "rh_treinamentos_userId_idx" ON "rh_treinamentos"("userId");
CREATE INDEX "rh_treinamentos_candidatoId_idx" ON "rh_treinamentos"("candidatoId");

ALTER TABLE "rh_treinamentos"
  ADD CONSTRAINT "rh_treinamentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rh_treinamentos_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "rh_candidatos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rh_treinamentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rh_treinamentos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "rh_modelos_contrato" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tipo" "RhModeloTipo" NOT NULL,
  "nome" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "nomeArquivo" TEXT NOT NULL,
  "conteudo" BYTEA NOT NULL,
  "autorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rh_modelos_contrato_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rh_modelos_contrato_tenantId_tipo_idx" ON "rh_modelos_contrato"("tenantId", "tipo");

ALTER TABLE "rh_modelos_contrato"
  ADD CONSTRAINT "rh_modelos_contrato_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rh_modelos_contrato_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "rh_documentos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "nomeArquivo" TEXT NOT NULL,
  "conteudo" BYTEA NOT NULL,
  "candidatoId" TEXT,
  "userId" TEXT,
  "autorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rh_documentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rh_documentos_tenantId_userId_idx" ON "rh_documentos"("tenantId", "userId");
CREATE INDEX "rh_documentos_tenantId_candidatoId_idx" ON "rh_documentos"("tenantId", "candidatoId");

ALTER TABLE "rh_documentos"
  ADD CONSTRAINT "rh_documentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rh_documentos_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "rh_candidatos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rh_documentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rh_documentos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agendamentos"
  ADD COLUMN "rhCandidatoId" TEXT,
  ADD COLUMN "rhUserId" TEXT,
  ADD COLUMN "rhTipo" "RhCompromissoTipo";

CREATE INDEX "agendamentos_rhCandidatoId_idx" ON "agendamentos"("rhCandidatoId");
CREATE INDEX "agendamentos_rhUserId_idx" ON "agendamentos"("rhUserId");

ALTER TABLE "agendamentos"
  ADD CONSTRAINT "agendamentos_rhCandidatoId_fkey" FOREIGN KEY ("rhCandidatoId") REFERENCES "rh_candidatos"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "agendamentos_rhUserId_fkey" FOREIGN KEY ("rhUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
