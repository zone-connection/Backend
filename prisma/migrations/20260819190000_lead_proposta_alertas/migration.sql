-- Alertas: lead sem atendimento e proposta próxima do vencimento.
ALTER TYPE "NotificacaoTipo" ADD VALUE 'lead_sem_atendimento';
ALTER TYPE "NotificacaoTipo" ADD VALUE 'proposta_vencimento_proximo';

ALTER TABLE "notificacoes"
  ADD COLUMN IF NOT EXISTS "propostaId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notificacoes_propostaId_fkey'
  ) THEN
    ALTER TABLE "notificacoes"
      ADD CONSTRAINT "notificacoes_propostaId_fkey"
      FOREIGN KEY ("propostaId")
      REFERENCES "propostas"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "notificacoes_userId_propostaId_tipo_eventoChave_idx"
  ON "notificacoes"("userId", "propostaId", "tipo", "eventoChave");

CREATE INDEX IF NOT EXISTS "propostas_validade_idx"
  ON "propostas"("validade");
