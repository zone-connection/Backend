import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { isMissingDatabaseObject } from '../../prisma/schema-repair';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaSchemaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaSchemaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (
      request?.method === 'GET' &&
      isMissingDatabaseObject(exception) &&
      !response.headersSent
    ) {
      this.logger.error(
        `Schema incompleto em ${request.originalUrl}: ${exception.message}`,
      );
      response.status(200).json([]);
      return;
    }

    throw exception;
  }
}
