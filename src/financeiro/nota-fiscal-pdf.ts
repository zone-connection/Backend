export type NotaFiscalPdfCampos = {
  numero: string | null;
  dataEmissao: string | null;
  cliente: string | null;
  vgv: string | null;
  corretor: string | null;
  construtora: string | null;
  empreendimento: string | null;
  torreBloco: string | null;
};

export type NotaFiscalPdfCatalogo = {
  corretores: string[];
  construtoras: string[];
  empreendimentos: { nome: string; construtora: string | null }[];
};

const VAZIO: NotaFiscalPdfCampos = {
  numero: null,
  dataEmissao: null,
  cliente: null,
  vgv: null,
  corretor: null,
  construtora: null,
  empreendimento: null,
  torreBloco: null,
};

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function cleanLine(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match;
  }
  return null;
}

function aparece(texto: string, nome: string) {
  const alvo = fold(nome).trim();
  if (alvo.length < 4) return false;
  const escaped = alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(texto);
}

function melhorNome(texto: string, nomes: string[]) {
  const candidatos = nomes
    .map((nome) => nome.trim())
    .filter((nome) => aparece(texto, nome))
    .sort((a, b) => b.length - a.length);
  return candidatos[0] ?? null;
}

function numeroDaNota(text: string) {
  const match = firstMatch(text, [
    /n[uú]mero\s+da\s+(?:nota|nfs-?e)\s*[:\-]?\s*(\d{1,15})/i,
    /nfs-?e\s*n[ºo°.]?\s*[:\-]?\s*(\d{1,15})/i,
    /nota\s+fiscal(?:\s+de\s+servi[cç]os?)?\s*n[ºo°.]?\s*[:\-]?\s*(\d{1,15})/i,
  ]);
  return match?.[1] ?? null;
}

function dataEmissao(text: string) {
  const match = firstMatch(text, [
    /data(?:\s+e\s+hora)?\s+de\s+emiss[aã]o\s*[:\-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i,
    /emiss[aã]o\s*[:\-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i,
  ]);
  if (!match) return null;
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function valorServico(text: string) {
  const match = firstMatch(text, [
    /valor\s+(?:total\s+)?dos\s+servi[cç]os\s*[:\-]?\s*r?\$?\s*([\d.]+,\d{2})/i,
    /valor\s+l[ií]quido(?:\s+da\s+nota)?\s*[:\-]?\s*r?\$?\s*([\d.]+,\d{2})/i,
    /valor\s+total(?:\s+da\s+nota)?\s*[:\-]?\s*r?\$?\s*([\d.]+,\d{2})/i,
  ]);
  return match?.[1] ?? null;
}

function clienteTomador(text: string) {
  const bloco = /tomador(?:\s+de\s+servi[cç]os?)?([\s\S]{0,500})/i.exec(text);
  const trecho = bloco?.[1] ?? '';
  const match =
    /(?:nome\s*\/\s*raz[aã]o\s+social|raz[aã]o\s+social|nome)\s*[:\-]?\s*([^\n]{3,120})/i.exec(
      trecho,
    ) ??
    /(?:nome\s*\/\s*raz[aã]o\s+social|raz[aã]o\s+social)\s*[:\-]?\s*([^\n]{3,120})/i.exec(
      text,
    );
  if (!match?.[1]) return null;
  const nome = cleanLine(match[1].split(/\b(?:cpf|cnpj|endere[cç]o|munic[ií]pio)\b/i)[0] ?? '');
  if (nome.length < 3) return null;
  return nome.slice(0, 120);
}

function torreBloco(text: string) {
  const torre = /(?:torre|bloco)\s*[:\-]?\s*([A-Za-z0-9]{1,10})/i.exec(text);
  const unidade = /(?:apto|apartamento|unidade)\s*[:\-]?\s*([A-Za-z0-9]{1,10})/i.exec(text);
  const partes = [
    torre?.[1] ? `Torre ${torre[1]}` : null,
    unidade?.[1] ? `Unidade ${unidade[1]}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : null;
}

export function lerCamposNotaFiscalPdf(
  text: string,
  catalogo: NotaFiscalPdfCatalogo,
): NotaFiscalPdfCampos {
  const bruto = text.replace(/\u0000/g, ' ');
  const dobrado = fold(bruto);
  const empreendimento = melhorNome(
    dobrado,
    catalogo.empreendimentos.map((item) => item.nome),
  );
  const vinculado = catalogo.empreendimentos.find(
    (item) => item.nome === empreendimento,
  );
  const construtora =
    melhorNome(dobrado, catalogo.construtoras) ??
    vinculado?.construtora ??
    null;
  const corretores = catalogo.corretores.filter((nome) => {
    const partes = nome.trim().split(/\s+/);
    return nome.trim().length >= 8 || partes.length >= 2;
  });

  return {
    ...VAZIO,
    numero: numeroDaNota(bruto),
    dataEmissao: dataEmissao(bruto),
    cliente: clienteTomador(bruto),
    vgv: valorServico(bruto),
    corretor: melhorNome(dobrado, corretores),
    construtora,
    empreendimento,
    torreBloco: torreBloco(bruto),
  };
}
