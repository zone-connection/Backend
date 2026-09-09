import {
  CatalogType,
  ContatoTipo,
  CreciProcessoStatus,
  Role,
  UserStatus,
} from '@prisma/client';

/** Senha única de todas as contas demo criadas pelo populate. */
export const DEMO_PASSWORD = 'Demo@123';

export function demoUserEmail(slug: string, key: string): string {
  return `${key}@${slug}.demo`.toLowerCase();
}

export type DemoUserKey =
  | 'gerente'
  | 'gerente2'
  | 'analista'
  | 'corretor1'
  | 'corretor2'
  | 'corretor3'
  | 'corretor4'
  | 'treinee'
  | 'inativo';

export const DEMO_MARKER_KEY: DemoUserKey = 'gerente';

export interface DemoUserDef {
  key: DemoUserKey;
  name: string;
  phone: string;
  cargo: string;
  role: Role;
  status: UserStatus;
  creci?: string;
  creciStatus?: CreciProcessoStatus;
  cor: string;
  equipe?: 1 | 2;
}

export const DEMO_USERS: readonly DemoUserDef[] = [
  {
    key: 'gerente',
    name: 'Camila Borges',
    phone: '(81) 98811-2201',
    cargo: 'Gerente comercial',
    role: Role.gerente,
    status: UserStatus.ativo,
    creci: '38421-F',
    creciStatus: CreciProcessoStatus.creci_recebido,
    cor: '#2563EB',
  },
  {
    key: 'gerente2',
    name: 'Henrique Vasconcelos',
    phone: '(81) 98811-2202',
    cargo: 'Gerente de expansão',
    role: Role.gerente,
    status: UserStatus.ativo,
    creci: '40112-F',
    creciStatus: CreciProcessoStatus.creci_recebido,
    cor: '#7C3AED',
  },
  {
    key: 'analista',
    name: 'Fernanda Dias',
    phone: '(81) 98811-2203',
    cargo: 'Analista de crédito',
    role: Role.analista,
    status: UserStatus.ativo,
    cor: '#0F766E',
  },
  {
    key: 'corretor1',
    name: 'Marina Alves',
    phone: '(81) 98811-3301',
    cargo: 'Corretora sênior',
    role: Role.corretor,
    status: UserStatus.ativo,
    creci: '51209-F',
    creciStatus: CreciProcessoStatus.creci_recebido,
    cor: '#DB2777',
    equipe: 1,
  },
  {
    key: 'corretor2',
    name: 'Pedro Henrique',
    phone: '(81) 98811-3302',
    cargo: 'Corretor',
    role: Role.corretor,
    status: UserStatus.ativo,
    creci: '52881-F',
    creciStatus: CreciProcessoStatus.creci_recebido,
    cor: '#EA580C',
    equipe: 1,
  },
  {
    key: 'corretor3',
    name: 'Sofia Ramos',
    phone: '(81) 98811-3303',
    cargo: 'Corretora',
    role: Role.corretor,
    status: UserStatus.ativo,
    creci: '49002-F',
    creciStatus: CreciProcessoStatus.aguardando_creci,
    cor: '#CA8A04',
    equipe: 2,
  },
  {
    key: 'corretor4',
    name: 'Rafael Nunes',
    phone: '(81) 98811-3304',
    cargo: 'Corretor',
    role: Role.corretor,
    status: UserStatus.ativo,
    creci: '55140-F',
    creciStatus: CreciProcessoStatus.creci_recebido,
    cor: '#0284C7',
    equipe: 2,
  },
  {
    key: 'treinee',
    name: 'João Pacheco',
    phone: '(81) 98811-4401',
    cargo: 'Trainee comercial',
    role: Role.treinee,
    status: UserStatus.ativo,
    creciStatus: CreciProcessoStatus.envio_documentacao,
    cor: '#64748B',
    equipe: 1,
  },
  {
    key: 'inativo',
    name: 'Laura Prado',
    phone: '(81) 98811-5501',
    cargo: 'Corretora',
    role: Role.corretor,
    status: UserStatus.inativo,
    creciStatus: CreciProcessoStatus.nao_iniciado,
    cor: '#94A3B8',
  },
];

export const DEMO_EQUIPES = [
  { slot: 1 as const, name: 'Equipe Atlântico', gerente: 'gerente' as DemoUserKey },
  { slot: 2 as const, name: 'Equipe Litoral', gerente: 'gerente2' as DemoUserKey },
];

