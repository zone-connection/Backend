/**
 * Parser defensivo do payload de webhook Page/leadgen da Meta.
 *
 * Não usa class-validator: o ValidationPipe global tem
 * `forbidNonWhitelisted: true` e payloads reais da Meta incluem campos
 * extras (ex.: campaign_id). Rejeitar esses campos com 400 faz a Meta
 * considerar a entrega falha — e o MetaService nunca registra o evento.
 */

export type LeadgenEvent = {
  leadgenId: string;
  pageId: string;
  formId: string | null;
  adId: string | null;
  adgroupId: string | null;
  pageIdSource: 'value' | 'entry';
};

export type ExtractSkip = {
  reason: string;
  field?: string;
};

export type ExtractLeadgenResult = {
  object: unknown;
  entryCount: number;
  events: LeadgenEvent[];
  skipped: ExtractSkip[];
};

export function asMetaId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extrai eventos leadgen. O page_id oficial pode vir em
 * `entry.changes[].value.page_id` ou, na ausência dele, em `entry.id`.
 */
export function extractLeadgenEvents(payload: unknown): ExtractLeadgenResult {
  const skipped: ExtractSkip[] = [];

  if (!isRecord(payload)) {
    return {
      object: undefined,
      entryCount: 0,
      events: [],
      skipped: [{ reason: 'payload_nao_objeto' }],
    };
  }

  const entries = payload.entry;
  if (!Array.isArray(entries)) {
    return {
      object: payload.object,
      entryCount: 0,
      events: [],
      skipped: [{ reason: 'entry_ausente_ou_invalido' }],
    };
  }

  const events: LeadgenEvent[] = [];

  for (const entry of entries) {
    if (!isRecord(entry)) {
      skipped.push({ reason: 'entry_invalida' });
      continue;
    }

    const entryPageId = asMetaId(entry.id);
    const changes = entry.changes;
    if (!Array.isArray(changes)) {
      skipped.push({ reason: 'changes_ausente', field: entryPageId ?? undefined });
      continue;
    }

    for (const change of changes) {
      if (!isRecord(change)) {
        skipped.push({ reason: 'change_invalido' });
        continue;
      }

      const field = typeof change.field === 'string' ? change.field : '';
      if (field !== 'leadgen') {
        skipped.push({ reason: 'campo_ignorado', field: field || '(vazio)' });
        continue;
      }

      const value = isRecord(change.value) ? change.value : {};
      const leadgenId = asMetaId(value.leadgen_id);
      const valuePageId = asMetaId(value.page_id);
      const pageId = valuePageId ?? entryPageId;

      if (!leadgenId) {
        skipped.push({ reason: 'leadgen_id_ausente', field: pageId ?? undefined });
        continue;
      }
      if (!pageId) {
        skipped.push({
          reason: 'page_id_ausente',
          field: leadgenId,
        });
        continue;
      }

      events.push({
        leadgenId,
        pageId,
        formId: asMetaId(value.form_id),
        adId: asMetaId(value.ad_id),
        adgroupId: asMetaId(value.adgroup_id),
        pageIdSource: valuePageId ? 'value' : 'entry',
      });
    }
  }

  return {
    object: payload.object,
    entryCount: entries.length,
    events,
    skipped,
  };
}
