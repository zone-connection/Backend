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
import { QueryPropostaDto } from "./dto/query-proposta.dto";
import { UpdatePropostaDto } from "./dto/update-proposta.dto";
import { PropostasService } from "./propostas.service";

@Controller("propostas")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin, Role.gerente, Role.super_admin)
export class PropostasController {
  constructor(private readonly propostasService: PropostasService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPropostaDto,
  ) {
    return this.propostasService.list(query, user);
  }

  @Get("cep/:cep")
  buscarCep(@CurrentUser() user: AuthenticatedUser, @Param("cep") cep: string) {
    return this.propostasService.buscarCep(cep, user);
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