export const DEMO_CATALOG: {
  type: CatalogType;
  items: readonly { label: string; color: string }[];
}[] = [
  {
    type: CatalogType.origem,
    items: [
      { label: 'Site', color: 'bg-sky-100 text-sky-700' },
      { label: 'Indicação', color: 'bg-emerald-100 text-emerald-700' },
      { label: 'Portal Imobiliário', color: 'bg-indigo-100 text-indigo-700' },
      { label: 'Instagram', color: 'bg-pink-100 text-pink-700' },
      { label: 'WhatsApp', color: 'bg-green-100 text-green-700' },
      { label: 'Facebook Ads', color: 'bg-blue-100 text-blue-700' },
      { label: 'Google Ads', color: 'bg-amber-100 text-amber-700' },
      { label: 'Feirão', color: 'bg-orange-100 text-orange-700' },
      { label: 'Telefone', color: 'bg-slate-200 text-slate-700' },
    ],
  },
  {
    type: CatalogType.tag,
    items: [
      { label: 'Financiamento', color: 'bg-blue-100 text-blue-700' },
      { label: 'FGTS', color: 'bg-cyan-100 text-cyan-700' },
      { label: 'MCMV', color: 'bg-teal-100 text-teal-700' },
      { label: 'Primeira compra', color: 'bg-violet-100 text-violet-700' },
      { label: 'Investidor', color: 'bg-amber-100 text-amber-700' },
      { label: 'Alto padrão', color: 'bg-purple-100 text-purple-700' },
      { label: 'Pet friendly', color: 'bg-rose-100 text-rose-700' },
      { label: 'Permuta', color: 'bg-orange-100 text-orange-700' },
      { label: 'Urgente', color: 'bg-red-100 text-red-700' },
    ],
  },
  {
    type: CatalogType.cca,
    items: [
      { label: 'CCA Recife', color: 'bg-sky-100 text-sky-700' },
      { label: 'CCA Olinda', color: 'bg-emerald-100 text-emerald-700' },
      { label: 'CCA Interior', color: 'bg-amber-100 text-amber-700' },
    ],
  },
];

export const DEMO_LOCALIDADES = [
  'Recife',
  'Olinda',
  'Jaboatão dos Guararapes',
  'Ipojuca / Porto de Galinhas',
  'Caruaru',
] as const;

export interface DemoConstrutoraDef {
  nome: string;
  cor: string;
  contato: string;
  endereco: string;
  viabilizadorNome: string;
  viabilizadorContato: string;
  cca: string;
  localidades: number[];
}

export const DEMO_CONSTRUTORAS: readonly DemoConstrutoraDef[] = [
  {
    nome: 'Moura Dubeux',
    cor: '#1D4ED8',
    contato: '(81) 3465-1000',
    endereco: 'Av. República do Líbano, 251 — Recife/PE',
    viabilizadorNome: 'Rogério Melo',
    viabilizadorContato: '(81) 98800-1010',
    cca: 'CCA Recife',
    localidades: [0, 1],
  },
  {
    nome: 'Queiroz Galvão',
    cor: '#0F766E',
    contato: '(81) 3421-2200',
    endereco: 'Rua do Bom Jesus, 120 — Recife/PE',
    viabilizadorNome: 'Andréa Lopes',
    viabilizadorContato: '(81) 98800-2020',
    cca: 'CCA Recife',
    localidades: [0, 2],
  },
  {
    nome: 'Rio Ave',
    cor: '#B45309',
    contato: '(81) 3131-3300',
    endereco: 'Av. Conselheiro Aguiar, 2000 — Recife/PE',
    viabilizadorNome: 'Tiago Sales',
    viabilizadorContato: '(81) 98800-3030',
    cca: 'CCA Olinda',
    localidades: [1, 2],
  },
  {
    nome: 'Porto Vitória',
    cor: '#7C3AED',
    contato: '(81) 3552-4400',
    endereco: 'Rod. PE-09, km 12 — Ipojuca/PE',
    viabilizadorNome: 'Marcela Pires',
    viabilizadorContato: '(81) 98800-4040',
    cca: 'CCA Interior',
    localidades: [3],
  },
  {
    nome: 'Construtora Agreste',
    cor: '#DB2777',
    contato: '(81) 3722-5500',
    endereco: 'Av. Agamenon Magalhães, 500 — Caruaru/PE',
    viabilizadorNome: 'Iran Bastos',
    viabilizadorContato: '(81) 98800-5050',
    cca: 'CCA Interior',
    localidades: [4],
  },
];

export interface DemoEmpreendimentoDef {
  nome: string;
  cor: string;
  construtora: number;
  localidade: number;
  cidade: string;
  endereco: string;
  tipo: string;
  status: string;
  tags: string[];
  quartos: number;
  banheiros: number;
  areaM2: number;
  observacao: string;
  previsaoMesesFrente: number;
  ativo?: boolean;
}

