export type OruloIdsPage = Record<string, unknown>;

export type OruloWebhookPayload = {
  date?: string;
  name?: string;
  properties?: {
    building_id?: number | string;
    status?: string;
    client_id?: string;
  };
};

export type OruloPublicationLink = {
  url: string;
  active: boolean;
};
