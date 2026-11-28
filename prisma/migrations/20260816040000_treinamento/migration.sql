-- CreateTable
CREATE TABLE "treinamento_secoes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "titulo" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treinamento_secoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treinamento_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "secaoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treinamento_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treinamento_secoes_tenantId_parentId_idx" ON "treinamento_secoes"("tenantId", "parentId");

-- CreateIndex
CREATE INDEX "treinamento_secoes_tenantId_sortOrder_idx" ON "treinamento_secoes"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "treinamento_links_tenantId_secaoId_idx" ON "treinamento_links"("tenantId", "secaoId");

-- CreateIndex
CREATE INDEX "treinamento_links_secaoId_sortOrder_idx" ON "treinamento_links"("secaoId", "sortOrder");

-- AddForeignKey
ALTER TABLE "treinamento_secoes" ADD CONSTRAINT "treinamento_secoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treinamento_secoes" ADD CONSTRAINT "treinamento_secoes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "treinamento_secoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treinamento_links" ADD CONSTRAINT "treinamento_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treinamento_links" ADD CONSTRAINT "treinamento_links_secaoId_fkey" FOREIGN KEY ("secaoId") REFERENCES "treinamento_secoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
