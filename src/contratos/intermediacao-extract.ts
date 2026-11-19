import {
  formatCep,
  formatCnpj,
  formatCpf,
  formatPhoneBr,
  isValidCnpj,
  isValidCpf,
  isValidEmail,
  isValidPhone,
  onlyDigits,
  type ExtractedField,
  type IntermediacaoKey,
} from './intermediacao-fields';

const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CEP_RE = /\b\d{5}-?\d{3}\b/g;
const PHONE_RE =
  /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\d{4}|\d{4})-?\d{4}/g;
const CRECI_RE = /\bCRECI[:\s-]*([A-Z]{0,2}\s*\d{3,6}(?:-?[A-Z])?)/i;
const MONEY_RE = /R\$\s*[\d.]{1,18},\d{2}/g;

type SectionId = 'contratante' | 'proprietario' | 'contratada' | 'imovel' | 'resto';

function normalize(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
}

function sliceSection(text: string, startRe: RegExp, endRe: RegExp) {
  const start = text.search(startRe);
  if (start < 0) return '';
  const from = text.slice(start);
  const end = from.slice(12).search(endRe);
  return end >= 0 ? from.slice(0, end + 12) : from.slice(0, 1800);
}

function labeled(section: string, labels: string[]) {
  const joined = labels.join('|');
  const re = new RegExp(
    `(?:${joined})\\s*[:\\-–]?\\s*([^\\n]{2,220})`,
    'i',
  );
  const match = section.match(re);
  return match?.[1]?.trim().replace(/\s{2,}/g, ' ') ?? '';
}

function uniqueKeepOrder(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function moneyClean(raw: string) {
  return raw.replace(/\s+/g, ' ').trim();
}

function field(
  key: IntermediacaoKey,
  value: string,
  confidence: ExtractedField['confidence'],
  snippet: string,
  warning?: string,
): ExtractedField | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return { key, value: trimmed.slice(0, 500), confidence, snippet: snippet.slice(0, 180), warning };
}

