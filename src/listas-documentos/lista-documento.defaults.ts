export const LISTA_DOCUMENTO_INTRO =
  "Confira abaixo a lista de documentos necessários para a análise de crédito no financiamento da Caixa Econômica Federal, no programa Minha Casa Minha Vida.";

export const LISTA_DOCUMENTO_AVISO =
  "A lista de documentos pode ser complementada pela Caixa Econômica Federal durante a análise de crédito, conforme o perfil do cliente e a operação de financiamento.";

const IDENTIFICACAO = [
  {
    titulo: "RG ou CNH",
    descricao: "Documento de identificação do titular.",
  },
  {
    titulo: "CPF",
    descricao: "Cadastro de Pessoa Física do titular.",
  },
  {
    titulo: "Comprovante de residência",
    descricao:
      "Pode ser conta de água, luz, telefone ou outro documento oficial em nome do titular.",
  },
  {
    titulo: "Certidão de estado civil",
    descricao:
      "Certidão de nascimento, casamento, casamento com averbação (divorciado) ou óbito, conforme o caso.",
  },
];

export const LISTAS_DOCUMENTO_PADRAO: Array<{
  chave: string;
  nome: string;
  sortOrder: number;
  itens: Array<{ titulo: string; descricao: string }>;
}> = [
  {
    chave: "clt",
    nome: "CLT",
    sortOrder: 0,
    itens: [
      ...IDENTIFICACAO,
      {
        titulo: "3 últimos contracheques / holerites",
        descricao: "Comprovantes de pagamento dos últimos três meses.",
      },
      {
        titulo: "CTPS",
        descricao: "Carteira de Trabalho e Previdência Social (física ou digital).",
      },
      {
        titulo: "Declaração de Imposto de Renda + recibo",
        descricao: "Quando aplicável.",
      },
      {
        titulo: "Extrato do FGTS",
        descricao: "Se utilizar o FGTS no financiamento.",
      },
    ],
  },
  {
    chave: "autonomo",
    nome: "Autônomo / Profissional Liberal",
    sortOrder: 1,
    itens: [
      ...IDENTIFICACAO,
      {
        titulo: "Declaração de Imposto de Renda + recibo",
        descricao: "Declaração completa e o recibo de entrega.",
      },
      {
        titulo: "Extratos bancários",
        descricao: "Movimentação da conta usada para comprovar a renda.",
      },
      {
        titulo: "Comprovantes de recebimentos",
        descricao: "Recibos, notas ou transferências que comprovem os ganhos.",
      },
      {
        titulo: "Comprovante de atividade profissional",
        descricao: "Documento que demonstre o exercício da atividade.",
      },
      {
        titulo: "Registro de autônomo / inscrição municipal",
        descricao: "Quando aplicável.",
      },
      {
        titulo: "Contrato social",
        descricao: "Se possuir empresa.",
      },
      {
        titulo: "CCMEI / DASN-SIMEI",
        descricao: "Se for MEI.",
      },
    ],
  },
  {
    chave: "pensionista",
    nome: "Pensionista / Aposentado",
    sortOrder: 2,
    itens: [
      ...IDENTIFICACAO,
      {
        titulo: "Extrato / comprovante do benefício do INSS",
        descricao: "Demonstrativo recente do benefício.",
      },
      {
        titulo: "Declaração de Imposto de Renda + recibo",
        descricao: "Quando aplicável.",
      },
      {
        titulo: "Extratos bancários",
        descricao: "Se necessário para complementar a análise.",
      },
    ],
  },
  {
    chave: "servidor",
    nome: "Servidor Público",
    sortOrder: 3,
    itens: [
      ...IDENTIFICACAO,
      {
        titulo: "3 últimos contracheques / holerites",
        descricao: "Comprovantes de pagamento dos últimos três meses.",
      },
      {
        titulo: "Comprovante de vínculo com o órgão público",
        descricao: "Se solicitado.",
      },
      {
        titulo: "Declaração de Imposto de Renda + recibo",
        descricao: "Quando aplicável.",
      },
    ],
  },
];
