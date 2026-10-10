-- Controle de chaves do imóvel e pós-venda da VendaUsado (sem arquivos/financeiro).

ALTER TYPE "VendaUsadoHistoricoTipo" ADD VALUE IF NOT EXISTS 'chave';
ALTER TYPE "VendaUsadoHistoricoTipo" ADD VALUE IF NOT EXISTS 'pos_venda';

CREATE TYPE "ImovelChaveStatus" AS ENUM ('disponivel', 'retirada', 'devolvida', 'perdida', 'inativa');
CREATE TYPE "ImovelChaveLocalizacao" AS ENUM ('imobiliaria', 'corretor', 'proprietario', 'comprador', 'portaria', 'caixa', 'outro');
CREATE TYPE "ImovelChaveMovimentoTipo" AS ENUM (
  'criacao',
  'edicao',
  'retirada',
  'devolucao',
  'perda',
  'reativacao',
  'localizacao',
  'responsavel',
  'entrega_comprador'
);
CREATE TYPE "VendaUsadoPosVendaStatus" AS ENUM (
  'pendente',
  'em_andamento',
  'aguardando_pendencia',
  'concluido',
  'cancelado'
);
CREATE TYPE "VendaUsadoPosVendaPendenciaStatus" AS ENUM ('pendente', 'em_andamento', 'concluida', 'cancelada');

CREATE TABLE "imovel_chaves" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "imovelId" TEXT NOT NULL,
  "identificacao" TEXT NOT NULL,
  "quantidade" INTEGER NOT NULL DEFAULT 1,
  "quantidadeRetirada" INTEGER NOT NULL DEFAULT 0,
  "status" "ImovelChaveStatus" NOT NULL DEFAULT 'disponivel',
  "localizacaoAtual" "ImovelChaveLocalizacao" NOT NULL DEFAULT 'imobiliaria',
  "responsavelAtualId" TEXT,
  "observacoes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "imovel_chaves_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "imovel_chave_movimentos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "chaveId" TEXT NOT NULL,
  "tipo" "ImovelChaveMovimentoTipo" NOT NULL,
  "quantidade" INTEGER NOT NULL DEFAULT 1,
  "motivo" TEXT NOT NULL DEFAULT '',
  "observacao" TEXT NOT NULL DEFAULT '',
  "localizacao" "ImovelChaveLocalizacao",
  "responsavelId" TEXT,
  "vendaUsadoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "imovel_chave_movimentos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venda_usado_pos_vendas" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vendaUsadoId" TEXT NOT NULL,
  "imovelId" TEXT NOT NULL,
  "interessadoId" TEXT NOT NULL,
  "proprietarioId" TEXT NOT NULL,
  "responsavelId" TEXT NOT NULL,
  "status" "VendaUsadoPosVendaStatus" NOT NULL DEFAULT 'pendente',
  "observacoes" TEXT NOT NULL DEFAULT '',
  "concluidoAt" TIMESTAMP(3),
  "canceladoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venda_usado_pos_vendas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venda_usado_pos_venda_pendencias" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "posVendaId" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL DEFAULT '',
  "status" "VendaUsadoPosVendaPendenciaStatus" NOT NULL DEFAULT 'pendente',
  "obrigatoria" BOOLEAN NOT NULL DEFAULT false,
  "responsavelId" TEXT,
  "prazo" TIMESTAMP(3),
  "concluidaEm" TIMESTAMP(3),
  "observacao" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venda_usado_pos_venda_pendencias_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "imovel_chaves_tenantId_imovelId_idx" ON "imovel_chaves"("tenantId", "imovelId");
CREATE INDEX "imovel_chaves_tenantId_status_idx" ON "imovel_chaves"("tenantId", "status");
CREATE INDEX "imovel_chave_movimentos_tenantId_chaveId_idx" ON "imovel_chave_movimentos"("tenantId", "chaveId");
CREATE INDEX "imovel_chave_movimentos_chaveId_createdAt_idx" ON "imovel_chave_movimentos"("chaveId", "createdAt");
CREATE UNIQUE INDEX "venda_usado_pos_vendas_vendaUsadoId_key" ON "venda_usado_pos_vendas"("vendaUsadoId");
CREATE INDEX "venda_usado_pos_vendas_tenantId_status_idx" ON "venda_usado_pos_vendas"("tenantId", "status");
CREATE INDEX "venda_usado_pos_venda_pendencias_tenantId_posVendaId_idx" ON "venda_usado_pos_venda_pendencias"("tenantId", "posVendaId");
CREATE INDEX "venda_usado_pos_venda_pendencias_posVendaId_status_idx" ON "venda_usado_pos_venda_pendencias"("posVendaId", "status");

ALTER TABLE "imovel_chaves" ADD CONSTRAINT "imovel_chaves_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imovel_chaves" ADD CONSTRAINT "imovel_chaves_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imovel_chaves" ADD CONSTRAINT "imovel_chaves_responsavelAtualId_fkey" FOREIGN KEY ("responsavelAtualId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "imovel_chave_movimentos" ADD CONSTRAINT "imovel_chave_movimentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imovel_chave_movimentos" ADD CONSTRAINT "imovel_chave_movimentos_chaveId_fkey" FOREIGN KEY ("chaveId") REFERENCES "imovel_chaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imovel_chave_movimentos" ADD CONSTRAINT "imovel_chave_movimentos_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "imovel_chave_movimentos" ADD CONSTRAINT "imovel_chave_movimentos_vendaUsadoId_fkey" FOREIGN KEY ("vendaUsadoId") REFERENCES "vendas_usado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "venda_usado_pos_vendas" ADD CONSTRAINT "venda_usado_pos_vendas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_pos_vendas" ADD CONSTRAINT "venda_usado_pos_vendas_vendaUsadoId_fkey" FOREIGN KEY ("vendaUsadoId") REFERENCES "vendas_usado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_pos_vendas" ADD CONSTRAINT "venda_usado_pos_vendas_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venda_usado_pos_vendas" ADD CONSTRAINT "venda_usado_pos_vendas_interessadoId_fkey" FOREIGN KEY ("interessadoId") REFERENCES "interessados_usado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venda_usado_pos_vendas" ADD CONSTRAINT "venda_usado_pos_vendas_proprietarioId_fkey" FOREIGN KEY ("proprietarioId") REFERENCES "proprietarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venda_usado_pos_vendas" ADD CONSTRAINT "venda_usado_pos_vendas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "venda_usado_pos_venda_pendencias" ADD CONSTRAINT "venda_usado_pos_venda_pendencias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_pos_venda_pendencias" ADD CONSTRAINT "venda_usado_pos_venda_pendencias_posVendaId_fkey" FOREIGN KEY ("posVendaId") REFERENCES "venda_usado_pos_vendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_pos_venda_pendencias" ADD CONSTRAINT "venda_usado_pos_venda_pendencias_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
