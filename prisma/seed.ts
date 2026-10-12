import {
  CatalogType,
  ContatoTipo,
  PrismaClient,
  Role,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const DEFAULT_TENANT_SLUG = 'new-palace';

/** Espelha Backend/src/catalog/catalog.defaults.ts — mantido inline no seed (ts-node). */
const DEFAULT_FUNNEL_STAGES = [
  { label: 'Novo lead', slug: 'novo', color: 'bg-slate-200 text-slate-700', sortOrder: 0 },
  { label: 'Contato', slug: 'contato', color: 'bg-blue-100 text-blue-700', sortOrder: 1 },
  { label: 'Qualificação', slug: 'qualificacao', color: 'bg-indigo-100 text-indigo-700', sortOrder: 2 },
  { label: 'Em análise', slug: 'em-analise', color: 'bg-violet-100 text-violet-700', sortOrder: 3 },
  { label: 'Visita agendada', slug: 'visita-agendada', color: 'bg-cyan-100 text-cyan-700', sortOrder: 4 },
  { label: 'Visita realizada', slug: 'visita-realizada', color: 'bg-teal-100 text-teal-700', sortOrder: 5 },
  { label: 'Proposta', slug: 'proposta', color: 'bg-amber-100 text-amber-700', sortOrder: 6 },
  { label: 'Negociação', slug: 'negociacao', color: 'bg-orange-100 text-orange-700', sortOrder: 7 },
  { label: 'Contrato / Fechamento', slug: 'contrato-fechamento', color: 'bg-emerald-100 text-emerald-700', sortOrder: 8 },
  { label: 'Ganho / Venda', slug: 'ganho-venda', color: 'bg-green-200 text-green-800', sortOrder: 9 },
  { label: 'Perdido', slug: 'perdido', color: 'bg-red-100 text-red-700', sortOrder: 10 },
] as const;

/** Catálogos operacionais: os leads guardam os labels como string, sem FK. */
const DEFAULT_ORIGENS = [
  { label: 'Site', color: 'bg-sky-100 text-sky-700' },
  { label: 'Indicação', color: 'bg-emerald-100 text-emerald-700' },
  { label: 'Portal Imobiliário', color: 'bg-indigo-100 text-indigo-700' },
  { label: 'Instagram', color: 'bg-pink-100 text-pink-700' },
  { label: 'WhatsApp', color: 'bg-green-100 text-green-700' },
  { label: 'Facebook Ads', color: 'bg-blue-100 text-blue-700' },
  { label: 'Google Ads', color: 'bg-amber-100 text-amber-700' },
  { label: 'Feirão', color: 'bg-orange-100 text-orange-700' },
  { label: 'Telefone', color: 'bg-slate-200 text-slate-700' },
] as const;

const DEFAULT_TAGS = [
  { label: 'Financiamento', color: 'bg-blue-100 text-blue-700' },
  { label: 'FGTS', color: 'bg-cyan-100 text-cyan-700' },
  { label: 'MCMV', color: 'bg-teal-100 text-teal-700' },
  { label: 'Primeira compra', color: 'bg-violet-100 text-violet-700' },
  { label: 'Investidor', color: 'bg-amber-100 text-amber-700' },
  { label: 'Alto padrão', color: 'bg-purple-100 text-purple-700' },
  { label: 'Aluguel', color: 'bg-lime-100 text-lime-800' },
  { label: 'Pet friendly', color: 'bg-rose-100 text-rose-700' },
  { label: 'Permuta', color: 'bg-orange-100 text-orange-700' },
  { label: 'Urgente', color: 'bg-red-100 text-red-700' },
] as const;

const DEFAULT_EMPREENDIMENTO_TIPOS = [
  { label: 'Vertical', color: 'bg-blue-100 text-blue-700' },
  { label: 'Casa', color: 'bg-emerald-100 text-emerald-700' },
  { label: 'Loteamento', color: 'bg-amber-100 text-amber-700' },
  { label: 'Comercial', color: 'bg-violet-100 text-violet-700' },
] as const;

const DEFAULT_EMPREENDIMENTO_STATUS = [
  { label: 'Lançamento', color: 'bg-sky-100 text-sky-700' },
  { label: 'Em obras', color: 'bg-orange-100 text-orange-700' },
  { label: 'Pronto', color: 'bg-green-100 text-green-700' },
] as const;

const DEFAULT_EMPREENDIMENTO_TAGS = [
  { label: 'Litoral', color: 'bg-cyan-100 text-cyan-700' },
  { label: 'FGTS', color: 'bg-indigo-100 text-indigo-700' },
  { label: 'MCMV', color: 'bg-teal-100 text-teal-700' },
  { label: 'Caixa', color: 'bg-slate-200 text-slate-700' },
] as const;

const DEFAULT_DOCUMENTACAO_FONTES = [
  { label: 'Indicação', color: 'bg-emerald-100 text-emerald-700' },
  { label: 'Lead próprio', color: 'bg-blue-100 text-blue-700' },
  { label: 'Lista', color: 'bg-indigo-100 text-indigo-700' },
  { label: 'Campanha', color: 'bg-amber-100 text-amber-700' },
  { label: 'Outro', color: 'bg-slate-200 text-slate-700' },
] as const;

const DEFAULT_DOCUMENTACAO_STATUS1 = [
  { label: 'Pré-análise', color: 'bg-violet-100 text-violet-700' },
  { label: 'Em análise', color: 'bg-indigo-100 text-indigo-700' },
  { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  { label: 'Aprovado c/ restrição', color: 'bg-amber-100 text-amber-700' },
] as const;

const DEFAULT_DOCUMENTACAO_STATUS2 = [
  { label: 'Vendido', color: 'bg-green-200 text-green-800' },
  { label: 'Bacen', color: 'bg-sky-100 text-sky-700' },
  { label: 'Andamento', color: 'bg-orange-100 text-orange-700' },
] as const;

const DEFAULT_MOTIVOS_PERDA = [
  { label: 'Sem retorno', color: 'bg-slate-200 text-slate-700' },
  { label: 'Comprou com concorrente', color: 'bg-orange-100 text-orange-700' },
  { label: 'Crédito não aprovado', color: 'bg-red-100 text-red-700' },
  { label: 'Fora do perfil financeiro', color: 'bg-amber-100 text-amber-700' },
  { label: 'Contato inválido', color: 'bg-rose-100 text-rose-700' },
  { label: 'Desistiu da compra', color: 'bg-violet-100 text-violet-700' },
] as const;

/** Mesma lógica de slug da tela de Configurações (src/catalog/catalog.util.ts). */
function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `item-${Date.now()}`
  );
}

