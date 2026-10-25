-- A migration 20261023220000 alterou "venda_usados" (nome inexistente).
-- As colunas precisam existir em "vendas_usado".

ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'concluido';
ALTER TYPE "FunilTipo" ADD VALUE IF NOT EXISTS 'pos_venda';

ALTER TABLE "vendas_usado"
  ADD COLUMN IF NOT EXISTS "posVendaRecusadoEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "posVendaRecusadoPorId" TEXT;

ALTER TABLE "venda_usado_pos_vendas"
  ADD COLUMN IF NOT EXISTS "funilId" TEXT,
  ADD COLUMN IF NOT EXISTS "funilEtapaId" TEXT,
  ADD COLUMN IF NOT EXISTS "encaminhadoEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "encaminhadoPorId" TEXT,
  ADD COLUMN IF NOT EXISTS "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "lastStageChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "lastMovementAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "prazoDueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "alertaProximoAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendas_usado_posVendaRecusadoPorId_fkey'
  ) THEN
    ALTER TABLE "vendas_usado"
      ADD CONSTRAINT "vendas_usado_posVendaRecusadoPorId_fkey"
      FOREIGN KEY ("posVendaRecusadoPorId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venda_usado_pos_vendas_funilId_fkey'
  ) THEN
    ALTER TABLE "venda_usado_pos_vendas"
      ADD CONSTRAINT "venda_usado_pos_vendas_funilId_fkey"
      FOREIGN KEY ("funilId") REFERENCES "funis"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venda_usado_pos_vendas_funilEtapaId_fkey'
  ) THEN
    ALTER TABLE "venda_usado_pos_vendas"
      ADD CONSTRAINT "venda_usado_pos_vendas_funilEtapaId_fkey"
      FOREIGN KEY ("funilEtapaId") REFERENCES "funil_etapas"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venda_usado_pos_vendas_encaminhadoPorId_fkey'
  ) THEN
    ALTER TABLE "venda_usado_pos_vendas"
      ADD CONSTRAINT "venda_usado_pos_vendas_encaminhadoPorId_fkey"
      FOREIGN KEY ("encaminhadoPorId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "venda_usado_pos_vendas_tenantId_funilEtapaId_idx"
  ON "venda_usado_pos_vendas"("tenantId", "funilEtapaId");
CREATE INDEX IF NOT EXISTS "venda_usado_pos_vendas_tenantId_responsavelId_idx"
  ON "venda_usado_pos_vendas"("tenantId", "responsavelId");
