-- CreateTable
CREATE TABLE "listas_documento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "chave" TEXT,
    "intro" TEXT NOT NULL DEFAULT '',
    "aviso" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listas_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lista_documento_itens" (
    "id" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lista_documento_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listas_documento_tenantId_sortOrder_idx" ON "listas_documento"("tenantId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "listas_documento_tenantId_chave_key" ON "listas_documento"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "lista_documento_itens_listaId_sortOrder_idx" ON "lista_documento_itens"("listaId", "sortOrder");

-- AddForeignKey
ALTER TABLE "listas_documento" ADD CONSTRAINT "listas_documento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_documento_itens" ADD CONSTRAINT "lista_documento_itens_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas_documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