interface SeedUser {
  name: string;
  email: string;
  password: string;
  phone?: string;
  cargo?: string;
  role: Role;
  status?: UserStatus;
}

const defaultPassword = process.env.SEED_DEFAULT_PASSWORD ?? 'Mudar@123';

const demoAccounts: SeedUser[] = [
  {
    name: 'Ana Souza',
    email: 'admin@imob.com',
    password: 'admin',
    phone: '(11) 99999-0001',
    cargo: 'Diretora',
    role: Role.admin,
  },
  {
    name: 'Carlos Lima',
    email: 'gerente@imob.com',
    password: 'gerente',
    phone: '(11) 99999-0002',
    cargo: 'Gerente comercial',
    role: Role.gerente,
  },
  {
    name: 'Lucia Ferreira',
    email: 'analista@imob.com',
    password: 'analista',
    phone: '(11) 99999-0008',
    cargo: 'Analista de crédito',
    role: Role.analista,
  },
  {
    name: 'Marina Alves',
    email: 'corretor@imob.com',
    password: 'corretor',
    phone: '(11) 99999-0003',
    cargo: 'Corretora sênior',
    role: Role.corretor,
  },
  {
    name: 'Pedro Henrique',
    email: 'pedro@imob.com',
    password: defaultPassword,
    phone: '(11) 99999-0004',
    cargo: 'Corretor',
    role: Role.corretor,
  },
  {
    name: 'Sofia Ramos',
    email: 'sofia@imob.com',
    password: defaultPassword,
    phone: '(11) 99999-0005',
    cargo: 'Corretora',
    role: Role.corretor,
  },
  {
    name: 'Rafael Nunes',
    email: 'rafael@imob.com',
    password: defaultPassword,
    phone: '(11) 99999-0006',
    cargo: 'Corretor',
    role: Role.corretor,
  },
  {
    name: 'Laura Prado',
    email: 'laura@imob.com',
    password: defaultPassword,
    phone: '(11) 99999-0007',
    cargo: 'Corretora',
    role: Role.corretor,
    status: UserStatus.inativo,
  },
];

