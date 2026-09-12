export function textoCriacao(autorNome: string): string {
  return `${autorNome} criou a captação.`;
}

export function textoEtapa(
  autorNome: string,
  de: string,
  para: string,
): string {
  return `${autorNome} alterou:\n${de} → ${para}`;
}

export function textoResponsavel(novoNome: string): string {
  return `${novoNome} assumiu a captação.`;
}

export function textoValorPretendido(): string {
  return 'Valor pretendido alterado.';
}

export function textoValorAvaliacao(): string {
  return 'Valor de avaliação alterado.';
}

export function textoExclusividade(exclusividade: boolean): string {
  return `Exclusividade alterada para ${exclusividade ? 'Sim' : 'Não'}.`;
}

export function textoEdicao(autorNome: string): string {
  return `${autorNome} atualizou a captação.`;
}
