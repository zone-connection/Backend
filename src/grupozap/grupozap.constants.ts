/** User-Agent enviado pelo Grupo OLX nas notificações. */
export const GRUPOZAP_USER_AGENT = 'grupozap-notification-api';

/** Nome de usuário do Basic Auth no exemplo da documentação. A chave é o que vale. */
export const GRUPOZAP_BASIC_USER = 'vivareal';

export const GRUPOZAP_LEAD_ORIGINS = ['Grupo OLX', 'MCMV_OLX'] as const;

export const DISPLAY_ADDRESS_VALUES = ['All', 'Street', 'Neighborhood'] as const;
export type DisplayAddress = (typeof DISPLAY_ADDRESS_VALUES)[number];

export const LEAD_TYPE_LABEL: Record<string, string> = {
  CLICK_SCHEDULE: 'Agendamento',
  CLICK_WHATSAPP: 'WhatsApp',
  CONTACT_CHAT: 'Chat',
  CONTACT_FORM: 'Formulário',
  PHONE_VIEW: 'Telefone',
  VISIT_REQUEST: 'Visita',
};

/** Tipos cujo anúncio exige LotArea (área total), não LivingArea. */
export const LOT_AREA_PROPERTY_TYPES = new Set([
  'Residential / Land Lot',
  'Commercial / Land Lot',
  'Commercial / Industrial',
  'Residential / Farm Ranch',
  'Residential / Agricultural',
]);

/** A documentação exige Bathrooms para estes PropertyType. */
export const BATHROOMS_REQUIRED = new Set([
  'Residential / Apartment',
  'Residential / Home',
  'Residential / Condo',
  'Residential / Village House',
  'Residential / Farm Ranch',
  'Residential / Penthouse',
  'Residential / Flat',
  'Residential / Kitnet',
  'Residential / Loft',
  'Residential / Sobrado',
  'Residential / Agricultural',
  'Commercial / Consultorio',
  'Commercial / Edificio Residencial',
  'Commercial / Loja',
  'Commercial / Office',
]);

export const UF_NAME: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
};
