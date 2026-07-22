/** Comparação de nomes em pt-BR (A–Z, ignora acento/caixa). */
export function compareByNamePtBr(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return (a ?? '').localeCompare(b ?? '', 'pt-BR', { sensitivity: 'base' })
}

type ScheduleSortable = {
  contact_name?: string | null
  scheduled_at: string | null
}

function scheduleTimeMs(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

/** Agenda do dia: nome A–Z; empate por horário. */
export function compareScheduleByNameThenTime(a: ScheduleSortable, b: ScheduleSortable): number {
  const byName = compareByNamePtBr(a.contact_name, b.contact_name)
  if (byName !== 0) return byName
  return scheduleTimeMs(a.scheduled_at) - scheduleTimeMs(b.scheduled_at)
}

/** Próximos agendamentos: horário (relevância) e nome A–Z no empate. */
export function compareScheduleByTimeThenName(a: ScheduleSortable, b: ScheduleSortable): number {
  const byTime = scheduleTimeMs(a.scheduled_at) - scheduleTimeMs(b.scheduled_at)
  if (byTime !== 0) return byTime
  return compareByNamePtBr(a.contact_name, b.contact_name)
}
