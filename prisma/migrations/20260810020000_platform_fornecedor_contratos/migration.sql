CREATE TABLE "platform_fornecedor_contratos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "centro" TEXT NOT NULL,
    "valorAdesao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorMensalidade" DOUBLE PRECISION NOT NULL,
    "qtdMensalidades" INTEGER NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "PlatformContratoStatus" NOT NULL DEFAULT 'ativo',
    "observacao" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_fornecedor_contratos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_fornecedor_contrato_parcelas" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "FinanceiroTituloStatus" NOT NULL DEFAULT 'aberto',
    "dataPagamento" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_fornecedor_contrato_parcelas_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financeiro_titulos" ADD COLUMN "platformFornecedorContratoId" TEXT;

CREATE UNIQUE INDEX "platform_fornecedor_contratos_codigo_key" ON "platform_fornecedor_contratos"("codigo");
CREATE INDEX "platform_fornecedor_contratos_parceiroId_idx" ON "platform_fornecedor_contratos"("parceiroId");
CREATE INDEX "platform_fornecedor_contratos_status_idx" ON "platform_fornecedor_contratos"("status");
CREATE INDEX "platform_fornecedor_contratos_vencimento_idx" ON "platform_fornecedor_contratos"("vencimento");
CREATE UNIQUE INDEX "platform_fornecedor_contrato_parcelas_contratoId_numero_key" ON "platform_fornecedor_contrato_parcelas"("contratoId", "numero");
CREATE INDEX "platform_fornecedor_contrato_parcelas_contratoId_idx" ON "platform_fornecedor_contrato_parcelas"("contratoId");
CREATE INDEX "platform_fornecedor_contrato_parcelas_vencimento_idx" ON "platform_fornecedor_contrato_parcelas"("vencimento");
CREATE INDEX "financeiro_titulos_platformFornecedorContratoId_idx" ON "financeiro_titulos"("platformFornecedorContratoId");

ALTER TABLE "platform_fornecedor_contratos" ADD CONSTRAINT "platform_fornecedor_contratos_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "financeiro_parceiros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_fornecedor_contrato_parcelas" ADD CONSTRAINT "platform_fornecedor_contrato_parcelas_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "platform_fornecedor_contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financeiro_titulos" ADD CONSTRAINT "financeiro_titulos_platformFornecedorContratoId_fkey" FOREIGN KEY ("platformFornecedorContratoId") REFERENCES "platform_fornecedor_contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
