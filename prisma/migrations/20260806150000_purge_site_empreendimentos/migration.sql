-- Remove empreendimentos importados do site New Palace.
-- Cadastros manuais usam externalKey com prefixo "manual-".
-- FKs em leads/documentacoes/propostas usam ON DELETE SET NULL.

DELETE FROM "empreendimentos"
WHERE "externalKey" NOT LIKE 'manual-%'
   OR (
     "externalUrl" IS NOT NULL
     AND "externalUrl" ILIKE '%imobiliarianewpalace.com.br%'
   );
