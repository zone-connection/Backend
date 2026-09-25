import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_CAPTATION_FUNNEL_STAGES,
  DEFAULT_FUNNEL_STAGES,
  DEFAULT_VENDA_USADOS_FUNNEL_STAGES,
  defaultStagesForTipo,
} from './catalog.defaults';

describe('etapas padrão por tipo de funil', () => {
  it('comercial mantém o funil de vendas atual', () => {
    const stages = defaultStagesForTipo('comercial');
    assert.equal(stages, DEFAULT_FUNNEL_STAGES);
    assert.equal(stages[0]?.papel, 'inicial');
    assert.ok(stages.some((s) => s.papel === 'analise'));
    assert.ok(stages.some((s) => s.papel === 'venda'));
    assert.ok(stages.some((s) => s.papel === 'perdido'));
  });

  it('captação tem 8 etapas com inicial, sucesso e perda', () => {
    const stages = defaultStagesForTipo('captacao');
    assert.equal(stages, DEFAULT_CAPTATION_FUNNEL_STAGES);
    assert.equal(stages.length, 8);
    assert.equal(stages[0]?.label, 'Novo proprietário');
    assert.equal(stages[0]?.papel, 'inicial');
    assert.ok(stages.some((s) => s.label === 'Imóvel captado' && s.papel === 'venda'));
    assert.ok(stages.some((s) => s.label === 'Captação perdida' && s.papel === 'perdido'));
    assert.equal(
      stages.filter((s) => s.papel === 'analise').length,
      0,
    );
  });

  it('venda de usados tem 9 etapas sem análise de crédito', () => {
    const stages = defaultStagesForTipo('venda_usados');
    assert.equal(stages, DEFAULT_VENDA_USADOS_FUNNEL_STAGES);
    assert.equal(stages.length, 9);
    assert.equal(stages[0]?.label, 'Novo interessado');
    assert.ok(stages.some((s) => s.label === 'Venda' && s.papel === 'venda'));
    assert.ok(stages.some((s) => s.label === 'Perdido' && s.papel === 'perdido'));
    assert.equal(
      stages.filter((s) => s.papel === 'analise').length,
      0,
    );
  });
});
