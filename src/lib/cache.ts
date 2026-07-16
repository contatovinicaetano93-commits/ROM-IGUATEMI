export interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class MemoryCache {
  private static cache = new Map<string, CacheEntry<any>>()
  private static maxSize = 1000

  static get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.value as T
  }

  static set<T>(key: string, value: T, ttlSeconds: number = 300): void {
    // Evict old entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
  }

  static delete(key: string): void {
    this.cache.delete(key)
  }

  static clear(): void {
    this.cache.clear()
  }

  static size(): number {
    return this.cache.size
  }
}

export async function cachedFetch<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 300,
): Promise<T> {
  const cached = MemoryCache.get<T>(key)
  if (cached) return cached

  const value = await fn()
  MemoryCache.set(key, value, ttlSeconds)
  return value
}

export function createCachedFunction<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 300,
): () => Promise<T> {
  return () => cachedFetch(key, fn, ttlSeconds)
}
