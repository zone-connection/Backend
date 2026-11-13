import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { MulterError } from 'multer';
import type { Response } from 'express';

@Catch(MulterError)
export class MulterUploadFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const tooBig = exception.code === 'LIMIT_FILE_SIZE';
    const status = tooBig
      ? HttpStatus.PAYLOAD_TOO_LARGE
      : HttpStatus.BAD_REQUEST;
    const message = tooBig
      ? 'O PDF deve ter no máximo 5 MB.'
      : 'Arquivo inválido para envio.';
    res.status(status).json({ statusCode: status, message });
  }
}