export const DEMO_EMPREENDIMENTOS: readonly DemoEmpreendimentoDef[] = [
  {
    nome: 'Reserva Boa Viagem',
    cor: '#1D4ED8',
    construtora: 0,
    localidade: 0,
    cidade: 'Recife',
    endereco: 'Rua Setúbal, 800 — Boa Viagem',
    tipo: 'Vertical',
    status: 'Em obras',
    tags: ['Caixa', 'FGTS'],
    quartos: 3,
    banheiros: 2,
    areaM2: 92,
    observacao: 'Torre única, 24 andares, lazer completo.',
    previsaoMesesFrente: 14,
  },
  {
    nome: 'Edifício Casa Forte Prime',
    cor: '#0F766E',
    construtora: 1,
    localidade: 0,
    cidade: 'Recife',
    endereco: 'Av. Rui Barbosa, 1450 — Casa Forte',
    tipo: 'Vertical',
    status: 'Lançamento',
    tags: ['Caixa'],
    quartos: 4,
    banheiros: 3,
    areaM2: 148,
    observacao: 'Alto padrão, 2 unidades por andar.',
    previsaoMesesFrente: 28,
  },
  {
    nome: 'Porto Beach Residence',
    cor: '#B45309',
    construtora: 3,
    localidade: 3,
    cidade: 'Ipojuca',
    endereco: 'Rod. PE-09, km 14 — Porto de Galinhas',
    tipo: 'Vertical',
    status: 'Em obras',
    tags: ['Litoral'],
    quartos: 2,
    banheiros: 2,
    areaM2: 68,
    observacao: 'Frente mar, foco em investidor e locação de temporada.',
    previsaoMesesFrente: 20,
  },
  {
    nome: 'Loteamento Vale do Agreste',
    cor: '#DB2777',
    construtora: 4,
    localidade: 4,
    cidade: 'Caruaru',
    endereco: 'BR-232, km 130 — Caruaru',
    tipo: 'Loteamento',
    status: 'Pronto',
    tags: ['MCMV'],
    quartos: 0,
    banheiros: 0,
    areaM2: 250,
    observacao: 'Lotes de 250m², infraestrutura entregue.',
    previsaoMesesFrente: 0,
  },
  {
    nome: 'Residencial Candeias Vida',
    cor: '#0284C7',
    construtora: 2,
    localidade: 2,
    cidade: 'Jaboatão dos Guararapes',
    endereco: 'Av. Bernardo Vieira de Melo, 3000 — Candeias',
    tipo: 'Vertical',
    status: 'Em obras',
    tags: ['MCMV', 'FGTS'],
    quartos: 2,
    banheiros: 1,
    areaM2: 48,
    observacao: 'Faixa MCMV, entrada facilitada.',
    previsaoMesesFrente: 10,
  },
  {
    nome: 'Comercial Empresarial Derby',
    cor: '#7C3AED',
    construtora: 1,
    localidade: 0,
    cidade: 'Recife',
    endereco: 'Praça do Derby, 90 — Recife',
    tipo: 'Comercial',
    status: 'Pronto',
    tags: [],
    quartos: 0,
    banheiros: 1,
    areaM2: 38,
    observacao: 'Salas comerciais a partir de 38m².',
    previsaoMesesFrente: 0,
    ativo: false,
  },
];

export interface DemoLeadDef {
  key: string;
  nome: string;
  telefone: string;
  email: string;
  origem: string;
  interesse: string;
  cidade: string;
  bairro: string;
  stage: string;
  prioridade: 'Alta' | 'Média' | 'Baixa';
  tipo: ContatoTipo;
  renda?: number;
  tipoRenda?: string;
  estadoCivil?: string;
  tags: string[];
  corretor?: DemoUserKey;
  equipe?: 1 | 2;
  construtora?: number;
  empreendimento?: number;
  diasAtras: number;
  overdue?: boolean;
  alerta?: boolean;
  perda?: { motivo: string; por: DemoUserKey };
}

