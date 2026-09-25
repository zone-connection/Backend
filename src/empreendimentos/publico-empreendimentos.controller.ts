import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { EmpreendimentosService } from './empreendimentos.service';

@Controller('publico/empreendimentos')
export class PublicoEmpreendimentosController {
  constructor(private readonly empreendimentos: EmpreendimentosService) {}

  @Public()
  @Get(':tenantSlug/:slug')
  findPublicBySlug(
    @Param('tenantSlug') tenantSlug: string,
    @Param('slug') slug: string,
  ) {
    return this.empreendimentos.findPublicBySlug(tenantSlug, slug);
  }

  @Public()
  @Get(':id')
  findPublic(@Param('id', ParseUUIDPipe) id: string) {
    return this.empreendimentos.findPublic(id);
  }
}
