/**
 * Contagem operacional por pessoa (cabeça), não por linha de serviço/comanda.
 * Usado em Hoje (movimento) e Pipeline (badges).
 */

export function countDistinctContactIds(
  rows: ReadonlyArray<{ contact_id: string | null | undefined }>,
): number {
  const ids = new Set<string>()
  for (const row of rows) {
    const id = row.contact_id?.trim()
    if (id) ids.add(id)
  }
  return ids.size
}
