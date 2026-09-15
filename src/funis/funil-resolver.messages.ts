import { FunilTipo } from '@prisma/client';

export const FUNIL_TIPO_LABEL: Record<FunilTipo, string> = {
  [FunilTipo.comercial]: 'Comercial',
  [FunilTipo.captacao]: 'Captação',
  [FunilTipo.venda_usados]: 'Venda de usados',
};

export function missingFunilMessage(tipo: FunilTipo): string {
  return `Não existe um funil de ${FUNIL_TIPO_LABEL[tipo]} configurado para esta operação.`;
}
