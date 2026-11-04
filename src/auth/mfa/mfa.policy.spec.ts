import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MfaDecision, Role } from '@prisma/client';
import { canDisableMfa, mfaGateFor, mfaPolicyForRole } from './mfa.policy';

describe('política de 2FA', () => {
  it('obriga o super admin e só pergunta ao admin da imobiliária', () => {
    assert.equal(mfaPolicyForRole(Role.super_admin), 'obrigatoria');
    assert.equal(mfaPolicyForRole(Role.admin), 'escolha');
    assert.equal(mfaPolicyForRole(Role.gerente), 'voluntaria');
    assert.equal(mfaPolicyForRole(Role.corretor), 'voluntaria');
  });

  it('não libera o super admin sem autenticador', () => {
    assert.equal(
      mfaGateFor({ role: Role.super_admin, totpEnabledAt: null, mfaDecision: MfaDecision.recusar }),
      'configurar',
    );
  });

  it('pede o código quando a 2FA já está ativa', () => {
    assert.equal(
      mfaGateFor({ role: Role.corretor, totpEnabledAt: new Date(), mfaDecision: null }),
      'codigo',
    );
  });

  it('pede o QR Code do admin antes de entrar e não repete depois de recusar', () => {
    assert.equal(
      mfaGateFor({ role: Role.admin, totpEnabledAt: null, mfaDecision: null }),
      'configurar',
    );
    assert.equal(
      mfaGateFor({ role: Role.admin, totpEnabledAt: null, mfaDecision: MfaDecision.recusar }),
      null,
    );
  });

  it('impede o super admin de desativar', () => {
    assert.equal(canDisableMfa(Role.super_admin), false);
    assert.equal(canDisableMfa(Role.admin), true);
    assert.equal(canDisableMfa(Role.corretor), true);
  });
});
