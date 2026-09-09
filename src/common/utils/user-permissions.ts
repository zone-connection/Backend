import { Role } from '@prisma/client';

export type UserPermissions = {
  modules: Record<string, boolean>;
  actions: Record<string, boolean>;
};

export const PERMISSION_MODULES = [
  { key: 'dashboard', label: 'Dashboard', routes: ['/dashboard'], group: 'operacao' },
  { key: 'leads', label: 'Leads', routes: ['/leads'], group: 'operacao' },
  { key: 'funil', label: 'Funil', routes: ['/funil'], group: 'operacao' },
  { key: 'triagem', label: 'Triagem', routes: ['/triagem'], group: 'operacao' },
  { key: 'agenda', label: 'Agenda', routes: ['/agenda'], group: 'operacao' },
  {
    key: 'clientes',
    label: 'Clientes',
    routes: ['/clientes', '/funil-clientes'],
    group: 'operacao',
  },
  {
    key: 'leadsPerdidos',
    label: 'Leads perdidos',
    routes: ['/leads-perdidos'],
    group: 'operacao',
  },
  {
    key: 'clientesPerdidos',
    label: 'Perda de cliente',
    routes: ['/clientes-perdidos'],
    group: 'operacao',
  },
  {
    key: 'treinamento',
    label: 'Treinamento',
    routes: ['/treinamento'],
    group: 'operacao',
  },
  {
    key: 'captacao',
    label: 'Captação de imóveis',
    routes: ['/captacao'],
    group: 'operacao',
  },
  {
    key: 'imoveisUsados',
    label: 'Venda de imóveis usados',
    routes: ['/imoveis-usados'],
    group: 'operacao',
  },
  {
    key: 'locacao',
    label: 'Locação',
    routes: ['/locacao'],
    group: 'operacao',
  },
  {
    key: 'documentacao',
    label: 'Documentação',
    routes: ['/documentacao'],
    group: 'fechamento',
  },
  { key: 'propostas', label: 'Propostas', routes: ['/propostas'], group: 'fechamento' },
  { key: 'contratos', label: 'Contratos', routes: ['/contratos'], group: 'fechamento' },
  { key: 'vendas', label: 'Vendas', routes: ['/vendas'], group: 'fechamento' },
  {
    key: 'construtoras',
    label: 'Construtoras',
    routes: ['/construtoras'],
    group: 'catalogo',
  },
  { key: 'imoveis', label: 'Imóveis', routes: ['/imoveis'], group: 'catalogo' },
  { key: 'corretores', label: 'Ranking', routes: ['/corretores'], group: 'gestao' },
  { key: 'atrasos', label: 'Atrasos', routes: ['/atrasos'], group: 'gestao' },
  { key: 'metas', label: 'Metas', routes: ['/metas'], group: 'gestao' },
  { key: 'analise', label: 'Análise', routes: ['/resultado'], group: 'gestao' },
  {
    key: 'taxaConversao',
    label: 'Taxa de conversão',
    routes: ['/taxa-conversao'],
    group: 'gestao',
  },
  { key: 'equipes', label: 'Equipes', routes: ['/equipes'], group: 'gestao' },
  { key: 'usuarios', label: 'Usuários', routes: ['/usuarios'], group: 'gestao' },
  {
    key: 'permissoes',
    label: 'Permissões',
    routes: ['/permissoes'],
    group: 'gestao',
  },
  {
    key: 'configuracoes',
    label: 'Configurações',
    routes: ['/configuracoes'],
    group: 'gestao',
  },
  {
    key: 'financeiro',
    label: 'Financeiro',
    routes: ['/financeiro'],
    group: 'financeiro',
  },
  {
    key: 'comissao',
    label: 'Comissões',
    routes: ['/financeiro/comissao'],
    group: 'financeiro',
  },
] as const;

