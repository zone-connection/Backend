import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CaptacaoImovelTipo } from '@prisma/client';
import { buildGrupoZapFeed, toJpegUrl, type FeedImovel } from './grupozap-feed';

function imovel(overrides: Partial<FeedImovel> = {}): FeedImovel {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tipo: CaptacaoImovelTipo.apartamento,
    cep: '50010000',
    logradouro: 'Rua da Aurora',
    numero: '100',
    complemento: 'Apto 12',
    bairro: 'Boa Vista',
    cidade: 'Recife',
    estado: 'PE',
    area: 72.4,
    areaConstruida: 68.2,
    quartos: 2,
    suites: 1,
    banheiros: 2,
    vagas: 1,
    descricao:
      'Apartamento arejado, com sala, cozinha e área de serviço, pronto para morar.',
    precoVenda: 350000.9,
    fotos: [
      'https://cdn.exemplo.com/1.jpg',
      'https://cdn.exemplo.com/2.jpg',
      'https://cdn.exemplo.com/3.jpg',
      'https://cdn.exemplo.com/4.jpeg',
      'https://cdn.exemplo.com/5.jpg',
    ],
    ...overrides,
  };
}

const contact = {
  name: 'Imobiliária Feliz',
  email: 'contato@imobiliariafeliz.com.br',
  telephone: '(81) 3333-4444',
  logoUrl: '',
};

describe('feed VRSync', () => {
  it('gera o XML de venda com os elementos obrigatórios da documentação', () => {
    const { xml, included, blocked } = buildGrupoZapFeed({
      providerEmail: 'integracao@npconnect.com.br',
      contact,
      displayAddress: 'Neighborhood',
      imoveis: [imovel()],
      publishedAt: new Date('2026-09-25T12:00:00.000Z'),
    });

    assert.equal(included, 1);
    assert.deepEqual(blocked, []);
    assert.match(xml, /xmlns="http:\/\/www\.vivareal\.com\/schemas\/1\.0\/VRSync"/);
    assert.match(xml, /<Provider><!\[CDATA\[NP Connect\]\]><\/Provider>/);
    assert.match(xml, /<TransactionType>For Sale<\/TransactionType>/);
    assert.match(xml, /<PublicationType>STANDARD<\/PublicationType>/);
    assert.match(xml, /<ListPrice currency="BRL">350000<\/ListPrice>/);
    assert.match(xml, /<LivingArea unit="square metres">68<\/LivingArea>/);
    assert.match(xml, /<PropertyType>Residential \/ Apartment<\/PropertyType>/);
    assert.match(xml, /<UsageType>Residential<\/UsageType>/);
    assert.match(xml, /displayAddress="Neighborhood"/);
    assert.match(xml, /<State abbreviation="PE">/);
    assert.match(xml, /<PostalCode>50010-000<\/PostalCode>/);
    assert.match(xml, /primary="true"/);
    assert.match(xml, /<Bathrooms>2<\/Bathrooms>/);
    assert.equal((xml.match(/medium="image"/g) ?? []).length, 5);
  });

  it('deixa de fora anúncio sem o mínimo de 5 fotos JPG ou sem preço', () => {
    const { included, blocked } = buildGrupoZapFeed({
      providerEmail: contact.email,
      contact,
      displayAddress: 'All',
      imoveis: [
        imovel({ id: 'sem-foto', fotos: ['https://cdn.exemplo.com/1.jpg'] }),
        imovel({ id: 'sem-preco', precoVenda: null }),
      ],
    });
    assert.equal(included, 0);
    assert.equal(blocked.length, 2);
    assert.match(blocked[0].reasons.join(' '), /5 fotos JPG/);
    assert.match(blocked[1].reasons.join(' '), /Preço de venda/);
  });

  it('usa LotArea em terreno e converte foto da Cloudinary para JPG', () => {
    const jpeg = toJpegUrl(
      'https://res.cloudinary.com/demo/image/upload/v1/foto.png',
    );
    assert.equal(
      jpeg,
      'https://res.cloudinary.com/demo/image/upload/f_jpg/v1/foto.jpg',
    );

    const { xml, included } = buildGrupoZapFeed({
      providerEmail: contact.email,
      contact,
      displayAddress: 'Street',
      imoveis: [
        imovel({
          tipo: CaptacaoImovelTipo.terreno,
          area: 450.8,
          areaConstruida: null,
          banheiros: null,
          fotos: Array.from({ length: 5 }, (_, index) =>
            `https://res.cloudinary.com/demo/image/upload/v1/t${index}.png`,
          ),
        }),
      ],
    });
    assert.equal(included, 1);
    assert.match(xml, /<PropertyType>Residential \/ Land Lot<\/PropertyType>/);
    assert.match(xml, /<LotArea unit="square metres">450<\/LotArea>/);
    assert.doesNotMatch(xml, /<LivingArea/);
    assert.match(xml, /f_jpg/);
  });
});
