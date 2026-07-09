import type { DirectorReport, MonthKey, QuarterKey } from './types'

function esc(v: string | number | null | undefined) {
  const s = v == null ? '' : String(v)
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Planilha estilo FATURAMENTOVITOR: profissional × mês (faturamento + ticket). */
export function revenueCsv(report: DirectorReport, selectedMonth?: MonthKey) {
  const months = report.revenue_blocks[0]?.months.map((m) => m.month) ?? []
  const filtered = selectedMonth ? months.filter((m) => m === selectedMonth) : months
  const header = ['Profissional', ...filtered.flatMap((m) => [`Fat ${m}`, `Ticket ${m}`]), 'Total fat']
  const lines = [header.map(esc).join(';')]

  for (const block of report.revenue_blocks) {
    const byMonth = new Map(block.months.map((m) => [m.month, m]))
    let total = 0
    const cells: (string | number)[] = [block.professional.name]
    for (const m of filtered) {
      const row = byMonth.get(m)
      const rev = row?.revenue ?? 0
      total += rev
      cells.push(rev, row?.ticket_avg ?? 0)
    }
    cells.push(total)
    lines.push(cells.map(esc).join(';'))
  }
  return lines.join('\n')
}

/** Retorno 0011: profissional × trimestre + delta. */
export function returnCsv(report: DirectorReport, selectedQuarter?: QuarterKey) {
  const header = [
    'Profissional',
    'Trimestre',
    'Taxa retorno %',
    'Clientes',
    'Retornaram',
    'Δ vs anterior (p.p.)',
  ]
  const lines = [header.map(esc).join(';')]
  for (const block of report.return_blocks) {
    for (const q of block.quarters) {
      if (selectedQuarter && q.quarter !== selectedQuarter) continue
      lines.push(
        [
          block.professional.name,
          q.label,
          (q.return_rate * 100).toFixed(1),
          q.clients_total,
          q.clients_returned,
          q.delta_vs_prev ?? '',
        ]
          .map(esc)
          .join(';')
      )
    }
  }
  return lines.join('\n')
}

/** Lista de reativação por profissional. */
export function reactivationCsv(report: DirectorReport) {
  const header = ['Profissional', 'Cliente', 'Telefone', 'Última visita', 'Dias sem vir', 'Ação sugerida']
  const lines = [header.map(esc).join(';')]
  for (const block of report.return_blocks) {
    for (const c of block.reactivation) {
      lines.push(
        [
          block.professional.name,
          c.name,
          c.phone ?? '',
          c.last_visit,
          c.days_since,
          c.suggested_action,
        ]
          .map(esc)
          .join(';')
      )
    }
  }
  return lines.join('\n')
}
