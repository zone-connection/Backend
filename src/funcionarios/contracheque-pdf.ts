import PDFDocument from 'pdfkit';

export type Lancamento = {
  codigo?: string;
  descricao: string;
  referencia?: string;
  valor: number;
};

export type ContrachequePdfInput = {
  empresa: string;
  endereco?: string;
  cnpj?: string;
  nome: string;
  cargo: string;
  codigo: string;
  cbo: string;
  admissaoLabel: string;
  competenciaLabel: string;
  dataPagamentoLabel: string;
  salarioBruto: number;
  beneficios: Lancamento[];
  descontos: Lancamento[];
  salarioLiquido: number;
  totalVencimentos: number;
  totalDescontos: number;
  salarioBase: number;
  salarioContrInss: number;
  baseFgts: number;
  fgtsMes: number;
  baseIrpf: number;
  observacoes?: string;
};

function num(n: number) {
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dash(value?: string) {
  const v = value?.trim();
  return v ? v : '—';
}

export function buildContrachequePdf(
  input: ContrachequePdfInput,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 18,
      info: {
        Title: `Recibo de Pagamento de Salário — ${input.nome}`,
        Author: input.empresa,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageH = doc.page.height;
    const gap = 10;
    const viaH = (pageH - 36 - gap) / 2;
    drawHolerite(doc, 18, viaH, input, '1ª via — funcionário');
    drawHolerite(doc, 18 + viaH + gap, viaH, input, '2ª via — empregador');
    doc.end();
  });
}

