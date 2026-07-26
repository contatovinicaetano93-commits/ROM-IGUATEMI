/**
 * Normaliza valores jsonb que podem ter sido gravados como string
 * (efeito de `${JSON.stringify(x)}::jsonb` em alguns drivers).
 */
export function asJsonArray<T>(value: unknown): T[] {
  let v: unknown = value
  for (let i = 0; i < 3; i++) {
    if (typeof v !== 'string') break
    try {
      v = JSON.parse(v)
    } catch {
      return []
    }
  }
  return Array.isArray(v) ? (v as T[]) : []
}

export function asJsonObject<T extends Record<string, unknown>>(value: unknown): T | null {
  let v: unknown = value
  for (let i = 0; i < 3; i++) {
    if (typeof v !== 'string') break
    try {
      v = JSON.parse(v)
    } catch {
      return null
    }
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as T
  return null
}