export const PERMISSION_ACTIONS = [
  { key: 'leads.view', label: 'Visualizar leads', module: 'leads' },
  { key: 'leads.create', label: 'Criar leads', module: 'leads' },
  { key: 'leads.edit', label: 'Editar leads', module: 'leads' },
  { key: 'leads.delete', label: 'Excluir leads', module: 'leads' },
  { key: 'leads.viewLost', label: 'Visualizar leads perdidos', module: 'leads' },
  {
    key: 'leads.viewOthers',
    label: 'Visualizar leads de outros corretores',
    module: 'leads',
  },
  { key: 'leads.changeOwner', label: 'Alterar responsável pelo lead', module: 'leads' },
  { key: 'leads.export', label: 'Exportar leads', module: 'leads' },
  { key: 'financeiro.access', label: 'Acessar Financeiro', module: 'financeiro' },
  {
    key: 'financeiro.pagar.view',
    label: 'Visualizar contas a pagar',
    module: 'financeiro',
  },
  {
    key: 'financeiro.pagar.create',
    label: 'Criar contas a pagar',
    module: 'financeiro',
  },
  {
    key: 'financeiro.pagar.edit',
    label: 'Editar contas a pagar',
    module: 'financeiro',
  },
  {
    key: 'financeiro.pagar.delete',
    label: 'Excluir contas a pagar',
    module: 'financeiro',
  },
  {
    key: 'financeiro.receber.view',
    label: 'Visualizar contas a receber',
    module: 'financeiro',
  },
  {
    key: 'financeiro.receber.create',
    label: 'Criar contas a receber',
    module: 'financeiro',
  },
  {
    key: 'financeiro.receber.edit',
    label: 'Editar contas a receber',
    module: 'financeiro',
  },
  {
    key: 'financeiro.receber.delete',
    label: 'Excluir contas a receber',
    module: 'financeiro',
  },
  { key: 'financeiro.fluxo', label: 'Visualizar fluxo de caixa', module: 'financeiro' },
  { key: 'financeiro.comissao', label: 'Acessar comissões', module: 'financeiro' },
  {
    key: 'financeiro.export',
    label: 'Exportar informações financeiras',
    module: 'financeiro',
  },
] as const;

const ROLE_DEFAULT_ROUTES: Record<Role, readonly string[]> = {
  super_admin: [
    '/perfil',
    '/tenants',
    '/guia',
    '/dashboard',
    '/leads',
    '/funil',
    '/agenda',
    '/metas',
    '/contratos',
    '/vendas',
    '/configuracoes',
    '/financeiro',
  ],
  admin: [
    '/dashboard',
    '/vendas',
    '/leads',
    '/funil',
    '/funil-clientes',
    '/agenda',
    '/imoveis',
    '/treinamento',
    '/clientes',
    '/corretores',
    '/atrasos',
    '/metas',
    '/triagem',
    '/documentacao',
    '/resultado',
    '/usuarios',
    '/permissoes',
    '/equipes',
    '/construtoras',
    '/leads-perdidos',
    '/taxa-conversao',
    '/propostas',
    '/contratos',
    '/financeiro',
    '/configuracoes',
    '/perfil',
  ],
  gerente: [
    '/dashboard',
    '/vendas',
    '/leads',
    '/funil',
    '/funil-clientes',
    '/agenda',
    '/imoveis',
    '/treinamento',
    '/clientes',
    '/corretores',
    '/atrasos',
    '/metas',
    '/triagem',
    '/documentacao',
    '/resultado',
    '/usuarios',
    '/construtoras',
    '/propostas',
    '/contratos',
    '/financeiro/comissao',
    '/configuracoes',
    '/perfil',
  ],
  corretor: [
    '/dashboard',
    '/leads',
    '/funil',
    '/funil-clientes',
    '/agenda',
    '/imoveis',
    '/treinamento',
    '/clientes',
    '/clientes-perdidos',
    '/metas',
    '/triagem',
    '/documentacao',
    '/contratos',
    '/construtoras',
    '/financeiro/comissao',
    '/perfil',
  ],
  analista: [
    '/resultado',
    '/documentacao',
    '/contratos',
    '/imoveis',
    '/treinamento',
    '/construtoras',
    '/usuarios',
    '/configuracoes',
    '/perfil',
  ],
  financeiro: [
    '/financeiro/visao-geral',
    '/financeiro/clientes-fornecedores',
    '/financeiro/movimentacao',
    '/financeiro/fluxo-caixa',
    '/financeiro/contas-a-receber',
    '/financeiro/contas-a-pagar',
    '/financeiro/despesas',
    '/financeiro/comissao',
    '/perfil',
  ],
    treinee: [
    '/dashboard',
    '/leads',
    '/funil',
    '/funil-clientes',
    '/agenda',
    '/imoveis',
    '/treinamento',
    '/clientes',
    '/clientes-perdidos',
    '/metas',
    '/triagem',
    '/documentacao',
    '/contratos',
    '/financeiro/comissao',
    '/construtoras',
    '/configuracoes',
    '/perfil',
  ],
  /** Solo: acesso só via permissions liberadas pelo admin. */
  assistente: ['/perfil'],
};