function drawHolerite(
  doc: InstanceType<typeof PDFDocument>,
  y0: number,
  h: number,
  input: ContrachequePdfInput,
  viaLabel: string,
) {
  const x = 22;
  const w = 551;
  const sigW = 86;
  const innerW = w - sigW;
  const black = '#111111';

  doc.save();
  doc.lineWidth(0.8).strokeColor(black).rect(x, y0, w, h).stroke();
  doc.rect(x + innerW, y0, sigW, h).stroke();

  let y = y0 + 6;
  doc.fillColor(black).font('Helvetica-Bold').fontSize(9);
  doc.text(input.empresa || 'Empresa', x + 6, y, { width: innerW - 160 });
  doc.font('Helvetica').fontSize(8);
  doc.text('Recibo de Pagamento de Salário', x + innerW - 154, y, {
    width: 148,
    align: 'right',
  });
  y += 12;
  doc.fontSize(7).fillColor('#333333');
  doc.text(dash(input.endereco), x + 6, y, { width: innerW - 160 });
  doc.fillColor(black).text(`Mês Referência: ${input.competenciaLabel}`, x + innerW - 154, y, {
    width: 148,
    align: 'right',
  });
  y += 10;
  if (input.cnpj?.trim()) {
    doc.text(`CNPJ: ${input.cnpj}`, x + 6, y, { width: innerW - 12 });
    y += 10;
  }

  y += 2;
  doc.moveTo(x, y).lineTo(x + innerW, y).stroke();
  const infoTop = y;
  const infoH = 28;
  const cols = [
    { label: 'Código', value: dash(input.codigo), w: 58 },
    { label: 'Nome do Funcionário', value: dash(input.nome), w: 168 },
    { label: 'Admissão', value: dash(input.admissaoLabel), w: 70 },
    { label: 'CBO', value: dash(input.cbo), w: 70 },
    { label: 'Função', value: dash(input.cargo), w: innerW - 58 - 168 - 70 - 70 },
  ];
  let cx = x;
  for (const col of cols) {
    doc.rect(cx, infoTop, col.w, infoH).stroke();
    doc.font('Helvetica').fontSize(6).fillColor('#444444');
    doc.text(col.label, cx + 3, infoTop + 3, { width: col.w - 6 });
    doc.font('Helvetica-Bold').fontSize(7).fillColor(black);
    doc.text(col.value, cx + 3, infoTop + 13, { width: col.w - 6 });
    cx += col.w;
  }
  y = infoTop + infoH;

  const tableH = h - (y - y0) - 62;
  const headers = [
    { label: 'Cód.', w: 36 },
    { label: 'Descrição', w: 188 },
    { label: 'Referência', w: 62 },
    { label: 'Vencimentos', w: 89 },
    { label: 'Descontos', w: innerW - 36 - 188 - 62 - 89 },
  ];
  doc.rect(x, y, innerW, 14).stroke();
  let hx = x;
  doc.font('Helvetica-Bold').fontSize(6.5);
  for (const head of headers) {
    doc.text(head.label, hx + 3, y + 4, { width: head.w - 6 });
    hx += head.w;
  }
  y += 14;

  const rows: Array<{
    codigo: string;
    descricao: string;
    referencia: string;
    vencimento: string;
    desconto: string;
  }> = [
    {
      codigo: '001',
      descricao: 'SALÁRIO',
      referencia: '30',
      vencimento: num(input.salarioBruto),
      desconto: '',
    },
    ...input.beneficios.map((item, index) => ({
      codigo: item.codigo?.trim() || String(100 + index + 1).padStart(3, '0'),
      descricao: item.descricao.toUpperCase(),
      referencia: item.referencia?.trim() ?? '',
      vencimento: num(item.valor),
      desconto: '',
    })),
    ...input.descontos.map((item, index) => ({
      codigo: item.codigo?.trim() || String(200 + index + 1).padStart(3, '0'),
      descricao: item.descricao.toUpperCase(),
      referencia: item.referencia?.trim() ?? '',
      vencimento: '',
      desconto: num(item.valor),
    })),
  ];

  const rowH = 11;
  const maxRows = Math.max(8, Math.floor((tableH - 14) / rowH));
  doc.font('Helvetica').fontSize(7);
  for (let i = 0; i < maxRows; i++) {
    const row = rows[i];
    const ry = y + i * rowH;
    doc.rect(x, ry, innerW, rowH).stroke();
    let rx = x;
    const cells = row
      ? [row.codigo, row.descricao, row.referencia, row.vencimento, row.desconto]
      : ['', '', '', '', ''];
    headers.forEach((head, idx) => {
      const align = idx >= 3 ? 'right' : idx === 2 ? 'center' : 'left';
      doc.text(cells[idx] ?? '', rx + 3, ry + 2.5, {
        width: head.w - 6,
        align,
      });
      rx += head.w;
    });
  }
  y += maxRows * rowH;

  const totH = 22;
  doc.rect(x, y, innerW, totH).stroke();
  const tw = innerW / 3;
  const totals = [
    ['Total de Vencimentos', num(input.totalVencimentos)],
    ['Total de Descontos', num(input.totalDescontos)],
    ['Valor Líquido R$', num(input.salarioLiquido)],
  ];
  totals.forEach(([label, value], i) => {
    const tx = x + tw * i;
    doc.rect(tx, y, tw, totH).stroke();
    doc.font('Helvetica').fontSize(6).fillColor('#444444');
    doc.text(label, tx + 4, y + 3, { width: tw - 8 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(black);
    doc.text(value, tx + 4, y + 11, { width: tw - 8, align: i === 2 ? 'right' : 'left' });
  });
  y += totH;

  const baseH = h - (y - y0);
  const bases = [
    ['Salário Base', num(input.salarioBase)],
    ['Salário Contr. INSS', num(input.salarioContrInss)],
    ['Base FGTS', num(input.baseFgts)],
    ['FGTS do Mês', num(input.fgtsMes)],
    ['Base Cálc. IRPF', num(input.baseIrpf)],
  ];
  const bw = innerW / bases.length;
  bases.forEach(([label, value], i) => {
    const bx = x + bw * i;
    doc.rect(bx, y, bw, baseH).stroke();
    doc.font('Helvetica').fontSize(5.5).fillColor('#444444');
    doc.text(label, bx + 3, y + 3, { width: bw - 6 });
    doc.font('Helvetica-Bold').fontSize(7).fillColor(black);
    doc.text(value, bx + 3, y + 13, { width: bw - 6 });
  });

  const sigX = x + innerW + 4;
  doc.font('Helvetica').fontSize(6).fillColor(black);
  doc.text(
    'Declaro ter recebido a importância líquida discriminada neste recibo.',
    sigX,
    y0 + 10,
    { width: sigW - 8, align: 'center' },
  );
  doc.text(`Data: ${input.dataPagamentoLabel}`, sigX, y0 + h / 2 - 8, {
    width: sigW - 8,
    align: 'center',
  });
  doc.moveTo(sigX + 4, y0 + h - 36).lineTo(sigX + sigW - 8, y0 + h - 36).stroke();
  doc.fontSize(5.5).text('Assinatura do Funcionário', sigX, y0 + h - 30, {
    width: sigW - 8,
    align: 'center',
  });
  doc.fontSize(5).fillColor('#666666').text(viaLabel, sigX, y0 + h - 16, {
    width: sigW - 8,
    align: 'center',
  });
  doc.restore();
}
