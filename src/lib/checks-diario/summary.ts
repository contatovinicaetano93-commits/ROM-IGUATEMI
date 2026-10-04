export type ChecksPersonProgress = {
  total_tasks: number
  done_tasks: number
}

export type ChecksBoardSummary = {
  people: number
  complete: number
  partial: number
  pending: number
  no_routine: number
  with_routine: number
  logs_today: number
}

/** Sem rotina não é pendente — é buraco, não atraso. */
export function summarizeChecksPeople(
  people: readonly ChecksPersonProgress[],
  logsToday = 0,
): ChecksBoardSummary {
  let complete = 0
  let partial = 0
  let pending = 0
  let noRoutine = 0
  for (const person of people) {
    if (person.total_tasks === 0) {
      noRoutine += 1
      continue
    }
    if (person.done_tasks >= person.total_tasks) complete += 1
    else if (person.done_tasks > 0) partial += 1
    else pending += 1
  }
  return {
    people: people.length,
    complete,
    partial,
    pending,
    no_routine: noRoutine,
    with_routine: people.length - noRoutine,
    logs_today: logsToday,
  }
}

export function checksDayProgressLabel(summary: ChecksBoardSummary): string {
  if (summary.with_routine === 0) {
    return summary.no_routine > 0
      ? `sem rotina · ${summary.no_routine} na equipe`
      : 'sem rotina no dia'
  }
  const ok = `${summary.complete}/${summary.with_routine} ok`
  if (summary.no_routine === 0) return ok
  return `${ok} · ${summary.no_routine} sem rotina`
}
