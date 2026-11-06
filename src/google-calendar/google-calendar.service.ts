import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AgendamentoAlvo,
  AgendamentoSolicitacaoStatus,
  AgendamentoStatus,
  AgendamentoTipo,
  Role,
  UserStatus,
} from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  decryptSecret,
  encryptSecret,
  googleTokenKey,
} from './google-token.crypto';
import {
  frontendOAuthReturnUrl,
  googleOAuthConfigured,
  parseAllowedRedirectUris,
  pickRedirectUri,
} from './google-oauth.util';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const USERINFO_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const SCOPES = `openid email ${CALENDAR_SCOPE} ${USERINFO_SCOPE}`;
const TIME_ZONE = 'America/Sao_Paulo';
const STATE_TYP = 'gcal-oauth';

type OAuthState = {
  sub: string;
  redirectUri: string;
  typ: string;
};

export type GoogleSyncAgendamento = {
  id: string;
  tenantId?: string | null;
  autorId: string;
  atribuidoParaId: string | null;
  titulo: string;
  tipo: AgendamentoTipo;
  status: AgendamentoStatus;
  solicitacaoStatus: AgendamentoSolicitacaoStatus;
  alvoTipo: AgendamentoAlvo;
  alvoEquipeId?: string | null;
  alvoGerenteId?: string | null;
  startsAt: Date;
  endsAt: Date | null;
  local: string | null;
  observacoes: string | null;
  lead?: { nome: string } | null;
};

type GoogleConnection = {
  id: string;
  userId: string;
  calendarId: string;
  refreshTokenEnc: string;
};

