export type LeadNotifySnapshot = {
  id: string;
  nome: string;
  telefone: string;
  origem: string;
  cidade: string;
};

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
