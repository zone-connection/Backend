import { CaptacaoImovelTipo } from '@prisma/client';
import { imovelTitulo } from '../captacao/captacao.constants';
import {
  BATHROOMS_REQUIRED,
  LOT_AREA_PROPERTY_TYPES,
  UF_NAME,
  type DisplayAddress,
} from './grupozap.constants';

const PROPERTY_TYPE: Record<CaptacaoImovelTipo, string | null> = {
  apartamento: 'Residential / Apartment',
  casa: 'Residential / Home',
  terreno: 'Residential / Land Lot',
  sala_comercial: 'Commercial / Office',
  loja: 'Commercial / Business',
  galpao: 'Commercial / Industrial',
  fazenda: 'Residential / Agricultural',
  chacara: 'Residential / Farm Ranch',
  outro: null,
};

const COMMERCIAL = new Set<CaptacaoImovelTipo>([
  'sala_comercial',
  'loja',
  'galpao',
]);

export type FeedImovel = {
  id: string;
  tipo: CaptacaoImovelTipo;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  area: number | null;
  areaConstruida: number | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  descricao: string;
  precoVenda: number | null;
  fotos: string[];
};

export type FeedContact = {
  name: string;
  email: string;
  telephone: string;
  logoUrl: string;
};

export type FeedBlocked = {
  imovelId: string;
  titulo: string;
  reasons: string[];
};

export type FeedBuildResult = {
  xml: string;
  included: number;
  blocked: FeedBlocked[];
};

const NAME_BY_UF = new Map(
  Object.entries(UF_NAME).map(([abbr, name]) => [name.toLowerCase(), abbr]),
);

export function resolveState(estado: string): { abbr: string; name: string } | null {
  const raw = estado.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (UF_NAME[upper]) return { abbr: upper, name: UF_NAME[upper] };
  const abbr = NAME_BY_UF.get(raw.toLowerCase());
  if (abbr) return { abbr, name: UF_NAME[abbr] };
  return null;
}

export function formatPostalCode(cep: string): string | null {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function toJpegUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === 'res.cloudinary.com') {
      const marker = '/upload/';
      const index = parsed.pathname.indexOf(marker);
      if (index >= 0) {
        const prefix = parsed.pathname.slice(0, index + marker.length);
        let rest = parsed.pathname.slice(index + marker.length);
        rest = rest.replace(/\.(png|webp|gif|jpeg|jpg)$/i, '.jpg');
        if (!/\/f_jpg(\/|$)/.test(`/${rest}`)) {
          rest = `f_jpg/${rest}`;
        }
        parsed.pathname = `${prefix}${rest}`;
        return parsed.toString();
      }
    }
  } catch {
    return null;
  }
  if (/\.jpe?g($|\?)/i.test(trimmed)) return trimmed;
  return null;
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function integerAmount(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const whole = Math.trunc(value);
  return whole > 0 ? whole : null;
}

function wholeArea(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const whole = Math.trunc(value);
  return whole > 0 ? whole : null;
}

function buildTitle(imovel: FeedImovel): string {
  const base = plainText(
    imovelTitulo({
      tipo: imovel.tipo,
      logradouro: imovel.logradouro,
      numero: imovel.numero,
      bairro: imovel.bairro,
      cidade: imovel.cidade,
    }),
  );
  let title = base.length >= 10 ? base : `${base} à venda`.trim();
  if (title.length < 10 && imovel.cidade.trim()) {
    title = `${title} em ${imovel.cidade.trim()}`.trim();
  }
  if (title.length < 10) title = 'Imóvel à venda';
  return title.slice(0, 100).trim();
}

function buildDescription(imovel: FeedImovel, title: string): string {
  let text = plainText(imovel.descricao);
  if (text.length < 50) {
    const extra = [
      title,
      imovel.bairro && imovel.cidade
        ? `Localizado em ${imovel.bairro}, ${imovel.cidade}.`
        : '',
      imovel.quartos != null ? `${imovel.quartos} quarto(s).` : '',
      imovel.area != null ? `Área de ${Math.trunc(imovel.area)} m².` : '',
      'Imóvel disponível para venda.',
    ]
      .filter(Boolean)
      .join(' ');
    text = `${text} ${extra}`.trim();
  }
  return text.slice(0, 3000).trim();
}

