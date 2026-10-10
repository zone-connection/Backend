import { BadRequestException } from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export function intermediacaoFileKind(filename: string, mimetype: string) {
  const name = filename.toLowerCase();
  const mime = mimetype.toLowerCase();
  if (name.endsWith('.doc') && !name.endsWith('.docx')) {
    throw new BadRequestException(
      'Arquivo .doc antigo não é suportado. Salve como .docx ou PDF pesquisável.',
    );
  }
  if (name.endsWith('.docx') || mime.includes('wordprocessingml')) return 'docx' as const;
  if (name.endsWith('.pdf') || mime.includes('pdf')) return 'pdf' as const;
  throw new BadRequestException('Envie um Word (.docx) ou PDF com texto selecionável.');
}

export async function extractDocumentText(params: {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}) {
  const kind = intermediacaoFileKind(params.filename, params.mimetype);
  if (kind === 'docx') {
    const result = await mammoth.extractRawText({ buffer: params.buffer });
    const text = result.value?.trim() ?? '';
    if (text.length < 40) {
      throw new BadRequestException(
        'Não foi possível ler o texto do Word. Confira se o arquivo não está vazio.',
      );
    }
    return { kind, text };
  }

  const parser = new PDFParse({ data: params.buffer });
  try {
    const parsed = await parser.getText();
    const text = parsed.text?.trim() ?? '';
    if (text.length < 40) {
      throw new BadRequestException(
        'Este PDF parece escaneado ou sem texto selecionável. Salve como Word ou PDF pesquisável.',
      );
    }
    return { kind, text };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
