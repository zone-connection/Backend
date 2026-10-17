import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FunilTipo, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import {
  canSendWhatsappInbox,
  seesAllWhatsappInbox,
} from '../common/utils/roles';
import { TeamScopeService } from '../equipes/team-scope.service';
import { isCrmWhatsappLeadNotifyText } from '../lead-notify/lead-notify.messages';
import { decryptPageAccessToken, metaTokenKey } from '../meta/meta-token.crypto';
import {
  OzapApiClient,
  OzapApiError,
  type OzapChatMessage,
  type OzapInboxChat,
} from './ozap-api.client';

const IA_PAUSED_UNTIL = '2099-12-31T23:59:59.000Z';

const TAG_COLORS = new Set([
  'bg-slate-500 text-white',
  'bg-blue-500 text-white',
  'bg-indigo-500 text-white',
  'bg-violet-500 text-white',
  'bg-purple-500 text-white',
  'bg-fuchsia-500 text-white',
  'bg-pink-500 text-white',
  'bg-rose-500 text-white',
  'bg-red-500 text-white',
  'bg-orange-500 text-white',
  'bg-amber-500 text-amber-950',
  'bg-yellow-400 text-yellow-950',
  'bg-lime-500 text-lime-950',
  'bg-green-500 text-white',
  'bg-emerald-500 text-white',
  'bg-teal-500 text-white',
  'bg-cyan-500 text-white',
  'bg-sky-500 text-white',
]);

const DEFAULT_TAG_COLOR = 'bg-slate-500 text-white';

