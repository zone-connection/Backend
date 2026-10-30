import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPhoneOwnedByAnotherTenant } from './lead-notify-phone';

describe('isPhoneOwnedByAnotherTenant', () => {
  it('bloqueia o WhatsApp cadastrado em outra imobiliária', () => {
    assert.equal(
      isPhoneOwnedByAnotherTenant('(81) 99999-1111', ['81999991111']),
      true,
    );
    assert.equal(
      isPhoneOwnedByAnotherTenant('5581999991111', ['(81) 99999-1111']),
      true,
    );
  });

  it('libera número que só existe nesta imobiliária', () => {
    assert.equal(
      isPhoneOwnedByAnotherTenant('(81) 98888-2222', ['(11) 90000-0000']),
      false,
    );
    assert.equal(
      isPhoneOwnedByAnotherTenant('(81) 98888-2222', ['', null]),
      false,
    );
    assert.equal(
      isPhoneOwnedByAnotherTenant('(81) 9999-1111', ['81999991111']),
      true,
    );
  });
});
