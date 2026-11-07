import { BadRequestException } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { INTERMEDIACAO_KEYS } from './intermediacao-fields';

type PdfJsModule = {
  getDocument: (src: {
    data: Uint8Array;
    disableWorker?: boolean;
    isEvalSupported?: boolean;
  }) => { promise: Promise<PdfJsDoc> };
  GlobalWorkerOptions: { workerSrc: string };
};

type PdfJsDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfJsPage>;
  destroy: () => Promise<void>;
};

type PdfJsPage = {
  getTextContent: () => Promise<{
    items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }>;
  }>;
};

async function loadPdfJs(): Promise<PdfJsModule> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as PdfJsModule;
  pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
  return pdfjs;
}

type TextRun = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function collectRuns(
  items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }>,
): TextRun[] {
  const runs: TextRun[] = [];
  for (const item of items) {
    const str = item.str ?? '';
    const transform = item.transform;
    if (!str || !transform || transform.length < 6) continue;
    const height = Math.hypot(transform[2] ?? 0, transform[3] ?? 0) || item.height || 10;
    runs.push({
      str,
      x: transform[4] ?? 0,
      y: transform[5] ?? 0,
      width: item.width || str.length * height * 0.5,
      height,
    });
  }
  return runs;
}

function findSnippetBox(runs: TextRun[], snippet: string) {
  const needle = snippet.replace(/\s+/g, '');
  if (needle.length < 3) return null;
  const parts: { run: TextRun; len: number }[] = [];
  let hay = '';
  for (const run of runs) {
    const clean = run.str.replace(/\s+/g, '');
    parts.push({ run, len: clean.length });
    hay += clean;
  }
  const start = hay.indexOf(needle);
  if (start < 0) return null;
  const end = start + needle.length;
  let pos = 0;
  const hit: TextRun[] = [];
  for (const part of parts) {
    const next = pos + part.len;
    if (next > start && pos < end && part.len > 0) hit.push(part.run);
    pos = next;
  }
  if (!hit.length) return null;
  const x = Math.min(...hit.map((r) => r.x));
  const y = Math.min(...hit.map((r) => r.y));
  const right = Math.max(...hit.map((r) => r.x + r.width));
  const top = Math.max(...hit.map((r) => r.y + r.height));
  return {
    x,
    y,
    width: Math.max(24, right - x),
    height: Math.max(8, top - y),
    size: hit[0]?.height ?? 10,
  };
}

export async function fillPdfTemplate(
  buffer: Buffer,
  mappings: { key: string; snippet: string }[],
  values: Record<string, string>,
) {
  const sorted = [...mappings]
    .filter((item) => INTERMEDIACAO_KEYS.includes(item.key as (typeof INTERMEDIACAO_KEYS)[number]))
    .filter((item) => item.snippet.trim().length >= 3)
    .sort((a, b) => b.snippet.length - a.snippet.length);
  if (!sorted.length) {
    throw new BadRequestException('Confirme ao menos um trecho do PDF para preencher o modelo.');
  }

  const pdfjs = await loadPdfJs();
  const loading = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
  });
  const srcDoc = await loading.promise;
  const boxes: Array<{
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    size: number;
    text: string;
  }> = [];

  try {
    for (let pageNum = 1; pageNum <= srcDoc.numPages; pageNum += 1) {
      const page = await srcDoc.getPage(pageNum);
      const content = await page.getTextContent();
      const runs = collectRuns(content.items);
      for (const item of sorted) {
        const next = (values[item.key] ?? '').trim();
        if (!next || next === item.snippet.trim()) continue;
        const box = findSnippetBox(runs, item.snippet.trim());
        if (!box) continue;
        boxes.push({ page: pageNum, ...box, text: next.slice(0, 180) });
      }
    }
  } finally {
    await srcDoc.destroy().catch(() => undefined);
  }

  if (!boxes.length) {
    throw new BadRequestException(
      'Não achei no PDF os trechos confirmados. Aplique os dados no formulário e use o PDF do sistema, ou envie o contrato em Word.',
    );
  }

  const pdf = await PDFDocument.load(buffer);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  for (const box of boxes) {
    const page = pages[box.page - 1];
    if (!page) continue;
    page.drawRectangle({
      x: box.x - 1,
      y: box.y - 1,
      width: box.width + 2,
      height: box.height + 2,
      color: rgb(1, 1, 1),
    });
    const size = Math.min(11, Math.max(7, box.size * 0.85));
    page.drawText(box.text, {
      x: box.x,
      y: box.y,
      size,
      font,
      color: rgb(0.05, 0.05, 0.08),
      maxWidth: Math.max(40, box.width + 40),
    });
  }

  return Buffer.from(await pdf.save());
}
