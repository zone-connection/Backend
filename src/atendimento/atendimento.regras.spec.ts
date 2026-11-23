import assert from 'node:assert/strict';
import test from 'node:test';
import { checklistCompleto, statusCadencia } from './atendimento.regras';

test('cadência atrasada só depois do dia previsto e não mexe no prazo do SLA', () => {
  const inicio = new Date('2026-11-01T10:00:00.000Z');
  const etapa = { id: '1', ordem: 1, dia: 2, acao: 'WhatsApp', descricao: '' };
  const antes = statusCadencia(etapa, inicio, undefined, new Date('2026-11-02T12:00:00.000Z'));
  const depois = statusCadencia(etapa, inicio, undefined, new Date('2026-11-04T12:00:00.000Z'));
  assert.equal(antes.status, 'pendente');
  assert.equal(depois.status, 'atrasada');
  const feita = statusCadencia(
    etapa,
    inicio,
    { etapaId: '1', dia: 2, acao: 'WhatsApp', concluidaEm: '2026-11-02T12:00:00.000Z' },
    new Date('2026-11-04T12:00:00.000Z'),
  );
  assert.equal(feita.status, 'concluida');
});

test('checklist completo exige os itens obrigatórios', () => {
  const itens = [
    { id: 'a', modeloId: 'm', texto: 'Interesse', obrigatorio: true, ordem: 1 },
    { id: 'b', modeloId: 'm', texto: 'Renda', obrigatorio: true, ordem: 2 },
    { id: 'c', modeloId: 'm', texto: 'Extra', obrigatorio: false, ordem: 3 },
  ];
  assert.equal(checklistCompleto(itens, new Set(['a'])), false);
  assert.equal(checklistCompleto(itens, new Set(['a', 'b'])), true);
});
