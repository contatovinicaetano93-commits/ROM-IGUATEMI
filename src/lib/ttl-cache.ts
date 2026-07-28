/**
 * Cache em memória por isolate serverless (warm).
 * Bom para KPIs/listagens estáveis por 30–120s sem Redis.
 */

interface Entry<T> {
  value: T
  expiresAt: number
}

const store = new Map<string, Entry<unknown>>()
const inflightTtl = new Map<string, Promise<unknown>>()

export function ttlGet<T>(key: string): T | undefined {
  const hit = store.get(key)
  if (!hit) return undefined
  if (Date.now() > hit.expiresAt) {
    store.delete(key)
    return undefined
  }
  return hit.value as T
}

export function ttlSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) })
  return value
}

export async function ttlGetOrSet<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> {
  const cached = ttlGet<T>(key)
  if (cached !== undefined) return cached

  // Singleflight: evita stampede (múltiplas requisições simultâneas ao mesmo KPI).
  const existing = inflightTtl.get(key) as Promise<T> | undefined
  if (existing) return existing

  const pending = (async () => {
    try {
      const value = await compute()
      return ttlSet(key, value, ttlMs)
    } finally {
      inflightTtl.delete(key)
    }
  })()

  inflightTtl.set(key, pending)
  return pending
}

export function ttlDelete(prefixOrKey: string) {
  if (!prefixOrKey.endsWith('*')) {
    store.delete(prefixOrKey)
    return
  }
  const prefix = prefixOrKey.slice(0, -1)
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}
