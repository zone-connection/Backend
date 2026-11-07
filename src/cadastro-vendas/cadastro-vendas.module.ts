import { Module } from '@nestjs/common';
import { CadastroVendasController } from './cadastro-vendas.controller';
import { CadastroVendasService } from './cadastro-vendas.service';

@Module({
  controllers: [CadastroVendasController],
  providers: [CadastroVendasService],
})
export class CadastroVendasModule {}