@Injectable()
export class WhatsappInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ozapApi: OzapApiClient,
    private readonly config: ConfigService,
    private readonly teamScope: TeamScopeService,
  ) {}

  async listChats(
    requester: AuthenticatedUser,
    page = 1,
    limit = 50,
    filters?: { corretorId?: string; equipeId?: string; tagId?: string },
  ) {
    const { instanceId } = await this.requireInstance(requester);
    const leadFilters = this.parseLeadFilters(filters);
    const tagId = this.parseFilterId(filters?.tagId);
    const taggedChatIds =
      typeof tagId === 'string' ? await this.taggedChatIds(requester.id, tagId) : null;
    if (taggedChatIds && taggedChatIds.length === 0) {
      return {
        available: true as const,
        instanceId,
        page: 1,
        limit,
        total: 0,
        hasMore: false,
        canSend: canSendWhatsappInbox(requester),
        chats: [],
      };
    }
    return this.withUserTags(
      requester,
      await this.listScopedChats(
        requester,
        instanceId,
        page,
        limit,
        leadFilters,
        taggedChatIds,
      ),
    );
  }

  async listMessages(chatId: string, requester: AuthenticatedUser) {
    const { instanceId } = await this.requireInstance(requester);
    await this.assertCanViewChat(requester, instanceId, chatId);
    try {
      const messages = await this.ozapApi.listMessages({ instanceId, chatId });
      return {
        available: true as const,
        chatId,
        messages: messages.map((message) => ({
          ...message,
          mediaUrl: this.toCrmMediaUrl(message.mediaUrl),
        })),
      };
    } catch (error) {
      this.throwOzap(error);
    }
  }

  async streamMedia(url: string, hint: string | undefined, requester: AuthenticatedUser) {
    await this.requireInstance(requester);
    try {
      return await this.ozapApi.fetchMedia(url, hint);
    } catch (error) {
      this.throwOzap(error);
    }
  }

  publicMediaUrl(raw: string | undefined): string | null {
    const url = raw?.trim() || null;
    if (!url) return null;
    if (
      this.ozapApi.isAllowedMediaHost(url) &&
      !this.ozapApi.needsMediaProxy(url)
    ) {
      return url;
    }
    return null;
  }

  async transcribeAudio(rawUrl: string, requester: AuthenticatedUser) {
    const url = rawUrl.trim();
    if (!url) {
      throw new BadRequestException('Informe o áudio.');
    }
    const { openaiApiKey } = await this.requireInstance(requester);
    const apiKey = this.unlockOpenaiKey(openaiApiKey);
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Transcrição indisponível. Cadastre a chave OpenAI na conexão OZap desta imobiliária.',
      );
    }
    try {
      const file = await this.ozapApi.fetchMedia(url, 'audio');
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(file.body)], {
          type: file.contentType || 'audio/ogg',
        }),
        'audio.ogg',
      );
      form.append('model', 'whisper-1');
      form.append('language', 'pt');
      const response = await fetch(
        'https://api.openai.com/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { text?: string; error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new ServiceUnavailableException(
          payload?.error?.message || 'A OpenAI recusou a transcrição.',
        );
      }
      return { text: payload?.text?.trim() || '' };
    } catch (error) {
      this.throwOzap(error);
    }
  }

  private toCrmMediaUrl(url: string | null): string | null {
    return this.ozapApi.clientMediaUrl(url);
  }

  async sendMessage(
    chatId: string,
    content: string,
    requester: AuthenticatedUser,
  ) {
    this.assertCanSend(requester);
    const { instanceId } = await this.requireInstance(requester);
    await this.assertCanViewChat(requester, instanceId, chatId);
    const text = content.trim();
    if (!text) {
      throw new BadRequestException('Informe a mensagem.');
    }
    try {
      await this.ozapApi.pauseChat({
        instanceId,
        chatId,
        pausedUntil: IA_PAUSED_UNTIL,
      });
      await this.ozapApi.sendChatText({ instanceId, chatId, text });
      return { ok: true as const, aiPaused: true as const };
    } catch (error) {
      this.throwOzap(error);
    }
  }

  async editMessage(
    chatId: string,
    messageId: string,
    content: string,
    requester: AuthenticatedUser,
  ) {
    this.assertCanSend(requester);
    const { instanceId } = await this.requireInstance(requester);
    await this.assertCanViewChat(requester, instanceId, chatId);
    const text = content.trim();
    if (!text) {
      throw new BadRequestException('Informe a mensagem.');
    }
    try {
      await this.ozapApi.editMessage({
        instanceId,
        chatId,
        messageId,
        text,
      });
      return { ok: true as const };
    } catch (error) {
      this.throwMessageMutation(error, 'editar');
    }
  }

  async deleteMessage(
    chatId: string,
    messageId: string,
    requester: AuthenticatedUser,
  ) {
    this.assertCanSend(requester);
    const { instanceId } = await this.requireInstance(requester);
    await this.assertCanViewChat(requester, instanceId, chatId);
    try {
      await this.ozapApi.deleteMessage({ instanceId, chatId, messageId });
      return { ok: true as const };
    } catch (error) {
      this.throwMessageMutation(error, 'excluir');
    }
  }

  async assumeChat(chatId: string, requester: AuthenticatedUser) {
    this.assertCanSend(requester);
    const { instanceId } = await this.requireInstance(requester);
    await this.assertCanViewChat(requester, instanceId, chatId);
    try {
      await this.ozapApi.pauseChat({
        instanceId,
        chatId,
        pausedUntil: IA_PAUSED_UNTIL,
      });
      return { ok: true as const, aiPaused: true as const };
    } catch (error) {
      this.throwOzap(error);
    }
  }

  async resumeChat(chatId: string, requester: AuthenticatedUser) {
    this.assertCanSend(requester);
    const { instanceId } = await this.requireInstance(requester);
    await this.assertCanViewChat(requester, instanceId, chatId);
    try {
      await this.ozapApi.pauseChat({
        instanceId,
        chatId,
        pausedUntil: null,
      });
      return { ok: true as const, aiPaused: false as const };
    } catch (error) {
      this.throwOzap(error);
    }
  }

  private assertCanSend(requester: AuthenticatedUser) {
    if (!canSendWhatsappInbox(requester)) {
      throw new ForbiddenException(
        'Seu perfil não pode enviar mensagens no WhatsApp.',
      );
    }
  }

  private expandChatIds(ids: Array<string | null | undefined>): string[] {
    const out = new Set<string>();
    for (const id of ids) {
      const raw = id?.trim();
      if (!raw) continue;
      out.add(raw);
      const digits = raw.replace(/\D/g, '');
      if (!digits) continue;
      out.add(digits);
      out.add(`${digits}@s.whatsapp.net`);
      out.add(`${digits}@c.us`);
    }
    return [...out];
  }

  private isLeadNotifyChat(chat: {
    lastMessage?: string | null;
    name?: string | null;
  }) {
    return (
      isCrmWhatsappLeadNotifyText(chat.lastMessage) ||
      isCrmWhatsappLeadNotifyText(chat.name)
    );
  }

  private parseLeadFilters(filters?: {
    corretorId?: string;
    equipeId?: string;
  }): { corretorId?: string | null; equipeId?: string | null } | null {
    const corretorId = this.parseFilterId(filters?.corretorId);
    const equipeId = this.parseFilterId(filters?.equipeId);
    if (corretorId === undefined && equipeId === undefined) return null;
    return {
      ...(corretorId !== undefined ? { corretorId } : {}),
      ...(equipeId !== undefined ? { equipeId } : {}),
    };
  }

  private parseFilterId(raw?: string): string | null | undefined {
    const value = raw?.trim();
    if (!value || value === 'todos' || value === '__all__') return undefined;
    if (value === 'none' || value === '__none__') return null;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new BadRequestException('Filtro de corretor ou equipe inválido.');
    }
    return value;
  }

  private async chatLeadWhere(
    requester: AuthenticatedUser,
    filters?: { corretorId?: string | null; equipeId?: string | null } | null,
  ): Promise<Prisma.LeadWhereInput> {
    const tenantId = requireTenantId(requester);
    let base: Prisma.LeadWhereInput;
    if (seesAllWhatsappInbox(requester.role)) {
      base = { tenantId, perdidoAt: null };
    } else if (requester.role === Role.gerente) {
      base = {
        AND: [await this.teamScope.leadScope(requester), { perdidoAt: null }],
      };
    } else {
      base = { tenantId, corretorId: requester.id, perdidoAt: null };
    }
    if (!filters) return base;
    return {
      AND: [
        base,
        {
          ...(filters.corretorId !== undefined
            ? { corretorId: filters.corretorId }
            : {}),
          ...(filters.equipeId !== undefined
            ? { equipeId: filters.equipeId }
            : {}),
        },
      ],
    };
  }

  private async listScopedChats(
    requester: AuthenticatedUser,
    instanceId: number,
    page: number,
    limit: number,
    filters?: { corretorId?: string | null; equipeId?: string | null } | null,
    taggedChatIds?: string[] | null,
  ) {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.min(100, Math.max(10, Math.floor(limit) || 50));
    const leadWhere = await this.chatLeadWhere(requester, filters);
    const where: Prisma.LeadOzapLinkWhereInput = {
      instanceId,
      lead: leadWhere,
      ...(taggedChatIds
        ? { chatId: { in: this.expandChatIds(taggedChatIds) } }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.leadOzapLink.count({ where }),
      this.prisma.leadOzapLink.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        select: {
          chatId: true,
          lastMessageAt: true,
          lead: { select: { id: true, nome: true, telefone: true } },
        },
      }),
    ]);
    const ozapByChat = await this.indexOzapChats(instanceId);
    return {
      available: true as const,
      instanceId,
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: safePage * safeLimit < total,
      canSend: canSendWhatsappInbox(requester),
      chats: rows
        .map((row) => {
          const ozap = this.ozapChatFor(
            ozapByChat,
            row.chatId,
            row.lead.telefone,
          );
          return {
            chatId: row.chatId,
            name: row.lead.nome,
            phone: row.lead.telefone || ozap?.phone || null,
            lastMessage: ozap?.lastMessage ?? null,
            lastMessageAt:
              ozap?.lastMessageAt ?? row.lastMessageAt?.toISOString() ?? null,
            unread: ozap?.unread ?? 0,
            isGroup: ozap?.isGroup ?? false,
            aiPaused: ozap?.aiPaused ?? false,
            pausedUntil: ozap?.pausedUntil ?? null,
            leadStatus: ozap?.leadStatus ?? null,
            leadId: row.lead.id,
            leadNome: row.lead.nome,
          };
        })
        .filter((chat) => !this.isLeadNotifyChat(chat)),
    };
  }

  private async indexOzapChats(instanceId: number) {
    const map = new Map<string, OzapInboxChat>();
    try {
      let page = 1;
      for (let extra = 0; extra < 8; extra += 1) {
        const listed = await this.ozapApi.listChats(instanceId, page, 50);
        for (const chat of listed.chats) {
          for (const id of this.expandChatIds([chat.chatId, chat.phone])) {
            if (!map.has(id)) map.set(id, chat);
          }
        }
        if (!listed.hasMore) break;
        page += 1;
      }
    } catch {
      /* preview do OZap é opcional; a lista segue pelos leads do CRM */
    }
    return map;
  }

  private ozapChatFor(
    map: Map<string, OzapInboxChat>,
    chatId: string,
    phone?: string | null,
  ) {
    for (const id of this.expandChatIds([chatId, phone])) {
      const hit = map.get(id);
      if (hit) return hit;
    }
    return undefined;
  }

  private async assertCanViewChat(
    requester: AuthenticatedUser,
    instanceId: number,
    chatId: string,
  ) {
    if (seesAllWhatsappInbox(requester.role)) return;
    const leadWhere = await this.chatLeadWhere(requester, null);
    const digits = chatId.replace(/\D/g, '');
    const ids = [
      chatId.trim(),
      digits,
      digits ? `${digits}@s.whatsapp.net` : '',
      digits ? `${digits}@c.us` : '',
    ].filter(Boolean);
    const link = await this.prisma.leadOzapLink.findFirst({
      where: {
        instanceId,
        chatId: { in: ids },
        lead: leadWhere,
      },
      select: { id: true },
    });
    if (!link) {
      throw new ForbiddenException(
        'Você só pode ver conversas dos seus leads.',
      );
    }
  }

  private async requireInstance(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    if (!this.ozapApi.isConfigured()) {
      throw new ServiceUnavailableException(
        'Integração WhatsApp (OZap) não configurada.',
      );
    }
    const connection = await this.prisma.tenantOzapConnection.findFirst({
      where: { tenantId, ativo: true },
      select: { instanceId: true, openaiApiKey: true },
    });
    if (!connection) {
      throw new NotFoundException(
        'A imobiliária ainda não tem instância WhatsApp conectada.',
      );
    }
    return connection;
  }

  private unlockOpenaiKey(stored: string | null | undefined): string {
    const raw = stored?.trim();
    if (!raw) return '';
    try {
      return decryptPageAccessToken(raw, metaTokenKey(this.config)).trim();
    } catch {
      return '';
    }
  }

  async listTags(requester: AuthenticatedUser) {
    await this.requireInstance(requester);
    return this.prisma.whatsappUserTag.findMany({
      where: {
        userId: requester.id,
        tenantId: requireTenantId(requester),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createTag(
    requester: AuthenticatedUser,
    input: { name?: string; color?: string },
  ) {
    await this.requireInstance(requester);
    const name = input.name?.trim() ?? '';
    if (name.length < 1 || name.length > 40) {
      throw new BadRequestException('Informe um nome de tag (até 40 caracteres).');
    }
    const color = this.normalizeTagColor(input.color);
    try {
      return await this.prisma.whatsappUserTag.create({
        data: {
          tenantId: requireTenantId(requester),
          userId: requester.id,
          name,
          color,
          source: 'custom',
        },
      });
    } catch {
      throw new BadRequestException('Você já tem uma tag com esse nome.');
    }
  }

  async updateTag(
    tagId: string,
    requester: AuthenticatedUser,
    input: { name?: string; color?: string },
  ) {
    await this.requireInstance(requester);
    const tag = await this.prisma.whatsappUserTag.findFirst({
      where: { id: tagId, userId: requester.id },
      select: { id: true },
    });
    if (!tag) throw new NotFoundException('Tag não encontrada.');
    const data: { name?: string; color?: string } = {};
    if (typeof input.name === 'string') {
      const name = input.name.trim();
      if (name.length < 1 || name.length > 40) {
        throw new BadRequestException(
          'Informe um nome de tag (até 40 caracteres).',
        );
      }
      data.name = name;
    }
    if (typeof input.color === 'string') {
      data.color = this.normalizeTagColor(input.color);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Informe nome ou cor para atualizar.');
    }
    try {
      return await this.prisma.whatsappUserTag.update({
        where: { id: tag.id },
        data,
      });
    } catch {
      throw new BadRequestException('Você já tem uma tag com esse nome.');
    }
  }

  async deleteTag(tagId: string, requester: AuthenticatedUser) {
    await this.requireInstance(requester);
    const tag = await this.prisma.whatsappUserTag.findFirst({
      where: { id: tagId, userId: requester.id },
      select: { id: true },
    });
    if (!tag) throw new NotFoundException('Tag não encontrada.');
    await this.prisma.whatsappUserTag.delete({ where: { id: tag.id } });
    return { ok: true as const };
  }

  async importFunilTags(requester: AuthenticatedUser) {
    await this.requireInstance(requester);
    const tenantId = requireTenantId(requester);
    const funil = await this.prisma.funil.findFirst({
      where: { tenantId, tipo: FunilTipo.comercial, ativo: true },
      select: {
        etapas: {
          where: { active: true },
          orderBy: { sortOrder: 'asc' },
          select: { label: true, slug: true, color: true, sortOrder: true },
        },
      },
    });
    if (!funil || funil.etapas.length === 0) {
      throw new BadRequestException(
        'Não há etapas no funil comercial ativo para copiar.',
      );
    }
    const existing = await this.prisma.whatsappUserTag.findMany({
      where: { userId: requester.id, tenantId },
      select: { id: true, name: true, funilSlug: true },
    });
    const bySlug = new Map(
      existing
        .filter((row) => row.funilSlug)
        .map((row) => [row.funilSlug as string, row] as const),
    );
    const usedNames = new Set(existing.map((row) => row.name.toLowerCase()));
    const created: string[] = [];
    for (const etapa of funil.etapas) {
      const found = bySlug.get(etapa.slug);
      if (found) {
        await this.prisma.whatsappUserTag.update({
          where: { id: found.id },
          data: {
            name: etapa.label,
            color: etapa.color,
            sortOrder: etapa.sortOrder,
            source: 'funil',
          },
        });
        continue;
      }
      let name = etapa.label.trim();
      if (usedNames.has(name.toLowerCase())) name = `${name} (funil)`;
      await this.prisma.whatsappUserTag.create({
        data: {
          tenantId,
          userId: requester.id,
          name,
          color: etapa.color,
          source: 'funil',
          funilSlug: etapa.slug,
          sortOrder: etapa.sortOrder,
        },
      });
      usedNames.add(name.toLowerCase());
      created.push(name);
    }
    return this.listTags(requester);
  }

  async setChatTag(
    chatId: string,
    tagId: string,
    requester: AuthenticatedUser,
    attach: boolean,
  ) {
    const { instanceId } = await this.requireInstance(requester);
    await this.assertCanViewChat(requester, instanceId, chatId);
    const tag = await this.prisma.whatsappUserTag.findFirst({
      where: { id: tagId, userId: requester.id },
      select: { id: true },
    });
    if (!tag) throw new NotFoundException('Tag não encontrada.');
    if (attach) {
      await this.prisma.whatsappUserChatTag.upsert({
        where: {
          userId_tagId_chatId: {
            userId: requester.id,
            tagId: tag.id,
            chatId,
          },
        },
        create: { userId: requester.id, tagId: tag.id, chatId },
        update: {},
      });
    } else {
      await this.prisma.whatsappUserChatTag.deleteMany({
        where: { userId: requester.id, tagId: tag.id, chatId },
      });
    }
    return { ok: true as const };
  }

  private normalizeTagColor(color?: string) {
    const raw = color?.trim() || DEFAULT_TAG_COLOR;
    if (TAG_COLORS.has(raw)) return raw;
    if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw;
    return DEFAULT_TAG_COLOR;
  }

  private async taggedChatIds(userId: string, tagId: string): Promise<string[]> {
    const rows = await this.prisma.whatsappUserChatTag.findMany({
      where: { userId, tagId },
      select: { chatId: true },
    });
    return [...new Set(rows.map((row) => row.chatId))];
  }

  private async withUserTags<
    T extends { chats: Array<{ chatId: string; phone?: string | null }> },
  >(requester: AuthenticatedUser, result: T): Promise<T> {
    const ids = this.expandChatIds(
      result.chats.flatMap((chat) => [chat.chatId, chat.phone]),
    );
    if (ids.length === 0) {
      return {
        ...result,
        chats: result.chats.map((chat) => ({ ...chat, tags: [] })),
      };
    }
    const rows = await this.prisma.whatsappUserChatTag.findMany({
      where: { userId: requester.id, chatId: { in: ids } },
      select: {
        chatId: true,
        tag: { select: { id: true, name: true, color: true } },
      },
    });
    const byChat = new Map<
      string,
      Array<{ id: string; name: string; color: string }>
    >();
    const add = (
      key: string | null | undefined,
      tag: { id: string; name: string; color: string },
    ) => {
      if (!key) return;
      const list = byChat.get(key) ?? [];
      if (!list.some((item) => item.id === tag.id)) list.push(tag);
      byChat.set(key, list);
    };
    for (const row of rows) {
      for (const key of this.expandChatIds([row.chatId])) add(key, row.tag);
    }
    return {
      ...result,
      chats: result.chats.map((chat) => ({
        ...chat,
        tags:
          byChat.get(chat.chatId) ??
          (chat.phone ? byChat.get(chat.phone) : undefined) ??
          [],
      })),
    };
  }

  private throwMessageMutation(
    error: unknown,
    action: 'editar' | 'excluir',
  ): never {
    if (error instanceof OzapApiError) {
      if (error.status === 404 || error.status === 405) {
        throw new BadRequestException(
          `O OZap não aceita ${action} essa mensagem neste número. Só funciona se a API da instância liberar a ação.`,
        );
      }
      if (error.status === 400) {
        throw new BadRequestException(error.message);
      }
    }
    this.throwOzap(error);
  }

  private throwOzap(error: unknown): never {
    if (error instanceof OzapApiError) {
      if (error.status === 400) {
        throw new BadRequestException(error.message);
      }
      throw new ServiceUnavailableException(error.message);
    }
    throw error;
  }
}

export type { OzapChatMessage, OzapInboxChat };