export function extractIntermediacaoFields(rawText: string): {
  fields: ExtractedField[];
  avisos: string[];
  values: Record<string, string>;
} {
  const text = normalize(rawText);
  const avisos: string[] = [];
  const fields: ExtractedField[] = [];

  const contratante = sliceSection(
    text,
    /CONTRATANTE/i,
    /PROPRIET[ÁA]RIO|CONTRATADA|CL[ÁA]USULA|IM[ÓO]VEL/i,
  );
  const proprietario = sliceSection(
    text,
    /PROPRIET[ÁA]RIO|VENDEDOR/i,
    /CONTRATADA|IMOBILI[ÁA]RIA|CL[ÁA]USULA|CONTRATANTE/i,
  );
  const contratada = sliceSection(
    text,
    /CONTRATADA|IMOBILI[ÁA]RIA/i,
    /TESTEMUNHA|CL[ÁA]USULA|CONTRATANTE|PROPRIET/i,
  );
  const imovel = sliceSection(
    text,
    /IM[ÓO]VEL|UNIDADE|EMPREENDIMENTO/i,
    /VALOR|PAGAMENTO|CL[ÁA]USULA|TESTEMUNHA/i,
  );

  const cpfContratante = uniqueKeepOrder(
    (contratante.match(CPF_RE) ?? []).filter(isValidCpf),
  );
  const nomes = labeled(contratante, ['Nome', 'Nome completo', 'CONTRATANTE\\(s\\)']);
  if (cpfContratante.length >= 2) {
    avisos.push(
      'Há mais de um CPF no bloco do contratante. Os nomes e CPFs foram concatenados com " / ".',
    );
  }
  const nomeValue =
    nomes ||
    labeled(contratante, ['Denominado', 'denominada']);
  push(
    fields,
    field(
      'contratanteNome',
      nomeValue.replace(/\b(brasileiro|brasileira|solteiro|casado).*/i, '').trim(),
      nomeValue ? 'alta' : 'baixa',
      nomeValue,
    ),
  );
  push(
    fields,
    field(
      'contratanteCpf',
      cpfContratante.map(formatCpf).join(' / '),
      cpfContratante.length ? 'alta' : 'baixa',
      cpfContratante[0] ?? '',
      cpfContratante.length > 1 ? 'Vários CPFs concatenados' : undefined,
    ),
  );

  const rg = labeled(contratante, ['RG', 'Identidade']);
  if (rg) {
    const rgNum = rg.match(/[\d.\-]+/)?.[0] ?? rg;
    push(fields, field('contratanteRg', rgNum, 'media', rg));
    const orgao = rg.match(/\b([A-Z]{2,5}-?[A-Z]{2})\b/)?.[1];
    if (orgao) push(fields, field('contratanteRgOrgao', orgao, 'media', orgao));
  }

  const emailsC = uniqueKeepOrder(contratante.match(EMAIL_RE) ?? []);
  if (emailsC[0] && isValidEmail(emailsC[0])) {
    push(fields, field('contratanteEmail', emailsC[0], 'alta', emailsC[0]));
  }
  const phonesC = uniqueKeepOrder((contratante.match(PHONE_RE) ?? []).filter(isValidPhone));
  if (phonesC[0]) {
    push(fields, field('contratanteTel', formatPhoneBr(phonesC[0]), 'alta', phonesC[0]));
  }
  const cepC = (contratante.match(CEP_RE) ?? []).find((c) => onlyDigits(c).length === 8);
  if (cepC) push(fields, field('contratanteCep', formatCep(cepC), 'alta', cepC));
  const endC = labeled(contratante, ['Endere[cç]o', 'Residente']);
  if (endC) push(fields, field('contratanteEndereco', endC, 'media', endC));

  const cnpjP = uniqueKeepOrder((proprietario.match(CNPJ_RE) ?? []).filter(isValidCnpj));
  const cpfP = uniqueKeepOrder((proprietario.match(CPF_RE) ?? []).filter(isValidCpf));
  const docP = cnpjP[0] ? formatCnpj(cnpjP[0]) : cpfP[0] ? formatCpf(cpfP[0]) : '';
  push(
    fields,
    field(
      'proprietarioNome',
      labeled(proprietario, ['Nome', 'Raz[aã]o social', 'PROPRIET[ÁA]RIO']),
      'media',
      proprietario.slice(0, 80),
    ),
  );
  if (docP) {
    push(fields, field('proprietarioCnpj', docP, 'alta', docP));
  }
  const endP = labeled(proprietario, ['Endere[cç]o']);
  if (endP) push(fields, field('proprietarioEndereco', endP, 'media', endP));
  const phonesP = uniqueKeepOrder((proprietario.match(PHONE_RE) ?? []).filter(isValidPhone));
  if (phonesP[0]) {
    push(fields, field('proprietarioTel', formatPhoneBr(phonesP[0]), 'media', phonesP[0]));
  }

  const cnpjCd = uniqueKeepOrder((contratada.match(CNPJ_RE) ?? []).filter(isValidCnpj));
  if (cnpjCd[0]) {
    push(fields, field('contratadaCnpj', formatCnpj(cnpjCd[0]), 'alta', cnpjCd[0]));
  }
  const creci = contratada.match(CRECI_RE)?.[1] ?? text.match(CRECI_RE)?.[1];
  if (creci) push(fields, field('contratadaCreci', creci.trim(), 'alta', creci));
  const emailsCd = uniqueKeepOrder(contratada.match(EMAIL_RE) ?? []);
  if (emailsCd[0] && isValidEmail(emailsCd[0])) {
    push(fields, field('contratadaEmail', emailsCd[0], 'alta', emailsCd[0]));
  }
  const nomeCd = labeled(contratada, ['Nome', 'Raz[aã]o social', 'CONTRATADA']);
  if (nomeCd) push(fields, field('contratadaNome', nomeCd, 'media', nomeCd));
  const endCd = labeled(contratada, ['Endere[cç]o']);
  if (endCd) push(fields, field('contratadaEndereco', endCd, 'media', endCd));

  const emp = labeled(text, ['Empreendimento', 'Condom[ií]nio']);
  if (emp) push(fields, field('empreendimento', emp, 'media', emp));
  const constName = labeled(text, ['Construtora']);
  if (constName) push(fields, field('construtora', constName, 'media', constName));
  const bloco = labeled(imovel || text, ['Bloco', 'Torre']);
  if (bloco) push(fields, field('bloco', bloco.split(/[,\n]/)[0]!.trim(), 'media', bloco));
  const unidade = labeled(imovel || text, ['Unidade', 'Apartamento', 'Apto']);
  if (unidade) {
    push(
      fields,
      field('unidade', unidade.split(/[,\n]/)[0]!.trim(), 'media', unidade),
    );
  }
  const andar = labeled(imovel || text, ['Andar']);
  if (andar) push(fields, field('andar', andar.split(/[,\n]/)[0]!.trim(), 'baixa', andar));
  const desc = labeled(text, ['Descri[cç][aã]o do im[oó]vel', 'o im[oó]vel']);
  if (desc) push(fields, field('descricaoImovel', desc, 'baixa', desc));

  const moneys = uniqueKeepOrder(text.match(MONEY_RE) ?? []).map(moneyClean);
  if (moneys[0]) push(fields, field('precoImovel', moneys[0], 'media', moneys[0]));
  if (moneys[1]) {
    push(fields, field('valorIntermediacao', moneys[1], 'baixa', moneys[1]));
  }
  const extenso = labeled(text, ['por extenso', 'equivale a']);
  if (extenso) {
    push(fields, field('valorIntermediacaoExtenso', extenso, 'baixa', extenso));
  }

  const banco = labeled(text, ['Banco']);
  if (banco) push(fields, field('banco', banco.split(/[,\n]/)[0]!.trim(), 'media', banco));
  const agencia = labeled(text, ['Ag[eê]ncia']);
  if (agencia) {
    push(fields, field('agencia', agencia.split(/[,\n]/)[0]!.trim(), 'media', agencia));
  }
  const conta = labeled(text, ['Conta(?: corrente)?']);
  if (conta) push(fields, field('conta', conta.split(/[,\n]/)[0]!.trim(), 'media', conta));
  const pix = labeled(text, ['PIX', 'Chave PIX']);
  if (pix) push(fields, field('pix', pix.split(/[,\n]/)[0]!.trim(), 'media', pix));
  const repres = labeled(text, ['Representante legal', 'titular']);
  if (repres) push(fields, field('representanteLegal', repres, 'baixa', repres));

  const cidade = labeled(text, ['Cidade']) || text.match(/\b([A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõç]+(?:\s[A-Z][a-z]+)?)[,\s]+(\d{1,2}\s+de\s+[a-z]+)/)?.[1];
  if (cidade) push(fields, field('cidade', cidade, 'baixa', cidade));

  const dataMatch = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/);
  if (dataMatch) {
    const iso = `${dataMatch[3]}-${dataMatch[2]!.padStart(2, '0')}-${dataMatch[1]!.padStart(2, '0')}`;
    push(fields, field('data', iso, 'media', dataMatch[0]!));
  }

  const testemunhaBlock = text.slice(text.search(/TESTEMUNHA/i));
  const tCpfs = uniqueKeepOrder((testemunhaBlock.match(CPF_RE) ?? []).filter(isValidCpf));
  if (tCpfs[0]) push(fields, field('testemunha1Cpf', formatCpf(tCpfs[0]), 'media', tCpfs[0]));
  if (tCpfs[1]) push(fields, field('testemunha2Cpf', formatCpf(tCpfs[1]), 'media', tCpfs[1]));

  const values: Record<string, string> = {};
  for (const item of fields) {
    if (!(item.key in values)) values[item.key] = item.value;
  }
  return { fields, avisos, values };
}

function push(list: ExtractedField[], item: ExtractedField | null) {
  if (item) list.push(item);
}
