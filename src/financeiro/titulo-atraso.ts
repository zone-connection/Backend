/** Encargos de mora alinhados ao contrato: multa 2% + juros 1% a.m. pro rata. */

export const ATRASO_MULTA = 0.02;
export const ATRASO_JUROS_MES = 0.01;
export const ATRASO_DIAS_MES = 30;

export type EncargosAtraso = {
  diasAtraso: number;
  multa: number;
  juros: number;
  valorAtraso: number;
  valorAtualizado: number;
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = toIso.slice(0, 10).split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function calcularEncargosAtraso(
  valor: number,
  vencimentoIso: string,
  referenciaIso: string,
): EncargosAtraso {
  const principal = Number(valor) || 0;
  const diasAtraso = daysBetweenIso(vencimentoIso, referenciaIso);
  if (diasAtraso <= 0 || principal <= 0) {
    return {
      diasAtraso: 0,
      multa: 0,
      juros: 0,
      valorAtraso: 0,
      valorAtualizado: round2(principal),
    };
  }
  const multa = round2(principal * ATRASO_MULTA);
  const juros = round2(
    principal * ATRASO_JUROS_MES * (diasAtraso / ATRASO_DIAS_MES),
  );
  const valorAtraso = round2(multa + juros);
  return {
    diasAtraso,
    multa,
    juros,
    valorAtraso,
    valorAtualizado: round2(principal + valorAtraso),
  };
}
