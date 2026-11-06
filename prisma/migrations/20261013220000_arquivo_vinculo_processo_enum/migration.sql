-- Garante o valor mesmo se a migration anterior não tiver aplicado o ADD VALUE
-- (PostgreSQL não deixa usar um enum novo na mesma transação em alguns casos).
ALTER TYPE "ArquivoVinculoTipo" ADD VALUE IF NOT EXISTS 'processo';
