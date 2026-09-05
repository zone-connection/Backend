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
import { CreateTriagemDto } from './dto/create-triagem.dto';
import { UpdateTriagemDto } from './dto/update-triagem.dto';
import { QueryTriagemLeadsDto } from './dto/query-triagem-leads.dto';
import { TriagemService } from './triagem.service';

@Controller('triagem')
export class TriagemController {
  constructor(private readonly triagemService: TriagemService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.corretor, Role.treinee, Role.gerente, Role.admin, Role.super_admin)
  create(
    @Body() dto: CreateTriagemDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.triagemService.create(dto, requester);
  }

  @Patch('events/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.corretor, Role.treinee, Role.gerente, Role.admin, Role.super_admin)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTriagemDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.triagemService.update(id, dto, requester);
  }

  /** Antes de GET :leadId — lista contatos da tela. */
  @Get('leads')
  listLeads(
    @Query() query: QueryTriagemLeadsDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.triagemService.listLeads(query, requester);
  }

  @Get(':leadId')
  listByLead(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.triagemService.listByLead(leadId, requester);
  }
}
