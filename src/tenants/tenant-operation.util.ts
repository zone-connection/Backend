export const TENANT_OPERATION_KEYS = [
  'comercial',
  'captacao',
  'imoveisUsados',
  'locacao',
] as const;

export type TenantOperationKey = (typeof TENANT_OPERATION_KEYS)[number];

/** Comercial permanece o CRM atual. Novas operações nascem desligadas. */
export const TENANT_OPERATION_DEFAULTS: Record<TenantOperationKey, boolean> = {
  comercial: true,
  captacao: false,
  imoveisUsados: false,
  locacao: false,
};

export function isTenantOperationKey(key: string): key is TenantOperationKey {
  return (TENANT_OPERATION_KEYS as readonly string[]).includes(key);
}

export function isTenantOperationEnabled(
  modules: Record<string, boolean> | null | undefined,
  key: TenantOperationKey,
): boolean {
  if (typeof modules?.[key] === 'boolean') return modules[key] === true;
  return TENANT_OPERATION_DEFAULTS[key];
}

export function pickOperationModules(
  modules: Record<string, boolean> | null | undefined,
): Record<TenantOperationKey, boolean> {
  return {
    comercial: isTenantOperationEnabled(modules, 'comercial'),
    captacao: isTenantOperationEnabled(modules, 'captacao'),
    imoveisUsados: isTenantOperationEnabled(modules, 'imoveisUsados'),
    locacao: isTenantOperationEnabled(modules, 'locacao'),
  };
}

export function mergeOperationModules(
  current: Record<string, boolean>,
  patch: Partial<Record<TenantOperationKey, boolean>>,
): Record<string, boolean> {
  const next = { ...current };
  for (const key of TENANT_OPERATION_KEYS) {
    if (typeof patch[key] === 'boolean') next[key] = patch[key]!;
  }
  return next;
}

/** Paths das operações (captação, usados, locação). */
export function operationModuleForApiPath(
  rawPath: string,
): TenantOperationKey | null {
  const path = rawPath.split('?')[0].replace(/^\/+/, '').toLowerCase();
  if (path.startsWith('captacao')) return 'captacao';
  if (path.startsWith('imoveis-usados') || path.startsWith('imoveisusados')) {
    return 'imoveisUsados';
  }
  if (path.startsWith('locacao')) return 'locacao';
  return null;
}
