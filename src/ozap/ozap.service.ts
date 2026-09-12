import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OzapWebhookDto } from './dto/ozap-webhook.dto';

type OzapTransaction = Prisma.TransactionClient;
type OzapWebhookResult = {
  ok: true;
  leadId?: string;
  ignored?: true;
  reason?: 'instance_not_mapped';
  duplicate?: true;
};

class DuplicateOzapDeliveryError extends Error {}

type MessageReceivedData = {
  chat_id?: unknown;
  message_id?: unknown;
  from?: unknown;
  content?: unknown;
  contact_name?: unknown;
};

type ChatStatusChangedData = {
  chat_id?: unknown;
  new_status?: unknown;
  lead_category?: unknown;
};

type MessageSentData = {
  chat_id?: unknown;
  content?: unknown;
  source?: unknown;
};

type CampoLeadOzap =
  | 'nome'
  | 'cidade'
  | 'bairro'
  | 'renda'
  | 'tipo_renda'
  | 'estado_civil';

const CATEGORIA_PRIORIDADE: Record<string, string> = {
  cold: 'Baixa',
  warm: 'Média',
  hot: 'Alta',
  purchased: 'Alta',
};

@Injectable()
export class OzapService {
  private readonly logger = new Logger(OzapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleWebhook(payload: OzapWebhookDto): Promise<OzapWebhookResult> {
    const connection = await this.prisma.tenantOzapConnection.findFirst({
      where: { instanceId: payload.instance_id, ativo: true },
      select: { tenantId: true },
    });
    if (!connection) {
      this.logger.warn(
        `Webhook OZap ignorado: instância ${payload.instance_id} não está vinculada ou está inativa.`,
      );
      return { ok: true, ignored: true, reason: 'instance_not_mapped' };
    }

    const data = payload.data;
    const chatId = this.asString(data.chat_id);
    const messageId = this.asString(data.message_id);
    const deliveryKey = [
      payload.instance_id,
      payload.event,
      messageId ?? `${chatId ?? 'sem-chat'}:${payload.timestamp}`,
    ].join(':');

    try {
      return await this.prisma.$transaction(async (tx) => {
        try {
          await tx.ozapWebhookDelivery.create({
            data: {
              deliveryKey,
              event: payload.event,
              instanceId: payload.instance_id,
              chatId,
              messageId,
              // Não persistimos o conteúdo da conversa neste log de idempotência.
              payload: {
                timestamp: payload.timestamp,
              } as Prisma.InputJsonValue,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            throw new DuplicateOzapDeliveryError();
          }
          throw error;
        }

        if (payload.event === 'message.received') {
          const leadId = await this.handleMessageReceived(
            tx,
            payload.instance_id,
            data as MessageReceivedData,
            payload.timestamp,
            connection.tenantId,
          );
          return { ok: true, leadId };
        }

        if (payload.event === 'chat.status_changed') {
          await this.handleStatusChanged(
            tx,
            payload.instance_id,
            data as ChatStatusChangedData,
          );
        }
        if (payload.event === 'message.sent') {
          await this.handleMessageSent(
            tx,
            payload.instance_id,
            data as MessageSentData,
          );
        }

        return { ok: true };
      });
    } catch (error) {
      if (error instanceof DuplicateOzapDeliveryError) {
        if (payload.event === 'message.received' && chatId) {
          const linkedLead = await this.prisma.leadOzapLink.findUnique({
            where: {
              instanceId_chatId: {
                instanceId: payload.instance_id,
                chatId,
              },
            },
            select: { leadId: true },
          });
          if (!linkedLead) {
            const removed = await this.prisma.ozapWebhookDelivery.deleteMany({
              where: { deliveryKey },
            });
            if (removed.count > 0) {
              this.logger.warn(
                `Reprocessando entrega OZap antiga sem lead vinculado: instance=${payload.instance_id} chat=${chatId}.`,
              );
              return this.handleWebhook(payload);
            }
          }
        }
        return { ok: true, duplicate: true };
      }
      const detail = error instanceof Error ? error.stack : String(error);
      this.logger.error(
        `Falha ao processar webhook OZap event=${payload.event} instance=${payload.instance_id} chat=${chatId ?? 'ausente'} message=${messageId ?? 'ausente'}.`,
        detail,
      );
      throw error;
    }
  }

  private async handleMessageReceived(
    tx: OzapTransaction,
    instanceId: number,
    data: MessageReceivedData,
    timestamp: string,
    tenantId: string,
  ) {
    const chatId = this.requiredString(data.chat_id, 'chat_id');
    const phone = this.formatBrazilianPhone(
      this.requiredString(data.from, 'from'),
    );
    const contactName = this.asString(data.contact_name) || 'Lead WhatsApp';
    const timestampDate = this.parseDate(timestamp);

    const existingLink = await tx.leadOzapLink.findUnique({
      where: { instanceId_chatId: { instanceId, chatId } },
      include: { lead: true },
    });

    let lead = existingLink?.lead;
    if (lead && lead.tenantId !== tenantId) {
      // Link aponta para lead de outro tenant — não reutiliza.
      lead = undefined;
    }
    if (!lead) {
      lead =
        (await tx.lead.findFirst({
          where: { tenantId, telefone: phone, perdidoAt: null },
        })) ?? undefined;
    }

    if (!lead) {
      const digits = phone.replace(/\D/g, '');
      lead = await tx.lead.create({
        data: {
          tenantId,
          nome: contactName,
          telefone: phone,
          email: `${digits}@whatsapp.ozap.local`,
          origem: 'WhatsApp',
          interesse: 'Comprar',
          cidade: 'A definir',
          bairro: 'A definir',
          stage: 'novo',
          prioridade: 'Média',
          tags: ['WhatsApp', 'OZap'],
        },
      });
    } else if (
      lead.nome.trim().toLocaleLowerCase('pt-BR') === 'lead whatsapp' &&
      contactName !== 'Lead WhatsApp'
    ) {
      lead = await tx.lead.update({
        where: { id: lead.id },
        data: { nome: contactName },
      });
    }

    await tx.leadOzapLink.upsert({
      where: { leadId: lead.id },
      create: {
        leadId: lead.id,
        instanceId,
        chatId,
        lastMessageAt: timestampDate,
      },
      update: { lastMessageAt: timestampDate, instanceId, chatId },
    });

    await this.applyPendingField(tx, instanceId, chatId, lead.id, data.content);

    return lead.id;
  }

  private async handleMessageSent(
    tx: OzapTransaction,
    instanceId: number,
    data: MessageSentData,
  ) {
    const chatId = this.asString(data.chat_id);
    const content = this.asString(data.content);
    const source = this.asString(data.source);
    if (!chatId || !content || (source && source !== 'ai')) return;

    const campoPendente = this.identifyRequestedField(content);
    if (!campoPendente) return;

    await tx.leadOzapLink.updateMany({
      where: { instanceId, chatId },
      data: { campoPendente },
    });
  }

  private async applyPendingField(
    tx: OzapTransaction,
    instanceId: number,
    chatId: string,
    leadId: string,
    content: unknown,
  ) {
    const resposta = this.asString(content);
    if (!resposta) return;

    const link = await tx.leadOzapLink.findUnique({
      where: { instanceId_chatId: { instanceId, chatId } },
      select: { campoPendente: true },
    });
    const campo = link?.campoPendente as CampoLeadOzap | null;
    if (!campo) return;

    const data = this.getLeadAnswerData(campo, resposta);
    await tx.lead.update({ where: { id: leadId }, data });
    await tx.leadOzapLink.update({
      where: { instanceId_chatId: { instanceId, chatId } },
      data: { campoPendente: null },
    });
  }

  private async handleStatusChanged(
    tx: OzapTransaction,
    instanceId: number,
    data: ChatStatusChangedData,
  ) {
    const chatId = this.asString(data.chat_id);
    if (!chatId) return;

    const link = await tx.leadOzapLink.findUnique({
      where: { instanceId_chatId: { instanceId, chatId } },
    });
    if (!link) return;

    const categoria =
      this.asString(data.lead_category) ?? this.asString(data.new_status);
    if (!categoria) return;

    const prioridade = CATEGORIA_PRIORIDADE[categoria];
    const lead = await tx.lead.findUnique({
      where: { id: link.leadId },
      select: { tags: true },
    });
    if (!lead) return;

    const tags = [
      ...lead.tags.filter((tag) => !tag.startsWith('OZap:')),
      `OZap: ${this.labelCategoria(categoria)}`,
    ];
    await tx.leadOzapLink.update({
      where: { id: link.id },
      data: { categoria },
    });
    await tx.lead.update({
      where: { id: link.leadId },
      data: { ...(prioridade ? { prioridade } : {}), tags },
    });
  }

  private formatBrazilianPhone(raw: string) {
    const digits = raw.replace(/\D/g, '').replace(/^55/, '');
    if (!/^\d{10,11}$/.test(digits)) {
      throw new Error('Telefone OZap inválido.');
    }
    const ddd = digits.slice(0, 2);
    const local = digits.slice(2);
    return local.length === 9
      ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
      : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
  }

  private requiredString(value: unknown, field: string) {
    const normalized = this.asString(value);
    if (!normalized) throw new Error(`Campo OZap obrigatório ausente: ${field}.`);
    return normalized;
  }

  private asString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private parseDate(value: string) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private labelCategoria(categoria: string) {
    return (
      {
        cold: 'frio',
        warm: 'morno',
        hot: 'quente',
        purchased: 'comprou',
        human_intervention: 'atendimento humano',
      }[categoria] ?? categoria
    );
  }

  private identifyRequestedField(content: string): CampoLeadOzap | null {
    const normalized = content.toLocaleLowerCase('pt-BR');
    if (/com quem (eu )?falo|qual (é )?seu nome|seu nome/.test(normalized)) {
      return 'nome';
    }
    if (/cidade|região|regiao/.test(normalized)) return 'cidade';
    if (/bairro/.test(normalized)) return 'bairro';
    if (/renda (bruta|mensal)|ganha por mês|ganha por mes/.test(normalized)) {
      return 'renda';
    }
    if (/tipo de renda|clt|autônomo|autonomo|funcionário público|funcionario publico/.test(normalized)) {
      return 'tipo_renda';
    }
    if (/estado civil/.test(normalized)) {
      return 'estado_civil';
    }
    return null;
  }

  private getLeadAnswerData(campo: CampoLeadOzap, resposta: string) {
    if (campo === 'renda') {
      const renda = this.parseIncome(resposta);
      return renda ? { renda } : {};
    }
    if (campo === 'tipo_renda') {
      return { tipoRenda: resposta.trim().slice(0, 60) };
    }
    if (campo === 'estado_civil') {
      return { estadoCivil: resposta.trim().slice(0, 40) };
    }
    return { [campo]: resposta.trim().slice(0, 120) };
  }

  private parseIncome(value: string) {
    const normalized = value.trim().replace(/[^\d,.-]/g, '');
    if (!normalized) return null;
    const semCentavos = normalized.replace(/[.,]\d{2}$/, '');
    const digits = semCentavos.replace(/\D/g, '');
    const renda = Number(digits);
    return Number.isSafeInteger(renda) && renda > 0 ? renda : null;
  }
}
