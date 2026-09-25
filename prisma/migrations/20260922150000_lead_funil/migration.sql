-- Cada lead fica preso a um funil comercial. Trocar o funil em uso não mistura os cards.

ALTER TABLE "leads" ADD COLUMN "funilId" TEXT;

-- Um único funil por imobiliária: o comercial em uso (o mais recente, se houver mais de um ativo).
-- Não altera etapa, nome, ordem nem qual funil está ativo.
UPDATE "leads" AS l
SET "funilId" = chosen."id"
FROM (
  SELECT DISTINCT ON ("tenantId") "id", "tenantId"
  FROM "funis"
  WHERE "tipo" = 'comercial' AND "ativo" = true
  ORDER BY "tenantId", "updatedAt" DESC, "createdAt" ASC
) AS chosen
WHERE l."funilId" IS NULL
  AND chosen."tenantId" = l."tenantId";

UPDATE "leads" AS l
SET "funilId" = sub."id"
FROM (
  SELECT DISTINCT ON ("tenantId") "id", "tenantId"
  FROM "funis"
  WHERE "tipo" = 'comercial'
  ORDER BY "tenantId", "createdAt" ASC
) AS sub
WHERE l."funilId" IS NULL
  AND sub."tenantId" = l."tenantId";

-- Só cria funil quando a imobiliária não tem nenhum comercial.
-- O nome não pode colidir com um funil que já existe (a migration inteira cairia).
-- A etapa nova vai só nesse funil criado agora, não num funil antigo com o mesmo nome.
WITH alvos AS (
  SELECT l."tenantId"
  FROM "leads" l
  WHERE l."funilId" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "funis" f
      WHERE f."tenantId" = l."tenantId" AND f."tipo" = 'comercial'
    )
  GROUP BY l."tenantId"
),
novos AS (
  INSERT INTO "funis" ("id", "tenantId", "name", "ativo", "tipo", "createdAt", "updatedAt")
  SELECT
    gen_random_uuid()::text,
    a."tenantId",
    CASE
      WHEN EXISTS (
        SELECT 1 FROM "funis" x
        WHERE x."tenantId" = a."tenantId" AND x."name" = 'Comercial (leads)'
      )
      THEN 'Comercial (leads) ' || substr(md5(a."tenantId"), 1, 8)
      ELSE 'Comercial (leads)'
    END,
    true,
    'comercial',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM alvos a
  RETURNING "id", "tenantId"
),
etapas AS (
  INSERT INTO "funil_etapas" (
    "id", "funilId", "label", "slug", "color", "sortOrder", "active", "papel", "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    n."id",
    'Novo lead',
    'novo',
    'bg-slate-200 text-slate-700',
    0,
    true,
    'inicial',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM novos n
  RETURNING "funilId"
)
UPDATE "leads" AS l
SET "funilId" = n."id"
FROM novos n
WHERE l."funilId" IS NULL
  AND l."tenantId" = n."tenantId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "leads" WHERE "funilId" IS NULL) THEN
    RAISE EXCEPTION 'Ainda há leads sem funil comercial.';
  END IF;
END $$;

ALTER TABLE "leads" ALTER COLUMN "funilId" SET NOT NULL;

CREATE INDEX "leads_funilId_idx" ON "leads"("funilId");
CREATE INDEX "leads_tenantId_funilId_idx" ON "leads"("tenantId", "funilId");

ALTER TABLE "leads" ADD CONSTRAINT "leads_funilId_fkey"
  FOREIGN KEY ("funilId") REFERENCES "funis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
