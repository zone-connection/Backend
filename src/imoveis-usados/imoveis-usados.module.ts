import { Module } from '@nestjs/common';
import { ImoveisUsadosService } from './imoveis-usados.service';
import { VendaUsadoFluxoService } from './venda-usado-fluxo.service';
import { VendaUsadoFechamentoService } from './venda-usado-fechamento.service';
import { ImovelChaveService } from './imovel-chave.service';
import { VendaUsadoPosVendaService } from './venda-usado-pos-venda.service';
import { ImoveisUsadosController } from './imoveis-usados.controller';
import { InteressadosUsadosController } from './interessados-usados.controller';

import { FunisModule } from '../funis/funis.module';

@Module({
  imports: [FunisModule],
  controllers: [InteressadosUsadosController, ImoveisUsadosController],
  providers: [
    ImoveisUsadosService,
    VendaUsadoFluxoService,
    VendaUsadoFechamentoService,
    ImovelChaveService,
    VendaUsadoPosVendaService,
  ],
  exports: [
    ImoveisUsadosService,
    VendaUsadoFluxoService,
    VendaUsadoFechamentoService,
    ImovelChaveService,
    VendaUsadoPosVendaService,
  ],
})
export class ImoveisUsadosModule {}
