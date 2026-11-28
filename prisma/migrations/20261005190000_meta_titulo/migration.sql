-- User-defined title for commercial goals.
ALTER TABLE "metas" ADD COLUMN IF NOT EXISTS "titulo" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "metas_corretor_unique";
DROP INDEX IF EXISTS "metas_gerente_unique";
DROP INDEX IF EXISTS "metas_imobiliaria_unique";

CREATE UNIQUE INDEX "metas_corretor_unique"
  ON "metas"("corretorId", "origem", "tipo", "periodo", "inicio", "titulo")
  WHERE "escopo" = 'corretor' AND "corretorId" IS NOT NULL;

CREATE UNIQUE INDEX "metas_gerente_unique"
  ON "metas"("tenantId", "gerenteId", "origem", "tipo", "periodo", "inicio", "titulo")
  WHERE "escopo" = 'gerente' AND "gerenteId" IS NOT NULL;

CREATE UNIQUE INDEX "metas_imobiliaria_unique"
  ON "metas"("tenantId", "origem", "tipo", "periodo", "inicio", "titulo")
  WHERE "escopo" = 'imobiliaria';
