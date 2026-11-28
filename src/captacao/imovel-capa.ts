const DEMO_IMOVEL_CAPAS: Record<string, readonly string[]> = {
  apartamento: [
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
  ],
  casa: [
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
  ],
  terreno: [
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1464146072230-91cabc968266?auto=format&fit=crop&w=1200&q=80',
  ],
  sala_comercial: [
    'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80',
  ],
};

export function demoImovelCapaUrl(tipo: string, salt: string): string {
  const pool =
    DEMO_IMOVEL_CAPAS[tipo] ?? DEMO_IMOVEL_CAPAS.apartamento ?? [];
  let hash = 0;
  for (let i = 0; i < salt.length; i += 1) {
    hash = (hash * 31 + salt.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length]!;
}

export function imovelCapaResolvida(item: {
  id?: string;
  tipo?: string;
  fotoUrl?: string | null;
  fotos?: Array<{ url: string }>;
}): string | null {
  const real = item.fotos?.[0]?.url ?? item.fotoUrl ?? null;
  if (real && real.trim()) return real;
  if (!item.tipo && !item.id) return null;
  return demoImovelCapaUrl(item.tipo ?? 'apartamento', item.id ?? item.tipo ?? 'imovel');
}