function roleHasRoute(role: Role, route: string): boolean {
  return ROLE_DEFAULT_ROUTES[role].some(
    (allowed) => route === allowed || route.startsWith(`${allowed}/`),
  );
}

export function emptyPermissions(): UserPermissions {
  return { modules: {}, actions: {} };
}

export function sanitizeUserPermissions(raw: unknown): UserPermissions {
  const next = emptyPermissions();
  if (!raw || typeof raw !== 'object') return next;
  const obj = raw as { modules?: unknown; actions?: unknown };
  if (obj.modules && typeof obj.modules === 'object') {
    const modules = obj.modules as Record<string, unknown>;
    for (const item of PERMISSION_MODULES) {
      if (typeof modules[item.key] === 'boolean') {
        next.modules[item.key] = modules[item.key] as boolean;
      }
    }
  }
  if (obj.actions && typeof obj.actions === 'object') {
    const actions = obj.actions as Record<string, unknown>;
    for (const item of PERMISSION_ACTIONS) {
      if (typeof actions[item.key] === 'boolean') {
        next.actions[item.key] = actions[item.key] as boolean;
      }
    }
  }
  return next;
}

export function defaultsFromRole(role: Role): UserPermissions {
  const modules: Record<string, boolean> = {};
  for (const item of PERMISSION_MODULES) {
    if (item.key === 'financeiro') {
      modules.financeiro = ROLE_DEFAULT_ROUTES[role].some(
        (route) =>
          route === '/financeiro' ||
          (route.startsWith('/financeiro/') && route !== '/financeiro/comissao'),
      );
      continue;
    }
    if (item.key === 'comissao') {
      modules.comissao = roleHasRoute(role, '/financeiro/comissao');
      continue;
    }
    modules[item.key] = item.routes.some((route) => roleHasRoute(role, route));
  }

  const gestor = role === Role.admin || role === Role.gerente;
  const finUser =
    role === Role.admin ||
    role === Role.gerente ||
    role === Role.super_admin ||
    role === Role.financeiro;

  const actions: Record<string, boolean> = {
    'leads.view': Boolean(modules.leads),
    'leads.create': Boolean(modules.leads),
    'leads.edit': Boolean(modules.leads),
    'leads.delete': role === Role.admin || role === Role.super_admin,
    'leads.viewLost': Boolean(modules.leadsPerdidos),
    'leads.viewOthers':
      role === Role.admin ||
      role === Role.super_admin ||
      role === Role.gerente ||
      role === Role.analista,
    'leads.changeOwner': gestor,
    'leads.export': gestor,
    'financeiro.access': Boolean(modules.financeiro),
    'financeiro.pagar.view': finUser && Boolean(modules.financeiro),
    'financeiro.pagar.create': finUser && Boolean(modules.financeiro),
    'financeiro.pagar.edit': finUser && Boolean(modules.financeiro),
    'financeiro.pagar.delete': finUser && Boolean(modules.financeiro),
    'financeiro.receber.view': finUser && Boolean(modules.financeiro),
    'financeiro.receber.create': finUser && Boolean(modules.financeiro),
    'financeiro.receber.edit': finUser && Boolean(modules.financeiro),
    'financeiro.receber.delete': finUser && Boolean(modules.financeiro),
    'financeiro.fluxo': finUser && Boolean(modules.financeiro),
    'financeiro.comissao': Boolean(modules.comissao),
    'financeiro.export': role === Role.admin,
  };

  return { modules, actions };
}

