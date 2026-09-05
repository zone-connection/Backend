import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { QueryAnaliseDto, UpdateAnaliseDto } from './dto/analise.dto';
import { AnaliseService } from './analise.service';

@Controller('analise')
@UseGuards(RolesGuard)
@Roles(Role.admin, Role.gerente, Role.analista)
export class AnaliseController {
  constructor(private readonly analiseService: AnaliseService) {}

  @Get()
  list(
    @Query() query: QueryAnaliseDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.analiseService.list(query, requester);
  }

  @Get('resumo')
  resumo(@CurrentUser() requester: AuthenticatedUser) {
    return this.analiseService.resumo(requester);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.analiseService.findOne(id, requester);
  }

  @Post(':id/assumir')
  assumir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.analiseService.assumir(id, requester);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnaliseDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.analiseService.update(id, dto, requester);
  }
}
