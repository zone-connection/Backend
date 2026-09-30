-- Follow-up vencido coloca o lead em atraso.
-- Tarefa registrada (contaAtraso = false) não coloca.
ALTER TABLE "agendamentos" ADD COLUMN "contaAtraso" BOOLEAN NOT NULL DEFAULT false;

-- Follow-ups já criados ao avançar etapa do funil continuam contando.
UPDATE "agendamentos"
SET "contaAtraso" = true
WHERE tipo = 'tarefa'
  AND observacoes LIKE 'Etapa do funil:%';
