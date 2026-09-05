export const PERIODO_GRANULARIDADES = [
  "mes",
  "bimestre",
  "trimestre",
  "semestre",
  "anual",
] as const;

export type PeriodoGranularidade = (typeof PERIODO_GRANULARIDADES)[number];

const DURACAO_MESES: Record<PeriodoGranularidade, number> = {
  mes: 1,
  bimestre: 2,
  trimestre: 3,
  semestre: 6,
  anual: 12,
};

const BRASIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

export function duracaoMesesGranularidade(
  granularidade: PeriodoGranularidade,
) {
  return DURACAO_MESES[granularidade];
}

/** Mês 1–12 alinhado ao início do recorte (ex.: junho + trimestre → abril). */
export function snapMesInicio(
  mes: number,
  granularidade: PeriodoGranularidade,
) {
  const duracao = DURACAO_MESES[granularidade];
  const mes1 = Math.min(12, Math.max(1, Math.trunc(mes) || 1));
  return Math.floor((mes1 - 1) / duracao) * duracao + 1;
}

export function janelaPeriodoBrasil(opts: {
  mes?: number;
  ano?: number;
  granularidade?: PeriodoGranularidade;
  now?: Date;
}) {
  const now = opts.now ?? new Date();
  const brasil = new Date(now.getTime() - BRASIL_UTC_OFFSET_MS);
  const realY = brasil.getUTCFullYear();
  const realM = brasil.getUTCMonth();
  const granularidade = opts.granularidade ?? "mes";
  const ano = opts.ano ?? realY;
  const mesInicio = snapMesInicio(opts.mes ?? realM + 1, granularidade);
  const duracaoMeses = DURACAO_MESES[granularidade];
  const start0 = mesInicio - 1;

  const toInstant = (y: number, monthIndex: number) =>
    new Date(Date.UTC(y, monthIndex, 1) + BRASIL_UTC_OFFSET_MS);

  const inicio = toInstant(ano, start0);
  const fim = toInstant(ano, start0 + duracaoMeses);
  const anteriorInicio = toInstant(ano, start0 - duracaoMeses);

  return {
    granularidade,
    ano,
    mesInicio,
    duracaoMeses,
    atual: { inicio, fim },
    anterior: { inicio: anteriorInicio, fim: inicio },
  };
}
