UPDATE "funil_etapas" AS etapa
SET "papel" = 'captado'
FROM "funis" AS funil
WHERE etapa."funilId" = funil."id"
  AND funil."tipo" = 'captacao'
  AND etapa."papel" = 'venda';
