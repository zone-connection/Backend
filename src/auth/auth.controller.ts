import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  RequestContext,
  type ClientContext,
} from '../common/decorators/request-context.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  clearAuthCookies,
  COOKIE,
  setAuthCookies,
} from '../common/utils/auth-cookies';
import { THROTTLE } from '../config/security.constants';
import { AuthService } from './auth.service';
import { TurnstileService } from './turnstile.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateAppearanceDto } from './dto/update-appearance.dto';
import { imageUploadInterceptor } from '../media/media.constants';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly turnstile: TurnstileService,
  ) {}

  @Public()
  @Throttle({ default: THROTTLE.login })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @RequestContext() context: ClientContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.turnstile.assertValid(dto.captchaToken, context.ip);

    const result = await this.authService.login(
      dto.email,
      dto.password,
      context,
      dto.tenantSlug,
    );

    if (result.status === 'mfa') {
      return { mfaRequired: true, mfaToken: result.mfaToken };
    }
    if (result.status === 'setup') {
      return { mfaSetupRequired: true, setupToken: result.setupToken };
    }
    if (result.status === 'decision') {
      return { mfaDecisionRequired: true, decisionToken: result.decisionToken };
    }
    return this.sessionResponse(res, result);
  }

  @Public()
  @Throttle({ default: THROTTLE.mfa })
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMfa(
    @Body() body: { mfaToken?: string; code?: string },
    @RequestContext() context: ClientContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.mfaToken || !body.code) {
      return { ok: false };
    }
    const result = await this.authService.verifyMfa(body.mfaToken, body.code, context);
    return this.sessionResponse(res, result);
  }

  @Public()
  @Throttle({ default: THROTTLE.mfa })
  @Post('mfa/recover')
  @HttpCode(HttpStatus.OK)
  async recoverMfa(
    @Body() body: { mfaToken?: string; recoveryCode?: string },
    @RequestContext() context: ClientContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.mfaToken || !body.recoveryCode) {
      return { ok: false };
    }
    const result = await this.authService.recoverMfa(
      body.mfaToken,
      body.recoveryCode,
      context,
    );
    return this.sessionResponse(res, result);
  }

  @Public()
  @Throttle({ default: THROTTLE.mfa })
  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  beginMfaSetup(@Body() body: { setupToken?: string }) {
    if (!body.setupToken) return { ok: false };
    return this.authService.beginMfaSetup(body.setupToken);
  }

  @Public()
  @Throttle({ default: THROTTLE.mfa })
  @Post('mfa/setup/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmMfaSetup(
    @Body() body: { setupToken?: string; code?: string },
    @RequestContext() context: ClientContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.setupToken || !body.code) return { ok: false };
    const result = await this.authService.confirmMfaSetup(
      body.setupToken,
      body.code,
      context,
    );
    const session = this.sessionResponse(res, result);
    return { ...session, recoveryCodes: result.recoveryCodes };
  }

  @Public()
  @Throttle({ default: THROTTLE.mfa })
  @Post('mfa/decision')
  @HttpCode(HttpStatus.OK)
  async decideMfa(
    @Body() body: { decisionToken?: string; choice?: 'manter' | 'recusar'; password?: string },
    @RequestContext() context: ClientContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.decisionToken || !body.choice || !body.password) return { ok: false };
    const result = await this.authService.decideMfa(
      body.decisionToken,
      body.choice,
      body.password,
      context,
    );
    if (result.status === 'setup') {
      return { mfaSetupRequired: true, setupToken: result.setupToken };
    }
    if (result.status !== 'authenticated') return { ok: false };
    return this.sessionResponse(res, result);
  }

  private sessionResponse(
    res: Response,
    result: { accessToken: string; refreshToken: string; user: unknown },
  ) {
    const csrfToken = randomBytes(32).toString('hex');
    setAuthCookies(res, this.config, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      csrfToken,
    });
    return { user: result.user, csrfToken };
  }

  @Public()
  @Throttle({ default: THROTTLE.refresh })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[COOKIE.refresh] as string | undefined;
    const tokens = await this.authService.refresh(refreshToken ?? '');

    const csrfToken = randomBytes(32).toString('hex');
    setAuthCookies(res, this.config, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      csrfToken,
    });

    return { ok: true, csrfToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(userId);
    clearAuthCookies(res, this.config);
  }

  @Post('heartbeat')
  @HttpCode(HttpStatus.NO_CONTENT)
  async heartbeat(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.heartbeat(user.id, user.tenantId);
  }

  @Throttle({ default: THROTTLE.mfa })
  @Post('mfa/decisao')
  async mfaDecisao(
    @CurrentUser('id') userId: string,
    @Body() body: { choice?: 'manter' | 'recusar'; password?: string; code?: string },
  ) {
    if (!body.choice || (body.choice === 'recusar' && !body.password)) {
      throw new BadRequestException('Informe a escolha e a senha atual.');
    }
    await this.authService.decideMfaInSession(
      userId,
      body.choice,
      body.password ?? '',
      body.code ?? '',
    );
    return { ok: true, setup: body.choice === 'manter' };
  }

  @Get('mfa/status')
  mfaStatus(@CurrentUser('id') userId: string) {
    return this.authService.mfaStatus(userId);
  }

  @Throttle({ default: THROTTLE.mfa })
  @Post('mfa/enable')
  mfaEnable(@CurrentUser('id') userId: string) {
    return this.authService.mfaEnable(userId);
  }

  @Throttle({ default: THROTTLE.mfa })
  @Post('mfa/enable/confirm')
  mfaConfirm(
    @CurrentUser('id') userId: string,
    @Body() body: { code?: string },
  ) {
    if (!body.code) throw new BadRequestException('Informe o código de seis dígitos.');
    return this.authService.mfaConfirm(userId, body.code);
  }

  @Throttle({ default: THROTTLE.mfa })
  @Post('mfa/disable')
  mfaDisable(
    @CurrentUser('id') userId: string,
    @Body() body: { password?: string; code?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.password || !body.code) {
      throw new BadRequestException('Informe a senha e o código atual.');
    }
    return this.authService.mfaDisable(userId, body.password, body.code).then(() => {
      clearAuthCookies(res, this.config);
      return { ok: true };
    });
  }

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.authService.me(userId);
  }

  @Patch('me')
  updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAppearanceDto,
  ) {
    return this.authService.updateAppearance(userId, dto);
  }

  @Post('me/avatar')
  @UseInterceptors(imageUploadInterceptor())
  uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.authService.uploadAvatar(userId, file);
  }

  @Delete('me/avatar')
  removeAvatar(@CurrentUser('id') userId: string) {
    return this.authService.removeAvatar(userId);
  }

  @Throttle({ default: THROTTLE.changePassword })
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Public()
  @Throttle({ default: THROTTLE.forgotPassword })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: THROTTLE.forgotPassword })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
  }
}
