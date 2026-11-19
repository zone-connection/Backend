-- Converte pré-chaves, pós-chaves e intercaladas de valor único para lista.
ALTER TABLE "propostas"
  ALTER COLUMN "preChaves" DROP DEFAULT,
  ALTER COLUMN "posChaves" DROP DEFAULT,
  ALTER COLUMN "intercaladas" DROP DEFAULT;

ALTER TABLE "propostas"
  ALTER COLUMN "preChaves" TYPE INTEGER[]
  USING (
    CASE
      WHEN "preChaves" IS NULL THEN ARRAY[]::INTEGER[]
      ELSE ARRAY["preChaves"]::INTEGER[]
    END
  ),
  ALTER COLUMN "posChaves" TYPE INTEGER[]
  USING (
    CASE
      WHEN "posChaves" IS NULL THEN ARRAY[]::INTEGER[]
      ELSE ARRAY["posChaves"]::INTEGER[]
    END
  ),
  ALTER COLUMN "intercaladas" TYPE INTEGER[]
  USING (
    CASE
      WHEN "intercaladas" IS NULL THEN ARRAY[]::INTEGER[]
      ELSE ARRAY["intercaladas"]::INTEGER[]
    END
  );

ALTER TABLE "propostas"
  ALTER COLUMN "preChaves" SET DEFAULT ARRAY[]::INTEGER[],
  ALTER COLUMN "posChaves" SET DEFAULT ARRAY[]::INTEGER[],
  ALTER COLUMN "intercaladas" SET DEFAULT ARRAY[]::INTEGER[];

ALTER TABLE "propostas"
  ALTER COLUMN "preChaves" SET NOT NULL,
  ALTER COLUMN "posChaves" SET NOT NULL,
  ALTER COLUMN "intercaladas" SET NOT NULL;