interface SeedLead {
  nome: string;
  telefone: string;
  email: string;
  origem: string;
  interesse: 'Comprar' | 'Alugar' | 'Investir';
  cidade: string;
  bairro: string;
  stage: string;
  prioridade: 'Alta' | 'Média' | 'Baixa';
  tipo?: ContatoTipo;
  renda?: number | null;
  tags?: string[];
  /** E-mail do corretor dono; null representa lead ainda sem atribuição. */
  corretor: string | null;
  diasAtras: number;
  perda?: { motivo: string; porEmail: string; diasAtras: number };
}

const demoLeads: SeedLead[] = [
  // --- Funil de captação, um lead por etapa ativa ---
  {
    nome: 'Mariana Freitas',
    telefone: '(81) 98812-4471',
    email: 'mariana.freitas@example.com',
    origem: 'Site',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Boa Viagem',
    stage: 'novo',
    prioridade: 'Alta',
    renda: 12000,
    tags: ['Financiamento', 'Primeira compra'],
    corretor: 'corretor@imob.com',
    diasAtras: 1,
  },
  {
    nome: 'Rodrigo Peixoto',
    telefone: '(81) 99143-2280',
    email: 'rodrigo.peixoto@example.com',
    origem: 'Indicação',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Graças',
    stage: 'contato',
    prioridade: 'Média',
    renda: 18000,
    tags: ['Alto padrão'],
    corretor: 'pedro@imob.com',
    diasAtras: 2,
  },
  {
    nome: 'Camila Duarte',
    telefone: '(81) 98455-1097',
    email: 'camila.duarte@example.com',
    origem: 'Instagram',
    interesse: 'Alugar',
    cidade: 'Olinda',
    bairro: 'Bairro Novo',
    stage: 'qualificacao',
    prioridade: 'Baixa',
    renda: 4500,
    tags: ['Aluguel', 'Pet friendly'],
    corretor: 'sofia@imob.com',
    diasAtras: 3,
  },
  {
    nome: 'Thiago Barreto',
    telefone: '(81) 99671-3324',
    email: 'thiago.barreto@example.com',
    origem: 'Portal Imobiliário',
    interesse: 'Investir',
    cidade: 'Ipojuca',
    bairro: 'Porto de Galinhas',
    stage: 'em-analise',
    prioridade: 'Alta',
    renda: 35000,
    tags: ['Investidor', 'Alto padrão'],
    corretor: 'rafael@imob.com',
    diasAtras: 4,
  },
  {
    nome: 'Juliana Mendes',
    telefone: '(81) 98290-7715',
    email: 'juliana.mendes@example.com',
    origem: 'WhatsApp',
    interesse: 'Comprar',
    cidade: 'Jaboatão dos Guararapes',
    bairro: 'Candeias',
    stage: 'visita-agendada',
    prioridade: 'Média',
    renda: 7800,
    tags: ['MCMV', 'FGTS'],
    corretor: 'corretor@imob.com',
    diasAtras: 5,
  },
  {
    nome: 'Fernando Aquino',
    telefone: '(81) 99508-6612',
    email: 'fernando.aquino@example.com',
    origem: 'Feirão',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Torre',
    stage: 'visita-realizada',
    prioridade: 'Alta',
    renda: 9500,
    tags: ['Financiamento'],
    corretor: 'pedro@imob.com',
    diasAtras: 6,
  },
  {
    nome: 'Patrícia Nóbrega',
    telefone: '(81) 98737-4408',
    email: 'patricia.nobrega@example.com',
    origem: 'Google Ads',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Espinheiro',
    stage: 'proposta',
    prioridade: 'Alta',
    renda: 22000,
    tags: ['Alto padrão', 'Urgente'],
    corretor: 'sofia@imob.com',
    diasAtras: 8,
  },
  {
    nome: 'Bruno Carvalho',
    telefone: '(81) 99320-1186',
    email: 'bruno.carvalho@example.com',
    origem: 'Site',
    interesse: 'Investir',
    cidade: 'Recife',
    bairro: 'Pina',
    stage: 'negociacao',
    prioridade: 'Média',
    renda: 27000,
    tags: ['Investidor'],
    corretor: 'rafael@imob.com',
    diasAtras: 9,
  },
  {
    nome: 'Letícia Vasconcelos',
    telefone: '(81) 98164-9923',
    email: 'leticia.vasconcelos@example.com',
    origem: 'Indicação',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Casa Forte',
    stage: 'contrato-fechamento',
    prioridade: 'Alta',
    renda: 31000,
    tags: ['Alto padrão', 'Financiamento'],
    corretor: 'corretor@imob.com',
    diasAtras: 12,
  },
  {
    nome: 'Marcelo Tavares',
    telefone: '(81) 99755-3041',
    email: 'marcelo.tavares@example.com',
    origem: 'Facebook Ads',
    interesse: 'Comprar',
    cidade: 'Paulista',
    bairro: 'Janga',
    stage: 'ganho-venda',
    prioridade: 'Média',
    renda: 8600,
    tags: ['MCMV'],
    corretor: 'pedro@imob.com',
    diasAtras: 15,
  },

  // --- Leads sem corretor atribuído (fila de distribuição) ---
  {
    nome: 'Aline Cordeiro',
    telefone: '(81) 3427-8890',
    email: 'aline.cordeiro@example.com',
    origem: 'Telefone',
    interesse: 'Alugar',
    cidade: 'Camaragibe',
    bairro: 'Aldeia',
    stage: 'novo',
    prioridade: 'Baixa',
    renda: 3900,
    tags: ['Aluguel'],
    corretor: null,
    diasAtras: 1,
  },
  {
    nome: 'Gustavo Rocha',
    telefone: '(81) 98901-5573',
    email: 'gustavo.rocha@example.com',
    origem: 'Site',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Setúbal',
    stage: 'novo',
    prioridade: 'Média',
    renda: null,
    tags: [],
    corretor: null,
    diasAtras: 2,
  },

  // --- Mais volume distribuído entre os corretores ---
  {
    nome: 'Renata Lins',
    telefone: '(81) 99012-6648',
    email: 'renata.lins@example.com',
    origem: 'Instagram',
    interesse: 'Alugar',
    cidade: 'Recife',
    bairro: 'Boa Viagem',
    stage: 'qualificacao',
    prioridade: 'Média',
    renda: 6200,
    tags: ['Aluguel', 'Pet friendly'],
    corretor: 'sofia@imob.com',
    diasAtras: 4,
  },
  {
    nome: 'Diego Amorim',
    telefone: '(81) 98603-2217',
    email: 'diego.amorim@example.com',
    origem: 'WhatsApp',
    interesse: 'Investir',
    cidade: 'Cabo de Santo Agostinho',
    bairro: 'Centro',
    stage: 'em-analise',
    prioridade: 'Baixa',
    renda: 15000,
    tags: ['Investidor', 'Permuta'],
    corretor: 'rafael@imob.com',
    diasAtras: 7,
  },
  {
    nome: 'Sabrina Queiroz',
    telefone: '(81) 99488-7736',
    email: 'sabrina.queiroz@example.com',
    origem: 'Portal Imobiliário',
    interesse: 'Comprar',
    cidade: 'Caruaru',
    bairro: 'Maurício de Nassau',
    stage: 'visita-agendada',
    prioridade: 'Alta',
    renda: 10400,
    tags: ['Financiamento', 'Urgente'],
    corretor: 'corretor@imob.com',
    diasAtras: 5,
  },
  {
    nome: 'Otávio Bezerra',
    telefone: '(81) 98255-9014',
    email: 'otavio.bezerra@example.com',
    origem: 'Feirão',
    interesse: 'Comprar',
    cidade: 'Jaboatão dos Guararapes',
    bairro: 'Piedade',
    stage: 'proposta',
    prioridade: 'Média',
    renda: 8900,
    tags: ['FGTS'],
    corretor: 'pedro@imob.com',
    diasAtras: 10,
  },
  {
    nome: 'Helena Martins',
    telefone: '(81) 99136-4482',
    email: 'helena.martins@example.com',
    origem: 'Indicação',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Graças',
    stage: 'negociacao',
    prioridade: 'Alta',
    renda: 26000,
    tags: ['Alto padrão'],
    corretor: 'sofia@imob.com',
    diasAtras: 11,
  },

  // --- Carteira pessoal (tipo cliente) ---
  {
    nome: 'Eduardo Salgado',
    telefone: '(81) 99674-1120',
    email: 'eduardo.salgado@example.com',
    origem: 'Indicação',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Boa Viagem',
    stage: 'ganho-venda',
    prioridade: 'Média',
    tipo: ContatoTipo.cliente,
    renda: 19000,
    tags: ['Financiamento'],
    corretor: 'corretor@imob.com',
    diasAtras: 40,
  },
  {
    nome: 'Vanessa Coelho',
    telefone: '(81) 98340-7752',
    email: 'vanessa.coelho@example.com',
    origem: 'Site',
    interesse: 'Alugar',
    cidade: 'Olinda',
    bairro: 'Carmo',
    stage: 'contrato-fechamento',
    prioridade: 'Baixa',
    tipo: ContatoTipo.cliente,
    renda: 5200,
    tags: ['Aluguel'],
    corretor: 'pedro@imob.com',
    diasAtras: 35,
  },
  {
    nome: 'Ricardo Falcão',
    telefone: '(81) 99811-3308',
    email: 'ricardo.falcao@example.com',
    origem: 'Indicação',
    interesse: 'Investir',
    cidade: 'Ipojuca',
    bairro: 'Porto de Galinhas',
    stage: 'negociacao',
    prioridade: 'Alta',
    tipo: ContatoTipo.cliente,
    renda: 48000,
    tags: ['Investidor', 'Alto padrão'],
    corretor: 'rafael@imob.com',
    diasAtras: 30,
  },
  {
    nome: 'Beatriz Uchôa',
    telefone: '(81) 98527-6690',
    email: 'beatriz.uchoa@example.com',
    origem: 'WhatsApp',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Espinheiro',
    stage: 'visita-realizada',
    prioridade: 'Média',
    tipo: ContatoTipo.cliente,
    renda: 14000,
    tags: ['Permuta'],
    corretor: 'sofia@imob.com',
    diasAtras: 25,
  },
  {
    nome: 'Anderson Prado',
    telefone: '(81) 3231-4405',
    email: 'anderson.prado@example.com',
    origem: 'Telefone',
    interesse: 'Comprar',
    cidade: 'Paulista',
    bairro: 'Maranguape',
    stage: 'contato',
    prioridade: 'Baixa',
    tipo: ContatoTipo.cliente,
    renda: 6100,
    tags: ['MCMV'],
    corretor: 'corretor@imob.com',
    diasAtras: 20,
  },
  {
    nome: 'Cláudia Bandeira',
    telefone: '(81) 99260-8871',
    email: 'claudia.bandeira@example.com',
    origem: 'Portal Imobiliário',
    interesse: 'Investir',
    cidade: 'Recife',
    bairro: 'Pina',
    stage: 'em-analise',
    prioridade: 'Média',
    tipo: ContatoTipo.cliente,
    renda: 33000,
    tags: ['Investidor'],
    corretor: 'pedro@imob.com',
    diasAtras: 18,
  },

  // --- Leads perdidos (soft-delete: só aparecem no módulo do admin) ---
  {
    nome: 'Sérgio Maia',
    telefone: '(81) 98418-2273',
    email: 'sergio.maia@example.com',
    origem: 'Facebook Ads',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Torre',
    stage: 'perdido',
    prioridade: 'Baixa',
    renda: 4200,
    tags: ['Financiamento'],
    corretor: 'pedro@imob.com',
    diasAtras: 30,
    perda: {
      motivo: 'Crédito não aprovado',
      porEmail: 'gerente@imob.com',
      diasAtras: 6,
    },
  },
  {
    nome: 'Tatiane Lopes',
    telefone: '(81) 99045-3319',
    email: 'tatiane.lopes@example.com',
    origem: 'Instagram',
    interesse: 'Alugar',
    cidade: 'Olinda',
    bairro: 'Bairro Novo',
    stage: 'perdido',
    prioridade: 'Média',
    renda: 3100,
    tags: ['Aluguel'],
    corretor: 'sofia@imob.com',
    diasAtras: 28,
    perda: {
      motivo: 'Sem retorno',
      porEmail: 'gerente@imob.com',
      diasAtras: 9,
    },
  },
  {
    nome: 'Wagner Coutinho',
    telefone: '(81) 98692-5540',
    email: 'wagner.coutinho@example.com',
    origem: 'Site',
    interesse: 'Comprar',
    cidade: 'Jaboatão dos Guararapes',
    bairro: 'Candeias',
    stage: 'perdido',
    prioridade: 'Alta',
    renda: 11000,
    tags: ['Urgente'],
    corretor: 'corretor@imob.com',
    diasAtras: 22,
    perda: {
      motivo: 'Comprou com concorrente',
      porEmail: 'admin@imob.com',
      diasAtras: 4,
    },
  },
  {
    nome: 'Priscila Andrade',
    telefone: '(81) 3072-6614',
    email: 'priscila.andrade@example.com',
    origem: 'Telefone',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Boa Viagem',
    stage: 'perdido',
    prioridade: 'Baixa',
    renda: null,
    tags: [],
    corretor: null,
    diasAtras: 26,
    perda: {
      motivo: 'Contato inválido',
      porEmail: 'admin@imob.com',
      diasAtras: 12,
    },
  },
];

