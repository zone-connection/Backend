-- Preferências de busca no lead/cliente (matching).
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "orcamentoMax" INTEGER,
  ADD COLUMN IF NOT EXISTS "quartosMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "vagasMin" INTEGER;

-- Valor e vagas no empreendimento (matching).
ALTER TABLE "empreendimentos"
  ADD COLUMN IF NOT EXISTS "vagas" INTEGER,
  ADD COLUMN IF NOT EXISTS "valorReferencia" INTEGER;

-- Notificação de imóvel compatível + vínculo ao empreendimento.
ALTER TYPE "NotificacaoTipo" ADD VALUE 'imovel_compativel';

ALTER TABLE "notificacoes"
  ADD COLUMN IF NOT EXISTS "empreendimentoId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notificacoes_empreendimentoId_fkey'
  ) THEN
    ALTER TABLE "notificacoes"
      ADD CONSTRAINT "notificacoes_empreendimentoId_fkey"
      FOREIGN KEY ("empreendimentoId")
      REFERENCES "empreendimentos"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "notificacoes_userId_empreendimentoId_tipo_eventoChave_idx"
  ON "notificacoes"("userId", "empreendimentoId", "tipo", "eventoChave");
