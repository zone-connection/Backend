import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapMetaLeadFields } from './meta-lead-fields';

describe('mapMetaLeadFields', () => {
  it('mapeia campos padrão da Meta', () => {
    const mapped = mapMetaLeadFields([
      { name: 'full_name', values: ['Denis Santos'] },
      { name: 'email', values: ['denis@imobiliaria.com'] },
      { name: 'phone_number', values: ['+55 14 99651-6819'] },
    ]);
    assert.equal(mapped.nome, 'Denis Santos');
    assert.equal(mapped.email, 'denis@imobiliaria.com');
    assert.equal(mapped.telefone, '(14) 99651-6819');
  });

  it('lê WhatsApp e e-mail com rótulo customizado do Instant Form', () => {
    const mapped = mapMetaLeadFields([
      { name: 'full_name', values: ['Denis Santos'] },
      { name: 'Qual seu WhatsApp?', values: ['14996516819'] },
      { name: 'E-mail para contato', values: ['denis@casa.com'] },
      { name: 'Renda mensal', values: ['R$ 15.000'] },
    ]);
    assert.equal(mapped.telefone, '(14) 99651-6819');
    assert.equal(mapped.email, 'denis@casa.com');
    assert.equal(mapped.renda, 15000);
  });

  it('descobre telefone e e-mail pelo valor se o nome do campo for livre', () => {
    const mapped = mapMetaLeadFields([
      { name: 'full_name', values: ['Ana'] },
      { name: 'pergunta_3', values: ['ana@ex.com'] },
      { name: 'pergunta_4', values: ['(11) 98888-7777'] },
    ]);
    assert.equal(mapped.email, 'ana@ex.com');
    assert.equal(mapped.telefone, '(11) 98888-7777');
  });

  it('mapeia cadastro completo e ignora corretor/equipe', () => {
    const mapped = mapMetaLeadFields([
      { name: 'full_name', values: ['Paulo Carvalho'] },
      { name: 'Cidade', values: ['Vitória'] },
      { name: 'Bairro', values: ['Centro'] },
      { name: 'CPF', values: ['123.456.789-01'] },
      { name: 'Estado civil', values: ['Casado'] },
      { name: 'Tipo de renda', values: ['CLT'] },
      { name: 'Renda mensal', values: ['R$ 8.000'] },
      { name: 'Orçamento', values: ['450.000'] },
      { name: 'Empreendimento', values: ['Metrocasa Clube Vila das Belezas'] },
      { name: 'Corretor', values: ['João'] },
      { name: 'Equipe', values: ['Vendas 1'] },
    ]);
    assert.equal(mapped.cidade, 'Vitória');
    assert.equal(mapped.bairro, 'Centro');
    assert.equal(mapped.cpf, '123.456.789-01');
    assert.equal(mapped.estadoCivil, 'Casado');
    assert.equal(mapped.tipoRenda, 'CLT');
    assert.equal(mapped.renda, 8000);
    assert.equal(mapped.orcamentoMax, 450000);
    assert.equal(mapped.empreendimentoNome, 'Metrocasa Clube Vila das Belezas');
    assert.equal(mapped.extraTags.some((t) => /corretor|equipe/i.test(t)), false);
  });
});
