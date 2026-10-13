import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { SendLeadWhatsappDto } from '../leads/dto/send-lead-whatsapp.dto';
import { WhatsappInboxService } from './whatsapp-inbox.service';

@Controller('whatsapp')
export class WhatsappInboxController {
  constructor(private readonly inbox: WhatsappInboxService) {}

  @Get('media')
  async media(
    @Query('url') url: string,
    @Query('type') type: string | undefined,
    @CurrentUser() requester: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const publicUrl = this.inbox.publicMediaUrl(url);
    if (publicUrl) {
      res.redirect(302, publicUrl);
      return;
    }
    const file = await this.inbox.streamMedia(url, type, requester);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(file.body);
  }

  @Post('media/transcribe')
  transcribe(
    @Body() body: { url?: string },
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.inbox.transcribeAudio(body.url ?? '', requester);
  }

  @Get('chats')
  listChats(
    @CurrentUser() requester: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('corretorId') corretorId?: string,
    @Query('equipeId') equipeId?: string,
    @Query('tagId') tagId?: string,
  ) {
    return this.inbox.listChats(
      requester,
      Number(page) || 1,
      Number(limit) || 50,
      { corretorId, equipeId, tagId },
    );
  }

  @Get('tags')
  listTags(@CurrentUser() requester: AuthenticatedUser) {
    return this.inbox.listTags(requester);
  }

  @Post('tags')
  createTag(
    @Body() body: { name?: string; color?: string },
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.inbox.createTag(requester, body);
  }

  @Post('tags/from-funil')
  importFunilTags(@CurrentUser() requester: AuthenticatedUser) {
    return this.inbox.importFunilTags(requester);
  }

  @Delete('tags/:tagId')
  deleteTag(
    @Param('tagId') tagId: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.inbox.deleteTag(tagId, requester);
  }

  @Get('chats/:chatId/messages')
  listMessages(
    @Param('chatId') chatId: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.inbox.listMessages(decodeURIComponent(chatId), requester);
  }

  @Post('chats/:chatId/messages')
  sendMessage(
    @Param('chatId') chatId: string,
    @Body() dto: SendLeadWhatsappDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.inbox.sendMessage(
      decodeURIComponent(chatId),
      dto.content,
      requester,
    );
  }

  @Post('chats/:chatId/assume')
  assume(
    @Param('chatId') chatId: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.inbox.assumeChat(decodeURIComponent(chatId), requester);
  }

  @Post('chats/:chatId/tags')
  attachTag(
    @Param('chatId') chatId: string,
    @Body() body: { tagId?: string },
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.inbox.setChatTag(
      decodeURIComponent(chatId),
      body.tagId ?? '',
      requester,
      true,
    );
  }

  @Delete('chats/:chatId/tags/:tagId')
  detachTag(
    @Param('chatId') chatId: string,
    @Param('tagId') tagId: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.inbox.setChatTag(
      decodeURIComponent(chatId),
      tagId,
      requester,
      false,
    );
  }

  @Post('chats/:chatId/resume')
  resume(
    @Param('chatId') chatId: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.inbox.resumeChat(decodeURIComponent(chatId), requester);
  }
}
