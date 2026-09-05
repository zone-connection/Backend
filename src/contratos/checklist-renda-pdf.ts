import PDFDocument from 'pdfkit';

type PdfDoc = InstanceType<typeof PDFDocument>;

export type ChecklistLogo = {
  png: Buffer;
  width: number;
  height: number;
};

type Rgb = [number, number, number];

function parseHex(value?: string | null): Rgb {
  const hex = value?.trim().replace(/^#/, '');
  if (!hex || !/^[\da-f]{6}$/i.test(hex)) return [7, 158, 212];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function v(values: Record<string, string>, key: string) {
  return String(values[key] ?? '').trim();
}

function on(values: Record<string, string>, key: string) {
  const raw = v(values, key).toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'sim';
}

function yesNo(values: Record<string, string>, key: string): 'sim' | 'nao' | '' {
  const raw = v(values, key).toLowerCase();
  if (raw === 'sim' || raw === 'true' || raw === '1') return 'sim';
  if (raw === 'nao' || raw === 'não' || raw === 'false' || raw === '0') {
    return 'nao';
  }
  return '';
}

function formatDateBr(iso: string) {
  if (!iso) return '____/____/________';
  const [year, month, day] = iso.slice(0, 10).split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function money(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('R$') ? trimmed : `R$ ${trimmed}`;
}

function dash(value: string) {
  return value || '—';
}

export function buildChecklistRendaPdf(input: {
  values: Record<string, string>;
  brandHex: string;
  logo?: ChecklistLogo | null;
  tenantName?: string | null;
}): Promise<Buffer> {
  const color = parseHex(input.brandHex);
  const values = input.values;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      info: {
        Title: 'Checklist — Renda Informal / Renda Mista',
        Author: input.tenantName ?? 'CRM',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = 48;
    const right = pageW - 48;
    const width = right - left;

    doc.save();
    doc.lineWidth(1.3).strokeColor(color).rect(16, 16, pageW - 32, pageH - 32).stroke();
    doc.lineWidth(0.55).rect(23, 23, pageW - 46, pageH - 46).stroke();
    doc.restore();

    let y = 42;
    if (input.logo?.png) {
      const maxW = 130;
      const maxH = 48;
      const scale = Math.min(
        maxW / Math.max(input.logo.width, 1),
        maxH / Math.max(input.logo.height, 1),
        1,
      );
      const w = Math.max(28, input.logo.width * scale);
      const h = Math.max(16, input.logo.height * scale);
      doc.image(input.logo.png, (pageW - w) / 2, y, { width: w, height: h });
      y += h + 10;
    }

    if (input.tenantName?.trim()) {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#667085')
        .text(input.tenantName.trim().toUpperCase(), left, y, {
          width,
          align: 'center',
        });
      y += 14;
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(color)
      .text('CHECKLIST — RENDA INFORMAL / RENDA MISTA', left, y, {
        width,
        align: 'center',
      });
    y += 22;
    drawOrnament(doc, y, color, pageW);
    y += 22;

    y = sectionBar(doc, y, 'DADOS DO CLIENTE', color, left, width);
    y = fieldLine(doc, y, 'Nome', dash(v(values, 'nome')), color, left, width);
    y = fieldLine(doc, y, 'CPF', dash(v(values, 'cpf')), color, left, width);
    y = fieldLine(
      doc,
      y,
      'Renda solicitada',
      dash(money(v(values, 'rendaSolicitada'))),
      color,
      left,
      width,
    );
    y = fieldLine(
      doc,
      y,
      'Profissão exata',
      dash(v(values, 'profissao')),
      color,
      left,
      width,
    );
    y = fieldLine(
      doc,
      y,
      'Renda parcial apurada nos extratos',
      dash(money(v(values, 'rendaParcialExtratos'))),
      color,
      left,
      width,
    );

    const bolsa = yesNo(values, 'bolsaFamilia');
    y = labeledYesNo(
      doc,
      y,
      'Cliente possui Bolsa Família?',
      bolsa,
      color,
      left,
    );
    y = fieldLine(
      doc,
      y,
      'Se sim, valor mensal',
      dash(money(v(values, 'bolsaFamiliaValor'))),
      color,
      left,
      width,
    );

    y += 6;
    y = sectionBar(doc, y, 'EM CASO DE RENDA MISTA', color, left, width);
    y = labeledYesNo(
      doc,
      y,
      'Possui vínculo empregatício?',
      yesNo(values, 'vinculoEmpregaticio'),
      color,
      left,
    );
    y = fieldLine(doc, y, 'Empresa', dash(v(values, 'empresa')), color, left, width);
    y = fieldLine(
      doc,
      y,
      'Salário (conforme contracheque)',
      dash(money(v(values, 'salarioContracheque'))),
      color,
      left,
      width,
    );

    y += 6;
    y = sectionBar(doc, y, 'DOCUMENTAÇÃO ANEXADA', color, left, width);
    const docs: Array<[string, string]> = [
      ['docExtratos', 'Extratos bancários dos últimos 6 meses'],
      ['docContracheques', 'Contracheques (renda mista)'],
      [
        'docFgts',
        'Extrato do FGTS com recolhimento do mesmo mês do contracheque',
      ],
      ['docIdentidade', 'Documento de identificação'],
      ['docOutros', 'Outros documentos'],
    ];
    for (const [key, label] of docs) {
      y = checkboxLine(doc, y, on(values, key), label, color, left);
    }
    if (v(values, 'docOutrosTexto')) {
      y = fieldLine(
        doc,
        y,
        'Quais',
        v(values, 'docOutrosTexto'),
        color,
        left,
        width,
      );
    }

    y += 8;
    y = sectionBar(doc, y, 'OBSERVAÇÕES', color, left, width);
    const notes = v(values, 'observacoes') || ' ';
    const notesH = Math.max(54, doc.heightOfString(notes, { width: width - 16 }) + 12);
    doc.save();
    doc
      .lineWidth(0.7)
      .strokeColor(color)
      .roundedRect(left, y, width, notesH, 4)
      .stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#000000')
      .text(notes, left + 8, y + 8, { width: width - 16 });
    doc.restore();
    y += notesH + 18;

    const cidade = v(values, 'cidade');
    const data = formatDateBr(v(values, 'data'));
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#000000')
      .text(
        [cidade, data].filter(Boolean).join(', ') || data,
        left,
        y,
        { width, align: 'center' },
      );
    y += 48;

    const lineW = 220;
    const x = (pageW - lineW) / 2;
    doc.save();
    doc.strokeColor(color).lineWidth(0.7).moveTo(x, y).lineTo(x + lineW, y).stroke();
    doc.restore();
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#222')
      .text('ASSINATURA', left, y + 8, { width, align: 'center' });
    const signer = v(values, 'nome');
    if (signer) {
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#000000')
        .text(signer, left, y + 20, { width, align: 'center' });
    }

    drawOrnament(doc, pageH - 42, color, pageW);
    doc.end();
  });
}

function drawOrnament(
  doc: PdfDoc,
  y: number,
  color: Rgb,
  pageW: number,
) {
  const center = pageW / 2;
  doc.save();
  doc.strokeColor(color).fillColor(color).lineWidth(0.7);
  doc.moveTo(center - 105, y).lineTo(center - 13, y).stroke();
  doc.moveTo(center + 13, y).lineTo(center + 105, y).stroke();
  doc.circle(center - 8, y, 2).fill();
  doc.circle(center + 8, y, 2).fill();
  doc
    .moveTo(center, y - 5)
    .lineTo(center + 5, y)
    .lineTo(center, y + 5)
    .lineTo(center - 5, y)
    .closePath()
    .fill();
  doc.restore();
}

function sectionBar(
  doc: PdfDoc,
  y: number,
  title: string,
  color: Rgb,
  left: number,
  width: number,
) {
  doc.save();
  doc.fillColor(color).roundedRect(left, y, width, 18, 3).fill();
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .text(title, left + 8, y + 5, { width: width - 16 });
  doc.restore();
  return y + 26;
}

function fieldLine(
  doc: PdfDoc,
  y: number,
  label: string,
  value: string,
  color: Rgb,
  left: number,
  width: number,
) {
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(color)
    .text(label.toUpperCase(), left, y);
  y += 11;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(value, left, y, {
    width,
  });
  y += 13;
  doc.save();
  doc
    .strokeColor(color)
    .opacity(0.35)
    .lineWidth(0.45)
    .moveTo(left, y)
    .lineTo(left + width, y)
    .stroke();
  doc.restore();
  return y + 10;
}

function labeledYesNo(
  doc: PdfDoc,
  y: number,
  label: string,
  value: 'sim' | 'nao' | '',
  color: Rgb,
  left: number,
) {
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#222').text(label, left, y);
  y += 14;
  checkbox(doc, left, y, value === 'sim', 'Sim', color);
  checkbox(doc, left + 70, y, value === 'nao', 'Não', color);
  return y + 18;
}

function checkboxLine(
  doc: PdfDoc,
  y: number,
  checked: boolean,
  label: string,
  color: Rgb,
  left: number,
) {
  checkbox(doc, left, y, checked, label, color);
  return y + 16;
}

function checkbox(
  doc: PdfDoc,
  x: number,
  y: number,
  checked: boolean,
  label: string,
  color: Rgb,
) {
  doc.save();
  doc.lineWidth(0.9).strokeColor(color).rect(x, y, 9, 9).stroke();
  if (checked) {
    doc.fillColor(color).rect(x + 1.6, y + 1.6, 5.8, 5.8).fill();
  }
  doc
    .fillColor('#222')
    .font('Helvetica')
    .fontSize(9)
    .text(label, x + 14, y - 1);
  doc.restore();
}
