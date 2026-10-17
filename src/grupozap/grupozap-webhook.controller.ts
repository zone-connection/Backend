import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { GrupoZapWebhookGuard } from './guards/grupozap-webhook.guard';
import { GrupoZapService } from './grupozap.service';

/**
 * Webhooks do Grupo OLX.
 * O corpo não usa DTO: a documentação avisa que campos novos podem aparecer
 * sem aviso, e o ValidationPipe global rejeitaria o payload.
 * Sucesso é só HTTP 2xx. Eles ignoram o corpo da resposta.
 */
@Controller('grupozap')
@Public()
@SkipThrottle()
@UseGuards(GrupoZapWebhookGuard)
export class GrupoZapWebhookController {
  constructor(private readonly grupozap: GrupoZapService) {}

  @Post('lead/:anuncianteId')
  @HttpCode(200)
  receive(
    @Param('anuncianteId') anuncianteId: string,
    @Body() body: unknown,
  ) {
    return this.grupozap.handleLead(anuncianteId, body);
  }

  /** URL sem o id do anunciante, como a documentação também permite. */
  @Post('lead')
  @HttpCode(200)
  receiveWithoutAdvertiser(@Body() body: unknown) {
    return this.grupozap.handleLead(undefined, body);
  }

  @Post('report')
  @HttpCode(200)
  report(@Body() body: unknown) {
    return this.grupozap.handleReport(body);
  }
}

@Controller('feeds/grupozap')
@Public()
@SkipThrottle()
export class GrupoZapFeedController {
  constructor(private readonly grupozap: GrupoZapService) {}

  @Get(':anuncianteId')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  feed(@Param('anuncianteId') anuncianteId: string) {
    return this.grupozap.renderFeed(anuncianteId);
  }
}
