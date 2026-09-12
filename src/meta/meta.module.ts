import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MetaWebhookSignatureGuard } from './guards/meta-webhook-signature.guard';
import { MetaGraphApiService } from './meta-graph-api.service';
import { MetaLeadPollService } from './meta-lead-poll.service';
import { MetaController } from './meta.controller';
import { MetaOAuthController } from './meta-oauth.controller';
import { MetaOAuthService } from './meta-oauth.service';
import { MetaService } from './meta.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [MetaController, MetaOAuthController],
  providers: [
    MetaService,
    MetaGraphApiService,
    MetaWebhookSignatureGuard,
    MetaLeadPollService,
    MetaOAuthService,
  ],
})
export class MetaModule {}
