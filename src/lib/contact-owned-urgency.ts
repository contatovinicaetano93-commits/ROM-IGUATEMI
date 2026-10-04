export interface OwnedUrgencyFlags {
  overdue: number
  due_soon: number
  scheduled_soon: number
}

export interface OwnedUrgencyQueueCounts {
  overdue: number
  due_soon: number
  scheduled: number
}

/**
 * Pure: agrega flags por contato nas filas Reativar
 * (overdue → due_soon exclusivos; scheduled independente).
 */
export function aggregateOwnedUrgencyFlags(
  rows: readonly OwnedUrgencyFlags[],
): OwnedUrgencyQueueCounts {
  let overdue = 0
  let due_soon = 0
  let scheduled = 0
  for (const u of rows) {
    if (u.overdue > 0) overdue += 1
    else if (u.due_soon > 0) due_soon += 1
    if (u.scheduled_soon > 0) scheduled += 1
  }
  return { overdue, due_soon, scheduled }
}

/**
 * Total do badge da fila Reativar a partir das contagens SQL.
 * Não usa `items.length` — a lista é paginada (limit 250) e o badge
 * precisa do total real (ex.: Atrasados 3104, não 250).
 */
export function totalForUrgencyQueue(
  counts: OwnedUrgencyQueueCounts,
  queue: 'overdue' | 'due_soon' | 'scheduled',
): number {
  switch (queue) {
    case 'overdue':
      return counts.overdue
    case 'due_soon':
      return counts.due_soon
    case 'scheduled':
      return counts.scheduled
    default: {
      const _exhaustive: never = queue
      return _exhaustive
    }
  }
}
