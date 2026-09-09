import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MetaGraphApiService,
  MetaLeadField,
  MetaLeadPayload,
} from './meta-graph-api.service';
import {
  extractLeadgenEvents,
  type LeadgenEvent,
} from './meta-webhook.parser';
import { decryptPageAccessToken, metaTokenKey } from './meta-token.crypto';

type TenantMetaConn = {
  tenantId: string;
  pageAccessToken: string;
};

/** Ping da Lead Ads Testing Tool — não é a Página real nem um lead buscável. */
const META_DUMMY_ID = '444444444444';

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly graphApi: MetaGraphApiService,
  ) {}

  verifyChallenge(mode?: string, token?: string, challenge?: string) {
    const expected = this.config.get<string>('META_VERIFY_TOKEN');
    if (
      mode === 'subscribe' &&
      expected &&
      token &&
      token === expected &&
      challenge
    ) {
      return challenge;
    }
    return null;
  }

  async handleWebhook(payload: unknown) {
    const extracted = extractLeadgenEvents(payload);

    this.logger.log(
      `Webhook recebido object=${String(extracted.object)} entries=${extracted.entryCount} leadgenEvents=${extracted.events.length} skipped=${extracted.skipped.length}`,
    );

    for (const skip of extracted.skipped) {
      this.logger.warn(
        `Evento webhook ignorado: ${skip.reason}${skip.field ? ` (${skip.field})` : ''}`,
      );
    }

    const leadIds: string[] = [];

    for (const event of extracted.events) {
      this.logger.log(
        `Evento leadgen leadgen_id=${event.leadgenId} page_id=${event.pageId} form_id=${event.formId ?? 'n/a'} page_id_source=${event.pageIdSource}`,
      );

      const connection = await this.resolveConnection(event);
      if (!connection) {
        continue;
      }

      this.logger.log(
        `TenantMetaConnection encontrada page_id=${event.pageId} tenantId=${connection.tenantId}`,
      );

      const result = await this.processLeadgenEvent(
        event,
        payload,
        connection,
      );
      if (result.leadId) leadIds.push(result.leadId);
    }

    return { ok: true, leadIds };
  }

  /**
   * App em Development Mode não dispara webhook para lead de anúncio de
   * quem não tem papel no app. A Graph API (token da Página) ainda lista
   * esses leads — puxamos periodicamente e gravamos no CRM.
   */
  async syncActiveConnections(): Promise<{
    created: number;
    skipped: number;
    failed: number;
  }> {
    const connections = await this.prisma.tenantMetaConnection.findMany({
      where: { ativo: true },
      select: { tenantId: true, pageAccessToken: true, pageId: true },
    });

    const totals = { created: 0, skipped: 0, failed: 0 };
    for (const connection of connections) {
      const result = await this.syncConnection({
        ...connection,
        pageAccessToken: this.decryptToken(connection.pageAccessToken),
      });
      totals.created += result.created;
      totals.skipped += result.skipped;
      totals.failed += result.failed;
    }
    return totals;
  }

  private async syncConnection(connection: TenantMetaConn & { pageId: string }) {
    const result = { created: 0, skipped: 0, failed: 0 };
    let forms: { id: string }[];
    try {
      forms = await this.graphApi.listLeadgenForms(
        connection.pageId,
        connection.pageAccessToken,
      );
    } catch (error) {
      result.failed += 1;
      this.logger.error(
        `Falha ao listar formulários page_id=${connection.pageId}: ${
          error instanceof Error ? error.message : 'erro'
        }`,
      );
      return result;
    }

    for (const form of forms) {
      let leads: MetaLeadPayload[];
      try {
        leads = await this.graphApi.listFormLeads(
          form.id,
          connection.pageAccessToken,
        );
      } catch (error) {
        result.failed += 1;
        this.logger.error(
          `Falha ao listar leads form_id=${form.id}: ${
            error instanceof Error ? error.message : 'erro'
          }`,
        );
        continue;
      }

      for (const metaLead of leads) {
        try {
          const outcome = await this.importGraphLead(
            connection,
            form.id,
            metaLead,
          );
          if (outcome === 'created') result.created += 1;
          else result.skipped += 1;
        } catch (error) {
          result.failed += 1;
          this.logger.error(
            `Falha ao importar leadgen_id=${metaLead.id}: ${
              error instanceof Error ? error.message : 'erro'
            }`,
          );
        }
      }
    }

    this.logger.log(
      `Sync Graph page_id=${connection.pageId} tenantId=${connection.tenantId} created=${result.created} skipped=${result.skipped} failed=${result.failed}`,
    );
    return result;
  }

  private async importGraphLead(
    connection: TenantMetaConn & { pageId: string },
    formId: string,
    metaLead: MetaLeadPayload,
  ): Promise<'created' | 'skipped'> {
    const leadgenId = String(metaLead.id ?? '').trim();
    if (!leadgenId || leadgenId === META_DUMMY_ID) return 'skipped';
    if (this.isMetaPlaceholderLead(metaLead.field_data ?? [])) return 'skipped';

    const existingLink = await this.prisma.leadMetaLink.findUnique({
      where: { leadgenId },
      select: { leadId: true },
    });
    if (existingLink) return 'skipped';

    const event: LeadgenEvent = {
      leadgenId,
      pageId: connection.pageId,
      formId: metaLead.form_id ?? formId,
      adId: metaLead.ad_id ?? null,
      adgroupId: null,
      pageIdSource: 'value',
    };
    const mapped = this.mapFieldData(metaLead.field_data ?? []);

    this.logger.log(
      `Importando lead da Graph leadgen_id=${leadgenId} tenantId=${connection.tenantId}`,
    );

    const lead = await this.findOrCreateLead(
      mapped,
      event,
      metaLead,
      connection.tenantId,
    );

    await this.prisma.leadMetaLink.upsert({
      where: { leadgenId },
      create: {
        leadId: lead.id,
        leadgenId,
        pageId: connection.pageId,
        formId: event.formId ?? null,
        adId: event.adId ?? null,
      },
      update: {},
    });

    this.logger.log(
      `Lead importado leadgen_id=${leadgenId} crmLeadId=${lead.id} tenantId=${connection.tenantId}`,
    );
    return 'created';
  }

  /**
   * HTTP 200 mesmo sem connection: a Meta reenvia 4xx/5xx. Retry não cria a
   * connection; o teste dummy (page_id 444444444444) ficaria em loop.
   * O isolamento de tenant continua: sem connection, nenhum lead é gravado.
   *
   * O ping da ferramenta de teste usa page_id 444444444444. Nesse caso a
   * connection é a Página real (META_PAGE_ID ou a única conexão ativa).
   */
  private async resolveConnection(
    event: LeadgenEvent,
  ): Promise<TenantMetaConn | null> {
    const pageId = this.isDummyEvent(event)
      ? this.config.get<string>('META_PAGE_ID')?.trim() || null
      : event.pageId;

    if (this.isDummyEvent(event) && !pageId) {
      const actives = await this.prisma.tenantMetaConnection.findMany({
        where: { ativo: true },
        select: { tenantId: true, pageAccessToken: true, pageId: true },
        take: 2,
      });
      if (actives.length === 1) {
        this.logger.log(
          `Teste dummy da Meta roteado para a única Página ativa page_id=${actives[0].pageId} tenantId=${actives[0].tenantId}`,
        );
        return this.withDecryptedToken(actives[0]);
      }
      this.logger.warn(
        'Ignorando leadgen dummy (444444444444): defina META_PAGE_ID ou mantenha só uma Página Meta ativa no CRM.',
      );
      return null;
    }

    if (!pageId) return null;

    const active = await this.prisma.tenantMetaConnection.findFirst({
      where: { pageId, ativo: true },
      select: { tenantId: true, pageAccessToken: true },
    });
    if (active) return this.withDecryptedToken(active);

    const inactive = await this.prisma.tenantMetaConnection.findFirst({
      where: { pageId },
      select: { tenantId: true, ativo: true },
    });
    if (inactive) {
      this.logger.warn(
        `Ignorando leadgen: page_id ${pageId} tem TenantMetaConnection inativa (tenant ${inactive.tenantId}).`,
      );
      return null;
    }

    this.logger.warn(
      `Ignorando leadgen: page_id ${pageId} sem TenantMetaConnection.`,
    );
    return null;
  }

  private async processLeadgenEvent(
    event: LeadgenEvent,
    payload: unknown,
    connection: TenantMetaConn,
  ) {
    const deliveryKey = `leadgen:${event.leadgenId}`;

    try {
      await this.prisma.metaWebhookDelivery.create({
        data: {
          deliveryKey,
          leadgenId: event.leadgenId,
          pageId: event.pageId,
          formId: event.formId,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.leadMetaLink.findUnique({
          where: { leadgenId: event.leadgenId },
          select: { leadId: true },
        });
        this.logger.log(
          `Lead duplicado (idempotência) leadgen_id=${event.leadgenId} leadId=${existing?.leadId ?? 'n/a'}`,
        );
        return { ok: true, duplicate: true, leadId: existing?.leadId };
      }
      throw error;
    }

    try {
      const existingLink = await this.prisma.leadMetaLink.findUnique({
        where: { leadgenId: event.leadgenId },
        select: { leadId: true },
      });
      if (existingLink) {
        this.logger.log(
          `Lead duplicado (LeadMetaLink) leadgen_id=${event.leadgenId} leadId=${existingLink.leadId}`,
        );
        return { ok: true, duplicate: true, leadId: existingLink.leadId };
      }

      const dummy = this.isDummyEvent(event);
      const metaLead = dummy
        ? {
            id: event.leadgenId,
            field_data: [] as MetaLeadField[],
          }
        : await this.graphApi.fetchLead(
            event.leadgenId,
            connection.pageAccessToken,
          );
      const mapped = dummy
        ? {
            nome: 'Lead de teste Meta',
            telefone: '(00) 44444-4444',
            email: 'teste-meta@facebook.meta.local',
            cidade: null,
            bairro: null,
            extraTags: ['Teste Meta'],
          }
        : this.mapFieldData(metaLead.field_data ?? []);

      this.logger.log(
        `Criando lead no CRM leadgen_id=${event.leadgenId} tenantId=${connection.tenantId}`,
      );

      const lead = await this.findOrCreateLead(
        mapped,
        event,
        metaLead,
        connection.tenantId,
      );

      await this.prisma.leadMetaLink.upsert({
        where: { leadgenId: event.leadgenId },
        create: {
          leadId: lead.id,
          leadgenId: event.leadgenId,
          pageId: event.pageId,
          formId: event.formId ?? metaLead.form_id ?? null,
          adId: event.adId ?? metaLead.ad_id ?? null,
          adgroupId: event.adgroupId,
        },
        update: {},
      });

      this.logger.log(
        `Lead criado leadgen_id=${event.leadgenId} crmLeadId=${lead.id} tenantId=${connection.tenantId}`,
      );
      return { ok: true, leadId: lead.id };
    } catch (error) {
      // Libera a chave para a Meta reenviar o evento após falha (Graph API, etc.).
      await this.prisma.metaWebhookDelivery
        .delete({ where: { deliveryKey } })
        .catch(() => undefined);
      throw error;
    }
  }

  private async findOrCreateLead(
    mapped: ReturnType<MetaService['mapFieldData']>,
    event: LeadgenEvent,
    metaLead: MetaLeadPayload,
    tenantId: string,
  ) {
    const reusable = await this.findReusableLead(mapped, tenantId);
    if (reusable) {
      await this.mergeTags(reusable.id, reusable.tags, mapped.extraTags);
      this.logger.log(
        `Lead reutilizado crmLeadId=${reusable.id} tenantId=${tenantId} leadgen_id=${event.leadgenId}`,
      );
      return reusable;
    }

    const tags = [
      'Facebook',
      'Lead Ads',
      ...mapped.extraTags,
      ...(event.formId ? [`Form: ${event.formId}`] : []),
      ...(event.adId || metaLead.ad_id
        ? [`Ad: ${event.adId ?? metaLead.ad_id}`]
        : []),
    ];

    return this.prisma.lead.create({
      data: {
        tenantId,
        nome: mapped.nome,
        telefone: mapped.telefone ?? '(00) 00000-0000',
        email: mapped.email ?? `${event.leadgenId}@facebook.meta.local`,
        origem: 'Facebook Ads',
        interesse: 'Comprar',
        cidade: mapped.cidade ?? 'A definir',
        bairro: mapped.bairro ?? 'A definir',
        stage: 'novo',
        prioridade: 'Média',
        tags,
      },
    });
  }

  /** Reusa lead existente sem vínculo Meta (evita conflito no leadId unique). */
  private async findReusableLead(
    mapped: ReturnType<MetaService['mapFieldData']>,
    tenantId: string,
  ) {
    if (mapped.telefone) {
      const byPhone = await this.prisma.lead.findFirst({
        where: { tenantId, telefone: mapped.telefone, perdidoAt: null },
        include: { metaLink: true },
      });
      if (byPhone && !byPhone.metaLink) return byPhone;
    }

    if (mapped.email && !mapped.email.endsWith('@facebook.meta.local')) {
      const byEmail = await this.prisma.lead.findFirst({
        where: { tenantId, email: mapped.email, perdidoAt: null },
        include: { metaLink: true },
      });
      if (byEmail && !byEmail.metaLink) return byEmail;
    }

    return null;
  }

  private async mergeTags(
    leadId: string,
    current: string[],
    extra: string[],
  ) {
    const next = new Set([
      ...current,
      'Facebook',
      'Lead Ads',
      ...extra,
    ]);
    if (next.size === current.length) return;
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { tags: [...next] },
    });
  }

  private mapFieldData(fields: MetaLeadField[]) {
    const byName = new Map<string, string>();
    for (const field of fields) {
      const key = field.name?.trim().toLowerCase();
      const value = field.values?.find((v) => typeof v === 'string' && v.trim());
      if (key && value) byName.set(key, value.trim());
    }

    const get = (...keys: string[]) => {
      for (const key of keys) {
        const value = byName.get(key);
        if (value) return value;
      }
      return null;
    };

    const firstName = get('first_name', 'nome');
    const lastName = get('last_name', 'sobrenome');
    const joinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const fullName =
      get('full_name', 'nome_completo', 'name') || joinedName || null;

    const rawPhone = get(
      'phone_number',
      'phone',
      'telefone',
      'mobile_phone',
      'work_phone_number',
    );
    const rawEmail = get('email', 'e-mail', 'work_email');
    const cidade = get('city', 'cidade');
    const bairro = get('street_address', 'bairro', 'neighborhood');

    const extraTags: string[] = [];
    for (const [key, value] of byName) {
      if (
        [
          'full_name',
          'first_name',
          'last_name',
          'nome',
          'nome_completo',
          'name',
          'sobrenome',
          'phone_number',
          'phone',
          'telefone',
          'mobile_phone',
          'work_phone_number',
          'email',
          'e-mail',
          'work_email',
          'city',
          'cidade',
          'street_address',
          'bairro',
          'neighborhood',
        ].includes(key)
      ) {
        continue;
      }
      extraTags.push(`${key}: ${value.slice(0, 80)}`);
    }

    return {
      nome: fullName || 'Lead Facebook',
      telefone: rawPhone ? this.formatPhoneOrFallback(rawPhone) : null,
      email: rawEmail && this.isValidEmail(rawEmail) ? rawEmail : null,
      cidade,
      bairro,
      extraTags,
    };
  }

  private formatPhoneOrFallback(raw: string) {
    const digits = raw.replace(/\D/g, '').replace(/^55/, '');
    if (/^\d{10,11}$/.test(digits)) {
      const ddd = digits.slice(0, 2);
      const local = digits.slice(2);
      return local.length === 9
        ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
        : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
    }
    const fallback = digits.slice(-11) || '00000000000';
    const padded = fallback.padStart(11, '0').slice(-11);
    return `(${padded.slice(0, 2)}) ${padded.slice(2, 7)}-${padded.slice(7)}`;
  }

  private isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private isDummyEvent(event: LeadgenEvent) {
    return (
      event.pageId === META_DUMMY_ID || event.leadgenId === META_DUMMY_ID
    );
  }

  private isMetaPlaceholderLead(fields: MetaLeadField[]) {
    return fields.some((field) =>
      (field.values ?? []).some((value) =>
        value.toLowerCase().includes('<test lead:'),
      ),
    );
  }

  private decryptToken(stored: string) {
    return decryptPageAccessToken(stored, metaTokenKey(this.config));
  }

  private withDecryptedToken<T extends { pageAccessToken: string }>(row: T): T {
    return { ...row, pageAccessToken: this.decryptToken(row.pageAccessToken) };
  }
}
