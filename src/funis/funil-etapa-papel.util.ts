import { FunilEtapaPapel } from '@prisma/client';

/** Slugs legados usados como fallback quando `papel` ainda não foi atribuído. */
export const LEGACY_PAPEL_BY_SLUG: Record<string, FunilEtapaPapel> = {
  novo: FunilEtapaPapel.inicial,
  'em-analise': FunilEtapaPapel.analise,
  'ganho-venda': FunilEtapaPapel.venda,
  venda: FunilEtapaPapel.venda,
  perdido: FunilEtapaPapel.perdido,
};

type EtapaPapelInput = {
  id: string;
  slug: string;
  papel: FunilEtapaPapel | null;
};

/**
 * Papel efetivo da etapa.
 * Fallback por slug legado só vale se nenhuma outra etapa do funil
 * já tiver esse papel gravado — senão a edição de papéis “não atualiza”.
 */
export function resolveEtapaPapel(
  etapa: EtapaPapelInput,
  siblings: Array<Pick<EtapaPapelInput, 'id' | 'papel'>> = [],
): FunilEtapaPapel | null {
  if (etapa.papel) return etapa.papel;
  const legacy = LEGACY_PAPEL_BY_SLUG[etapa.slug] ?? null;
  if (!legacy) return null;
  const ownedElsewhere = siblings.some(
    (s) => s.id !== etapa.id && s.papel === legacy,
  );
  if (ownedElsewhere) return null;
  return legacy;
}
