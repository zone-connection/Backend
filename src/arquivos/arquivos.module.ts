import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { MailerModule } from '../mailer/mailer.module';
import { ArquivosController } from './arquivos.controller';
import { ArquivosService } from './arquivos.service';
import { MulterUploadFilter } from './multer-upload.filter';
import { R2Service } from './r2.service';

@Module({
  imports: [MailerModule],
  controllers: [ArquivosController],
  providers: [
    ArquivosService,
    R2Service,
    { provide: APP_FILTER, useClass: MulterUploadFilter },
  ],
  exports: [ArquivosService],
})
export class ArquivosModule {}
