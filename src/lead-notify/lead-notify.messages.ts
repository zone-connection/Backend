export type LeadNotifySnapshot = {
  id: string;
  nome: string;
  telefone: string;
  origem: string;
  cidade: string;
};

export const DEFAULT_CRM_ORIGIN = 'https://www.zoneconnection.com.br';
export const DEFAULT_BRAND_LOGO_URL = `${DEFAULT_CRM_ORIGIN}/brand/zone-connection-logo.png`;

function isLocalHost(url: string) {
  return /localhost|127\.0\.0\.1/i.test(url);
}

function isPreviewHost(url: string) {
  return /vercel\.app|netlify\.app|sslip\.io/i.test(url);
}

function canonicalizePublicOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'zoneconnection.com.br') {
      parsed.hostname = 'www.zoneconnection.com.br';
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/** Origem do CRM nos avisos (nunca preview Vercel). */
export function pickPublicFrontendUrl(
  frontendUrlList?: string | null,
  crmPublicUrl?: string | null,
): string {
  const preferred = crmPublicUrl?.trim();
  if (preferred) {
    return canonicalizePublicOrigin(preferred) ?? DEFAULT_CRM_ORIGIN;
  }

  const urls = (frontendUrlList ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean)
    .filter((url) => /^https:\/\//i.test(url) && !isLocalHost(url));

  const production = urls.filter((url) => !isPreviewHost(url));
  const branded = production.find((url) =>
    /zoneconnection\.com\.br/i.test(url),
  );
  return (
    canonicalizePublicOrigin(branded ?? production[0] ?? DEFAULT_CRM_ORIGIN) ??
    DEFAULT_CRM_ORIGIN
  );
}

export function leadCrmPath(leadId?: string | null): string {
  return leadId ? `/funil?lead=${encodeURIComponent(leadId)}` : '/funil';
}

export function formatLeadWhatsApp(params: {
  titulo: string;
  lead?: LeadNotifySnapshot | null;
  extra?: string;
  crmUrl?: string | null;
}): string {
  const lines = [params.titulo, ''];
  if (params.lead) {
    lines.push(`Nome: ${params.lead.nome}`);
    lines.push(`Telefone: ${params.lead.telefone}`);
    lines.push(`Origem: ${params.lead.origem}`);
    lines.push(`Cidade: ${params.lead.cidade}`);
  }
  if (params.extra) {
    lines.push(params.extra);
  }
  if (params.crmUrl) {
    lines.push('', `Abra no CRM: ${params.crmUrl}`);
  }
  return lines.join('\n').trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatLeadEmailHtml(params: {
  titulo: string;
  lead?: LeadNotifySnapshot | null;
  extra?: string;
  crmUrl?: string | null;
  brandName?: string | null;
  logoUrl?: string | null;
}): string {
  const brand = escapeHtml(params.brandName?.trim() || 'Zone Connection');
  const logo = escapeHtml(params.logoUrl?.trim() || DEFAULT_BRAND_LOGO_URL);
  const rows: string[] = [];
  if (params.lead) {
    rows.push(
      `<tr><td style="padding:6px 0;color:#64748b;width:88px;">Nome</td><td style="padding:6px 0;color:#0f172a;font-weight:600;">${escapeHtml(params.lead.nome)}</td></tr>`,
      `<tr><td style="padding:6px 0;color:#64748b;">Telefone</td><td style="padding:6px 0;color:#0f172a;">${escapeHtml(params.lead.telefone)}</td></tr>`,
      `<tr><td style="padding:6px 0;color:#64748b;">Origem</td><td style="padding:6px 0;color:#0f172a;">${escapeHtml(params.lead.origem)}</td></tr>`,
      `<tr><td style="padding:6px 0;color:#64748b;">Cidade</td><td style="padding:6px 0;color:#0f172a;">${escapeHtml(params.lead.cidade || '—')}</td></tr>`,
    );
  }
  if (params.extra) {
    rows.push(
      `<tr><td colspan="2" style="padding:10px 0;color:#334155;">${escapeHtml(params.extra)}</td></tr>`,
    );
  }
  const cta = params.crmUrl
    ? `<a href="${escapeHtml(params.crmUrl)}" style="display:inline-block;margin-top:18px;background:#079ED4;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">Abrir no CRM</a>
       <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;word-break:break-all;">${escapeHtml(params.crmUrl)}</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle;padding-right:12px;">
              <img src="${logo}" alt="${brand}" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:50%;object-fit:contain;background:#fff;border:1px solid #e2e8f0;" />
            </td>
            <td style="vertical-align:middle;">
              <div style="font-size:15px;font-weight:700;color:#0f172a;">${brand}</div>
              <div style="font-size:12px;color:#64748b;">Aviso do CRM</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <h1 style="margin:0 0 16px;font-size:18px;line-height:1.3;color:#0f172a;">${escapeHtml(params.titulo)}</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows.join('')}</table>
        ${cta}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function leadAtribuidoCopy(lead: LeadNotifySnapshot) {
  return {
    titulo: `Novo lead atribuído — ${lead.nome}`,
    corpo: `${lead.nome} · ${lead.telefone} · ${lead.origem} · ${lead.cidade}`,
    whatsappTitulo: 'Novo lead atribuído a você',
  };
}

export function leadPoolCopy(lead: LeadNotifySnapshot) {
  return {
    titulo: `Novo lead no pool — ${lead.nome}`,
    corpo: `${lead.nome} · ${lead.telefone} · ${lead.origem} · ${lead.cidade}`,
    whatsappTitulo: 'Novo lead no pool (sem corretor)',
  };
}

export function leadLoteCopy(quantidade: number) {
  const n = quantidade === 1 ? '1 lead novo' : `${quantidade} leads novos`;
  return {
    titulo: `Você recebeu ${n}`,
    corpo: `Abra o CRM para atender ${n} na sua carteira.`,
    whatsappTitulo: `Você recebeu ${n}`,
  };
}

export function equipePoolCopy(quantidade: number, equipeNome?: string | null) {
  const n = quantidade === 1 ? '1 lead' : `${quantidade} leads`;
  const onde = equipeNome ? ` no pool da equipe ${equipeNome}` : ' no pool da equipe';
  return {
    titulo: `${n} no pool da equipe`,
    corpo: `${n} aguardando distribuição${onde}.`,
    whatsappTitulo: `${n} no pool da equipe`,
  };
}
