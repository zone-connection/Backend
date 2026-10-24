import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { GoogleCalendarService } from './google-calendar.service';

@Controller('integrations/google')
export class GoogleCalendarController {
  constructor(private readonly googleCalendar: GoogleCalendarService) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.googleCalendar.status(user);
  }

  @Get('connect')
  connect(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
    @Query('returnOrigin') returnOrigin?: string,
  ) {
    const url = this.googleCalendar.buildAuthorizeUrl(
      user,
      req,
      returnOrigin,
    );
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
    const dest = await this.googleCalendar.handleCallback({
      code,
      state,
      error,
    });
    return res.redirect(dest);
  }

  @Post('disconnect')
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.googleCalendar.disconnect(user);
  }
}
