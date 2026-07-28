/**
 * Helpers jsonb para postgres.js.
 *
 * Nunca use `${JSON.stringify(x)}::jsonb` — o driver já serializa strings
 * como valor JSON string e o resultado fica duplamente codificado
 * (jsonb_typeof = 'string'), quebrando .map/.reduce no dashboard.
 *
 * Escrita: passe o array/objeto direto `${value}` (ou sql.json).
 * Leitura: use asJsonArray / asJsonObject para tolerar legado duplo.
 */

export function asJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value == null) return []
  if (typeof value === 'string') {
    try {
      return asJsonArray<T>(JSON.parse(value))
    } catch {
      return []
    }
  }
  return []
}

export function asJsonObject<T extends Record<string, unknown>>(value: unknown): T | null {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as T
  }
  if (typeof value === 'string') {
    try {
      return asJsonObject<T>(JSON.parse(value))
    } catch {
      return null
    }
  }
  return null
}