export const DEMO_LEADS: readonly DemoLeadDef[] = [
  {
    key: 'mariana',
    nome: 'Mariana Freitas',
    telefone: '(81) 98812-4471',
    email: 'mariana.freitas@example.com',
    origem: 'Site',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Boa Viagem',
    stage: 'novo',
    prioridade: 'Alta',
    tipo: ContatoTipo.lead,
    renda: 12000,
    tipoRenda: 'CLT',
    estadoCivil: 'Solteira',
    tags: ['Financiamento', 'Primeira compra'],
    corretor: 'corretor1',
    equipe: 1,
    construtora: 0,
    empreendimento: 0,
    diasAtras: 1,
    alerta: true,
  },
  {
    key: 'rodrigo',
    nome: 'Rodrigo Peixoto',
    telefone: '(81) 99143-2280',
    email: 'rodrigo.peixoto@example.com',
    origem: 'Indicação',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Graças',
    stage: 'contato',
    prioridade: 'Média',
    tipo: ContatoTipo.lead,
    renda: 18000,
    tipoRenda: 'Empresário',
    estadoCivil: 'Casado',
    tags: ['Alto padrão'],
    corretor: 'corretor2',
    equipe: 1,
    construtora: 1,
    empreendimento: 1,
    diasAtras: 2,
  },
  {
    key: 'camila',
    nome: 'Camila Duarte',
    telefone: '(81) 98455-1097',
    email: 'camila.duarte@example.com',
    origem: 'Instagram',
    interesse: 'Comprar',
    cidade: 'Olinda',
    bairro: 'Bairro Novo',
    stage: 'qualificacao',
    prioridade: 'Baixa',
    tipo: ContatoTipo.lead,
    renda: 6500,
    tipoRenda: 'CLT',
    estadoCivil: 'União estável',
    tags: ['Pet friendly', 'FGTS'],
    corretor: 'corretor3',
    equipe: 2,
    construtora: 2,
    empreendimento: 4,
    diasAtras: 3,
  },
  {
    key: 'thiago',
    nome: 'Thiago Barreto',
    telefone: '(81) 99671-3324',
    email: 'thiago.barreto@example.com',
    origem: 'Portal Imobiliário',
    interesse: 'Investir',
    cidade: 'Ipojuca',
    bairro: 'Porto de Galinhas',
    stage: 'em-analise',
    prioridade: 'Alta',
    tipo: ContatoTipo.lead,
    renda: 35000,
    tipoRenda: 'Empresário',
    estadoCivil: 'Casado',
    tags: ['Investidor', 'Alto padrão'],
    corretor: 'corretor4',
    equipe: 2,
    construtora: 3,
    empreendimento: 2,
    diasAtras: 4,
  },
  {
    key: 'juliana',
    nome: 'Juliana Mendes',
    telefone: '(81) 98290-7715',
    email: 'juliana.mendes@example.com',
    origem: 'WhatsApp',
    interesse: 'Comprar',
    cidade: 'Jaboatão dos Guararapes',
    bairro: 'Candeias',
    stage: 'visita-agendada',
    prioridade: 'Média',
    tipo: ContatoTipo.lead,
    renda: 7800,
    tipoRenda: 'CLT',
    estadoCivil: 'Solteira',
    tags: ['MCMV', 'FGTS'],
    corretor: 'corretor1',
    equipe: 1,
    construtora: 2,
    empreendimento: 4,
    diasAtras: 5,
  },
  {
    key: 'fernando',
    nome: 'Fernando Aquino',
    telefone: '(81) 99508-6612',
    email: 'fernando.aquino@example.com',
    origem: 'Feirão',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Torre',
    stage: 'visita-realizada',
    prioridade: 'Alta',
    tipo: ContatoTipo.lead,
    renda: 9500,
    tipoRenda: 'Autônomo',
    estadoCivil: 'Casado',
    tags: ['Financiamento'],
    corretor: 'corretor2',
    equipe: 1,
    construtora: 0,
    empreendimento: 0,
    diasAtras: 6,
  },
  {
    key: 'patricia',
    nome: 'Patrícia Nóbrega',
    telefone: '(81) 98737-4408',
    email: 'patricia.nobrega@example.com',
    origem: 'Google Ads',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Espinheiro',
    stage: 'proposta',
    prioridade: 'Alta',
    tipo: ContatoTipo.lead,
    renda: 22000,
    tipoRenda: 'CLT',
    estadoCivil: 'Casada',
    tags: ['Alto padrão', 'Urgente'],
    corretor: 'corretor3',
    equipe: 2,
    construtora: 1,
    empreendimento: 1,
    diasAtras: 8,
  },
  {
    key: 'bruno',
    nome: 'Bruno Carvalho',
    telefone: '(81) 99320-1186',
    email: 'bruno.carvalho@example.com',
    origem: 'Site',
    interesse: 'Investir',
    cidade: 'Recife',
    bairro: 'Pina',
    stage: 'negociacao',
    prioridade: 'Média',
    tipo: ContatoTipo.lead,
    renda: 27000,
    tipoRenda: 'Empresário',
    estadoCivil: 'Divorciado',
    tags: ['Investidor'],
    corretor: 'corretor4',
    equipe: 2,
    construtora: 4,
    empreendimento: 3,
    diasAtras: 9,
  },
  {
    key: 'leticia',
    nome: 'Letícia Vasconcelos',
    telefone: '(81) 98164-9923',
    email: 'leticia.vasconcelos@example.com',
    origem: 'Indicação',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Casa Forte',
    stage: 'contrato-fechamento',
    prioridade: 'Alta',
    tipo: ContatoTipo.cliente,
    renda: 31000,
    tipoRenda: 'Empresária',
    estadoCivil: 'Casada',
    tags: ['Alto padrão', 'Financiamento'],
    corretor: 'corretor1',
    equipe: 1,
    construtora: 1,
    empreendimento: 1,
    diasAtras: 12,
  },
  {
    key: 'marcelo',
    nome: 'Marcelo Tavares',
    telefone: '(81) 99755-3041',
    email: 'marcelo.tavares@example.com',
    origem: 'Facebook Ads',
    interesse: 'Comprar',
    cidade: 'Paulista',
    bairro: 'Janga',
    stage: 'ganho-venda',
    prioridade: 'Média',
    tipo: ContatoTipo.cliente,
    renda: 8600,
    tipoRenda: 'CLT',
    estadoCivil: 'Casado',
    tags: ['MCMV'],
    corretor: 'corretor2',
    equipe: 1,
    construtora: 2,
    empreendimento: 4,
    diasAtras: 18,
  },
  {
    key: 'aline',
    nome: 'Aline Cordeiro',
    telefone: '(81) 3427-8890',
    email: 'aline.cordeiro@example.com',
    origem: 'Telefone',
    interesse: 'Comprar',
    cidade: 'Camaragibe',
    bairro: 'Aldeia',
    stage: 'novo',
    prioridade: 'Baixa',
    tipo: ContatoTipo.lead,
    renda: 4200,
    tags: ['MCMV'],
    equipe: 1,
    diasAtras: 1,
  },
  {
    key: 'gustavo',
    nome: 'Gustavo Rocha',
    telefone: '(81) 98901-5573',
    email: 'gustavo.rocha@example.com',
    origem: 'Site',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Setúbal',
    stage: 'novo',
    prioridade: 'Média',
    tipo: ContatoTipo.lead,
    tags: [],
    equipe: 2,
    diasAtras: 2,
  },
  {
    key: 'renata',
    nome: 'Renata Lins',
    telefone: '(81) 99012-6648',
    email: 'renata.lins@example.com',
    origem: 'Instagram',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Boa Viagem',
    stage: 'qualificacao',
    prioridade: 'Média',
    tipo: ContatoTipo.lead,
    renda: 6200,
    tipoRenda: 'CLT',
    tags: ['Pet friendly'],
    corretor: 'corretor3',
    equipe: 2,
    diasAtras: 4,
    overdue: true,
  },
  {
    key: 'diego',
    nome: 'Diego Amorim',
    telefone: '(81) 98603-2217',
    email: 'diego.amorim@example.com',
    origem: 'WhatsApp',
    interesse: 'Investir',
    cidade: 'Cabo de Santo Agostinho',
    bairro: 'Centro',
    stage: 'em-analise',
    prioridade: 'Baixa',
    tipo: ContatoTipo.lead,
    renda: 15000,
    tipoRenda: 'Autônomo',
    tags: ['Investidor', 'Permuta'],
    corretor: 'corretor4',
    equipe: 2,
    construtora: 4,
    empreendimento: 3,
    diasAtras: 7,
  },
  {
    key: 'sabrina',
    nome: 'Sabrina Queiroz',
    telefone: '(81) 99488-7736',
    email: 'sabrina.queiroz@example.com',
    origem: 'Portal Imobiliário',
    interesse: 'Comprar',
    cidade: 'Caruaru',
    bairro: 'Maurício de Nassau',
    stage: 'visita-agendada',
    prioridade: 'Alta',
    tipo: ContatoTipo.lead,
    renda: 10400,
    tipoRenda: 'CLT',
    tags: ['Financiamento', 'Urgente'],
    corretor: 'corretor1',
    equipe: 1,
    diasAtras: 5,
  },
  {
    key: 'icaro',
    nome: 'Ícaro Bezerra',
    telefone: '(81) 98700-1122',
    email: 'icaro.bezerra@example.com',
    origem: 'Indicação',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Apipucos',
    stage: 'proposta',
    prioridade: 'Alta',
    tipo: ContatoTipo.cliente,
    renda: 19500,
    tipoRenda: 'CLT',
    estadoCivil: 'Casado',
    tags: ['Alto padrão'],
    corretor: 'corretor1',
    equipe: 1,
    construtora: 0,
    empreendimento: 0,
    diasAtras: 10,
  },
  {
    key: 'helena',
    nome: 'Helena Castro',
    telefone: '(81) 99221-3344',
    email: 'helena.castro@example.com',
    origem: 'Feirão',
    interesse: 'Comprar',
    cidade: 'Olinda',
    bairro: 'Casa Caiada',
    stage: 'ganho-venda',
    prioridade: 'Média',
    tipo: ContatoTipo.cliente,
    renda: 11200,
    tipoRenda: 'CLT',
    estadoCivil: 'Solteira',
    tags: ['FGTS', 'Financiamento'],
    corretor: 'corretor3',
    equipe: 2,
    construtora: 1,
    empreendimento: 1,
    diasAtras: 22,
  },
  {
    key: 'otavio',
    nome: 'Otávio Lima',
    telefone: '(81) 98111-7788',
    email: 'otavio.lima@example.com',
    origem: 'Facebook Ads',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Madalena',
    stage: 'perdido',
    prioridade: 'Baixa',
    tipo: ContatoTipo.lead,
    renda: 3800,
    tags: ['MCMV'],
    corretor: 'corretor2',
    equipe: 1,
    diasAtras: 20,
    perda: { motivo: 'Fora do perfil financeiro', por: 'corretor2' },
  },
  {
    key: 'bianca',
    nome: 'Bianca Mota',
    telefone: '(81) 99333-4455',
    email: 'bianca.mota@example.com',
    origem: 'WhatsApp',
    interesse: 'Comprar',
    cidade: 'Jaboatão dos Guararapes',
    bairro: 'Piedade',
    stage: 'perdido',
    prioridade: 'Média',
    tipo: ContatoTipo.lead,
    renda: 7200,
    tags: ['Primeira compra'],
    corretor: 'corretor4',
    equipe: 2,
    diasAtras: 14,
    perda: { motivo: 'Comprou com concorrente', por: 'corretor4' },
  },
  {
    key: 'paulo',
    nome: 'Paulo Sérgio',
    telefone: '(81) 98444-5566',
    email: 'paulo.sergio@example.com',
    origem: 'Telefone',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Casa Amarela',
    stage: 'perdido',
    prioridade: 'Baixa',
    tipo: ContatoTipo.lead,
    tags: [],
    diasAtras: 11,
    perda: { motivo: 'Sem retorno', por: 'gerente' },
  },
  {
    key: 'tatiane',
    nome: 'Tatiane Oliveira',
    telefone: '(81) 98555-6677',
    email: 'tatiane.oliveira@example.com',
    origem: 'Instagram',
    interesse: 'Comprar',
    cidade: 'Paulista',
    bairro: 'Janga',
    stage: 'contato',
    prioridade: 'Média',
    tipo: ContatoTipo.lead,
    renda: 5400,
    tipoRenda: 'CLT',
    tags: ['FGTS'],
    corretor: 'corretor2',
    equipe: 1,
    diasAtras: 3,
    overdue: true,
  },
  {
    key: 'nilo',
    nome: 'Nilo Ferreira',
    telefone: '(81) 98666-7788',
    email: 'nilo.ferreira@example.com',
    origem: 'Google Ads',
    interesse: 'Investir',
    cidade: 'Recife',
    bairro: 'Boa Viagem',
    stage: 'negociacao',
    prioridade: 'Alta',
    tipo: ContatoTipo.lead,
    renda: 41000,
    tipoRenda: 'Empresário',
    estadoCivil: 'Casado',
    tags: ['Investidor', 'Alto padrão', 'Urgente'],
    corretor: 'corretor1',
    equipe: 1,
    construtora: 3,
    empreendimento: 2,
    diasAtras: 6,
  },
];

