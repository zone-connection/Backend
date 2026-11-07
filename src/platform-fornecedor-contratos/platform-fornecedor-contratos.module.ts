import { Module } from '@nestjs/common';
import { PlatformFornecedorContratosController } from './platform-fornecedor-contratos.controller';
import { PlatformFornecedorContratosService } from './platform-fornecedor-contratos.service';

@Module({
  controllers: [PlatformFornecedorContratosController],
  providers: [PlatformFornecedorContratosService],
})
export class PlatformFornecedorContratosModule {}
