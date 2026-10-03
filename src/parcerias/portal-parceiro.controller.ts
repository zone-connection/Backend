import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import {
  PARCEIRO_COOKIE,
  clearParceiroAuthCookies,
  setParceiroAuthCookies,
} from '../common/utils/auth-cookies';
import { THROTTLE } from '../config/security.constants';
import { CurrentParceiro } from './decorators/current-parceiro.decorator';
import {
  ChangeParceiroPasswordDto,
  IndicarClienteDto,
  InteresseDto,
  ParceiroLoginDto,
} from './dto/parcerias.dto';
import { PortalParceiroAuthGuard } from './guards/portal-parceiro-auth.guard';
import { ParceiroAuthService } from './parceiro-auth.service';
import { ParceriasService } from './parcerias.service';
import type { PortalParceiroSession } from './parceiro.types';

@Public()
@Controller('portal-parceiros/auth')
export class PortalParceiroAuthController {
  constructor(
    private readonly auth: ParceiroAuthService,
    private readonly config: ConfigService,
  ) {}

  @Throttle({ default: THROTTLE.login })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: ParceiroLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password);
    const csrfToken = randomBytes(32).toString('hex');
    setParceiroAuthCookies(res, this.config, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      csrfToken,
    });
    return { parceiro: result.parceiro, csrfToken };
  }

  @Throttle({ default: THROTTLE.refresh })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.refresh(
      req.cookies?.[PARCEIRO_COOKIE.refresh] as string | undefined,
    );
    const csrfToken = randomBytes(32).toString('hex');
    setParceiroAuthCookies(res, this.config, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      csrfToken,
    });
    return { csrfToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    let id: string | undefined;
    const token = req.cookies?.[PARCEIRO_COOKIE.access] as string | undefined;
    if (token) {
      try {
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
        ) as { sub?: string };
        id = payload.sub;
      } catch {
        id = undefined;
      }
    }
    await this.auth.logout(id);
    clearParceiroAuthCookies(res);
  }
}

@Public()
@UseGuards(PortalParceiroAuthGuard)
@Controller('portal-parceiros')
export class PortalParceiroController {
  constructor(
    private readonly auth: ParceiroAuthService,
    private readonly parcerias: ParceriasService,
  ) {}

  @Get('me')
  me(@CurrentParceiro() session: PortalParceiroSession) {
    return this.auth.me(session);
  }

  @Patch('me/senha')
  @HttpCode(204)
  changePassword(
    @CurrentParceiro() session: PortalParceiroSession,
    @Body() dto: ChangeParceiroPasswordDto,
  ) {
    return this.auth.changePassword(session, dto.senhaAtual, dto.senhaNova);
  }

  @Get('parcerias')
  parceriasList(@CurrentParceiro() session: PortalParceiroSession) {
    return this.parcerias.minhasParcerias(session);
  }

  @Post('parcerias/:id/aceitar')
  aceitar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentParceiro() session: PortalParceiroSession,
  ) {
    return this.parcerias.aceitar(id, session);
  }

  @Get('imoveis')
  imoveis(
    @CurrentParceiro() session: PortalParceiroSession,
    @Query('parceriaId') parceriaId?: string,
  ) {
    return this.parcerias.vitrine(session, parceriaId);
  }

  @Post('interesses')
  interesse(
    @CurrentParceiro() session: PortalParceiroSession,
    @Body() dto: InteresseDto,
    @Query('parceriaId') parceriaId?: string,
  ) {
    return this.parcerias.registrarInteresse(
      session,
      dto.imovelId,
      dto.mensagem,
      parceriaId,
    );
  }

  @Get('oportunidades')
  oportunidades(
    @CurrentParceiro() session: PortalParceiroSession,
    @Query('parceriaId') parceriaId?: string,
  ) {
    return this.parcerias.oportunidades(session, parceriaId);
  }

  @Post('oportunidades/:id/aceitar')
  aceitarOportunidade(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentParceiro() session: PortalParceiroSession,
  ) {
    return this.parcerias.aceitarOportunidade(id, session);
  }

  @Post('indicar')
  indicar(
    @CurrentParceiro() session: PortalParceiroSession,
    @Body() dto: IndicarClienteDto,
    @Query('parceriaId') parceriaId?: string,
  ) {
    return this.parcerias.indicar(session, dto, parceriaId);
  }

  @Get('repasses')
  repasses(
    @CurrentParceiro() session: PortalParceiroSession,
    @Query('parceriaId') parceriaId?: string,
  ) {
    return this.parcerias.extrato(session, parceriaId);
  }
}