/** Relatos de triagem (histórico de contato) por lead. */
export const DEMO_TRIAGEM: readonly {
  lead: string;
  autor: DemoUserKey;
  texto: string;
  diasAtras: number;
  stageAnterior?: string;
  stageNovo?: string;
}[] = [
  {
    lead: 'rodrigo',
    autor: 'corretor2',
    texto:
      'Primeiro contato por telefone. Busca 3 quartos nas Graças, quer visitar no fim de semana.',
    diasAtras: 2,
    stageAnterior: 'novo',
    stageNovo: 'contato',
  },
  {
    lead: 'thiago',
    autor: 'corretor4',
    texto:
      'Investidor, tem FGTS e entrada. Enviado para análise de crédito com renda comprovada.',
    diasAtras: 4,
    stageAnterior: 'qualificacao',
    stageNovo: 'em-analise',
  },
  {
    lead: 'patricia',
    autor: 'corretor3',
    texto: 'Proposta enviada por e-mail. Cliente pediu 48h para decidir.',
    diasAtras: 7,
    stageAnterior: 'visita-realizada',
    stageNovo: 'proposta',
  },
  {
    lead: 'bruno',
    autor: 'corretor4',
    texto:
      'Negociando desconto de R$ 15 mil no valor da unidade. Aguardando retorno da construtora.',
    diasAtras: 5,
  },
  {
    lead: 'otavio',
    autor: 'corretor2',
    texto: 'Renda não cobre o financiamento mínimo. Lead marcado como perdido.',
    diasAtras: 20,
    stageAnterior: 'qualificacao',
    stageNovo: 'perdido',
  },
  {
    lead: 'nilo',
    autor: 'corretor1',
    texto: 'Cliente quer 2 unidades para locação. Simulação de permuta em estudo.',
    diasAtras: 3,
  },
  {
    lead: 'marcelo',
    autor: 'corretor2',
    texto: 'Contrato assinado, documentação enviada para o CCA.',
    diasAtras: 16,
    stageAnterior: 'contrato-fechamento',
    stageNovo: 'ganho-venda',
  },
];

