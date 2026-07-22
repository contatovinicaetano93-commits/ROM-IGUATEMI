/** Comparação de nomes em pt-BR (A–Z, ignora acento/caixa). */
export function compareByNamePtBr(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return (a ?? '').localeCompare(b ?? '', 'pt-BR', { sensitivity: 'base' })
}

/** Agenda do dia: nome A–Z; empate por horário. */
export function compareScheduleByNameThenTime(
  a: { contact_name?: string | null; scheduled_at: string },
  b: { contact_name?: string | null; scheduled_at: string },
): number {
  const byName = compareByNamePtBr(a.contact_name, b.contact_name)
  if (byName !== 0) return byName
  return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
}

/** Próximos agendamentos: horário (relevância) e nome A–Z no empate. */
export function compareScheduleByTimeThenName(
  a: { contact_name?: string | null; scheduled_at: string },
  b: { contact_name?: string | null; scheduled_at: string },
): number {
  const byTime = new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  if (byTime !== 0) return byTime
  return compareByNamePtBr(a.contact_name, b.contact_name)
}
