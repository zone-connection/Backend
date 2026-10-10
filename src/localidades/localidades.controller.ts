import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateLocalidadeDto } from "./dto/create-localidade.dto";
import { UpdateLocalidadeDto } from "./dto/update-localidade.dto";
import { LocalidadesService } from "./localidades.service";

@Controller("localidades")
@UseGuards(RolesGuard)
export class LocalidadesController {
  constructor(private readonly localidadesService: LocalidadesService) {}

  @Get()
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista, Role.treinee)
  list(@CurrentUser() requester: AuthenticatedUser) {
    return this.localidadesService.list(requester);
  }

  @Post()
  @Roles(Role.admin, Role.gerente, Role.analista, Role.treinee, Role.corretor)
  create(
    @Body() dto: CreateLocalidadeDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.localidadesService.create(dto, requester);
  }

  @Patch(":id")
  @Roles(Role.admin, Role.gerente, Role.analista, Role.treinee, Role.corretor)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocalidadeDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.localidadesService.update(id, dto, requester);
  }

  @Delete(":id")
  @Roles(Role.admin, Role.gerente, Role.analista, Role.treinee, Role.corretor)
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.localidadesService.remove(id, requester);
  }
}
