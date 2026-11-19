CREATE TYPE "ImovelFinalidade" AS ENUM ('venda', 'aluguel', 'lancamento', 'sala_comercial');

ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'prospeccao_ativa';
ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'frio';
ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'qualificado';
ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'agendado';
ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'agendado_compra';
ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'agendado_venda';
ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'lead_aluguel';
ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'leads_em_potencial';

ALTER TABLE "imoveis" ADD COLUMN "finalidade" "ImovelFinalidade" NOT NULL DEFAULT 'venda';
ALTER TABLE "empreendimentos" ADD COLUMN "finalidade" "ImovelFinalidade" NOT NULL DEFAULT 'lancamento';

UPDATE "imoveis" SET "finalidade" = 'sala_comercial' WHERE "tipo"::text = 'sala_comercial';
