/**
 * Resolve Agendados (cabeças) — mesma regra do Cérebro `fetch-unit`:
 * prefer CS/agenda local quando coerente; senão metrics Avec; nunca < attended.
 */
export function resolveAppointmentsHeads(opts: {
  metricAppt: number | null | undefined
  scheduleHeads: number
  attended: number | null | undefined
}): number {
  const metricAppt = Math.max(0, Number(opts.metricAppt ?? 0) || 0)
  const scheduled = Math.max(0, Number(opts.scheduleHeads) || 0)
  const attended = Math.max(0, Number(opts.attended ?? 0) || 0)

  if (scheduled >= attended && scheduled > 0) {
    if (metricAppt >= attended && metricAppt > scheduled) return metricAppt
    return scheduled
  }
  if (metricAppt >= attended && metricAppt > 0) return metricAppt
  return Math.max(scheduled, metricAppt, attended)
}
