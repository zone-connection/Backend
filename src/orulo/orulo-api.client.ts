import { Injectable, Logger } from '@nestjs/common';
import { ORULO_API_BASE, ORULO_RESULTS_PER_PAGE } from './orulo.constants';
import type {
  OruloIdsPage,
  OruloPublicationLink,
} from './orulo-api.types';

export class OruloApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OruloApiError';
  }
}

@Injectable()
export class OruloApiClient {
  private readonly logger = new Logger(OruloApiClient.name);

  async clientCredentials(clientId: string, clientSecret: string) {
    return this.requestToken({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });
  }

  async authorizationCode(params: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
  }) {
    return this.requestToken({
      grant_type: 'authorization_code',
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    });
  }

  async getConfig(token: string) {
    return this.getJson<Record<string, unknown>>('/api/v2/config', token);
  }

  async listActiveIds(token: string, page: number) {
    return this.getJson<OruloIdsPage>(
      `/api/v2/buildings/ids/active?page=${page}&results_per_page=${ORULO_RESULTS_PER_PAGE}`,
      token,
    );
  }

  async listRemovedIds(token: string, updatedAfter: string, page: number) {
    const after = encodeURIComponent(updatedAfter);
    const withPage = `/api/v2/buildings/ids/removed?updated_after=${after}&page=${page}&results_per_page=${ORULO_RESULTS_PER_PAGE}`;
    try {
      return await this.getJson<OruloIdsPage>(withPage, token);
    } catch (error) {
      if (error instanceof OruloApiError && error.status === 400 && page === 1) {
        return this.getJson<OruloIdsPage>(
          `/api/v2/buildings/ids/removed?updated_after=${after}`,
          token,
        );
      }
      throw error;
    }
  }

  async getBuilding(token: string, buildingId: number) {
    return this.getJson<Record<string, unknown>>(
      `/api/v2/buildings/${buildingId}`,
      token,
    );
  }

  async getImages(token: string, buildingId: number) {
    return this.getJson<unknown>(
      `/api/v2/buildings/${buildingId}/images?width=1200&height=800`,
      token,
    );
  }

  async getFloorPlans(token: string, buildingId: number) {
    return this.getJson<unknown>(
      `/api/v2/buildings/${buildingId}/floor_plans?width=1200&height=800`,
      token,
    );
  }

  async getCommercialContact(
    token: string,
    buildingId: number,
    contactId: string,
  ) {
    return this.getJson<Record<string, unknown>>(
      `/api/v2/buildings/${buildingId}/commercial_contacts/${contactId}`,
      token,
    );
  }

  async getFile(token: string, buildingId: number, fileId: string) {
    return this.getJson<Record<string, unknown>>(
      `/api/v2/buildings/${buildingId}/files/${fileId}`,
      token,
    );
  }

  async putPublicationLinks(
    token: string,
    buildingId: number,
    publication_links: OruloPublicationLink[],
  ) {
    return this.requestJson(
      'PUT',
      `/api/v2/buildings/${buildingId}/publication_links`,
      token,
      { publication_links },
    );
  }

  private async requestToken(body: Record<string, string>) {
    const res = await fetch(`${ORULO_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`Órulo token HTTP ${res.status}: ${text.slice(0, 200)}`);
      throw new OruloApiError(res.status, 'Falha ao autenticar na Órulo.');
    }
    const json = JSON.parse(text) as { access_token?: string };
    if (!json.access_token) {
      throw new OruloApiError(res.status, 'A Órulo não devolveu access_token.');
    }
    return json.access_token;
  }

  private async getJson<T>(path: string, token: string): Promise<T> {
    return this.requestJson<T>('GET', path, token);
  }

  private async requestJson<T>(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${ORULO_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!res.ok) {
      throw new OruloApiError(
        res.status,
        `Órulo ${method} ${path} falhou (${res.status}).`,
      );
    }
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}
