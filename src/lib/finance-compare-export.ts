import type { FinanceKpis, FinanceKpiBucket, FinanceDayPoint } from '@/lib/finance'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function num(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function pctPoints(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function deltaMoney(cur: number, prev: number): string {
  const d = cur - prev
  const sign = d > 0 ? '+' : ''
  return `${sign}${money(d)}`
}

/** Dia do mês (1–31) a partir de YYYY-MM-DD. */
export function dayOfMonth(isoDay: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay)
  return m ? Number(m[3]) : 0
}

export interface CompareBarSeries {
  label: string
  current: number
  previous: number
}

/** Métricas principais para barras agrupadas (R$). */
export function financeCompareMoneyBars(kpis: FinanceKpis): CompareBarSeries[] {
  const { current: c, previous: p } = kpis
  return [
    { label: 'Receita', current: c.revenue, previous: p.revenue },
    { label: 'Despesas', current: c.expenses, previous: p.expenses },
    { label: 'Fluxo', current: c.cash_flow, previous: p.cash_flow },
    { label: 'CMV', current: c.cmv, previous: p.cmv },
  ]
}

export interface DailyComparePoint {
  day: number
  current: number
  previous: number
}

/** Alinha receita diária dos dois meses pelo dia do calendário (1–31). */
export function alignDailyRevenue(
  current: FinanceDayPoint[],
  previous: FinanceDayPoint[],
): DailyComparePoint[] {
  const curMap = new Map(current.map((d) => [dayOfMonth(d.day), d.revenue]))
  const prevMap = new Map(previous.map((d) => [dayOfMonth(d.day), d.revenue]))
  const maxDay = Math.max(
    0,
    ...[...curMap.keys(), ...prevMap.keys()].filter((n) => n > 0),
  )
  const out: DailyComparePoint[] = []
  for (let d = 1; d <= maxDay; d++) {
    out.push({
      day: d,
      current: curMap.get(d) ?? 0,
      previous: prevMap.get(d) ?? 0,
    })
  }
  return out
}

function svgGroupedBars(
  series: CompareBarSeries[],
  curLabel: string,
  prevLabel: string,
  opts?: { height?: number; format?: 'money' | 'int' },
): string {
  const height = opts?.height ?? 220
  const width = 640
  const padL = 56
  const padR = 16
  const padT = 28
  const padB = 48
  const chartW = width - padL - padR
  const chartH = height - padT - padB
  const maxVal = Math.max(1, ...series.flatMap((s) => [s.current, s.previous]))
  const groupW = chartW / series.length
  const barW = Math.min(28, groupW * 0.32)

  const bars = series
    .map((s, i) => {
      const cx = padL + groupW * i + groupW / 2
      const hCur = (s.current / maxVal) * chartH
      const hPrev = (s.previous / maxVal) * chartH
      const yCur = padT + chartH - hCur
      const yPrev = padT + chartH - hPrev
      const labelY = height - 28
      return `
        <rect x="${cx - barW - 2}" y="${yPrev}" width="${barW}" height="${hPrev}" fill="#9ca3af" rx="2"/>
        <rect x="${cx + 2}" y="${yCur}" width="${barW}" height="${hCur}" fill="#b45309" rx="2"/>
        <text x="${cx}" y="${labelY}" text-anchor="middle" font-size="11" fill="#444">${escapeHtml(s.label)}</text>
      `
    })
    .join('')

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const y = padT + chartH * (1 - t)
    const v = maxVal * t
    const label =
      opts?.format === 'int'
        ? num(Math.round(v), 0)
        : v >= 1_000_000
          ? `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
          : v >= 1000
            ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`
            : num(v, 0)
    return `
      <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>
      <text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#666">${escapeHtml(label)}</text>
    `
  })

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Comparativo ${escapeHtml(curLabel)} vs ${escapeHtml(prevLabel)}">
    ${ticks.join('')}
    ${bars}
    <rect x="${padL}" y="${height - 14}" width="10" height="10" fill="#9ca3af"/>
    <text x="${padL + 14}" y="${height - 5}" font-size="11" fill="#444">${escapeHtml(prevLabel)}</text>
    <rect x="${padL + 110}" y="${height - 14}" width="10" height="10" fill="#b45309"/>
    <text x="${padL + 124}" y="${height - 5}" font-size="11" fill="#444">${escapeHtml(curLabel)}</text>
  </svg>`
}

function svgDailyLines(
  points: DailyComparePoint[],
  curLabel: string,
  prevLabel: string,
): string {
  if (points.length === 0) {
    return '<p style="color:#666;font-size:13px">Sem série diária para comparar.</p>'
  }
  const width = 640
  const height = 220
  const padL = 48
  const padR = 16
  const padT = 20
  const padB = 36
  const chartW = width - padL - padR
  const chartH = height - padT - padB
  const maxVal = Math.max(1, ...points.flatMap((p) => [p.current, p.previous]))

  const xAt = (i: number) =>
    padL + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW)
  const yAt = (v: number) => padT + chartH - (v / maxVal) * chartH

  const pathFor = (key: 'current' | 'previous') =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p[key]).toFixed(1)}`)
      .join(' ')

  const dayLabels = points
    .filter((_, i) => i === 0 || i === points.length - 1 || i % 5 === 4)
    .map((p) => {
      const i = points.findIndex((x) => x.day === p.day)
      return `<text x="${xAt(i)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#666">${p.day}</text>`
    })
    .join('')

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Receita diária">
    <line x1="${padL}" y1="${padT + chartH}" x2="${width - padR}" y2="${padT + chartH}" stroke="#e5e7eb"/>
    <path d="${pathFor('previous')}" fill="none" stroke="#9ca3af" stroke-width="2"/>
    <path d="${pathFor('current')}" fill="none" stroke="#b45309" stroke-width="2.5"/>
    ${dayLabels}
    <rect x="${padL}" y="4" width="10" height="10" fill="#9ca3af"/>
    <text x="${padL + 14}" y="13" font-size="11" fill="#444">${escapeHtml(prevLabel)}</text>
    <rect x="${padL + 110}" y="4" width="10" height="10" fill="#b45309"/>
    <text x="${padL + 124}" y="13" font-size="11" fill="#444">${escapeHtml(curLabel)}</text>
  </svg>`
}

function summaryRows(cur: FinanceKpiBucket, prev: FinanceKpiBucket): string {
  const rows: Array<[string, string, string, string]> = [
    ['Receita', money(cur.revenue), money(prev.revenue), deltaMoney(cur.revenue, prev.revenue)],
    [
      'Atendidos',
      num(cur.attended, 0),
      num(prev.attended, 0),
      num(cur.attended - prev.attended, 0),
    ],
    [
      'Ticket médio',
      money(cur.ticket_avg),
      money(prev.ticket_avg),
      cur.ticket_avg != null && prev.ticket_avg != null
        ? deltaMoney(cur.ticket_avg, prev.ticket_avg)
        : '—',
    ],
    ['Despesas', money(cur.expenses), money(prev.expenses), deltaMoney(cur.expenses, prev.expenses)],
    [
      'Margem bruta',
      pctPoints(cur.gross_margin),
      pctPoints(prev.gross_margin),
      cur.gross_margin != null && prev.gross_margin != null
        ? pctPoints(cur.gross_margin - prev.gross_margin)
        : '—',
    ],
    [
      'Fluxo',
      money(cur.cash_flow),
      money(prev.cash_flow),
      deltaMoney(cur.cash_flow, prev.cash_flow),
    ],
    ['CMV', money(cur.cmv), money(prev.cmv), deltaMoney(cur.cmv, prev.cmv)],
    [
      'Margem após CMV',
      pctPoints(cur.margin_after_cmv),
      pctPoints(prev.margin_after_cmv),
      cur.margin_after_cmv != null && prev.margin_after_cmv != null
        ? pctPoints(cur.margin_after_cmv - prev.margin_after_cmv)
        : '—',
    ],
  ]
  return rows
    .map(
      ([m, a, b, d]) =>
        `<tr><td>${escapeHtml(m)}</td><td>${escapeHtml(a)}</td><td>${escapeHtml(b)}</td><td>${escapeHtml(d)}</td></tr>`,
    )
    .join('')
}

/**
 * HTML imprimível do relatório financeiro comparativo.
 * Página 1: resumo em tabela. Página final: gráficos (page-break).
 */
export function buildFinanceComparePrintHtml(
  kpis: FinanceKpis,
  brandName = 'ROM',
): string {
  const { current: cur, previous: prev } = kpis
  const moneyBars = financeCompareMoneyBars(kpis)
  const volumeBars: CompareBarSeries[] = [
    { label: 'Atendidos', current: cur.attended, previous: prev.attended },
  ]
  const daily = alignDailyRevenue(cur.daily, prev.daily)
  const generated = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Financeiro ${escapeHtml(cur.label)} vs ${escapeHtml(prev.label)}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; margin: 28px; font-size: 13px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 22px 0 10px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
    th { background: #f9fafb; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    .chart-page { page-break-before: always; padding-top: 8px; }
    .chart-block { margin: 16px 0 28px; }
    .chart-caption { font-size: 12px; color: #555; margin: 0 0 8px; }
    @media print {
      body { margin: 16px; }
      .chart-page { page-break-before: always; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(brandName)} — Relatório financeiro</h1>
  <p class="meta">Período: <strong>${escapeHtml(cur.label)}</strong> vs <strong>${escapeHtml(prev.label)}</strong> · Gerado em ${escapeHtml(generated)}</p>

  <h2>Resumo comparativo</h2>
  <table>
    <thead>
      <tr>
        <th>Métrica</th>
        <th>${escapeHtml(cur.label)}</th>
        <th>${escapeHtml(prev.label)}</th>
        <th>Variação</th>
      </tr>
    </thead>
    <tbody>
      ${summaryRows(cur, prev)}
    </tbody>
  </table>

  <div class="chart-page">
    <h1>Gráficos — ${escapeHtml(cur.label)} vs ${escapeHtml(prev.label)}</h1>
    <p class="meta">Última página do relatório · valores em R$ (exceto atendidos)</p>

    <div class="chart-block">
      <h2>Receita, despesas, fluxo e CMV</h2>
      <p class="chart-caption">Barras cinza = ${escapeHtml(prev.label)} · barras âmbar = ${escapeHtml(cur.label)}</p>
      ${svgGroupedBars(moneyBars, cur.label, prev.label, { format: 'money' })}
    </div>

    <div class="chart-block">
      <h2>Atendidos</h2>
      ${svgGroupedBars(volumeBars, cur.label, prev.label, { height: 180, format: 'int' })}
    </div>

    <div class="chart-block">
      <h2>Receita diária (dia a dia do mês)</h2>
      <p class="chart-caption">Linha alinhada pelo dia do calendário (1–31)</p>
      ${svgDailyLines(daily, cur.label, prev.label)}
    </div>
  </div>

  <script>window.onload = function () { window.print(); }</script>
</body>
</html>`
}
