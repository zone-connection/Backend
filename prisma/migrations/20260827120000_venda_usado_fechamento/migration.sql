-- Fechamento, checklist de documentação e contrato da venda de usados (sem arquivos).

ALTER TYPE "VendaUsadoHistoricoTipo" ADD VALUE IF NOT EXISTS 'fechamento';
ALTER TYPE "VendaUsadoHistoricoTipo" ADD VALUE IF NOT EXISTS 'documentacao';
ALTER TYPE "VendaUsadoHistoricoTipo" ADD VALUE IF NOT EXISTS 'contrato';

CREATE TYPE "VendaUsadoFechamentoStatus" AS ENUM (
  'iniciado',
  'documentacao_pendente',
  'documentacao_em_analise',
  'contrato_em_elaboracao',
  'contrato_enviado',
  'aguardando_assinatura',
  'concluido',
  'cancelado'
);
CREATE TYPE "VendaUsadoDocumentoCategoria" AS ENUM ('comprador', 'proprietario', 'imovel', 'venda');
CREATE TYPE "VendaUsadoDocumentoTipo" AS ENUM (
  'identificacao',
  'cpf',
  'comprovante_residencia',
  'complementar',
  'matricula',
  'iptu',
  'certidao',
  'proposta',
  'contrato'
);
CREATE TYPE "VendaUsadoDocumentoStatus" AS ENUM ('pendente', 'recebido', 'em_analise', 'aprovado', 'recusado');
CREATE TYPE "VendaUsadoDocumentoFornecedor" AS ENUM ('comprador', 'proprietario', 'imobiliaria');
CREATE TYPE "VendaUsadoContratoStatus" AS ENUM (
  'rascunho',
  'em_elaboracao',
  'enviado',
  'aguardando_assinatura',
  'assinado',
  'cancelado'
);

CREATE TABLE "venda_usado_fechamentos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vendaUsadoId" TEXT NOT NULL,
  "propostaId" TEXT NOT NULL,
  "interessadoId" TEXT NOT NULL,
  "responsavelId" TEXT NOT NULL,
  "status" "VendaUsadoFechamentoStatus" NOT NULL DEFAULT 'iniciado',
  "observacoes" TEXT NOT NULL DEFAULT '',
  "concluidoAt" TIMESTAMP(3),
  "canceladoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venda_usado_fechamentos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venda_usado_documentos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fechamentoId" TEXT NOT NULL,
  "categoria" "VendaUsadoDocumentoCategoria" NOT NULL,
  "tipo" "VendaUsadoDocumentoTipo" NOT NULL,
  "nome" TEXT NOT NULL,
  "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
  "fornecedor" "VendaUsadoDocumentoFornecedor" NOT NULL,
  "analistaId" TEXT,
  "status" "VendaUsadoDocumentoStatus" NOT NULL DEFAULT 'pendente',
  "observacao" TEXT NOT NULL DEFAULT '',
  "dataSolicitacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dataRecebimento" TIMESTAMP(3),
  "dataAnalise" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venda_usado_documentos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venda_usado_contratos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fechamentoId" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "status" "VendaUsadoContratoStatus" NOT NULL DEFAULT 'rascunho',
  "observacoes" TEXT NOT NULL DEFAULT '',
  "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dataEnvio" TIMESTAMP(3),
  "dataAssinatura" TIMESTAMP(3),
  "assinadoPorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venda_usado_contratos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venda_usado_fechamentos_vendaUsadoId_key" ON "venda_usado_fechamentos"("vendaUsadoId");
CREATE INDEX "venda_usado_fechamentos_tenantId_status_idx" ON "venda_usado_fechamentos"("tenantId", "status");
CREATE INDEX "venda_usado_documentos_tenantId_fechamentoId_idx" ON "venda_usado_documentos"("tenantId", "fechamentoId");
CREATE INDEX "venda_usado_documentos_fechamentoId_categoria_idx" ON "venda_usado_documentos"("fechamentoId", "categoria");
CREATE UNIQUE INDEX "venda_usado_contratos_fechamentoId_key" ON "venda_usado_contratos"("fechamentoId");
CREATE INDEX "venda_usado_contratos_tenantId_idx" ON "venda_usado_contratos"("tenantId");
CREATE UNIQUE INDEX "venda_usado_contratos_tenantId_numero_key" ON "venda_usado_contratos"("tenantId", "numero");

ALTER TABLE "venda_usado_fechamentos" ADD CONSTRAINT "venda_usado_fechamentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_fechamentos" ADD CONSTRAINT "venda_usado_fechamentos_vendaUsadoId_fkey" FOREIGN KEY ("vendaUsadoId") REFERENCES "vendas_usado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_fechamentos" ADD CONSTRAINT "venda_usado_fechamentos_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "venda_usado_propostas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venda_usado_fechamentos" ADD CONSTRAINT "venda_usado_fechamentos_interessadoId_fkey" FOREIGN KEY ("interessadoId") REFERENCES "interessados_usado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venda_usado_fechamentos" ADD CONSTRAINT "venda_usado_fechamentos_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "venda_usado_documentos" ADD CONSTRAINT "venda_usado_documentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_documentos" ADD CONSTRAINT "venda_usado_documentos_fechamentoId_fkey" FOREIGN KEY ("fechamentoId") REFERENCES "venda_usado_fechamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_documentos" ADD CONSTRAINT "venda_usado_documentos_analistaId_fkey" FOREIGN KEY ("analistaId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "venda_usado_contratos" ADD CONSTRAINT "venda_usado_contratos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_contratos" ADD CONSTRAINT "venda_usado_contratos_fechamentoId_fkey" FOREIGN KEY ("fechamentoId") REFERENCES "venda_usado_fechamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_contratos" ADD CONSTRAINT "venda_usado_contratos_assinadoPorId_fkey" FOREIGN KEY ("assinadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
