import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

export const ARQUIVO_MAX_BYTES = 5 * 1024 * 1024;
export const ARQUIVO_MAX_POR_REGISTRO = 40;
export const ANEXO_EMAIL_MAX_BYTES = 8 * 1024 * 1024;
export const ZIP_EMAIL_MAX_BYTES = 15 * 1024 * 1024;

export const TAGS_PADRAO = [
  'CPF',
  'RG',
  'CNH',
  'Comprovante de residência',
  'Comprovante de renda',
  'Certidão de nascimento',
  'Certidão de casamento',
  'Matrícula do imóvel',
  'Escritura',
  'Contrato',
  'Proposta comercial',
  'Comprovante de pagamento',
];

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function pdfUploadInterceptor() {
  return documentUploadInterceptor();
}

export function documentUploadInterceptor() {
  return FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: ARQUIVO_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || '').toLowerCase();
      const name = (file.originalname || '').toLowerCase();
      const ok =
        mime === 'application/pdf' ||
        name.endsWith('.pdf') ||
        IMAGE_MIMES.has(mime) ||
        /\.(jpe?g|png|webp|gif)$/.test(name);
      if (ok) {
        cb(null, true);
        return;
      }
      cb(
        new BadRequestException('Envie um PDF ou imagem (JPG, PNG, WEBP ou GIF).') as unknown as Error,
        false,
      );
    },
  });
}

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

export type DocumentoKind = {
  mime: string;
  ext: string;
};

export function detectDocumentoKind(
  buffer: Buffer,
  originalName: string,
  declaredMime?: string,
): DocumentoKind | null {
  if (isPdfBuffer(buffer)) {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  const name = (originalName || '').toLowerCase();
  const mime = (declaredMime || '').toLowerCase();
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString('ascii') === 'GIF87a') {
    return { mime: 'image/gif', ext: 'gif' };
  }
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString('ascii') === 'GIF89a') {
    return { mime: 'image/gif', ext: 'gif' };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (IMAGE_MIMES.has(mime) || /\.(jpe?g|png|webp|gif)$/.test(name)) {
    const ext = name.split('.').pop() || 'jpg';
    return { mime: mime || 'image/jpeg', ext };
  }
  return null;
}

export function slugifyTag(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function extFromMime(mime: string, originalName?: string): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  const fromName = (originalName || '').split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return 'pdf';
}

export function sanitizeFilename(name: string, ext = 'pdf'): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').trim();
  const cut = base.slice(0, 80) || 'documento';
  const lower = cut.toLowerCase();
  const suffix = `.${ext.replace(/^\./, '')}`;
  return lower.endsWith(suffix) ? cut : `${cut}${suffix}`;
}
