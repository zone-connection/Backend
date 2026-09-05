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
import { CreateConstrutoraDto } from "./dto/create-construtora.dto";
import { UpdateConstrutoraDto } from "./dto/update-construtora.dto";
import { QueryConstrutorasDto } from "./dto/query-construtoras.dto";
import { QueryVendasPeriodoDto } from "./dto/query-vendas-periodo.dto";
import { ConstrutorasService } from "./construtoras.service";

const IMAGE_ROLES = [
  Role.admin,
  Role.gerente,
  Role.analista,
  Role.treinee,
  Role.corretor,
] as const;

@Controller("construtoras")
@UseGuards(RolesGuard)
export class ConstrutorasController {
  constructor(private readonly construtorasService: ConstrutorasService) {}

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
    @Query() query: QueryConstrutorasDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.construtorasService.list(query, requester);
  }

  @Get(":id/vendas")
  @Roles(Role.admin, Role.gerente)
  listVendas(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: QueryVendasPeriodoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.construtorasService.listVendas(id, requester, query);
  }

  @Get(":id")
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista, Role.treinee)
  findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.construtorasService.findOne(id, requester);
  }

  @Post()
  @Roles(...IMAGE_ROLES)
  create(
    @Body() dto: CreateConstrutoraDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.construtorasService.create(dto, requester);
  }

  @Post(":id/logo")
  @Roles(...IMAGE_ROLES)
  @UseInterceptors(imageUploadInterceptor())
  uploadLogo(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.construtorasService.uploadLogo(id, file, requester);
  }

  @Patch(":id")
  @Roles(...IMAGE_ROLES)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateConstrutoraDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.construtorasService.update(id, dto, requester);
  }

  @Delete(":id/logo")
  @Roles(...IMAGE_ROLES)
  removeLogo(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.construtorasService.removeLogo(id, requester);
  }

  @Delete(":id")
  @Roles(Role.admin, Role.treinee)
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.construtorasService.remove(id, requester);
  }
}