export const DEMO_TREINAMENTO: readonly {
  titulo: string;
  links: { titulo: string; url: string }[];
  filhos?: { titulo: string; links: { titulo: string; url: string }[] }[];
}[] = [
  {
    titulo: 'Onboarding',
    links: [
      { titulo: 'Manual do corretor (PDF)', url: 'https://drive.google.com/demo/manual-corretor' },
      { titulo: 'Vídeo — primeiros 7 dias', url: 'https://drive.google.com/demo/onboarding-video' },
    ],
    filhos: [
      {
        titulo: 'Scripts de atendimento',
        links: [
          { titulo: 'Script — primeiro contato', url: 'https://drive.google.com/demo/script-contato' },
          { titulo: 'Script — follow-up', url: 'https://drive.google.com/demo/script-followup' },
        ],
      },
    ],
  },
  {
    titulo: 'Produtos e construtoras',
    links: [
      { titulo: 'Tabela de vendas atualizada', url: 'https://drive.google.com/demo/tabela-vendas' },
      { titulo: 'Book de empreendimentos', url: 'https://drive.google.com/demo/book' },
    ],
  },
  {
    titulo: 'Crédito e documentação',
    links: [
      { titulo: 'Checklist de documentos', url: 'https://drive.google.com/demo/checklist' },
      { titulo: 'Simulador Caixa', url: 'https://drive.google.com/demo/simulador' },
    ],
  },
];

export const DEMO_FINANCEIRO_PARCEIROS = [
  {
    nome: 'Imobiliária Parceira Norte',
    documento: '12.345.678/0001-90',
    tipo: 'cliente' as const,
    email: 'contato@parceiranorte.com.br',
    telefone: '(81) 3333-1010',
    cidade: 'Recife',
  },
  {
    nome: 'Agência Criativa Marketing',
    documento: '98.765.432/0001-10',
    tipo: 'fornecedor' as const,
    email: 'financeiro@agenciacriativa.com.br',
    telefone: '(81) 3333-2020',
    cidade: 'Recife',
  },
  {
    nome: 'Coworking Empresarial Recife',
    documento: '11.222.333/0001-44',
    tipo: 'fornecedor' as const,
    email: 'contratos@coworkingrecife.com.br',
    telefone: '(81) 3333-3030',
    cidade: 'Recife',
  },
  {
    nome: 'Construtora Moura Dubeux (repasse)',
    documento: '22.333.444/0001-55',
    tipo: 'ambos' as const,
    email: 'repasse@mouradubeux.com.br',
    telefone: '(81) 3465-1000',
    cidade: 'Recife',
  },
  {
    nome: 'Contabilidade Souza & Filhos',
    documento: '33.444.555/0001-66',
    tipo: 'fornecedor' as const,
    email: 'contato@souzacontabil.com.br',
    telefone: '(81) 3333-4040',
    cidade: 'Olinda',
  },
];

