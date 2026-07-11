import type { DirectorProfessional } from './types'

/** Normaliza nome para match flexível (acentos, case, espaços). */
export function normalizeProKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Associa nome Avec → profissional do portfólio.
 * Ordem: avec_pro_id exato → chave normalizada → contém / prefixo.
 */
export function matchDirectorProfessional(
  avecName: string,
  professionals: DirectorProfessional[],
): DirectorProfessional | null {
  const raw = avecName.trim()
  if (!raw) return null

  const byId = professionals.find((p) => p.avec_pro_id && p.avec_pro_id === raw)
  if (byId) return byId

  const key = normalizeProKey(raw)
  if (!key) return null

  const exact = professionals.find((p) => normalizeProKey(p.name) === key)
  if (exact) return exact

  // Match parcial por prefixo/substring (ex.: "Vitor M" ↔ "Vitor").
  // Se mais de um profissional do portfólio bater com o mesmo nome parcial
  // (ex.: dois "Lucas"), não adivinha — melhor faturamento não atribuído do
  // que atribuído ao profissional errado silenciosamente.
  const partialMatches = professionals.filter((p) => {
    const pk = normalizeProKey(p.name)
    if (!pk) return false
    return key === pk || key.startsWith(pk + ' ') || pk.startsWith(key + ' ') || key.includes(pk)
  })
  return partialMatches.length === 1 ? partialMatches[0]! : null
}
