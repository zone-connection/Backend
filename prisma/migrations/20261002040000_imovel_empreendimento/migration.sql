ALTER TABLE "imoveis" ADD COLUMN "empreendimentoId" TEXT;

INSERT INTO "empreendimentos" (
  "id",
  "tenantId",
  "nome",
  "cidade",
  "endereco",
  "tipo",
  "quartos",
  "banheiros",
  "vagas",
  "areaM2",
  "observacao",
  "imagemUrl",
  "imagens",
  "externalKey",
  "tags",
  "ativo",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  i."tenantId",
  LEFT(
    COALESCE(
      NULLIF(
        concat_ws(
          ' — ',
          CASE i.tipo
            WHEN 'apartamento' THEN 'Apartamento'
            WHEN 'casa' THEN 'Casa'
            WHEN 'terreno' THEN 'Terreno'
            WHEN 'sala_comercial' THEN 'Sala comercial'
            WHEN 'loja' THEN 'Loja'
            WHEN 'galpao' THEN 'Galpão'
            WHEN 'fazenda' THEN 'Fazenda'
            WHEN 'chacara' THEN 'Chácara'
            ELSE 'Outro'
          END,
          NULLIF(
            concat_ws(
              ', ',
              NULLIF(btrim(i.logradouro), ''),
              NULLIF(btrim(i.numero), '')
            ),
            ''
          )
        ),
        ''
      ),
      'Imóvel'
    ),
    180
  ),
  NULLIF(btrim(i.cidade), ''),
  NULLIF(
    concat_ws(
      ', ',
      NULLIF(btrim(i.logradouro), ''),
      NULLIF(btrim(i.numero), ''),
      NULLIF(btrim(i.complemento), ''),
      NULLIF(btrim(i.bairro), '')
    ),
    ''
  ),
  CASE i.tipo
    WHEN 'apartamento' THEN 'Apartamento'
    WHEN 'casa' THEN 'Casa'
    WHEN 'terreno' THEN 'Terreno'
    WHEN 'sala_comercial' THEN 'Sala comercial'
    WHEN 'loja' THEN 'Loja'
    WHEN 'galpao' THEN 'Galpão'
    WHEN 'fazenda' THEN 'Fazenda'
    WHEN 'chacara' THEN 'Chácara'
    ELSE 'Outro'
  END,
  i.quartos,
  i.banheiros,
  i.vagas,
  i.area::double precision,
  NULLIF(COALESCE(NULLIF(btrim(i.descricao), ''), NULLIF(btrim(i.observacoes), '')), ''),
  i."fotoUrl",
  CASE
    WHEN i."fotoUrl" IS NULL OR btrim(i."fotoUrl") = '' THEN '[]'::jsonb
    ELSE jsonb_build_array(
      jsonb_build_object('url', i."fotoUrl", 'publicId', COALESCE(i."fotoPublicId", ''))
    )
  END,
  'captacao-imovel-' || i.id,
  ARRAY['Captação']::text[],
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "imoveis" i
WHERE NOT EXISTS (
  SELECT 1
  FROM "empreendimentos" e
  WHERE e."tenantId" = i."tenantId"
    AND e."externalKey" = 'captacao-imovel-' || i.id
);

UPDATE "imoveis" i
SET "empreendimentoId" = e.id
FROM "empreendimentos" e
WHERE e."tenantId" = i."tenantId"
  AND e."externalKey" = 'captacao-imovel-' || i.id
  AND i."empreendimentoId" IS NULL;

CREATE UNIQUE INDEX "imoveis_empreendimentoId_key" ON "imoveis"("empreendimentoId");

ALTER TABLE "imoveis"
ADD CONSTRAINT "imoveis_empreendimentoId_fkey"
FOREIGN KEY ("empreendimentoId") REFERENCES "empreendimentos"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
