-- TriagemEvent: rastro da última edição do relato
ALTER TABLE "triagem_events"
  ADD COLUMN IF NOT EXISTS "textoAnterior" TEXT,
  ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