type TokenSet = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type AccessCache = { token: string; exp: number };

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly accessCache = new Map<string, AccessCache>();
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  isConfigured() {
    return googleOAuthConfigured(this.config);
  }

  async status(user: AuthenticatedUser) {
    if (!this.isConfigured()) {
      return { configured: false, connected: false, googleEmail: null };
    }
    const row = await this.prisma.userGoogleCalendar.findUnique({
      where: { userId: user.id },
      select: { googleEmail: true },
    });
    return {
      configured: true,
      connected: Boolean(row),
      googleEmail: row?.googleEmail ?? null,
    };
  }

  buildAuthorizeUrl(user: AuthenticatedUser, req: Request, returnOrigin?: string) {
    this.assertConfigured();
    const allowed = parseAllowedRedirectUris(this.config);
    const redirectUri = pickRedirectUri(req, allowed, returnOrigin);
    const state = this.jwt.sign(
      { sub: user.id, redirectUri, typ: STATE_TYP } satisfies OAuthState,
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '10m',
      },
    );
    const params = new URLSearchParams({
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'select_account consent',
      include_granted_scopes: 'true',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(query: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<string> {
    let redirectUri = parseAllowedRedirectUris(this.config)[0];
    try {
      if (!query.state) {
        return frontendOAuthReturnUrl(redirectUri, 'error');
      }
      const payload = this.jwt.verify<OAuthState>(query.state, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.typ !== STATE_TYP || !payload.sub || !payload.redirectUri) {
        return frontendOAuthReturnUrl(redirectUri, 'error');
      }
      redirectUri = payload.redirectUri;
      if (query.error === 'access_denied') {
        return frontendOAuthReturnUrl(redirectUri, 'denied');
      }
      if (!query.code) {
        return frontendOAuthReturnUrl(redirectUri, 'error');
      }

      const tokens = await this.exchangeCode(query.code, payload.redirectUri);
      if (!tokens.access_token) {
        this.logger.warn(
          `OAuth Google sem access_token: ${tokens.error_description ?? tokens.error}`,
        );
        return frontendOAuthReturnUrl(redirectUri, 'error');
      }
      const refreshToken =
        tokens.refresh_token ??
        (await this.existingRefreshToken(payload.sub));
      if (!refreshToken) {
        this.logger.warn('OAuth Google não devolveu refresh_token.');
        return frontendOAuthReturnUrl(redirectUri, 'error');
      }

      const googleEmail = await this.fetchGoogleEmail(tokens.access_token);
      const key = googleTokenKey(this.config);
      await this.prisma.userGoogleCalendar.upsert({
        where: { userId: payload.sub },
        create: {
          userId: payload.sub,
          googleEmail,
          refreshTokenEnc: encryptSecret(refreshToken, key),
        },
        update: {
          googleEmail,
          refreshTokenEnc: encryptSecret(refreshToken, key),
        },
      });
      this.accessCache.set(payload.sub, {
        token: tokens.access_token,
        exp: Date.now() + (tokens.expires_in ?? 3500) * 1000,
      });
      await this.backfillUpcoming(payload.sub).catch((err) =>
        this.logger.warn(
          `Backfill Google Calendar falhou: ${err instanceof Error ? err.message : err}`,
        ),
      );
      return frontendOAuthReturnUrl(redirectUri, 'connected');
    } catch (err) {
      this.logger.warn(
        `Callback Google falhou: ${err instanceof Error ? err.message : err}`,
      );
      return frontendOAuthReturnUrl(redirectUri, 'error');
    }
  }

  async disconnect(user: AuthenticatedUser) {
    await this.prisma.userGoogleCalendar.deleteMany({
      where: { userId: user.id },
    });
    this.accessCache.delete(user.id);
    return { ok: true };
  }

  async syncAgendamento(
    item: GoogleSyncAgendamento,
    opts?: { onlyUserId?: string },
  ) {
    return this.enqueue(item.id, () => this.syncAgendamentoNow(item, opts));
  }

  async removeAgendamento(agendamentoId: string) {
    return this.enqueue(agendamentoId, () =>
      this.removeAgendamentoNow(agendamentoId),
    );
  }

  async removeMany(agendamentoIds: string[]) {
    if (agendamentoIds.length === 0) return;
    for (const id of agendamentoIds) {
      await this.removeAgendamento(id);
    }
  }

  private enqueue(agendamentoId: string, work: () => Promise<void>) {
    const previous = this.inflight.get(agendamentoId) ?? Promise.resolve();
    const next = previous.then(work, work);
    this.inflight.set(agendamentoId, next);
    void next.finally(() => {
      if (this.inflight.get(agendamentoId) === next) {
        this.inflight.delete(agendamentoId);
      }
    });
    return next;
  }

  private async syncAgendamentoNow(
    item: GoogleSyncAgendamento,
    opts?: { onlyUserId?: string },
  ) {
    if (!this.shouldPush(item)) {
      if (
        item.status === AgendamentoStatus.cancelado ||
        item.solicitacaoStatus === AgendamentoSolicitacaoStatus.recusada
      ) {
        await this.removeAgendamentoNow(item.id);
      }
      return;
    }

    const recipientIds = await this.resolveRecipientUserIds(item);
    const targetIds = opts?.onlyUserId
      ? recipientIds.filter((id) => id === opts.onlyUserId)
      : recipientIds;
    if (targetIds.length === 0) return;

    const connections = await this.prisma.userGoogleCalendar.findMany({
      where: { userId: { in: targetIds } },
    });
    const body = this.eventBody(item);
    for (const connection of connections) {
      try {
        await this.upsertGoogleEvent(connection, item, body);
      } catch (err) {
        this.logger.warn(
          `Falha ao replicar no Google de ${connection.userId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (!opts?.onlyUserId) {
      await this.removeStaleCopies(item.id, recipientIds);
    }
  }

  private async upsertGoogleEvent(
    connection: GoogleConnection,
    item: GoogleSyncAgendamento,
    body: ReturnType<GoogleCalendarService['eventBody']>,
  ) {
    const accessToken = await this.accessTokenFor(connection);
    if (!accessToken) return;

    const mapping = await this.prisma.userGoogleCalendarEvent.findUnique({
      where: {
        agendamentoId_connectionId: {
          agendamentoId: item.id,
          connectionId: connection.id,
        },
      },
    });

    if (mapping) {
      const updated = await this.calendarFetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(mapping.googleEventId)}`,
        {
          method: 'PATCH',
          accessToken,
          body,
        },
      );
      if (updated.status === 404) {
        await this.prisma.userGoogleCalendarEvent.delete({
          where: { id: mapping.id },
        });
        await this.createGoogleEvent(
          connection.id,
          connection.calendarId,
          item,
          accessToken,
          body,
        );
      }
      return;
    }

    await this.createGoogleEvent(
      connection.id,
      connection.calendarId,
      item,
      accessToken,
      body,
    );
  }

  private async removeStaleCopies(
    agendamentoId: string,
    recipientIds: string[],
  ) {
    const keep = new Set(recipientIds);
    const mappings = await this.prisma.userGoogleCalendarEvent.findMany({
      where: { agendamentoId },
      include: { connection: true },
    });
    for (const mapping of mappings) {
      if (keep.has(mapping.connection.userId)) continue;
      await this.deleteMappedEvent(mapping);
    }
  }

  private async removeAgendamentoNow(agendamentoId: string) {
    const mappings = await this.prisma.userGoogleCalendarEvent.findMany({
      where: { agendamentoId },
      include: { connection: true },
    });
    for (const mapping of mappings) {
      await this.deleteMappedEvent(mapping);
    }
  }

  private async deleteMappedEvent(mapping: {
    id: string;
    googleEventId: string;
    connection: GoogleConnection;
  }) {
    const accessToken = await this.accessTokenFor(mapping.connection);
    if (accessToken) {
      await this.calendarFetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(mapping.connection.calendarId)}/events/${encodeURIComponent(mapping.googleEventId)}`,
        { method: 'DELETE', accessToken },
      );
    }
    await this.prisma.userGoogleCalendarEvent
      .delete({ where: { id: mapping.id } })
      .catch(() => undefined);
  }

  /** Quem deve receber a cópia no Google, alinhado à visibilidade no CRM. */
  private async resolveRecipientUserIds(
    item: GoogleSyncAgendamento,
  ): Promise<string[]> {
    const tenantId =
      item.tenantId ??
      (
        await this.prisma.agendamento.findUnique({
          where: { id: item.id },
          select: { tenantId: true },
        })
      )?.tenantId;
    if (!tenantId) {
      return [item.atribuidoParaId ?? item.autorId];
    }

    const ids = new Set<string>();
    const addActive = async (where: {
      id?: string | { in: string[] };
      role?: Role;
      equipeId?: string;
    }) => {
      const users = await this.prisma.user.findMany({
        where: {
          tenantId,
          status: UserStatus.ativo,
          role: { not: Role.super_admin },
          ...where,
        },
        select: { id: true },
      });
      for (const user of users) ids.add(user.id);
    };

    switch (item.alvoTipo) {
      case AgendamentoAlvo.todos:
        await addActive({});
        break;
      case AgendamentoAlvo.gerentes:
        ids.add(item.autorId);
        await addActive({ role: Role.gerente });
        break;
      case AgendamentoAlvo.gerente:
        ids.add(item.autorId);
        if (item.alvoGerenteId) ids.add(item.alvoGerenteId);
        break;
      case AgendamentoAlvo.equipe: {
        ids.add(item.autorId);
        const equipeId = item.alvoEquipeId;
        if (equipeId) {
          const equipe = await this.prisma.equipe.findFirst({
            where: { id: equipeId, tenantId },
            select: { gerenteId: true },
          });
          if (equipe?.gerenteId) ids.add(equipe.gerenteId);
          await addActive({ equipeId });
        }
        break;
      }
      default:
        ids.add(item.atribuidoParaId ?? item.autorId);
        break;
    }

    if (ids.size === 0) ids.add(item.atribuidoParaId ?? item.autorId);

    const active = await this.prisma.user.findMany({
      where: {
        id: { in: [...ids] },
        tenantId,
        status: UserStatus.ativo,
        role: { not: Role.super_admin },
      },
      select: { id: true },
    });
    return active.map((user) => user.id);
  }

  private shouldPush(item: GoogleSyncAgendamento) {
    if (item.tipo === AgendamentoTipo.bloqueio) return false;
    if (item.solicitacaoStatus === AgendamentoSolicitacaoStatus.pendente) {
      return false;
    }
    if (item.solicitacaoStatus === AgendamentoSolicitacaoStatus.recusada) {
      return false;
    }
    if (item.status === AgendamentoStatus.cancelado) return false;
    return true;
  }

  private async backfillUpcoming(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        tenantId: true,
        role: true,
        equipeId: true,
        equipeGerenciada: { select: { id: true } },
      },
    });
    if (!user?.tenantId) return;

    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const adminAudience: Array<{
      alvoTipo: AgendamentoAlvo;
      alvoEquipeId?: string;
      alvoGerenteId?: string;
    }> = [{ alvoTipo: AgendamentoAlvo.todos }];
    if (user.role === Role.admin) {
      adminAudience.push(
        { alvoTipo: AgendamentoAlvo.equipe },
        { alvoTipo: AgendamentoAlvo.gerente },
        { alvoTipo: AgendamentoAlvo.gerentes },
      );
    } else if (user.role === Role.gerente) {
      adminAudience.push({ alvoTipo: AgendamentoAlvo.gerentes });
      adminAudience.push({
        alvoTipo: AgendamentoAlvo.gerente,
        alvoGerenteId: userId,
      });
      if (user.equipeGerenciada?.id) {
        adminAudience.push({
          alvoTipo: AgendamentoAlvo.equipe,
          alvoEquipeId: user.equipeGerenciada.id,
        });
      }
    } else if (user.equipeId) {
      adminAudience.push({
        alvoTipo: AgendamentoAlvo.equipe,
        alvoEquipeId: user.equipeId,
      });
    }

    const items = await this.prisma.agendamento.findMany({
      where: {
        tenantId: user.tenantId,
        startsAt: { gte: from },
        status: { not: AgendamentoStatus.cancelado },
        tipo: { not: AgendamentoTipo.bloqueio },
        solicitacaoStatus: {
          notIn: [
            AgendamentoSolicitacaoStatus.pendente,
            AgendamentoSolicitacaoStatus.recusada,
          ],
        },
        OR: [
          { autorId: userId, alvoTipo: AgendamentoAlvo.nenhum },
          { atribuidoParaId: userId, alvoTipo: AgendamentoAlvo.nenhum },
          ...adminAudience.map((audience) => ({
            alvoTipo: audience.alvoTipo,
            ...(audience.alvoEquipeId
              ? { alvoEquipeId: audience.alvoEquipeId }
              : {}),
            ...(audience.alvoGerenteId
              ? { alvoGerenteId: audience.alvoGerenteId }
              : {}),
          })),
        ],
      },
      select: {
        id: true,
        tenantId: true,
        autorId: true,
        atribuidoParaId: true,
        titulo: true,
        tipo: true,
        status: true,
        solicitacaoStatus: true,
        alvoTipo: true,
        alvoEquipeId: true,
        alvoGerenteId: true,
        startsAt: true,
        endsAt: true,
        local: true,
        observacoes: true,
        lead: { select: { nome: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: 80,
    });
    for (const item of items) {
      await this.syncAgendamento(item, { onlyUserId: userId });
    }
  }

  private eventBody(item: GoogleSyncAgendamento) {
    const end = item.endsAt
      ? new Date(item.endsAt)
      : new Date(new Date(item.startsAt).getTime() + 60 * 60 * 1000);
    const lines = [
      item.lead?.nome ? `Contato: ${item.lead.nome}` : null,
      item.observacoes?.trim() || null,
      'Criado no CRM Zone Connection',
    ].filter(Boolean);
    return {
      summary: item.titulo,
      description: lines.join('\n'),
      location: item.local?.trim() || undefined,
      start: {
        dateTime: new Date(item.startsAt).toISOString(),
        timeZone: TIME_ZONE,
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: TIME_ZONE,
      },
    };
  }

  private async createGoogleEvent(
    connectionId: string,
    calendarId: string,
    item: GoogleSyncAgendamento,
    accessToken: string,
    body: ReturnType<GoogleCalendarService['eventBody']>,
  ) {
    const created = await this.calendarFetch<{ id?: string }>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: 'POST', accessToken, body },
    );
    if (!created.ok || !created.json?.id) return;
    await this.prisma.userGoogleCalendarEvent
      .create({
        data: {
          connectionId,
          agendamentoId: item.id,
          googleEventId: created.json.id,
        },
      })
      .catch(() => undefined);
  }

  private async accessTokenFor(connection: {
    userId: string;
    refreshTokenEnc: string;
  }): Promise<string | null> {
    const cached = this.accessCache.get(connection.userId);
    if (cached && cached.exp - 30_000 > Date.now()) return cached.token;

    const refreshToken = decryptSecret(
      connection.refreshTokenEnc,
      googleTokenKey(this.config),
    );
    const tokens = await this.refreshAccessToken(refreshToken);
    if (!tokens.access_token) {
      if (tokens.error === 'invalid_grant') {
        await this.prisma.userGoogleCalendar.deleteMany({
          where: { userId: connection.userId },
        });
        this.accessCache.delete(connection.userId);
        this.logger.warn(
          `Refresh token Google inválido — conexão removida (${connection.userId}).`,
        );
      }
      return null;
    }
    this.accessCache.set(connection.userId, {
      token: tokens.access_token,
      exp: Date.now() + (tokens.expires_in ?? 3500) * 1000,
    });
    return tokens.access_token;
  }

  private async existingRefreshToken(userId: string): Promise<string | null> {
    const row = await this.prisma.userGoogleCalendar.findUnique({
      where: { userId },
      select: { refreshTokenEnc: true },
    });
    if (!row) return null;
    return decryptSecret(row.refreshTokenEnc, googleTokenKey(this.config));
  }

  private async exchangeCode(code: string, redirectUri: string) {
    return this.postToken({
      code,
      client_id: this.clientId(),
      client_secret: this.clientSecret(),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
  }

  private async refreshAccessToken(refreshToken: string) {
    return this.postToken({
      refresh_token: refreshToken,
      client_id: this.clientId(),
      client_secret: this.clientSecret(),
      grant_type: 'refresh_token',
    });
  }

  private async postToken(body: Record<string, string>): Promise<TokenSet> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    return (await response.json()) as TokenSet;
  }

  private async fetchGoogleEmail(accessToken: string): Promise<string> {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const json = (await response.json()) as { email?: string };
    return json.email?.trim() || 'google';
  }

  private async calendarFetch<T = unknown>(
    url: string,
    opts: { method: string; accessToken: string; body?: unknown },
  ): Promise<{ ok: boolean; status: number; json: T | null }> {
    const response = await fetch(url, {
      method: opts.method,
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    });
    if (response.status === 204) {
      return { ok: true, status: 204, json: null };
    }
    let json: T | null = null;
    try {
      json = (await response.json()) as T;
    } catch {
      json = null;
    }
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      this.logger.warn(`Google Calendar ${opts.method} ${response.status}`);
    }
    if (response.status === 410) {
      return { ok: true, status: 410, json };
    }
    return { ok: response.ok, status: response.status, json };
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Integração Google Calendar não configurada.',
      );
    }
  }

  private clientId() {
    const value = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    if (!value) {
      throw new BadRequestException('GOOGLE_CLIENT_ID ausente.');
    }
    return value;
  }

  private clientSecret() {
    const value = this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim();
    if (!value) {
      throw new BadRequestException('GOOGLE_CLIENT_SECRET ausente.');
    }
    return value;
  }
}