function collectPhotos(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    const jpeg = toJpegUrl(url);
    if (!jpeg || seen.has(jpeg)) continue;
    seen.add(jpeg);
    out.push(jpeg);
  }
  return out;
}

export function listingBlockers(imovel: FeedImovel, contact: FeedContact): string[] {
  const reasons: string[] = [];
  const propertyType = PROPERTY_TYPE[imovel.tipo];
  if (!propertyType) {
    reasons.push('Tipo de imóvel sem correspondência no VRSync.');
  }
  if (!contact.name.trim() || !contact.email.trim()) {
    reasons.push('Nome e e-mail da imobiliária são obrigatórios no anúncio.');
  }
  if (!formatPostalCode(imovel.cep)) {
    reasons.push('CEP obrigatório, com 8 dígitos.');
  }
  if (!imovel.cidade.trim() || !imovel.bairro.trim()) {
    reasons.push('Cidade e bairro são obrigatórios.');
  }
  if (!resolveState(imovel.estado)) {
    reasons.push('Estado inválido. Use a sigla, por exemplo PE.');
  }
  if (!integerAmount(imovel.precoVenda)) {
    reasons.push('Preço de venda obrigatório para anúncio For Sale.');
  }
  const title = buildTitle(imovel);
  if (title.length < 10 || title.length > 100) {
    reasons.push('Título do anúncio precisa ter entre 10 e 100 caracteres.');
  }
  const description = buildDescription(imovel, title);
  if (description.length < 50 || description.length > 3000) {
    reasons.push('Descrição precisa ter entre 50 e 3000 caracteres, sem HTML.');
  }
  if (propertyType) {
    const area = wholeArea(imovel.areaConstruida) ?? wholeArea(imovel.area);
    if (LOT_AREA_PROPERTY_TYPES.has(propertyType)) {
      if (!area) reasons.push('Área total obrigatória para este tipo de imóvel.');
    } else if (!area) {
      reasons.push('Área útil obrigatória para este tipo de imóvel.');
    }
    if (BATHROOMS_REQUIRED.has(propertyType) && imovel.banheiros == null) {
      reasons.push('Número de banheiros obrigatório para este tipo de imóvel.');
    }
  }
  if (collectPhotos(imovel.fotos).length < 5) {
    reasons.push('O portal exige no mínimo 5 fotos JPG.');
  }
  return reasons;
}

