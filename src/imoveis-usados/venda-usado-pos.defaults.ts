export const POS_VENDA_PENDENCIAS_PADRAO: Array<{
  titulo: string;
  descricao: string;
  obrigatoria: boolean;
}> = [
  {
    titulo: 'Confirmar entrega das chaves',
    descricao: 'Registrar a entrega das chaves ao comprador.',
    obrigatoria: true,
  },
  {
    titulo: 'Orientar comprador',
    descricao: 'Passar as orientações finais da operação.',
    obrigatoria: true,
  },
  {
    titulo: 'Confirmar encerramento da operação',
    descricao: 'Conferir se a venda está encerrada na imobiliária.',
    obrigatoria: true,
  },
  {
    titulo: 'Contato de acompanhamento',
    descricao: 'Contato opcional após a conclusão da venda.',
    obrigatoria: false,
  },
];
