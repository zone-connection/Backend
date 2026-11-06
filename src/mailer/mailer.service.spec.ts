import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isDeliverableEmail,
  parseOptionalNotifyEmail,
  resolveNotifyEmail,
} from './mailer.service';

describe('isDeliverableEmail', () => {
  it('aceita e-mail real', () => {
    assert.equal(isDeliverableEmail('corretor@imobiliaria.com'), true);
  });

  it('recusa placeholder .local', () => {
    assert.equal(isDeliverableEmail('contato.11@sem-email.local'), false);
  });

  it('recusa vazio ou inválido', () => {
    assert.equal(isDeliverableEmail(''), false);
    assert.equal(isDeliverableEmail('sem-arroba'), false);
  });
});

describe('resolveNotifyEmail', () => {
  it('usa o e-mail de preferência quando válido', () => {
    assert.equal(
      resolveNotifyEmail({
        email: 'login@imobiliaria.com',
        notifyEmail: 'avisos@gmail.com',
      }),
      'avisos@gmail.com',
    );
  });

  it('cai no e-mail de login se a preferência estiver vazia', () => {
    assert.equal(
      resolveNotifyEmail({
        email: 'login@imobiliaria.com',
        notifyEmail: null,
      }),
      'login@imobiliaria.com',
    );
  });

  it('ignora placeholder .local na preferência', () => {
    assert.equal(
      resolveNotifyEmail({
        email: 'login@imobiliaria.com',
        notifyEmail: 'x@sem-email.local',
      }),
      'login@imobiliaria.com',
    );
  });
});

describe('parseOptionalNotifyEmail', () => {
  it('trata vazio como limpar', () => {
    assert.equal(parseOptionalNotifyEmail(''), null);
    assert.equal(parseOptionalNotifyEmail('  '), null);
    assert.equal(parseOptionalNotifyEmail(undefined), undefined);
  });

  it('normaliza o e-mail', () => {
    assert.equal(parseOptionalNotifyEmail('  Avisos@Gmail.com '), 'avisos@gmail.com');
  });
});
