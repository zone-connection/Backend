import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MetaGraphApiService,
  MetaLeadField,
  MetaLeadPayload,
  type MetaAdAttribution,
} from './meta-graph-api.service';
import {
  extractLeadgenEvents,
  type LeadgenEvent,
} from './meta-webhook.parser';
import { decryptPageAccessToken, metaTokenKey } from './meta-token.crypto';
import { LeadNotifyService } from '../lead-notify/lead-notify.service';
import { FunisService } from '../funis/funis.service';
import { LeadFilaService } from '../leads/lead-fila.service';
import {
  emptyMappedMetaLead,
  mapMetaLeadFields,
  metaFieldKeys,
  type MappedMetaLead,
} from './meta-lead-fields';

type TenantMetaConn = {
  tenantId: string;
  pageAccessToken: string;
};

function metaLeadCanal(
  webhookPlatform?: string | null,
  graphPlatform?: string | null,
): 'Facebook' | 'Instagram' {
  const raw = `${graphPlatform ?? ''} ${webhookPlatform ?? ''}`.toLowerCase();
  if (raw.includes('ig') || raw.includes('instagram')) return 'Instagram';
  return 'Facebook';
}

/** Ping da Lead Ads Testing Tool — não é a Página real nem um lead buscável. */
const META_DUMMY_ID = '444444444444';

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly graphApi: MetaGraphApiService,
    private readonly leadNotify: LeadNotifyService,
    private readonly funis: FunisService,
    private readonly fila: LeadFilaService,
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
    try {
      await this.graphApi.subscribePageLeadgen(
        connection.pageId,
        connection.pageAccessToken,
      );
    } catch (error) {
      this.logger.warn(
        `Inscrição leadgen não renovada page_id=${connection.pageId}: ${
          error instanceof Error ? error.message : 'erro'
        }`,
      );
    }

    let forms: { id: string; name?: string }[];
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

    if (!forms.length) {
      this.logger.warn(
        `Nenhum Instant Form na Página page_id=${connection.pageId} tenantId=${connection.tenantId}: campanhas Lead Ads desta Página não têm formulário listável (o poll não consegue puxar leads até existir form ACTIVE/ARCHIVED).`,
      );
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
            form.name,
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
    formName?: string | null,
  ): Promise<'created' | 'skipped'> {
    const leadgenId = String(metaLead.id ?? '').trim();
    if (!leadgenId || leadgenId === META_DUMMY_ID) return 'skipped';
    if (this.isMetaPlaceholderLead(metaLead.field_data ?? [])) return 'skipped';

    const existingLink = await this.prisma.leadMetaLink.findUnique({
      where: { leadgenId },
      select: { leadId: true },
    });

    const event: LeadgenEvent = {
      leadgenId,
      pageId: connection.pageId,
      formId: metaLead.form_id ?? formId,
      adId: metaLead.ad_id ?? null,
      adgroupId: null,
      campaignId: null,
      platform: metaLead.platform ?? null,
      pageIdSource: 'value',
    };
    const fields = metaLead.field_data ?? [];
    const mapped = mapMetaLeadFields(fields);

    if (existingLink) {
      const known = this.withFormName(null, formName);
      await this.upsertMetaLink(
        existingLink.leadId,
        leadgenId,
        connection.pageId,
        event,
        known,
      ).catch((err) => {
        this.logger.warn(
          `Não atualizou campanha leadgen_id=${leadgenId}: ${err instanceof Error ? err.message : err}`,
        );
      });
      await this.syncLeadOrigemCampanha(existingLink.leadId, known);
      return 'skipped';
    }

    this.logger.log(
      `Importando lead da Graph leadgen_id=${leadgenId} tenantId=${connection.tenantId} campos=${metaFieldKeys(fields)} telefone=${mapped.telefone ?? 'vazio'} email=${mapped.email ?? 'vazio'}`,
    );

    const attribution = this.withFormName(
      await this.loadAttribution(connection.pageAccessToken, event),
      formName,
    );
    const { lead, created } = await this.findOrCreateLead(
      mapped,
      event,
      metaLead,
      connection.tenantId,
      attribution,
    );

    await this.upsertMetaLink(
      lead.id,
      leadgenId,
      connection.pageId,
      event,
      attribution,
    );

    this.logger.log(
      `Lead importado leadgen_id=${leadgenId} crmLeadId=${lead.id} tenantId=${connection.tenantId}`,
    );
    if (created) {
      this.queueLeadNotify(connection.tenantId, lead);
    }
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
        ? emptyMappedMetaLead({
            nome: 'Lead de teste Meta',
            telefone: '(00) 44444-4444',
            email: 'teste-meta@facebook.meta.local',
            extraTags: ['Teste Meta'],
          })
        : mapMetaLeadFields(metaLead.field_data ?? []);

      this.logger.log(
        `Criando lead no CRM leadgen_id=${event.leadgenId} tenantId=${connection.tenantId} campos=${metaFieldKeys(metaLead.field_data ?? [])} telefone=${mapped.telefone ?? 'vazio'} email=${mapped.email ?? 'vazio'}`,
      );

      const attribution = dummy
        ? null
        : this.withFormName(
            await this.loadAttribution(connection.pageAccessToken, {
              ...event,
              formId: event.formId ?? metaLead.form_id ?? null,
              adId: event.adId ?? metaLead.ad_id ?? null,
            }),
            null,
          );
      const { lead, created } = await this.findOrCreateLead(
        mapped,
        event,
        metaLead,
        connection.tenantId,
        attribution,
      );

      await this.upsertMetaLink(
        lead.id,
        event.leadgenId,
        event.pageId,
        {
          ...event,
          formId: event.formId ?? metaLead.form_id ?? null,
          adId: event.adId ?? metaLead.ad_id ?? null,
        },
        attribution,
      );

      this.logger.log(
        `Lead criado leadgen_id=${event.leadgenId} crmLeadId=${lead.id} tenantId=${connection.tenantId}`,
      );
      if (created && !dummy) {
        this.queueLeadNotify(connection.tenantId, lead);
      }
      return { ok: true, leadId: lead.id };
    } catch (error) {
      // Libera a chave para a Meta reenviar o evento após falha (Graph API, etc.).
      await this.prisma.metaWebhookDelivery
        .delete({ where: { deliveryKey } })
        .catch(() => undefined);
      throw error;
    }
  }

  private withFormName(
    attribution: MetaAdAttribution | null,
    formName?: string | null,
  ): MetaAdAttribution | null {
    const name = formName?.trim() || null;
    if (!attribution && !name) return null;
    return {
      campaignId: attribution?.campaignId ?? null,
      campaignName: attribution?.campaignName ?? null,
      adId: attribution?.adId ?? null,
      adName: attribution?.adName ?? null,
      formId: attribution?.formId ?? null,
      formName: attribution?.formName ?? name,
      costPerLead: attribution?.costPerLead ?? null,
      costCurrency: attribution?.costCurrency ?? 'BRL',
    };
  }

  private origemCampanha(
    attribution: MetaAdAttribution | null | undefined,
    fallback: string,
  ): string {
    const name =
      attribution?.campaignName?.trim() || attribution?.formName?.trim();
    return (name || fallback).slice(0, 120);
  }

  private async syncLeadOrigemCampanha(
    leadId: string,
    attribution: MetaAdAttribution | null,
  ) {
    const name =
      attribution?.campaignName?.trim() || attribution?.formName?.trim();
    if (!name) return;
    await this.prisma.lead
      .updateMany({
        where: {
          id: leadId,
          origem: { in: ['Instagram', 'Facebook Ads', 'Facebook'] },
        },
        data: { origem: name.slice(0, 120) },
      })
      .catch(() => undefined);
  }

  private async loadAttribution(
    pageAccessToken: string,
    event: LeadgenEvent,
  ): Promise<MetaAdAttribution | null> {
    try {
      return await this.graphApi.fetchAdAttribution({
        pageAccessToken,
        adId: event.adId,
        campaignId: event.campaignId,
        formId: event.formId,
      });
    } catch (err) {
      this.logger.warn(
        `Atribuição Meta falhou leadgen_id=${event.leadgenId}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private async upsertMetaLink(
    leadId: string,
    leadgenId: string,
    pageId: string,
    event: LeadgenEvent,
    attribution: MetaAdAttribution | null,
  ) {
    const data = {
      leadId,
      leadgenId,
      pageId,
      formId: attribution?.formId ?? event.formId ?? null,
      formName: attribution?.formName ?? null,
      adId: attribution?.adId ?? event.adId ?? null,
      adName: attribution?.adName ?? null,
      adgroupId: event.adgroupId,
      campaignId: attribution?.campaignId ?? event.campaignId ?? null,
      campaignName: attribution?.campaignName ?? null,
      costPerLead: attribution?.costPerLead ?? null,
      costCurrency: attribution?.costCurrency ?? 'BRL',
    };
    await this.prisma.leadMetaLink.upsert({
      where: { leadgenId },
      create: data,
      update: {
        ...(data.formId ? { formId: data.formId } : {}),
        ...(data.formName ? { formName: data.formName } : {}),
        ...(data.adId ? { adId: data.adId } : {}),
        ...(data.adName ? { adName: data.adName } : {}),
        ...(data.adgroupId ? { adgroupId: data.adgroupId } : {}),
        ...(data.campaignId ? { campaignId: data.campaignId } : {}),
        ...(data.campaignName ? { campaignName: data.campaignName } : {}),
        ...(data.costPerLead != null ? { costPerLead: data.costPerLead } : {}),
        ...(data.costCurrency ? { costCurrency: data.costCurrency } : {}),
      },
    });
  }

  private async findOrCreateLead(
    mapped: MappedMetaLead,
    event: LeadgenEvent,
    metaLead: MetaLeadPayload,
    tenantId: string,
    attribution?: MetaAdAttribution | null,
  ) {
    const reusable = await this.findReusableLead(mapped, tenantId);
    if (reusable) {
      await this.mergeTags(reusable.id, reusable.tags, mapped.extraTags);
      this.logger.log(
        `Lead reutilizado crmLeadId=${reusable.id} tenantId=${tenantId} leadgen_id=${event.leadgenId}`,
      );
      return { lead: reusable, created: false };
    }

    const canal = metaLeadCanal(event.platform, metaLead.platform);
    const tags = [
      canal,
      'Lead Ads',
      ...mapped.extraTags,
      ...(attribution?.campaignName
        ? [`Campanha: ${attribution.campaignName}`]
        : []),
      ...(attribution?.formName
        ? [`Form: ${attribution.formName}`]
        : event.formId
          ? [`Form: ${event.formId}`]
          : []),
      ...(attribution?.adName
        ? [`Ad: ${attribution.adName}`]
        : event.adId || metaLead.ad_id
          ? [`Ad: ${event.adId ?? metaLead.ad_id}`]
          : []),
    ];

    const placement = await this.funis.comercialPlacement(tenantId);
    const empreendimentoId = await this.matchEmpreendimento(
      tenantId,
      mapped.empreendimentoNome,
    );
    const origem = this.origemCampanha(
      attribution,
      canal === 'Instagram' ? 'Instagram' : 'Facebook Ads',
    );
    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        nome: mapped.nome,
        telefone: mapped.telefone ?? '(00) 00000-0000',
        email: mapped.email ?? `${event.leadgenId}@facebook.meta.local`,
        origem,
        interesse: mapped.interesse ?? 'Comprar',
        cidade: mapped.cidade ?? 'A definir',
        bairro: mapped.bairro ?? 'A definir',
        renda: mapped.renda ?? undefined,
        tipoRenda: mapped.tipoRenda ?? undefined,
        estadoCivil: mapped.estadoCivil ?? undefined,
        cpf: mapped.cpf ?? undefined,
        rg: mapped.rg ?? undefined,
        endereco: mapped.endereco ?? undefined,
        cep: mapped.cep ?? undefined,
        orcamentoMax: mapped.orcamentoMax ?? undefined,
        quartosMin: mapped.quartosMin ?? undefined,
        vagasMin: mapped.vagasMin ?? undefined,
        empreendimentoId: empreendimentoId ?? undefined,
        stage: placement.stage,
        funilId: placement.funilId,
        prioridade: 'Média',
        tags,
      },
    });
    if (empreendimentoId) {
      await this.prisma.leadEmpreendimentoInteresse.create({
        data: {
          tenantId,
          leadId: lead.id,
          empreendimentoId,
          status: 'ativo',
        },
      }).catch(() => undefined);
    }
    await this.fila.atribuirNovoLead({
      tenantId,
      leadId: lead.id,
      origem,
    });
    return { lead, created: true };
  }

  /** Liga o lead ao cadastro do tenant pelo nome do form; não usa corretor/equipe. */
  private async matchEmpreendimento(tenantId: string, nome: string | null) {
    const q = nome?.trim();
    if (!q) return null;
    const exact = await this.prisma.empreendimento.findFirst({
      where: { tenantId, ativo: true, nome: { equals: q, mode: 'insensitive' } },
      select: { id: true },
    });
    if (exact) return exact.id;
    const partial = await this.prisma.empreendimento.findFirst({
      where: { tenantId, ativo: true, nome: { contains: q, mode: 'insensitive' } },
      select: { id: true },
    });
    return partial?.id ?? null;
  }

  /** Reusa lead existente sem vínculo Meta (evita conflito no leadId unique). */
  private async findReusableLead(
    mapped: MappedMetaLead,
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

  private queueLeadNotify(
    tenantId: string,
    lead: {
      id: string;
      nome: string;
      telefone: string;
      origem: string;
      cidade: string;
      corretorId: string | null;
    },
  ) {
    void this.leadNotify.notifyNewLead({
      tenantId,
      lead: {
        id: lead.id,
        nome: lead.nome,
        telefone: lead.telefone,
        origem: lead.origem,
        cidade: lead.cidade,
        corretorId: lead.corretorId,
      },
    });
  }
}
