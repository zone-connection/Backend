-- Convert enum columns to free labels and migrate flags into tags.

ALTER TABLE "empreendimentos" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "empreendimentos"
SET "tags" = ARRAY_REMOVE(ARRAY[
  CASE WHEN "litoral" THEN 'Litoral' ELSE NULL END,
  CASE WHEN "aceitaFgts" THEN 'FGTS' ELSE NULL END,
  CASE WHEN "aceitaMcmv" THEN 'MCMV' ELSE NULL END,
  CASE WHEN "aceitaCaixa" THEN 'Caixa' ELSE NULL END
]::TEXT[], NULL);

ALTER TABLE "empreendimentos" DROP COLUMN "litoral";
ALTER TABLE "empreendimentos" DROP COLUMN "aceitaFgts";
ALTER TABLE "empreendimentos" DROP COLUMN "aceitaMcmv";
ALTER TABLE "empreendimentos" DROP COLUMN "aceitaCaixa";

ALTER TABLE "empreendimentos" ALTER COLUMN "tipo" TYPE TEXT USING (
  CASE "tipo"::text
    WHEN 'vertical' THEN 'Vertical'
    WHEN 'casa' THEN 'Casa'
    WHEN 'loteamento' THEN 'Loteamento'
    WHEN 'comercial' THEN 'Comercial'
    ELSE "tipo"::text
  END
);

ALTER TABLE "empreendimentos" ALTER COLUMN "status" TYPE TEXT USING (
  CASE "status"::text
    WHEN 'lancamento' THEN 'Lançamento'
    WHEN 'em_obras' THEN 'Em obras'
    WHEN 'pronto' THEN 'Pronto'
    ELSE "status"::text
  END
);

DROP TYPE "EmpreendimentoTipo";
DROP TYPE "EmpreendimentoStatus";

INSERT INTO "catalog_items" ("id", "tenantId", "type", "label", "slug", "color", "sortOrder", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid(), t."id", d.type, d.label, d.slug, d.color, d.sort_order, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN (
  VALUES
    ('empreendimento_tipo'::"CatalogType", 'Vertical', 'vertical', 'bg-blue-100 text-blue-700', 0),
    ('empreendimento_tipo'::"CatalogType", 'Casa', 'casa', 'bg-emerald-100 text-emerald-700', 1),
    ('empreendimento_tipo'::"CatalogType", 'Loteamento', 'loteamento', 'bg-amber-100 text-amber-700', 2),
    ('empreendimento_tipo'::"CatalogType", 'Comercial', 'comercial', 'bg-violet-100 text-violet-700', 3),
    ('empreendimento_status'::"CatalogType", 'Lançamento', 'lancamento', 'bg-sky-100 text-sky-700', 0),
    ('empreendimento_status'::"CatalogType", 'Em obras', 'em-obras', 'bg-orange-100 text-orange-700', 1),
    ('empreendimento_status'::"CatalogType", 'Pronto', 'pronto', 'bg-green-100 text-green-700', 2),
    ('empreendimento_tag'::"CatalogType", 'Litoral', 'litoral', 'bg-cyan-100 text-cyan-700', 0),
    ('empreendimento_tag'::"CatalogType", 'FGTS', 'fgts', 'bg-indigo-100 text-indigo-700', 1),
    ('empreendimento_tag'::"CatalogType", 'MCMV', 'mcmv', 'bg-teal-100 text-teal-700', 2),
    ('empreendimento_tag'::"CatalogType", 'Caixa', 'caixa', 'bg-slate-200 text-slate-700', 3)
) AS d(type, label, slug, color, sort_order)
ON CONFLICT ("tenantId", "type", "label") DO NOTHING;
