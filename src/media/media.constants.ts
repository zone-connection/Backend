import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
export const IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
  'application/octet-stream',
] as const;

export function imageUploadInterceptor() {
  return FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: IMAGE_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || '').toLowerCase();
      const allowed =
        mime.startsWith('image/') ||
        IMAGE_MIMES.includes(mime as (typeof IMAGE_MIMES)[number]);
      if (!allowed) {
        cb(null, false);
        return;
      }
      cb(null, true);
    },
  });
}

export function documentUploadInterceptor() {
  return FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || '').toLowerCase();
      const name = (file.originalname || '').toLowerCase();
      const byMime = DOCUMENT_MIMES.includes(
        mime as (typeof DOCUMENT_MIMES)[number],
      );
      const byExt =
        name.endsWith('.pdf') ||
        name.endsWith('.doc') ||
        name.endsWith('.docx');
      if (!byMime && !byExt) {
        cb(null, false);
        return;
      }
      cb(null, true);
    },
  });
}
