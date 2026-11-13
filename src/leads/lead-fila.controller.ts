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
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { LeadFilaService } from './lead-fila.service';

class SetAtivaDto {
  @IsBoolean()
  ativa!: boolean;
}

class SetPrazoDto {
  @IsInt()
  @Min(0)
  @Max(1440)
  minutos!: number;
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

class SetFiltrosDto {
  @IsBoolean()
  filtroCampanhas!: boolean;

  @IsBoolean()
  outrosCanaisNaFila!: boolean;
}

class AddEquipeDto {
  @IsUUID()
  equipeId!: string;
}

class CampanhaVinculoDto {
  @IsIn(['meta', 'olx'])
  canal!: 'meta' | 'olx';

  @IsString()
  chave!: string;

  @IsString()
  nome!: string;
}

class SetCampanhasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampanhaVinculoDto)
  campanhas!: CampanhaVinculoDto[];
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

  @Get('campanhas')
  campanhas(@CurrentUser() user: AuthenticatedUser) {
    return this.fila.listarCampanhas(user);
  }

  @Patch('filtros')
  filtros(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetFiltrosDto) {
    return this.fila.setFiltros(user, dto);
  }

  @Post('equipes')
  adicionarEquipe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddEquipeDto,
  ) {
    return this.fila.adicionarEquipe(user, dto.equipeId);
  }

  @Put('membros/:id/campanhas')
  campanhasDoMembro(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCampanhasDto,
  ) {
    return this.fila.setCampanhas(user, id, dto.campanhas);
  }

  @Patch()
  setAtiva(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetAtivaDto) {
    return this.fila.setAtiva(user, dto.ativa);
  }

  @Patch('prazo')
  setPrazo(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetPrazoDto) {
    return this.fila.setRedistribuirMinutos(user, dto.minutos);
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