export const DEMO_DESPESA_TIPOS = [
  { nome: 'Aluguel e condomínio', natureza: 'fixa' as const, orcadoMensal: 9500 },
  { nome: 'Folha de pagamento', natureza: 'fixa' as const, orcadoMensal: 42000 },
  { nome: 'Energia / utilidades', natureza: 'fixa_variavel' as const, orcadoMensal: 2600 },
  { nome: 'Marketing digital', natureza: 'variavel' as const, orcadoMensal: 15000 },
  { nome: 'Software / SaaS', natureza: 'fixa' as const, orcadoMensal: 3200 },
  { nome: 'Despesas gerais', natureza: 'variavel' as const, orcadoMensal: 4000 },
];

export const DEMO_RECEBIMENTO_TIPOS = [
  { nome: 'Comissão de venda', natureza: 'variavel' as const, orcadoMensal: 90000 },
  { nome: 'Taxa de corretagem', natureza: 'variavel' as const, orcadoMensal: 12000 },
  { nome: 'Consultoria imobiliária', natureza: 'fixa_variavel' as const, orcadoMensal: 6000 },
];

export type DemoCaptacaoImovelDef = {
  email: string;
  proprietario: string;
  telefone: string;
  cpfCnpj: string;
  portal?: boolean;
  tipo:
    | 'apartamento'
    | 'casa'
    | 'terreno'
    | 'sala_comercial';
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  area: number;
  quartos?: number;
  suites?: number;
  banheiros?: number;
  vagas?: number;
  descricao: string;
  pretendido: number;
  avaliacao: number;
  etapaSlug: string;
  exclusivo?: boolean;
  origem: string;
  corretor: DemoUserKey;
  vendaUsado?: {
    etapaSlug: string;
    preco: number;
    status: 'disponivel' | 'reservado';
  };
};

