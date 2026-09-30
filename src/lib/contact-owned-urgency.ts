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