async function seedDefaultFunnelStages(tenantId: string) {
  for (const stage of DEFAULT_FUNNEL_STAGES) {
    const bySlug = await prisma.catalogItem.findFirst({
      where: {
        tenantId,
        type: CatalogType.funil_etapa,
        slug: stage.slug,
      },
    });
    if (bySlug) {
      await prisma.catalogItem.update({
        where: { id: bySlug.id },
        data: {
          label: stage.label,
          color: stage.color,
          sortOrder: stage.sortOrder,
          active: true,
        },
      });
      continue;
    }

    const byLabel = await prisma.catalogItem.findUnique({
      where: {
        tenantId_type_label: {
          tenantId,
          type: CatalogType.funil_etapa,
          label: stage.label,
        },
      },
    });
    if (byLabel) {
      await prisma.catalogItem.update({
        where: { id: byLabel.id },
        data: {
          slug: stage.slug,
          color: stage.color,
          sortOrder: stage.sortOrder,
          active: true,
        },
      });
      continue;
    }

    await prisma.catalogItem.create({
      data: {
        tenantId,
        type: CatalogType.funil_etapa,
        label: stage.label,
        slug: stage.slug,
        color: stage.color,
        sortOrder: stage.sortOrder,
        active: true,
      },
    });
  }
  console.log(`  ✓ ${DEFAULT_FUNNEL_STAGES.length} etapas padrão do funil`);
}

