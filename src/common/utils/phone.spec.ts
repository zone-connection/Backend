import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  nationalPhoneDigits,
  phonesMatch,
  toWhatsAppChatId,
} from './phone';

describe('phone utils', () => {
  it('normaliza DDI 55 e pontuação', () => {
    assert.equal(nationalPhoneDigits('+55 (11) 99999-8888'), '11999998888');
    assert.equal(nationalPhoneDigits('11999998888'), '11999998888');
    assert.equal(nationalPhoneDigits('5511999998888'), '11999998888');
  });

  it('monta chatId com DDI 55', () => {
    assert.equal(toWhatsAppChatId('(11) 99999-8888'), '5511999998888');
    assert.equal(toWhatsAppChatId('123'), null);
  });

  it('compara números equivalentes', () => {
    assert.equal(phonesMatch('5511999998888', '(11) 99999-8888'), true);
    assert.equal(phonesMatch('(11) 99999-8888', '(21) 99999-8888'), false);
  });
});
