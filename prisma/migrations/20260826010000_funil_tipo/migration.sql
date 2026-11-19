-- Tipo de operação do funil + um ativo por (tenant, tipo)

CREATE TYPE "FunilTipo" AS ENUM ('comercial', 'captacao', 'venda_usados');

ALTER TABLE "funis" ADD COLUMN "tipo" "FunilTipo" NOT NULL DEFAULT 'comercial';

CREATE INDEX "funis_tenantId_tipo_idx" ON "funis"("tenantId", "tipo");

-- Se houver mais de um funil ativo no tenant (legado), mantém o mais antigo e
-- desativa os demais. Não apaga registros.
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "funis"
  WHERE ativo = true
)
UPDATE "funis"
SET ativo = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Funil padrão de captação (um ativo por tenant, se ainda não existir o tipo)
INSERT INTO "funis" ("id", "tenantId", "name", "tipo", "ativo", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  t."id",
  CASE
    WHEN EXISTS (
      SELECT 1 FROM "funis" f
      WHERE f."tenantId" = t."id" AND f."name" = 'Funil de Captação'
    ) THEN 'Funil de Captação (padrão)'
    ELSE 'Funil de Captação'
  END,
  'captacao',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "funis" f
  WHERE f."tenantId" = t."id" AND f."tipo" = 'captacao'
);

INSERT INTO "funil_etapas" (
  "id", "funilId", "label", "slug", "color", "sortOrder", "active", "papel",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  f."id",
  s.label,
  s.slug,
  s.color,
  s.sort_order,
  true,
  s.papel,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "funis" f
CROSS JOIN (
  VALUES
    ('Novo proprietário', 'novo-proprietario', 'bg-slate-200 text-slate-700', 0, 'inicial'::"FunilEtapaPapel"),
    ('Primeiro contato', 'primeiro-contato', 'bg-blue-100 text-blue-700', 1, NULL::"FunilEtapaPapel"),
    ('Avaliação', 'avaliacao', 'bg-indigo-100 text-indigo-700', 2, NULL::"FunilEtapaPapel"),
    ('Negociação', 'negociacao-captacao', 'bg-amber-100 text-amber-700', 3, NULL::"FunilEtapaPapel"),
    ('Aguardando documentação', 'aguardando-documentacao', 'bg-violet-100 text-violet-700', 4, NULL::"FunilEtapaPapel"),
    ('Captação aprovada', 'captacao-aprovada', 'bg-teal-100 text-teal-700', 5, NULL::"FunilEtapaPapel"),
    ('Imóvel captado', 'imovel-captado', 'bg-green-200 text-green-800', 6, 'venda'::"FunilEtapaPapel"),
    ('Captação perdida', 'captacao-perdida', 'bg-red-100 text-red-700', 7, 'perdido'::"FunilEtapaPapel")
) AS s(label, slug, color, sort_order, papel)
WHERE f."tipo" = 'captacao'
  AND NOT EXISTS (
    SELECT 1 FROM "funil_etapas" e WHERE e."funilId" = f."id"
  );

-- Funil padrão de venda de usados
INSERT INTO "funis" ("id", "tenantId", "name", "tipo", "ativo", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  t."id",
  CASE
    WHEN EXISTS (
      SELECT 1 FROM "funis" f
      WHERE f."tenantId" = t."id" AND f."name" = 'Funil de Venda de Usados'
    ) THEN 'Funil de Venda de Usados (padrão)'
    ELSE 'Funil de Venda de Usados'
  END,
  'venda_usados',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "funis" f
  WHERE f."tenantId" = t."id" AND f."tipo" = 'venda_usados'
);

INSERT INTO "funil_etapas" (
  "id", "funilId", "label", "slug", "color", "sortOrder", "active", "papel",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  f."id",
  s.label,
  s.slug,
  s.color,
  s.sort_order,
  true,
  s.papel,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "funis" f
CROSS JOIN (
  VALUES
    ('Novo interessado', 'novo-interessado', 'bg-slate-200 text-slate-700', 0, 'inicial'::"FunilEtapaPapel"),
    ('Qualificação', 'qualificacao-usados', 'bg-indigo-100 text-indigo-700', 1, NULL::"FunilEtapaPapel"),
    ('Imóvel apresentado', 'imovel-apresentado', 'bg-blue-100 text-blue-700', 2, NULL::"FunilEtapaPapel"),
    ('Visita agendada', 'visita-agendada-usados', 'bg-cyan-100 text-cyan-700', 3, NULL::"FunilEtapaPapel"),
    ('Visita realizada', 'visita-realizada-usados', 'bg-teal-100 text-teal-700', 4, NULL::"FunilEtapaPapel"),
    ('Proposta', 'proposta-usados', 'bg-amber-100 text-amber-700', 5, NULL::"FunilEtapaPapel"),
    ('Negociação', 'negociacao-usados', 'bg-orange-100 text-orange-700', 6, NULL::"FunilEtapaPapel"),
    ('Venda', 'venda-usados', 'bg-green-200 text-green-800', 7, 'venda'::"FunilEtapaPapel"),
    ('Perdido', 'perdido-usados', 'bg-red-100 text-red-700', 8, 'perdido'::"FunilEtapaPapel")
) AS s(label, slug, color, sort_order, papel)
WHERE f."tipo" = 'venda_usados'
  AND NOT EXISTS (
    SELECT 1 FROM "funil_etapas" e WHERE e."funilId" = f."id"
  );

CREATE UNIQUE INDEX "funis_tenantId_tipo_one_active"
  ON "funis" ("tenantId", "tipo")
  WHERE "ativo" = true;
