-- Logo única da construtora e galeria (máx. 2) do empreendimento.

ALTER TABLE "construtoras" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "construtoras" ADD COLUMN "logoPublicId" TEXT;

ALTER TABLE "empreendimentos" ADD COLUMN "imagens" JSONB NOT NULL DEFAULT '[]';

UPDATE "empreendimentos"
SET "imagens" = jsonb_build_array(
  jsonb_build_object('url', "imagemUrl", 'publicId', '')
)
WHERE "imagemUrl" IS NOT NULL AND btrim("imagemUrl") <> '';
