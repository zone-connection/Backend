import { extractIntermediacaoFields } from './intermediacao-extract';
import { isValidCnpj, isValidCpf } from './intermediacao-fields';
import assert from 'node:assert/strict';
import test from 'node:test';

test('extrai CPF e e-mail do contratante', () => {
  const text = `
CONTRATANTE(s)
Nome:  Gleison Silva / Lais Souza
CPF: 529.982.247-25 e 390.533.447-05
E-mail: gleison@email.com
Tel: (81) 98888-1234
CEP: 54762-000
PROPRIETÁRIO
Nome: Construtora Exemplo LTDA
CNPJ: 11.444.777/0001-61
CONTRATADA
New Palace Imoveis
CNPJ: 04.252.011/0001-10
CRECI: 12345-J
Empreendimento: Palacio das Flores
Unidade: 1101
Banco: Inter
PIX: 04.252.011/0001-10
`;
  const result = extractIntermediacaoFields(text);
  assert.ok(result.values.contratanteCpf?.includes('/'));
  assert.equal(result.values.contratanteEmail, 'gleison@email.com');
  assert.ok(isValidCpf('529.982.247-25'));
  assert.ok(isValidCnpj('11.444.777/0001-61'));
  assert.equal(result.values.empreendimento, 'Palacio das Flores');
  assert.equal(result.values.unidade, '1101');
});
