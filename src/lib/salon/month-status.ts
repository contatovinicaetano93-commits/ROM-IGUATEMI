/** Labels puros — seguro para client components (sem DB). */

export type MonthCloseStatus = 'complete' | 'in_progress' | 'incomplete'

export function statusLabelPt(status: MonthCloseStatus): string {
  if (status === 'complete') return 'Completo'
  if (status === 'in_progress') return 'Em andamento'
  return 'INCOMPLETO'
}
