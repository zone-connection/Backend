-- CreateTable
CREATE TABLE "localidades" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "localidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ConstrutoraLocalidades" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "localidades_tenantId_nome_key" ON "localidades"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "localidades_tenantId_idx" ON "localidades"("tenantId");

-- CreateIndex
CREATE INDEX "localidades_nome_idx" ON "localidades"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "_ConstrutoraLocalidades_AB_unique" ON "_ConstrutoraLocalidades"("A", "B");

-- CreateIndex
CREATE INDEX "_ConstrutoraLocalidades_B_index" ON "_ConstrutoraLocalidades"("B");

-- AddForeignKey
ALTER TABLE "localidades" ADD CONSTRAINT "localidades_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConstrutoraLocalidades" ADD CONSTRAINT "_ConstrutoraLocalidades_A_fkey" FOREIGN KEY ("A") REFERENCES "construtoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConstrutoraLocalidades" ADD CONSTRAINT "_ConstrutoraLocalidades_B_fkey" FOREIGN KEY ("B") REFERENCES "localidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
