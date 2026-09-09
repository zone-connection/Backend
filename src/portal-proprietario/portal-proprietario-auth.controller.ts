import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import {
  PORTAL_COOKIE,
  clearPortalAuthCookies,
  setPortalAuthCookies,
} from '../common/utils/auth-cookies';
import { THROTTLE } from '../config/security.constants';
import {
  PortalForgotPasswordDto,
  PortalLoginDto,
  PortalResetPasswordDto,
} from './dto/portal-auth.dto';
import { PortalProprietarioAuthService } from './portal-proprietario-auth.service';

@Public()
@Controller('portal-proprietario/auth')
export class PortalProprietarioAuthController {
  constructor(
    private readonly auth: PortalProprietarioAuthService,
    private readonly config: ConfigService,
  ) {}

  @Throttle({ default: THROTTLE.login })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: PortalLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(
      dto.email,
      dto.password,
      dto.tenantSlug,
    );
    const csrfToken = randomBytes(32).toString('hex');
    setPortalAuthCookies(res, this.config, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      csrfToken,
    });
    return { proprietario: result.proprietario, csrfToken };
  }

  @Throttle({ default: THROTTLE.refresh })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.refresh(
      req.cookies?.[PORTAL_COOKIE.refresh] as string | undefined,
    );
    const csrfToken = randomBytes(32).toString('hex');
    setPortalAuthCookies(res, this.config, {
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
    let acessoId: string | undefined;
    const token = req.cookies?.[PORTAL_COOKIE.access] as string | undefined;
    if (token) {
      try {
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
        ) as { sub?: string };
        acessoId = payload.sub;
      } catch {
        acessoId = undefined;
      }
    }
    await this.auth.logout(acessoId);
    clearPortalAuthCookies(res);
  }

  @Throttle({ default: THROTTLE.forgotPassword })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: PortalForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email, dto.tenantSlug);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() dto: PortalResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }
}
