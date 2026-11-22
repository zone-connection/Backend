import assert from 'node:assert/strict';
import test from 'node:test';
import { lerCamposNotaFiscalPdf } from './nota-fiscal-pdf';

const catalogo = {
  corretores: ['Ana', 'Marina Costa'],
  construtoras: ['Norte House'],
  empreendimentos: [
    { nome: 'Palacio das Flores', construtora: 'Norte House' },
    { nome: 'Sul', construtora: 'Outra' },
  ],
};

test('lê campos fixos e sugere cadastros citados na descrição', () => {
  const text = `
NFS-e nº 48291
Data de emissão: 12/03/2026
Tomador de Serviços
Nome / Razão Social: João Pedro Lima
CPF: 529.982.247-25
Valor dos serviços: R$ 18.500,00
Discriminação
Comissão de venda do empreendimento Palacio das Flores, torre B, unidade 1101.
Corretor responsável: Marina Costa.
`;
  const campos = lerCamposNotaFiscalPdf(text, catalogo);
  assert.equal(campos.numero, '48291');
  assert.equal(campos.dataEmissao, '2026-03-12');
  assert.equal(campos.cliente, 'João Pedro Lima');
  assert.equal(campos.vgv, '18.500,00');
  assert.equal(campos.empreendimento, 'Palacio das Flores');
  assert.equal(campos.construtora, 'Norte House');
  assert.equal(campos.corretor, 'Marina Costa');
  assert.equal(campos.torreBloco, 'Torre B · Unidade 1101');
});

test('ignora nome curto de corretor e empreendimento pequeno demais', () => {
  const text = `
Número da nota: 10
Emissão: 01/01/2026
Tomador
Nome: Cliente Exemplo LTDA
Valor líquido da nota R$ 100,00
Texto com Ana e Sul no meio, sem cadastro longo.
`;
  const campos = lerCamposNotaFiscalPdf(text, catalogo);
  assert.equal(campos.corretor, null);
  assert.equal(campos.empreendimento, null);
  assert.equal(campos.construtora, null);
});
