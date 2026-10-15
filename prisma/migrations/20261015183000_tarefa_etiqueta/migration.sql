CREATE TYPE "TarefaEtiqueta" AS ENUM ('cliente', 'ligacao', 'documentos', 'captacao', 'interna', 'followup', 'contrato');

ALTER TABLE "Tarefa" ADD COLUMN "etiqueta" "TarefaEtiqueta" NOT NULL DEFAULT 'documentos';

UPDATE "Tarefa" SET "etiqueta" = CASE "tipo"
  WHEN 'ligacao' THEN 'ligacao'::"TarefaEtiqueta"
  WHEN 'visita' THEN 'captacao'::"TarefaEtiqueta"
  WHEN 'reuniao' THEN 'cliente'::"TarefaEtiqueta"
  WHEN 'outro' THEN 'contrato'::"TarefaEtiqueta"
  WHEN 'bloqueio' THEN 'interna'::"TarefaEtiqueta"
  WHEN 'retirada_chave' THEN 'followup'::"TarefaEtiqueta"
  ELSE 'documentos'::"TarefaEtiqueta"
END;
