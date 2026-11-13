import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import type { ApiRequestContext } from './api-context';

@Injectable()
export class ApiAuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { api?: ApiRequestContext }>();
    const res = http.getResponse<Response>();
    const started = Date.now();
    const requestId = header(req, 'x-request-id') || randomUUID();
    res.setHeader('X-Request-Id', requestId);

    return next.handle().pipe(
      tap({
        next: () => {
          void this.write(req, res.statusCode || 200, started, requestId);
        },
        error: () => {
          void this.write(req, res.statusCode || 500, started, requestId);
        },
      }),
    );
  }

  private async write(
    req: Request & { api?: ApiRequestContext },
    statusCode: number,
    started: number,
    requestId: string,
  ) {
    try {
      await this.prisma.apiAuditoria.create({
        data: {
          aplicacaoId: req.api?.appId ?? null,
          tenantId: req.api?.tenantId ?? null,
          method: req.method,
          path: req.path?.slice(0, 300) || req.url.slice(0, 300),
          statusCode,
          duracaoMs: Date.now() - started,
          requestId,
        },
      });
    } catch {
      // Auditoria não pode derrubar a resposta.
    }
  }
}

function header(req: Request, name: string): string {
  const value = req.header(name);
  return typeof value === 'string' ? value.slice(0, 80) : '';
}
