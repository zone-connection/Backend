import { Module } from '@nestjs/common';
import { ListasDocumentosController } from './listas-documentos.controller';
import { ListasDocumentosService } from './listas-documentos.service';

@Module({
  controllers: [ListasDocumentosController],
  providers: [ListasDocumentosService],
})
export class ListasDocumentosModule {}
