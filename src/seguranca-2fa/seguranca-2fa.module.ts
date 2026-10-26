import { Module } from '@nestjs/common';
import { Seguranca2faController } from './seguranca-2fa.controller';
import { Seguranca2faService } from './seguranca-2fa.service';

@Module({
  controllers: [Seguranca2faController],
  providers: [Seguranca2faService],
  exports: [Seguranca2faService],
})
export class Seguranca2faModule {}
