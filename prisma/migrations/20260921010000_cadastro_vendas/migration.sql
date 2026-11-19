CREATE TABLE "cadastro_vendas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "clienteNome" TEXT NOT NULL,
    "telefone" TEXT,
    "construtoraId" TEXT,
    "empreendimentoId" TEXT,
    "corretorId" TEXT,
    "dataVenda" TIMESTAMP(3) NOT NULL,
    "vgv" INTEGER NOT NULL,
    "obs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cadastro_vendas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cadastro_vendas_tenantId_idx" ON "cadastro_vendas"("tenantId");
CREATE INDEX "cadastro_vendas_corretorId_idx" ON "cadastro_vendas"("corretorId");
CREATE INDEX "cadastro_vendas_dataVenda_idx" ON "cadastro_vendas"("dataVenda");

ALTER TABLE "cadastro_vendas" ADD CONSTRAINT "cadastro_vendas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cadastro_vendas" ADD CONSTRAINT "cadastro_vendas_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cadastro_vendas" ADD CONSTRAINT "cadastro_vendas_construtoraId_fkey" FOREIGN KEY ("construtoraId") REFERENCES "construtoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cadastro_vendas" ADD CONSTRAINT "cadastro_vendas_empreendimentoId_fkey" FOREIGN KEY ("empreendimentoId") REFERENCES "empreendimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cadastro_vendas" ADD CONSTRAINT "cadastro_vendas_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
