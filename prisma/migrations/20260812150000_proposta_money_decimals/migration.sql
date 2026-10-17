-- Parcela Caixa e renda do cliente passam a aceitar centavos.
ALTER TABLE "propostas"
  ALTER COLUMN "clienteRenda" TYPE DOUBLE PRECISION
  USING "clienteRenda"::DOUBLE PRECISION;

ALTER TABLE "propostas"
  ALTER COLUMN "parcelaCaixa" TYPE DOUBLE PRECISION
  USING "parcelaCaixa"::DOUBLE PRECISION;
