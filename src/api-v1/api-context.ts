import { SetMetadata } from '@nestjs/common';
import type { ApiScope } from './api-scopes';

export const API_SCOPES_KEY = 'apiScopes';

export const ApiScopes = (...scopes: ApiScope[]) =>
  SetMetadata(API_SCOPES_KEY, scopes);

export type ApiRequestContext = {
  appId: string;
  clientId: string;
  tenantId: string;
  scopes: string[];
  jti: string;
};
