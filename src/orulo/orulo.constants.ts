export const ORULO_API_BASE = 'https://www.orulo.com.br';
export const ORULO_EXTERNAL_KEY_PREFIX = 'orulo:';
export const ORULO_TAG = 'Órulo';
export const ORULO_MAX_IMAGES = 40;
export const ORULO_RESULTS_PER_PAGE = 500;
export const ORULO_RECONCILE_MIN_MS = 24 * 60 * 60 * 1000;

export function oruloExternalKey(buildingId: number) {
  return `${ORULO_EXTERNAL_KEY_PREFIX}${buildingId}`;
}
