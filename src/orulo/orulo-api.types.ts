export type OruloBuildingIdRow = {
  id: number;
  updated_at?: string;
};

export type OruloIdsPage = {
  building_ids: OruloBuildingIdRow[];
  total?: number;
  page?: number;
  total_pages?: number;
};

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
