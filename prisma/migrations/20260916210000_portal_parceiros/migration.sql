-- AlterTable
ALTER TABLE "imoveis" ADD COLUMN "liberadoParaParceria" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "ParceriaStatus" AS ENUM ('convite', 'ativa', 'suspensa', 'encerrada');
CREATE TYPE "ParceriaParticipacaoStatus" AS ENUM ('pendente', 'ativa', 'expirada', 'encerrada');
CREATE TYPE "ParceriaRepasseStatus" AS ENUM ('prevista', 'devida', 'paga');

-- CreateTable
CREATE TABLE "corretor_parceiros" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "creci" TEXT NOT NULL DEFAULT '',
    "imobiliariaOrigem" TEXT NOT NULL DEFAULT '',
    "telefone" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL,
    "hashedRefreshToken" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corretor_parceiros_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "corretor_parceiros_email_key" ON "corretor_parceiros"("email");

CREATE TABLE "parcerias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "status" "ParceriaStatus" NOT NULL DEFAULT 'convite',
    "percentualParceiro" DECIMAL(7,4) NOT NULL DEFAULT 50,
    "podeVerEstoque" BOOLEAN NOT NULL DEFAULT true,
    "podeReceberLead" BOOLEAN NOT NULL DEFAULT true,
    "podeIndicar" BOOLEAN NOT NULL DEFAULT true,
    "slaDias" INTEGER NOT NULL DEFAULT 7,
    "convidadoPorId" TEXT,
    "aceitoAt" TIMESTAMP(3),
    "encerradoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parcerias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "parcerias_tenantId_parceiroId_key" ON "parcerias"("tenantId", "parceiroId");
CREATE INDEX "parcerias_tenantId_status_idx" ON "parcerias"("tenantId", "status");
CREATE INDEX "parcerias_parceiroId_idx" ON "parcerias"("parceiroId");

CREATE TABLE "parceria_interesses" (
    "id" TEXT NOT NULL,
    "parceriaId" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parceria_interesses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "parceria_interesses_parceriaId_imovelId_key" ON "parceria_interesses"("parceriaId", "imovelId");
CREATE INDEX "parceria_interesses_imovelId_idx" ON "parceria_interesses"("imovelId");

CREATE TABLE "parceria_participacoes" (
    "id" TEXT NOT NULL,
    "parceriaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "responsavelCasaId" TEXT,
    "status" "ParceriaParticipacaoStatus" NOT NULL DEFAULT 'pendente',
    "expiresAt" TIMESTAMP(3),
    "aceitoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parceria_participacoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "parceria_participacoes_parceriaId_leadId_key" ON "parceria_participacoes"("parceriaId", "leadId");
CREATE INDEX "parceria_participacoes_leadId_idx" ON "parceria_participacoes"("leadId");

CREATE TABLE "parceria_repasses" (
    "id" TEXT NOT NULL,
    "parceriaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "status" "ParceriaRepasseStatus" NOT NULL DEFAULT 'prevista',
    "pagoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parceria_repasses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "parceria_repasses_parceriaId_status_idx" ON "parceria_repasses"("parceriaId", "status");

CREATE TABLE "parceria_eventos" (
    "id" TEXT NOT NULL,
    "parceriaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parceria_eventos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "parceria_eventos_parceriaId_createdAt_idx" ON "parceria_eventos"("parceriaId", "createdAt");

ALTER TABLE "parcerias" ADD CONSTRAINT "parcerias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parcerias" ADD CONSTRAINT "parcerias_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "corretor_parceiros"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parcerias" ADD CONSTRAINT "parcerias_convidadoPorId_fkey" FOREIGN KEY ("convidadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "parceria_interesses" ADD CONSTRAINT "parceria_interesses_parceriaId_fkey" FOREIGN KEY ("parceriaId") REFERENCES "parcerias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parceria_interesses" ADD CONSTRAINT "parceria_interesses_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "parceria_participacoes" ADD CONSTRAINT "parceria_participacoes_parceriaId_fkey" FOREIGN KEY ("parceriaId") REFERENCES "parcerias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parceria_participacoes" ADD CONSTRAINT "parceria_participacoes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parceria_participacoes" ADD CONSTRAINT "parceria_participacoes_responsavelCasaId_fkey" FOREIGN KEY ("responsavelCasaId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "parceria_repasses" ADD CONSTRAINT "parceria_repasses_parceriaId_fkey" FOREIGN KEY ("parceriaId") REFERENCES "parcerias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parceria_eventos" ADD CONSTRAINT "parceria_eventos_parceriaId_fkey" FOREIGN KEY ("parceriaId") REFERENCES "parcerias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
