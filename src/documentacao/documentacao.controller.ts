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
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateDocumentacaoDto } from './dto/create-documentacao.dto';
import { UpdateDocumentacaoDto } from './dto/update-documentacao.dto';
import { QueryDocumentacaoDto } from './dto/query-documentacao.dto';
import { DocumentacaoService } from './documentacao.service';

@Controller('documentacao')
@UseGuards(RolesGuard)
@Roles(Role.admin, Role.gerente, Role.corretor, Role.treinee, Role.analista, Role.super_admin)
export class DocumentacaoController {
  constructor(private readonly documentacaoService: DocumentacaoService) {}

  @Get()
  list(
    @Query() query: QueryDocumentacaoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.documentacaoService.list(query, requester);
  }

  /**
   * Usuários ativos do tenant para o select na ficha.
   * Admin/gerente/analista/treinee: corretores, treinees e gerentes.
   * Corretor: apenas o próprio.
   * Precisa ficar antes de GET :id.
   */
  @Get('corretores')
  @Roles(
    Role.admin,
    Role.gerente,
    Role.corretor,
    Role.treinee,
    Role.analista,
    Role.financeiro,
  )
  listCorretores(@CurrentUser() requester: AuthenticatedUser) {
    return this.documentacaoService.listCorretores(requester);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.documentacaoService.findOne(id, requester);
  }

  @Post()
  @Roles(Role.admin, Role.analista, Role.gerente, Role.treinee)
  create(
    @Body() dto: CreateDocumentacaoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.documentacaoService.create(dto, requester);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.analista, Role.gerente)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentacaoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.documentacaoService.update(id, dto, requester);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.analista)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.documentacaoService.remove(id, requester);
  }
}
