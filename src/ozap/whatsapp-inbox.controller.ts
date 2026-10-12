import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
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
  ) {
    const file = await this.inbox.streamMedia(url, type, requester);
    return new StreamableFile(file.body, { type: file.contentType });
  }

  @Get('chats')
  listChats(
    @CurrentUser() requester: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inbox.listChats(
      requester,
      Number(page) || 1,
      Number(limit) || 50,
    );
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

  @Post('chats/:chatId/resume')
  resume(
    @Param('chatId') chatId: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.inbox.resumeChat(decodeURIComponent(chatId), requester);
  }
}
