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

    this.logger.error(
      `Prisma ${exception.code} em ${request?.method ?? '?'} ${request?.originalUrl ?? '?'}: ${exception.message}`,
    );

    if (response.headersSent) return;

    if (request?.method === 'GET' && isMissingDatabaseObject(exception)) {
      response.status(200).json([]);
      return;
    }

    const message = prismaErrorMessage(exception);
    response.status(500).json({ statusCode: 500, message });
  }
}

function prismaErrorMessage(exception: Prisma.PrismaClientKnownRequestError) {
  if (exception.code === 'P2021' || exception.code === 'P2022') {
    return 'O banco está desatualizado para esta ação. Atualize o schema e tente de novo.';
  }
  if (exception.code === 'P2028') {
    return 'Não foi possível gravar no banco (transação). Tente de novo.';
  }
  if (exception.code === 'P2002') {
    return 'Já existe um registro com esses dados.';
  }
  if (exception.code === 'P2003') {
    return 'Não foi possível vincular o registro. Atualize a página e tente de novo.';
  }
  return 'Não foi possível concluir a operação.';
}
