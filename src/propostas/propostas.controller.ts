import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreatePropostaDto } from "./dto/create-proposta.dto";
import { CreatePropostaVinculoDto } from "./dto/create-proposta-vinculo.dto";
import { QueryPropostaDto } from "./dto/query-proposta.dto";
import { QueryPropostasVinculadasDto } from "./dto/query-propostas-vinculadas.dto";
import { UpdatePropostaDto } from "./dto/update-proposta.dto";
import { PropostaVinculosService } from "./proposta-vinculos.service";
import { PropostasService } from "./propostas.service";

@Controller("propostas")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  Role.admin,
  Role.gerente,
  Role.super_admin,
  Role.corretor,
  Role.treinee,
  Role.analista,
)
export class PropostasController {
  constructor(
    private readonly propostasService: PropostasService,
    private readonly vinculos: PropostaVinculosService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPropostaDto,
  ) {
    return this.propostasService.list(query, user);
  }

  @Get("vinculadas")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  listVinculadas(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPropostasVinculadasDto,
  ) {
    return this.propostasService.listVinculadas(query, user);
  }

  @Get("cep/:cep")
  buscarCep(@CurrentUser() user: AuthenticatedUser, @Param("cep") cep: string) {
    return this.propostasService.buscarCep(cep, user);
  }

  @Get(":id/vinculos")
  listVinculos(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.vinculos.list(id, user);
  }

  @Post(":id/vinculos")
  createVinculo(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreatePropostaVinculoDto,
  ) {
    return this.vinculos.create(id, dto, user);
  }

  @Delete(":id/vinculos/:vinculoId")
  removeVinculo(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("vinculoId", ParseUUIDPipe) vinculoId: string,
  ) {
    return this.vinculos.remove(id, vinculoId, user);
  }

  @Get(":id")
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.propostasService.findOne(id, user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePropostaDto,
  ) {
    return this.propostasService.create(dto, user);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePropostaDto,
  ) {
    return this.propostasService.update(id, dto, user);
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.propostasService.remove(id, user);
  }
}
