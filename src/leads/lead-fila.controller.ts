import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsUUID } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { LeadFilaService } from './lead-fila.service';

class SetAtivaDto {
  @IsBoolean()
  ativa!: boolean;
}

class AddMembroDto {
  @IsUUID()
  userId!: string;
}

class SetMembroDto {
  @IsBoolean()
  ativo!: boolean;
}

class ReordenarDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}

@Controller('leads/distribuir/fila')
export class LeadFilaController {
  constructor(private readonly fila: LeadFilaService) {}

  @Get()
  painel(
    @CurrentUser() user: AuthenticatedUser,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ) {
    return this.fila.painel(user, de, ate);
  }

  @Get('historico')
  historico(@CurrentUser() user: AuthenticatedUser) {
    return this.fila.historico(user);
  }

  @Get('elegiveis')
  elegiveis(@CurrentUser() user: AuthenticatedUser) {
    return this.fila.elegiveis(user);
  }

  @Patch()
  setAtiva(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetAtivaDto) {
    return this.fila.setAtiva(user, dto.ativa);
  }

  @Post('membros')
  adicionar(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddMembroDto) {
    return this.fila.adicionar(user, dto.userId);
  }

  @Patch('membros/:id')
  setMembro(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetMembroDto,
  ) {
    return this.fila.setMembroAtivo(user, id, dto.ativo);
  }

  @Delete('membros/:id')
  remover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.fila.remover(user, id);
  }

  @Put('ordem')
  reordenar(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReordenarDto) {
    return this.fila.reordenar(user, dto.ids);
  }
}