/** Catálogos com label + cor das badges. */
async function seedSimpleCatalog(
  tenantId: string,
  type: CatalogType,
  items: readonly { label: string; color: string }[],
): Promise<void> {
  for (const [index, item] of items.entries()) {
    await prisma.catalogItem.upsert({
      where: {
        tenantId_type_label: { tenantId, type, label: item.label },
      },
      update: {
        slug: slugify(item.label),
        color: item.color,
        sortOrder: index,
        active: true,
      },
      create: {
        tenantId,
        type,
        label: item.label,
        slug: slugify(item.label),
        color: item.color,
        sortOrder: index,
      },
    });
  }
  console.log(`  ✓ ${items.length} itens de ${type}`);
}

function diasAtras(dias: number): Date {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

async function seedLeads(
  tenantId: string,
  userIds: Map<string, string>,
): Promise<void> {
  // Recria a carteira de demonstração do zero para o seed ser reprodutível.
  await prisma.lead.deleteMany({ where: { tenantId } });

  await prisma.lead.createMany({
    data: demoLeads.map((lead) => {
      const criadoEm = diasAtras(lead.diasAtras);
      const perdidoEm = lead.perda ? diasAtras(lead.perda.diasAtras) : null;

      return {
        tenantId,
        tipo: lead.tipo ?? ContatoTipo.lead,
        nome: lead.nome,
        telefone: lead.telefone,
        email: lead.email,
        origem: lead.origem,
        interesse: lead.interesse,
        cidade: lead.cidade,
        bairro: lead.bairro,
        stage: lead.stage,
        prioridade: lead.prioridade,
        renda: lead.renda ?? null,
        tags: lead.tags ?? [],
        corretorId: lead.corretor ? (userIds.get(lead.corretor) ?? null) : null,
        perdidoAt: perdidoEm,
        motivoPerda: lead.perda?.motivo ?? null,
        perdidoPorId: lead.perda
          ? (userIds.get(lead.perda.porEmail) ?? null)
          : null,
        createdAt: criadoEm,
        updatedAt: perdidoEm ?? criadoEm,
      };
    }),
  });

  const perdidos = demoLeads.filter((l) => l.perda).length;
  const clientes = demoLeads.filter(
    (l) => l.tipo === ContatoTipo.cliente,
  ).length;
  const semCorretor = demoLeads.filter((l) => !l.corretor).length;

  console.log(
    `  ✓ ${demoLeads.length} contatos: ${demoLeads.length - clientes} leads, ` +
      `${clientes} clientes, ${perdidos} perdidos, ${semCorretor} sem corretor`,
  );
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Seed bloqueado: este script cria contas de demonstração com senhas fracas e não deve rodar em produção.',
    );
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: DEFAULT_TENANT_SLUG },
    update: { name: 'New Palace' },
    create: {
      id: DEFAULT_TENANT_ID,
      name: 'New Palace',
      slug: DEFAULT_TENANT_SLUG,
      status: UserStatus.ativo,
    },
  });
  console.log(`  ✓ tenant ${tenant.slug} (${tenant.id})`);

  const userIds = new Map<string, string>();

  for (const user of demoAccounts) {
    const hashed = await bcrypt.hash(user.password, SALT_ROUNDS);
    const saved = await prisma.user.upsert({
      where: {
        tenantId_email: { tenantId: tenant.id, email: user.email },
      },
      update: {
        name: user.name,
        password: hashed,
        phone: user.phone,
        cargo: user.cargo,
        role: user.role,
        status: user.status ?? UserStatus.ativo,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      create: {
        tenantId: tenant.id,
        name: user.name,
        email: user.email,
        password: hashed,
        phone: user.phone,
        cargo: user.cargo,
        role: user.role,
        status: user.status ?? UserStatus.ativo,
      },
      select: { id: true },
    });
    userIds.set(user.email, saved.id);
    console.log(`  ✓ ${user.email} (${user.role})`);
  }

  await seedDefaultFunnelStages(tenant.id);
  await seedSimpleCatalog(tenant.id, CatalogType.origem, DEFAULT_ORIGENS);
  await seedSimpleCatalog(tenant.id, CatalogType.tag, DEFAULT_TAGS);
  await seedSimpleCatalog(
    tenant.id,
    CatalogType.motivo_perda,
    DEFAULT_MOTIVOS_PERDA,
  );
  await seedSimpleCatalog(
    tenant.id,
    CatalogType.documentacao_fonte,
    DEFAULT_DOCUMENTACAO_FONTES,
  );
  await seedSimpleCatalog(
    tenant.id,
    CatalogType.documentacao_status1,
    DEFAULT_DOCUMENTACAO_STATUS1,
  );
  await seedSimpleCatalog(
    tenant.id,
    CatalogType.documentacao_status2,
    DEFAULT_DOCUMENTACAO_STATUS2,
  );
  await seedSimpleCatalog(
    tenant.id,
    CatalogType.empreendimento_tipo,
    DEFAULT_EMPREENDIMENTO_TIPOS,
  );
  await seedSimpleCatalog(
    tenant.id,
    CatalogType.empreendimento_status,
    DEFAULT_EMPREENDIMENTO_STATUS,
  );
  await seedSimpleCatalog(
    tenant.id,
    CatalogType.empreendimento_tag,
    DEFAULT_EMPREENDIMENTO_TAGS,
  );
  await seedLeads(tenant.id, userIds);

  console.log('\nSeed concluído.');
  console.log('Contas demo: admin@imob.com / gerente@imob.com / analista@imob.com / corretor@imob.com');
  console.log(`Senha padrão (se criar outros usuários via seed): ${defaultPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
