import { BadRequestException } from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { INTERMEDIACAO_KEYS } from './intermediacao-fields';

const XML_PARTS = [
  'word/document.xml',
  'word/header1.xml',
  'word/header2.xml',
  'word/header3.xml',
  'word/footer1.xml',
  'word/footer2.xml',
  'word/footer3.xml',
];

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unescapeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

type TextNode = { start: number; end: number; innerStart: number; innerEnd: number; text: string };

function collectNodes(xml: string): TextNode[] {
  const nodes: TextNode[] = [];
  const re = /<w:t\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const innerStart = match.index + match[0].length;
    const close = xml.indexOf('</w:t>', innerStart);
    if (close < 0) break;
    nodes.push({
      start: match.index,
      end: close + 6,
      innerStart,
      innerEnd: close,
      text: unescapeXml(xml.slice(innerStart, close)),
    });
  }
  return nodes;
}

function replaceFirst(xml: string, search: string, replacement: string) {
  if (!search.trim() || search.length < 3) return xml;
  const direct = escapeXml(search);
  const idxDirect = xml.indexOf(direct);
  if (idxDirect >= 0) {
    return xml.slice(0, idxDirect) + escapeXml(replacement) + xml.slice(idxDirect + direct.length);
  }

  const nodes = collectNodes(xml);
  if (!nodes.length) return xml;
  const concat = nodes.map((n) => n.text).join('');
  let idx = concat.indexOf(search);
  if (idx < 0) {
    const compact = concat.replace(/\s+/g, ' ');
    const compactSearch = search.replace(/\s+/g, ' ').trim();
    const compactIdx = compact.indexOf(compactSearch);
    if (compactIdx < 0) return xml;
    // fallback: skip split-run if compact spaces differ too much
    idx = concat.indexOf(compactSearch);
    if (idx < 0) return xml;
  }

  let consumed = 0;
  let remaining = search.length;
  let first = true;
  const pieces: { node: number; text: string }[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    const next = consumed + node.text.length;
    if (next <= idx) {
      consumed = next;
      continue;
    }
    const localStart = Math.max(0, idx - consumed);
    const take = Math.min(remaining, node.text.length - localStart);
    const before = first ? node.text.slice(0, localStart) : node.text.slice(0, localStart);
    const after = node.text.slice(localStart + take);
    pieces.push({
      node: i,
      text: first ? before + replacement + after : before + after,
    });
    first = false;
    remaining -= take;
    consumed = next;
    if (remaining <= 0) break;
  }

  if (!pieces.length) return xml;
  let out = xml;
  for (let p = pieces.length - 1; p >= 0; p -= 1) {
    const piece = pieces[p]!;
    const node = nodes[piece.node]!;
    out =
      out.slice(0, node.innerStart) +
      escapeXml(piece.text) +
      out.slice(node.innerEnd);
  }
  return out;
}

export function injectDocxPlaceholders(
  buffer: Buffer,
  mappings: { key: string; snippet: string }[],
) {
  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch {
    throw new BadRequestException('O Word enviado está corrompido ou não é um .docx válido.');
  }

  const sorted = [...mappings]
    .filter((item) => INTERMEDIACAO_KEYS.includes(item.key as (typeof INTERMEDIACAO_KEYS)[number]))
    .filter((item) => item.snippet.trim().length >= 3)
    .sort((a, b) => b.snippet.length - a.snippet.length);

  if (sorted.length === 0) {
    throw new BadRequestException(
      'Confirme ao menos um trecho do documento para virar campo do modelo.',
    );
  }

  let replaced = 0;
  for (const part of XML_PARTS) {
    const file = zip.file(part);
    if (!file) continue;
    let xml = file.asText();
    for (const item of sorted) {
      const before = xml;
      xml = replaceFirst(xml, item.snippet.trim(), `{{${item.key}}}`);
      if (xml !== before) replaced += 1;
    }
    zip.file(part, xml);
  }

  if (replaced === 0) {
    throw new BadRequestException(
      'Não achei os trechos confirmados no Word. Revise o mapeamento ou envie o .docx original.',
    );
  }

  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

export function renderIntermediacaoDocx(
  templateBuffer: Buffer,
  values: Record<string, string>,
) {
  let zip: PizZip;
  try {
    zip = new PizZip(templateBuffer);
  } catch {
    throw new BadRequestException('O modelo Word da imobiliária está inválido.');
  }

  const data: Record<string, string> = {};
  for (const key of INTERMEDIACAO_KEYS) {
    data[key] = values[key]?.trim() ?? '';
  }

  try {
    const doc = new Docxtemplater(zip, {
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    });
    doc.render(data);
    return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;
  } catch {
    throw new BadRequestException(
      'Não foi possível preencher o Word da imobiliária. Confirme o modelo novamente.',
    );
  }
}
