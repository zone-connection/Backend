-- CreateEnum
CREATE TYPE "ArquivoCategoria" AS ENUM ('ficha', 'proposta', 'outro');

-- CreateEnum
CREATE TYPE "ArquivoVinculoTipo" AS ENUM ('lead', 'imovel', 'empreendimento', 'proprietario', 'venda_usado', 'documentacao', 'tarefa', 'proposta');

-- CreateEnum
CREATE TYPE "ArquivoEventoTipo" AS ENUM ('upload', 'download', 'download_zip', 'visualizar', 'excluir', 'restaurar', 'alterar_metadados', 'tags_alteradas', 'compartilhar_email', 'share_link_criar', 'share_link_usar', 'share_link_revogar', 'tag_criar', 'tag_renomear', 'tag_inativar', 'tag_ativar', 'autorizacao_negada');

-- CreateTable
CREATE TABLE "documento_tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documento_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivo_documentos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "nomeExibicao" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "categoria" "ArquivoCategoria" NOT NULL DEFAULT 'outro',
    "uploadedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arquivo_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivo_vinculos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "arquivoId" TEXT NOT NULL,
    "entityType" "ArquivoVinculoTipo" NOT NULL,
    "entityId" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'cadastro',

    CONSTRAINT "arquivo_vinculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivo_documento_tags" (
    "arquivoId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "arquivo_documento_tags_pkey" PRIMARY KEY ("arquivoId","tagId")
);

-- CreateTable
CREATE TABLE "arquivo_eventos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "arquivoId" TEXT,
    "userId" TEXT,
    "tipo" "ArquivoEventoTipo" NOT NULL,
    "detalhe" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquivo_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivo_share_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT,
    "emailTo" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquivo_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivo_share_link_itens" (
    "linkId" TEXT NOT NULL,
    "arquivoId" TEXT NOT NULL,

    CONSTRAINT "arquivo_share_link_itens_pkey" PRIMARY KEY ("linkId","arquivoId")
);

CREATE UNIQUE INDEX "documento_tags_tenantId_slug_key" ON "documento_tags"("tenantId", "slug");
CREATE INDEX "documento_tags_tenantId_active_idx" ON "documento_tags"("tenantId", "active");
CREATE UNIQUE INDEX "arquivo_documentos_storageKey_key" ON "arquivo_documentos"("storageKey");
CREATE INDEX "arquivo_documentos_tenantId_deletedAt_idx" ON "arquivo_documentos"("tenantId", "deletedAt");
CREATE INDEX "arquivo_documentos_tenantId_categoria_idx" ON "arquivo_documentos"("tenantId", "categoria");
CREATE UNIQUE INDEX "arquivo_vinculos_arquivoId_entityType_entityId_key" ON "arquivo_vinculos"("arquivoId", "entityType", "entityId");
CREATE INDEX "arquivo_vinculos_tenantId_entityType_entityId_idx" ON "arquivo_vinculos"("tenantId", "entityType", "entityId");
CREATE INDEX "arquivo_documento_tags_tagId_idx" ON "arquivo_documento_tags"("tagId");
CREATE INDEX "arquivo_eventos_tenantId_createdAt_idx" ON "arquivo_eventos"("tenantId", "createdAt");
CREATE INDEX "arquivo_eventos_arquivoId_idx" ON "arquivo_eventos"("arquivoId");
CREATE UNIQUE INDEX "arquivo_share_links_tokenHash_key" ON "arquivo_share_links"("tokenHash");
CREATE INDEX "arquivo_share_links_tenantId_idx" ON "arquivo_share_links"("tenantId");

ALTER TABLE "documento_tags" ADD CONSTRAINT "documento_tags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documento_tags" ADD CONSTRAINT "documento_tags_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "arquivo_documentos" ADD CONSTRAINT "arquivo_documentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "arquivo_documentos" ADD CONSTRAINT "arquivo_documentos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "arquivo_vinculos" ADD CONSTRAINT "arquivo_vinculos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "arquivo_vinculos" ADD CONSTRAINT "arquivo_vinculos_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "arquivo_documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "arquivo_documento_tags" ADD CONSTRAINT "arquivo_documento_tags_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "arquivo_documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "arquivo_documento_tags" ADD CONSTRAINT "arquivo_documento_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "documento_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "arquivo_eventos" ADD CONSTRAINT "arquivo_eventos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "arquivo_eventos" ADD CONSTRAINT "arquivo_eventos_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "arquivo_documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "arquivo_eventos" ADD CONSTRAINT "arquivo_eventos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "arquivo_share_links" ADD CONSTRAINT "arquivo_share_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "arquivo_share_links" ADD CONSTRAINT "arquivo_share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "arquivo_share_link_itens" ADD CONSTRAINT "arquivo_share_link_itens_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "arquivo_share_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "arquivo_share_link_itens" ADD CONSTRAINT "arquivo_share_link_itens_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "arquivo_documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