function listingXml(
  imovel: FeedImovel,
  contact: FeedContact,
  displayAddress: DisplayAddress,
): string {
  const propertyType = PROPERTY_TYPE[imovel.tipo] as string;
  const state = resolveState(imovel.estado) as { abbr: string; name: string };
  const postal = formatPostalCode(imovel.cep) as string;
  const price = integerAmount(imovel.precoVenda) as number;
  const title = buildTitle(imovel);
  const description = buildDescription(imovel, title);
  const photos = collectPhotos(imovel.fotos);
  const usage = COMMERCIAL.has(imovel.tipo) ? 'Commercial' : 'Residential';
  const area = wholeArea(imovel.areaConstruida) ?? wholeArea(imovel.area);
  const lot = LOT_AREA_PROPERTY_TYPES.has(propertyType);

  const details = [
    `        <UsageType>${usage}</UsageType>`,
    `        <PropertyType>${propertyType}</PropertyType>`,
    `        <Description>${cdata(description)}</Description>`,
    `        <ListPrice currency="BRL">${price}</ListPrice>`,
    area != null && lot
      ? `        <LotArea unit="square metres">${area}</LotArea>`
      : '',
    area != null && !lot
      ? `        <LivingArea unit="square metres">${area}</LivingArea>`
      : '',
    imovel.quartos != null ? `        <Bedrooms>${imovel.quartos}</Bedrooms>` : '',
    imovel.banheiros != null
      ? `        <Bathrooms>${imovel.banheiros}</Bathrooms>`
      : '',
    imovel.suites != null ? `        <Suites>${imovel.suites}</Suites>` : '',
    imovel.vagas != null ? `        <Garage>${imovel.vagas}</Garage>` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const media = photos
    .map((url, index) => {
      const primary = index === 0 ? ' primary="true"' : '';
      return `          <Item medium="image" caption="img${index + 1}"${primary}>${xmlText(url)}</Item>`;
    })
    .join('\n');

  const location = [
    `        <Country abbreviation="BR">${cdata('Brasil')}</Country>`,
    `        <State abbreviation="${state.abbr}">${cdata(state.name)}</State>`,
    `        <City>${cdata(imovel.cidade.trim())}</City>`,
    `        <Neighborhood>${cdata(imovel.bairro.trim())}</Neighborhood>`,
    imovel.logradouro.trim()
      ? `        <Address>${cdata(imovel.logradouro.trim())}</Address>`
      : '',
    imovel.numero.trim()
      ? `        <StreetNumber>${cdata(imovel.numero.trim())}</StreetNumber>`
      : '',
    imovel.complemento.trim()
      ? `        <Complement>${cdata(imovel.complemento.trim())}</Complement>`
      : '',
    `        <PostalCode>${postal}</PostalCode>`,
  ]
    .filter(Boolean)
    .join('\n');

  const contactXml = [
    `        <Name>${cdata(contact.name.trim())}</Name>`,
    `        <Email>${xmlText(contact.email.trim())}</Email>`,
    contact.telephone.trim()
      ? `        <Telephone>${cdata(contact.telephone.trim())}</Telephone>`
      : '',
    contact.logoUrl.trim()
      ? `        <Logo>${xmlText(contact.logoUrl.trim())}</Logo>`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `    <Listing>
      <ListingID>${xmlText(imovel.id)}</ListingID>
      <Title>${cdata(title)}</Title>
      <TransactionType>For Sale</TransactionType>
      <PublicationType>STANDARD</PublicationType>
      <Media>
${media}
      </Media>
      <Details>
${details}
      </Details>
      <Location displayAddress="${displayAddress}">
${location}
      </Location>
      <ContactInfo>
${contactXml}
      </ContactInfo>
    </Listing>`;
}

export function buildGrupoZapFeed(input: {
  providerEmail: string;
  contact: FeedContact;
  displayAddress: DisplayAddress;
  imoveis: FeedImovel[];
  publishedAt?: Date;
}): FeedBuildResult {
  const blocked: FeedBlocked[] = [];
  const listings: string[] = [];
  for (const imovel of input.imoveis) {
    const reasons = listingBlockers(imovel, input.contact);
    if (reasons.length > 0) {
      blocked.push({
        imovelId: imovel.id,
        titulo: buildTitle(imovel),
        reasons,
      });
      continue;
    }
    listings.push(listingXml(imovel, input.contact, input.displayAddress));
  }

  const publishedAt = (input.publishedAt ?? new Date()).toISOString().slice(0, 19);
  const headerEmail = input.providerEmail.trim() || input.contact.email.trim();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.vivareal.com/schemas/1.0/VRSync http://xml.vivareal.com/vrsync.xsd">
  <Header>
    <Provider>${cdata('NP Connect')}</Provider>
    <Email>${xmlText(headerEmail)}</Email>
    <ContactName>${cdata(input.contact.name.trim() || 'Imobiliária')}</ContactName>
    <PublishDate>${publishedAt}</PublishDate>
    ${input.contact.telephone.trim() ? `<Telephone>${cdata(input.contact.telephone.trim())}</Telephone>` : ''}
  </Header>
  <Listings>
${listings.join('\n')}
  </Listings>
</ListingDataFeed>
`;

  return { xml, included: listings.length, blocked };
}
