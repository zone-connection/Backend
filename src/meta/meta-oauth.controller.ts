import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CompleteMetaOAuthDto } from './dto/complete-meta-oauth.dto';
import { MetaOAuthService } from './meta-oauth.service';

@Controller('integrations/meta')
export class MetaOAuthController {
  constructor(private readonly metaOAuth: MetaOAuthService) {}

  @Get('status')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.metaOAuth.status(user);
  }

  @Get('connect')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  connect(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
    @Query('returnOrigin') returnOrigin?: string,
  ) {
    const url = this.metaOAuth.buildAuthorizeUrl(user, req, returnOrigin);
    return res.redirect(url);
  }

  @Get('callback')
  @Public()
  @SkipThrottle()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const dest = await this.metaOAuth.handleCallback({ code, state, error });
    return res.redirect(dest);
  }

  @Get('assets')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  assets(@CurrentUser() user: AuthenticatedUser) {
    return this.metaOAuth.listAssets(user);
  }

  @Post('complete')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteMetaOAuthDto,
  ) {
    return this.metaOAuth.complete(user, dto);
  }

  @Post('disconnect')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.metaOAuth.disconnect(user);
  }
}
