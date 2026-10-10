export type StageRef = { slug: string; label: string };

export type StageHop = {
  fromSlug: string;
  fromLabel: string;
  toSlug: string;
  toLabel: string;
};

const AUTO_AVANCO = /^Etapa avançada de ".+" para ".+"\.$/;

export function isAutoAvancoTexto(texto: string) {
  return AUTO_AVANCO.test(texto.trim());
}

export function hopAutoTexto(hop: StageHop) {
  return `Etapa avançada de "${hop.fromLabel}" para "${hop.toLabel}".`;
}

/** Saltos para frente no funil. Recuo ou etapa fora da ordem vira um único salto. */
export function forwardStageHops(
  stages: StageRef[],
  fromSlug: string,
  toSlug: string,
): StageHop[] {
  if (!fromSlug || !toSlug || fromSlug === toSlug) return [];

  const fromIndex = stages.findIndex((s) => s.slug === fromSlug);
  const toIndex = stages.findIndex((s) => s.slug === toSlug);
  const fromLabel = fromIndex >= 0 ? stages[fromIndex].label : fromSlug;
  const toLabel = toIndex >= 0 ? stages[toIndex].label : toSlug;

  if (fromIndex < 0 || toIndex < 0 || toIndex <= fromIndex) {
    return [{ fromSlug, fromLabel, toSlug, toLabel }];
  }

  const hops: StageHop[] = [];
  for (let i = fromIndex; i < toIndex; i++) {
    hops.push({
      fromSlug: stages[i].slug,
      fromLabel: stages[i].label,
      toSlug: stages[i + 1].slug,
      toLabel: stages[i + 1].label,
    });
  }
  return hops;
}
