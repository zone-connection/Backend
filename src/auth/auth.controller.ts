import {
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
    const result = await this.authService.login(
      dto.email,
      dto.password,
      context,
      dto.tenantSlug,
    );

    const csrfToken = randomBytes(32).toString('hex');
    setAuthCookies(res, this.config, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      csrfToken,
    });

    // Tokens JWT ficam só nos cookies httpOnly.
    // csrfToken no body para frontends cross-origin (Vercel → Render).
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
