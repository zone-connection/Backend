import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
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
