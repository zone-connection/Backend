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

export function pdfUploadInterceptor() {
  return FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: ARQUIVO_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || '').toLowerCase();
      const name = (file.originalname || '').toLowerCase();
      if (mime === 'application/pdf' || name.endsWith('.pdf')) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
  });
}

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
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

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').trim();
  const cut = base.slice(0, 80) || 'documento';
  return cut.toLowerCase().endsWith('.pdf') ? cut : `${cut}.pdf`;
}
