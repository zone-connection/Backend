import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LeadsModule } from './leads/leads.module';
import { CatalogModule } from './catalog/catalog.module';
import { FunisModule } from './funis/funis.module';
import { TriagemModule } from './triagem/triagem.module';
import { DocumentacaoModule } from './documentacao/documentacao.module';
import { EquipesModule } from './equipes/equipes.module';
import { AnaliseModule } from './analise/analise.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { AgendaModule } from './agenda/agenda.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { TenantsModule } from './tenants/tenants.module';
import { CaptacaoModule } from './captacao/captacao.module';
import { ImoveisUsadosModule } from './imoveis-usados/imoveis-usados.module';
import { PortalProprietarioModule } from './portal-proprietario/portal-proprietario.module';
import { ConstrutorasModule } from './construtoras/construtoras.module';
import { ContratosModule } from './contratos/contratos.module';
import { LocalidadesModule } from './localidades/localidades.module';
import { TreinamentoModule } from './treinamento/treinamento.module';
import { EmpreendimentosModule } from './empreendimentos/empreendimentos.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MetasModule } from './metas/metas.module';
import { OzapModule } from './ozap/ozap.module';
import { MetaModule } from './meta/meta.module';
import { OruloModule } from './orulo/orulo.module';
import { PropostasModule } from './propostas/propostas.module';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { FuncionariosModule } from './funcionarios/funcionarios.module';
import { PlatformContratosModule } from './platform-contratos/platform-contratos.module';
import { PlatformFornecedorContratosModule } from './platform-fornecedor-contratos/platform-fornecedor-contratos.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { validateEnv } from './config/env.validation';
import { THROTTLE } from './config/security.constants';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ...THROTTLE.global }],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    LeadsModule,
    CatalogModule,
    FunisModule,
    TriagemModule,
    DocumentacaoModule,
    ConstrutorasModule,
    ContratosModule,
    LocalidadesModule,
    TreinamentoModule,
    EmpreendimentosModule,
    DashboardModule,
    MetasModule,
    OzapModule,
    MetaModule,
    OruloModule,
    PropostasModule,
    FinanceiroModule,
    FuncionariosModule,
    PlatformContratosModule,
    PlatformFornecedorContratosModule,
    EquipesModule,
    AnaliseModule,
    NotificacoesModule,
    AgendaModule,
    GoogleCalendarModule,
    TenantsModule,
    CaptacaoModule,
    ImoveisUsadosModule,
    PortalProprietarioModule,
  ],
  controllers: [AppController],
  providers: [
    // A ordem importa: o rate limiting roda antes da autenticação, para que
    // uma enxurrada de requisições seja barrada sem tocar no banco.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Autenticação JWT aplicada globalmente; use @Public() para abrir rotas.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // CSRF depois do JWT — mutações autenticadas exigem o header X-CSRF-Token.
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {}
