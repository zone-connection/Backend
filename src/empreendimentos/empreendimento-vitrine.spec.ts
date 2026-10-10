import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  catalogoFromTipologias,
  normalizeEmpreendimentoVitrine,
} from './empreendimento-vitrine';

describe('empreendimento tipologias', () => {
  it('mantém cada bloco de tipologia no JSON da vitrine', () => {
    const vitrine = normalizeEmpreendimentoVitrine({
      tipologias: [
        {
          nome: 'Com varanda',
          areaM2: 68,
          quartos: 2,
          suites: 1,
          banheiros: 2,
          vagas: 1,
          valor: 420000,
          valorM2: 6176,
          pavimento: '12',
          plantaUrl: 'https://cdn.example.com/planta-varanda.png',
        },
        {
          nome: 'Garden',
          areaM2: 90,
          quartos: 3,
          vagas: 2,
          valor: 610000,
          valorM2: null,
          pavimento: null,
          plantaUrl: null,
        },
      ],
    });

    assert.equal(vitrine?.tipologias.length, 2);
    assert.deepEqual(vitrine?.tiposUnidade, ['Com varanda', 'Garden']);
    assert.equal(vitrine?.areaMax, 90);
    assert.equal(vitrine?.valorMax, 610000);
    assert.equal(vitrine?.suites, 1);
    assert.equal(vitrine?.valorM2, 6176);
    assert.equal(vitrine?.tipologias[0].plantaUrl, 'https://cdn.example.com/planta-varanda.png');
  });

  it('deriva o catálogo pelos extremos das tipologias', () => {
    const catalogo = catalogoFromTipologias([
      {
        nome: 'Studio',
        areaM2: 32,
        quartos: 1,
        suites: null,
        banheiros: 1,
        vagas: 0,
        valor: 280000,
        valorM2: null,
        pavimento: null,
        plantaUrl: null,
      },
      {
        nome: 'Cobertura',
        areaM2: 140,
        quartos: 3,
        suites: 2,
        banheiros: 3,
        vagas: 2,
        valor: 980000,
        valorM2: 7000,
        pavimento: '20',
        plantaUrl: null,
      },
    ]);

    assert.equal(catalogo.areaM2, 32);
    assert.equal(catalogo.areaMax, 140);
    assert.equal(catalogo.quartos, 1);
    assert.equal(catalogo.valorReferencia, 280000);
    assert.equal(catalogo.valorMax, 980000);
    assert.equal(catalogo.vagas, 0);
  });

  it('não apaga vitrine antiga sem tipologias', () => {
    const vitrine = normalizeEmpreendimentoVitrine({
      headline: 'Vista para o mar',
      descricao: 'Torre única',
      lazer: ['Piscina'],
      tiposUnidade: ['Garden'],
      suites: 2,
      areaMax: 110,
    });

    assert.equal(vitrine?.headline, 'Vista para o mar');
    assert.deepEqual(vitrine?.lazer, ['Piscina']);
    assert.deepEqual(vitrine?.tiposUnidade, ['Garden']);
    assert.equal(vitrine?.suites, 2);
    assert.equal(vitrine?.areaMax, 110);
    assert.deepEqual(vitrine?.tipologias, []);
  });

  it('ignora JSON inválido sem quebrar a leitura', () => {
    assert.equal(normalizeEmpreendimentoVitrine(null), null);
    assert.equal(normalizeEmpreendimentoVitrine('texto'), null);
    assert.equal(normalizeEmpreendimentoVitrine([]), null);
    assert.equal(
      normalizeEmpreendimentoVitrine({ tipologias: [{ nome: 10 }] }),
      null,
    );
  });
});
