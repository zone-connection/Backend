import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfGuard } from './csrf.guard';
import { CSRF_HEADER } from '../utils/auth-cookies';

function ctx(partial: {
  method: string;
  path: string;
  cookies?: Record<string, string>;
  header?: string;
  isPublic?: boolean;
}) {
  const reflector = {
    getAllAndOverride: () => Boolean(partial.isPublic),
  };
  const request = {
    method: partial.method,
    originalUrl: partial.path,
    path: partial.path,
    cookies: partial.cookies ?? {},
    get: (name: string) =>
      name.toLowerCase() === CSRF_HEADER ? partial.header : undefined,
  };
  return {
    guard: new CsrfGuard(reflector as unknown as Reflector),
    context: {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    },
  };
}

describe('CsrfGuard', () => {
  it('GET passa sem CSRF', () => {
    const { guard, context } = ctx({ method: 'GET', path: '/parcerias' });
    assert.equal(guard.canActivate(context as never), true);
  });

  it('POST do portal de parceiros usa crm_parceiro_csrf', () => {
    const { guard, context } = ctx({
      method: 'POST',
      path: '/portal-parceiros/interesses',
      cookies: { crm_parceiro_csrf: 'abc12345' },
      header: 'abc12345',
    });
    assert.equal(guard.canActivate(context as never), true);
  });

  it('POST do portal de parceiros não aceita o CSRF do CRM', () => {
    const { guard, context } = ctx({
      method: 'POST',
      path: '/portal-parceiros/interesses',
      cookies: { crm_csrf: 'abc12345', crm_parceiro_csrf: 'outro' },
      header: 'abc12345',
    });
    assert.throws(
      () => guard.canActivate(context as never),
      ForbiddenException,
    );
  });

  it('POST do portal do proprietário continua no cookie próprio', () => {
    const { guard, context } = ctx({
      method: 'POST',
      path: '/portal-proprietario/auth/login',
      cookies: { crm_portal_csrf: 'tok-portal' },
      header: 'tok-portal',
    });
    assert.equal(guard.canActivate(context as never), true);
  });
});