export function mergePermissions(
  base: UserPermissions,
  override?: UserPermissions | null,
): UserPermissions {
  return {
    modules: { ...base.modules, ...(override?.modules ?? {}) },
    actions: { ...base.actions, ...(override?.actions ?? {}) },
  };
}

export function effectivePermissions(
  role: Role,
  stored?: UserPermissions | null,
): UserPermissions {
  return mergePermissions(defaultsFromRole(role), stored);
}

export function hasUserAction(
  role: Role,
  stored: UserPermissions | null | undefined,
  action: string,
): boolean {
  return effectivePermissions(role, stored).actions[action] === true;
}

export function hasUserModule(
  role: Role,
  stored: UserPermissions | null | undefined,
  moduleKey: string,
): boolean {
  return effectivePermissions(role, stored).modules[moduleKey] === true;
}

export function hasAnyUserModule(
  role: Role,
  stored: UserPermissions | null | undefined,
  moduleKeys: readonly string[],
): boolean {
  return moduleKeys.some((key) => hasUserModule(role, stored, key));
}

/** Prefixos de escrita que continuam restritos ao cargo (não bastam módulos). */
const SENSITIVE_WRITE_PREFIXES = ['users', 'tenants', 'equipes'] as const;

/**
 * Módulos de permissão que liberam um path da API além do @Roles.
 * Um path pode mapear para mais de um módulo (ex.: ranking serve Dashboard e Taxa).
 */
export function modulesForApiPath(rawPath: string): string[] {
  const path = rawPath.split('?')[0].replace(/^\/+/, '').toLowerCase();

  if (path.startsWith('leads/monitoramento')) return ['atrasos'];
  if (path.startsWith('leads/perdidos') || path.startsWith('leads/clientes-perdidos')) {
    return path.includes('clientes-perdidos')
      ? ['clientesPerdidos']
      : ['leadsPerdidos'];
  }
  if (path.startsWith('dashboard/ranking')) {
    return ['corretores', 'taxaConversao', 'dashboard'];
  }
  if (path.startsWith('dashboard')) {
    return ['dashboard', 'taxaConversao', 'corretores'];
  }
  if (path.startsWith('financeiro/comissao')) return ['comissao', 'financeiro'];
  if (path.startsWith('financeiro')) return ['financeiro'];
  if (path.startsWith('documentacao')) return ['documentacao', 'vendas'];
  if (path.startsWith('propostas')) return ['propostas'];
  if (path.startsWith('contratos')) return ['contratos'];
  if (path.startsWith('funis')) return ['funil'];
  if (path.startsWith('leads')) return ['leads'];
  if (path.startsWith('agenda')) return ['agenda'];
  if (path.startsWith('users')) return ['usuarios'];
  if (path.startsWith('equipes')) return ['equipes'];
  if (path.startsWith('analise')) return ['analise'];
  if (path.startsWith('metas')) return ['metas'];
  if (path.startsWith('catalog')) return ['configuracoes'];
  if (path.startsWith('construtoras')) return ['construtoras'];
  if (path.startsWith('portal-proprietario')) return [];
  if (path.startsWith('imoveis-usados')) return ['imoveisUsados'];
  if (
    path.startsWith('empreendimentos') ||
    path === 'imoveis' ||
    path.startsWith('imoveis/')
  ) {
    return ['imoveis', 'construtoras'];
  }
  if (path.startsWith('treinamento')) return ['treinamento'];
  if (path.startsWith('triagem')) return ['triagem'];
  if (path.startsWith('localidades')) return ['imoveis', 'construtoras'];
  if (path.startsWith('captacao')) return ['captacao'];
  if (path.startsWith('locacao')) return ['locacao'];
  return [];
}

export function isSensitiveApiWrite(rawPath: string, method: string): boolean {
  const verb = method.toUpperCase();
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return false;
  const path = rawPath.split('?')[0].replace(/^\/+/, '').toLowerCase();
  return SENSITIVE_WRITE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
