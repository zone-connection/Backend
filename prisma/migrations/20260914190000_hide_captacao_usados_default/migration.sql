-- Captação e venda de usados só aparecem quando o admin liga em Configurações.
UPDATE "tenants"
SET "modules" = jsonb_set(
  jsonb_set(
    COALESCE("modules", '{}'::jsonb),
    '{captacao}',
    'false'::jsonb,
    true
  ),
  '{imoveisUsados}',
  'false'::jsonb,
  true
);
