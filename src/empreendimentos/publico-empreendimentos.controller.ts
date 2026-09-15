import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { EmpreendimentosService } from './empreendimentos.service';

@Controller('publico/empreendimentos')
export class PublicoEmpreendimentosController {
  constructor(private readonly empreendimentos: EmpreendimentosService) {}

  @Public()
  @Get(':id')
  findPublic(@Param('id', ParseUUIDPipe) id: string) {
    return this.empreendimentos.findPublic(id);
  }
}
