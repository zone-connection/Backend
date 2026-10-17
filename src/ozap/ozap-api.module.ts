import { Module } from '@nestjs/common';
import { OzapApiClient } from './ozap-api.client';

@Module({
  providers: [OzapApiClient],
  exports: [OzapApiClient],
})
export class OzapApiModule {}
