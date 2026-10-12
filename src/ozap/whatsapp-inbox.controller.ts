import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { SendLeadWhatsappDto } from '../leads/dto/send-lead-whatsapp.dto';
import { WhatsappInboxService } from './whatsapp-inbox.service';

@Controller('whatsapp')
export class WhatsappInboxController {
  constructor(private readonly inbox: WhatsappInboxService) {}

  @Get('chats')
  listChats(@CurrentUser() requester: AuthenticatedUser) {
    return this.inbox.listChats(requester);
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