export const DEMO_CAPTATION_IMOVEIS: readonly DemoCaptacaoImovelDef[] = [
  {
    email: 'lucia.andrade.captacao@example.com',
    proprietario: 'Lúcia Andrade',
    telefone: '(81) 99120-1101',
    cpfCnpj: '12345678901',
    portal: true,
    tipo: 'apartamento',
    cep: '51020-000',
    logradouro: 'Av. Boa Viagem',
    numero: '1200',
    bairro: 'Boa Viagem',
    cidade: 'Recife',
    estado: 'PE',
    area: 92,
    quartos: 3,
    suites: 1,
    banheiros: 2,
    vagas: 1,
    descricao: 'Apartamento frente-mar com varanda gourmet.',
    pretendido: 890000,
    avaliacao: 860000,
    etapaSlug: 'novo-proprietario',
    origem: 'Indicação',
    corretor: 'corretor1',
  },
  {
    email: 'roberto.melo.captacao@example.com',
    proprietario: 'Roberto Melo',
    telefone: '(81) 99120-1102',
    cpfCnpj: '23456789012',
    tipo: 'casa',
    cep: '52060-000',
    logradouro: 'Rua das Flores',
    numero: '88',
    bairro: 'Casa Forte',
    cidade: 'Recife',
    estado: 'PE',
    area: 180,
    quartos: 4,
    suites: 2,
    banheiros: 3,
    vagas: 2,
    descricao: 'Casa em condomínio fechado com quintal.',
    pretendido: 1450000,
    avaliacao: 1380000,
    etapaSlug: 'primeiro-contato',
    origem: 'WhatsApp',
    corretor: 'corretor2',
  },
  {
    email: 'sandra.pires.captacao@example.com',
    proprietario: 'Sandra Pires',
    telefone: '(81) 99120-1103',
    cpfCnpj: '34567890123',
    tipo: 'apartamento',
    cep: '51110-000',
    logradouro: 'Rua do Pina',
    numero: '310',
    bairro: 'Pina',
    cidade: 'Recife',
    estado: 'PE',
    area: 68,
    quartos: 2,
    banheiros: 1,
    vagas: 1,
    descricao: 'Apartamento reformado próximo ao parque.',
    pretendido: 520000,
    avaliacao: 505000,
    etapaSlug: 'avaliacao',
    origem: 'Portal Imobiliário',
    corretor: 'corretor3',
  },
  {
    email: 'comercio.boa.vista.captacao@example.com',
    proprietario: 'BV Comércio Ltda',
    telefone: '(81) 3322-4400',
    cpfCnpj: '11222333000181',
    tipo: 'sala_comercial',
    cep: '50050-000',
    logradouro: 'Av. Conde da Boa Vista',
    numero: '640',
    bairro: 'Boa Vista',
    cidade: 'Recife',
    estado: 'PE',
    area: 45,
    banheiros: 1,
    vagas: 1,
    descricao: 'Sala comercial em edifício corporativo.',
    pretendido: 410000,
    avaliacao: 395000,
    etapaSlug: 'negociacao-captacao',
    exclusivo: true,
    origem: 'Site',
    corretor: 'corretor4',
  },
  {
    email: 'eliane.costa.captacao@example.com',
    proprietario: 'Eliane Costa',
    telefone: '(81) 99120-1105',
    cpfCnpj: '45678901234',
    portal: true,
    tipo: 'apartamento',
    cep: '52020-000',
    logradouro: 'Rua do Espinheiro',
    numero: '55',
    bairro: 'Espinheiro',
    cidade: 'Recife',
    estado: 'PE',
    area: 110,
    quartos: 3,
    suites: 1,
    banheiros: 2,
    vagas: 2,
    descricao: 'Cobertura duplex com rooftop.',
    pretendido: 1180000,
    avaliacao: 1120000,
    etapaSlug: 'aguardando-documentacao',
    exclusivo: true,
    origem: 'Indicação',
    corretor: 'corretor1',
  },
  {
    email: 'paulo.nunes.captacao@example.com',
    proprietario: 'Paulo Nunes',
    telefone: '(81) 99120-1106',
    cpfCnpj: '56789012345',
    tipo: 'casa',
    cep: '53020-000',
    logradouro: 'Av. Getúlio Vargas',
    numero: '900',
    bairro: 'Bairro Novo',
    cidade: 'Olinda',
    estado: 'PE',
    area: 150,
    quartos: 3,
    suites: 1,
    banheiros: 2,
    vagas: 2,
    descricao: 'Casa térrea com área gourmet.',
    pretendido: 780000,
    avaliacao: 750000,
    etapaSlug: 'captacao-aprovada',
    origem: 'Google Ads',
    corretor: 'corretor2',
  },
  {
    email: 'marina.freitas.captacao@example.com',
    proprietario: 'Marina Freitas',
    telefone: '(81) 99120-1107',
    cpfCnpj: '67890123456',
    portal: true,
    tipo: 'apartamento',
    cep: '51021-000',
    logradouro: 'Rua Setúbal',
    numero: '210',
    bairro: 'Boa Viagem',
    cidade: 'Recife',
    estado: 'PE',
    area: 78,
    quartos: 2,
    suites: 1,
    banheiros: 2,
    vagas: 1,
    descricao: 'Apartamento captado pronto para venda de usados.',
    pretendido: 640000,
    avaliacao: 620000,
    etapaSlug: 'imovel-captado',
    origem: 'Instagram',
    corretor: 'corretor1',
    vendaUsado: {
      etapaSlug: 'visita-agendada-usados',
      preco: 635000,
      status: 'disponivel',
    },
  },
  {
    email: 'carlos.bezerra.captacao@example.com',
    proprietario: 'Carlos Bezerra',
    telefone: '(81) 99120-1108',
    cpfCnpj: '78901234567',
    tipo: 'casa',
    cep: '54430-000',
    logradouro: 'Rua das Gaivotas',
    numero: '17',
    bairro: 'Candeias',
    cidade: 'Jaboatão dos Guararapes',
    estado: 'PE',
    area: 200,
    quartos: 4,
    suites: 2,
    banheiros: 3,
    vagas: 3,
    descricao: 'Casa de praia captada, com proposta em andamento.',
    pretendido: 980000,
    avaliacao: 940000,
    etapaSlug: 'imovel-captado',
    exclusivo: true,
    origem: 'Feirão',
    corretor: 'corretor3',
    vendaUsado: {
      etapaSlug: 'proposta-usados',
      preco: 950000,
      status: 'reservado',
    },
  },
  {
    email: 'helena.dias.captacao@example.com',
    proprietario: 'Helena Dias',
    telefone: '(81) 99120-1109',
    cpfCnpj: '89012345678',
    tipo: 'terreno',
    cep: '54735-000',
    logradouro: 'Estrada de Aldeia',
    numero: 's/n',
    bairro: 'Aldeia',
    cidade: 'Camaragibe',
    estado: 'PE',
    area: 450,
    descricao: 'Terreno residencial — captação perdida.',
    pretendido: 320000,
    avaliacao: 300000,
    etapaSlug: 'captacao-perdida',
    origem: 'Telefone',
    corretor: 'corretor4',
  },
];

export const DEMO_INTERESSADOS_USADOS = [
  {
    nome: 'Bruno Cavalcanti',
    telefone: '(81) 98870-2201',
    email: 'bruno.cavalcanti.usado@example.com',
    cidade: 'Recife',
    tipoDesejado: 'apartamento' as const,
    precoMax: 700000,
    quartosMin: 2,
  },
  {
    nome: 'Ana Beatriz Lopes',
    telefone: '(81) 98870-2202',
    email: 'ana.lopes.usado@example.com',
    cidade: 'Jaboatão dos Guararapes',
    tipoDesejado: 'casa' as const,
    precoMax: 1100000,
    quartosMin: 3,
  },
  {
    nome: 'Diego Martins',
    telefone: '(81) 98870-2203',
    email: 'diego.martins.usado@example.com',
    cidade: 'Recife',
    tipoDesejado: 'apartamento' as const,
    precoMax: 650000,
    quartosMin: 2,
  },
] as const;
