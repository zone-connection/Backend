import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { imageUploadInterceptor } from "../media/media.constants";
import { CreateEmpreendimentoDto } from "./dto/create-empreendimento.dto";
import { UpdateEmpreendimentoDto } from "./dto/update-empreendimento.dto";
import { QueryEmpreendimentosDto } from "./dto/query-empreendimentos.dto";
import { EmpreendimentosService } from "./empreendimentos.service";

const IMAGE_ROLES = [Role.admin, Role.gerente, Role.analista, Role.treinee] as const;

@Controller("empreendimentos")
@UseGuards(RolesGuard)
export class EmpreendimentosController {
  constructor(
    private readonly empreendimentosService: EmpreendimentosService,
  ) {}

  @Get()
  @Roles(
    Role.admin,
    Role.gerente,
    Role.corretor,
    Role.analista,
    Role.treinee,
    Role.financeiro,
    Role.super_admin,
  )
  list(
    @Query() query: QueryEmpreendimentosDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.empreendimentosService.list(query, requester);
  }

  @Get(":id/matches")
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista, Role.treinee)
  listMatches(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.empreendimentosService.listMatches(id, requester);
  }

  @Get(":id")
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista, Role.treinee)
  findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.empreendimentosService.findOne(id, requester);
  }

  @Post()
  @Roles(...IMAGE_ROLES)
  create(
    @Body() dto: CreateEmpreendimentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.empreendimentosService.create(dto, requester);
  }

  @Post(":id/imagens")
  @Roles(...IMAGE_ROLES)
  @UseInterceptors(imageUploadInterceptor())
  uploadImagem(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.empreendimentosService.uploadImagem(id, file, requester);
  }

  @Patch(":id")
  @Roles(...IMAGE_ROLES, Role.corretor)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmpreendimentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.empreendimentosService.update(id, dto, requester);
  }

  @Delete(":id/imagens/:index")
  @Roles(...IMAGE_ROLES)
  removeImagem(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("index", ParseIntPipe) index: number,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.empreendimentosService.removeImagem(id, index, requester);
  }

  @Delete(":id")
  @Roles(Role.admin, Role.analista, Role.treinee)
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.empreendimentosService.remove(id, requester);
  }
}
