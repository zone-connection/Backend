import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TenantPlano } from '@prisma/client';
import {
  modulesPresetForPlano,
  normalizeModulesForPlano,
} from './tenant-plan';

describe('módulos de operação no plano', () => {
  it('preset bronze liga comercial e deixa captação/usados/locação off', () => {
    const preset = modulesPresetForPlano(TenantPlano.bronze);
    assert.equal(preset.comercial, true);
    assert.equal(preset.funil, true);
    assert.equal(preset.captacao, false);
    assert.equal(preset.imoveisUsados, false);
    assert.equal(preset.locacao, false);
  });

  it('tenant antigo sem as chaves novas não perde o comercial', () => {
    const next = normalizeModulesForPlano(TenantPlano.ouro, {
      dashboard: true,
      funil: true,
    });
    assert.equal(next.comercial, true);
    assert.equal(next.captacao, false);
  });

  it('não liga captação só porque o plano é ouro', () => {
    const next = normalizeModulesForPlano(TenantPlano.ouro, {
      captacao: false,
    });
    assert.equal(next.captacao, false);
  });

  it('preserva captação ativa ao normalizar', () => {
    const next = normalizeModulesForPlano(TenantPlano.prata, {
      captacao: true,
    });
    assert.equal(next.captacao, true);
    assert.equal(next.comercial, true);
  });

  it('não aplica ocultar Clientes do menu no tenant (é preferência por usuário)', () => {
    const next = normalizeModulesForPlano(TenantPlano.ouro, {
      hideClientesNav: true,
      captacao: true,
    });
    assert.equal(next.hideClientesNav, undefined);
    assert.equal(next.captacao, true);
  });

  it('preserva admin ver clientes do corretor ao normalizar', () => {
    const next = normalizeModulesForPlano(TenantPlano.ouro, {
      adminVerClientesCorretor: true,
    });
    assert.equal(next.adminVerClientesCorretor, true);
  });
});
