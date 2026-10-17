import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { MetaWebhookSignatureGuard } from './guards/meta-webhook-signature.guard';
import { MetaService } from './meta.service';

/**
 * Callback do app Meta (Lead Ads).
 *
 * O body NÃO passa pelo ValidationPipe global (`forbidNonWhitelisted`).
 * Payloads reais da Meta trazem campos extras; rejeitá-los com 400 impede
 * o processamento e a Meta pode deixar de reenviar.
 * A autenticidade fica a cargo do HMAC (`MetaWebhookSignatureGuard`).
 */
@Controller('webhooks/meta')
@SkipThrottle()
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  /**
   * Verificação do callback URL no painel Meta Developers
   * (hub.mode / hub.verify_token / hub.challenge).
   */
  @Get()
  @Public()
  @Header('Content-Type', 'text/plain')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verified = this.metaService.verifyChallenge(mode, token, challenge);
    if (verified === null) {
      throw new ForbiddenException('Verificação do webhook Meta recusada.');
    }
    return res.status(200).send(verified);
  }

  @Post()
  @Public()
  @HttpCode(200)
  @UseGuards(MetaWebhookSignatureGuard)
  receive(@Req() req: Request) {
    return this.metaService.handleWebhook(req.body);
  }
}
