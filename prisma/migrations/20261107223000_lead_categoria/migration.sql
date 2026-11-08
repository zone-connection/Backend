CREATE TYPE "LeadCategoria" AS ENUM ('aluguel', 'potencial');

ALTER TABLE "leads" ADD COLUMN "categoria" "LeadCategoria";
