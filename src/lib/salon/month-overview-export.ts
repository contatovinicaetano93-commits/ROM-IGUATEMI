import type { MonthOverview } from '@/lib/salon/month-overview'
import type { PeriodAnalytics } from '@/lib/salon/period-analytics'
import { statusLabelPt } from '@/lib/salon/month-metrics'

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvRow(...cols: Array<string | number | null | undefined>): string {
  return cols.map(csvEscape).join(';')
}

function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return ''
  return `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/** Já em pontos percentuais (0–100). */
function pctPoints(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return ''
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/** CSV overview do mês (ROM = fonte de fechamento). */
export function buildMonthOverviewCsv(overview: MonthOverview): string {
  const { finance: f, analytics: a, closing: c, completeness } = overview
  const lines: string[] = [
    csvRow('=== OVERVIEW DO MÊS — ROM ==='),
    csvRow('Unidade', overview.unit),
    csvRow('Mês', overview.label, overview.month),
    csvRow('Gerado em', overview.generated_at),
    csvRow('Status do fechamento', overview.status_label),
    csvRow(
      'Completude',
      `${completeness.days_present}/${completeness.days_expected} dias`,
      completeness.days_missing.length
        ? `Faltando: ${completeness.days_missing.join(', ')}`
        : 'Sem buracos no período checado',
    ),
    '',
    csvRow('=== FECHAMENTO ROM (soma diária) ==='),
    csvRow('Indicador', 'Valor'),
    csvRow('Receita', money(c.revenue)),
    csvRow('Atendidos', c.attended),
    csvRow('Ticket médio', money(c.ticket_avg)),
    csvRow('Cancelamentos', c.cancelled),
    csvRow('No-shows', c.no_shows),
    csvRow('Despesas', money(c.expenses)),
    csvRow('CMV (estoque)', money(c.cmv)),
    csvRow('Fluxo de caixa', money(c.cash_flow)),
    csvRow('Margem bruta %', f.gross_margin != null ? String(f.gross_margin).replace('.', ',') : ''),
    csvRow('Margem após CMV %', f.margin_after_cmv != null ? String(f.margin_after_cmv).replace('.', ',') : ''),
    '',
    csvRow('=== OPERAÇÃO / VISÃO ANALÍTICA ==='),
    csvRow('Indicador', 'Valor', 'Fonte'),
    csvRow('Ocupação média', a.occupancy_avg != null ? pct(a.occupancy_avg) : '', 'avec_snapshot'),
    csvRow('Receita perdida (est.)', money(a.lost_revenue), 'rom_daily'),
    csvRow('Pacotes vendidos', a.packages_sold, 'avec_snapshot'),
    csvRow('Receita pacotes', money(a.packages_revenue), 'avec_snapshot'),
    csvRow('Taxa de retorno', a.return_rate != null ? pct(a.return_rate) : '', 'avec_snapshot'),
    csvRow('Novos no período', a.new_clients_period, 'avec_snapshot'),
    csvRow('Snapshot ops (dia)', a.snapshot_day ?? '', 'avec_snapshot'),
    '',
    csvRow('=== FORMAS DE PAGAMENTO ==='),
    csvRow('Forma', 'Valor', 'Participação'),
    ...(f.payment_mix.length
      ? f.payment_mix.map((p) => csvRow(p.method, money(p.amount), pctPoints(p.share)))
      : [csvRow('(sem dados)')]),
    '',
    csvRow('=== RECEITA DIÁRIA ==='),
    csvRow('Dia', 'Receita', 'Atendidos'),
    ...(f.daily.length
      ? f.daily.map((d) => csvRow(d.day, money(d.revenue), d.attended))
      : [csvRow('(sem receita diária)')]),
    '',
    csvRow('=== TOP PROFISSIONAIS (snapshot) ==='),
    csvRow('Nome', 'Receita', 'Atendidos', 'Ocupação'),
    ...(a.top_professionals.length
      ? a.top_professionals.map((p) =>
          csvRow(p.name, money(p.revenue), p.attended, p.occupancy != null ? pct(p.occupancy) : ''),
        )
      : [csvRow('(sem dados)')]),
    '',
    csvRow('=== TOP SERVIÇOS (snapshot) ==='),
    csvRow('Serviço', 'Qtd', 'Receita'),
    ...(a.top_services.length
      ? a.top_services.map((s) => csvRow(s.name, s.quantity, money(s.revenue)))
      : [csvRow('(sem dados)')]),
    '',
    csvRow('=== CANAIS DE AGENDAMENTO (snapshot) ==='),
    csvRow('Canal', 'Qtd'),
    ...(a.booking_channels.length
      ? a.booking_channels.map((ch) => csvRow(ch.channel, ch.count))
      : [csvRow('(sem dados)')]),
    '',
    csvRow('=== AQUISIÇÃO (snapshot) ==='),
    csvRow('Canal', 'Clientes'),
    ...(a.acquisition.length
      ? a.acquisition.map((ch) => csvRow(ch.channel, ch.clients))
      : [csvRow('(sem dados)')]),
    '',
    csvRow('=== PACOTES (snapshot) ==='),
    csvRow('Pacote', 'Qtd', 'Receita'),
    ...(a.packages.length
      ? a.packages.map((p) => csvRow(p.name, p.quantity, money(p.revenue)))
      : [csvRow('(sem dados)')]),
    '',
    csvRow('=== FONTES DOS DADOS ==='),
    csvRow('Campo', 'Fonte', 'Nota'),
    ...overview.source_notes.map((n) => csvRow(n.field, n.source, n.note)),
    '',
    csvRow(
      'Observação',
      'ROM é a fonte de fechamento do mês. Atendidos = comandas/atendimentos (não clientes únicos).',
    ),
  ]
  return '\uFEFF' + lines.join('\n')
}

/** CSV só da Visão analítica (período). */
export function buildPeriodAnalyticsCsv(period: PeriodAnalytics, unit: string): string {
  const lines: string[] = [
    csvRow('=== VISÃO ANALÍTICA — ROM ==='),
    csvRow('Unidade', unit),
    csvRow('Mês', period.label, period.month),
    csvRow('Snapshot ops', period.snapshot_day ?? ''),
    '',
    csvRow('Indicador', 'Valor'),
    csvRow('Ocupação média', period.occupancy_avg != null ? pct(period.occupancy_avg) : ''),
    csvRow('Cancelamentos', period.cancelled),
    csvRow('No-shows', period.no_shows),
    csvRow('Ticket médio', money(period.ticket_avg)),
    csvRow('Receita perdida (est.)', money(period.lost_revenue)),
    csvRow('Pacotes vendidos', period.packages_sold),
    csvRow('Receita pacotes', money(period.packages_revenue)),
    csvRow('Taxa de retorno', period.return_rate != null ? pct(period.return_rate) : ''),
    csvRow('Novos no período', period.new_clients_period),
    '',
    csvRow('=== TOP SERVIÇOS ==='),
    csvRow('Serviço', 'Qtd', 'Receita'),
    ...period.top_services.map((s) => csvRow(s.name, s.quantity, money(s.revenue))),
    '',
    csvRow('=== TOP PROFISSIONAIS ==='),
    csvRow('Nome', 'Receita', 'Atendidos', 'Ocupação'),
    ...period.top_professionals.map((p) =>
      csvRow(p.name, money(p.revenue), p.attended, p.occupancy != null ? pct(p.occupancy) : ''),
    ),
    '',
    csvRow('=== CANAIS ==='),
    csvRow('Canal', 'Qtd'),
    ...period.booking_channels.map((ch) => csvRow(ch.channel, ch.count)),
    '',
    csvRow('=== AQUISIÇÃO ==='),
    csvRow('Canal', 'Clientes'),
    ...period.acquisition.map((ch) => csvRow(ch.channel, ch.clients)),
    '',
    csvRow('=== PACOTES ==='),
    csvRow('Pacote', 'Qtd', 'Receita'),
    ...period.packages.map((p) => csvRow(p.name, p.quantity, money(p.revenue))),
  ]
  return '\uFEFF' + lines.join('\n')
}

export function buildMonthOverviewPrintHtml(overview: MonthOverview): string {
  const { finance: f, analytics: a, completeness } = overview
  const missing =
    completeness.days_missing.length > 0
      ? `<p><strong>Dias faltando:</strong> ${completeness.days_missing.join(', ')}</p>`
      : '<p>Sem buracos no período checado.</p>'

  const row = (k: string, v: string) =>
    `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Overview ${escapeHtml(overview.label)} — ${escapeHtml(overview.unit)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; margin: 32px; line-height: 1.4; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; margin: 28px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 16px; }
  .badge { display: inline-block; padding: 2px 8px; border: 1px solid #333; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 8px; }
  td, th { text-align: left; padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; color: #666; }
  .note { font-size: 12px; color: #555; margin-top: 24px; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>Overview do mês — ${escapeHtml(overview.unit)}</h1>
  <div class="meta">
    <div>${escapeHtml(overview.label)} (${escapeHtml(overview.month)})</div>
    <div>Status: <span class="badge">${escapeHtml(overview.status_label)}</span>
      · ${completeness.days_present}/${completeness.days_expected} dias
    </div>
    <div>Gerado em ${escapeHtml(new Date(overview.generated_at).toLocaleString('pt-BR'))}</div>
  </div>
  ${missing}

  <h2>Fechamento ROM</h2>
  <table>
    ${row('Receita', money(overview.closing.revenue))}
    ${row('Atendidos', String(overview.closing.attended))}
    ${row('Ticket médio', money(overview.closing.ticket_avg))}
    ${row('Cancelamentos', String(overview.closing.cancelled))}
    ${row('No-shows', String(overview.closing.no_shows))}
    ${row('Despesas', money(overview.closing.expenses))}
    ${row('CMV', money(overview.closing.cmv))}
    ${row('Fluxo de caixa', money(overview.closing.cash_flow))}
    ${row('Margem bruta %', f.gross_margin != null ? String(f.gross_margin) : '—')}
  </table>

  <h2>Operação / Visão analítica</h2>
  <table>
    ${row('Ocupação média', a.occupancy_avg != null ? pct(a.occupancy_avg) : '—')}
    ${row('Receita perdida (est.)', money(a.lost_revenue))}
    ${row('Pacotes vendidos', String(a.packages_sold))}
    ${row('Receita pacotes', money(a.packages_revenue))}
    ${row('Taxa de retorno', a.return_rate != null ? pct(a.return_rate) : '—')}
    ${row('Novos no período', String(a.new_clients_period))}
    ${row('Snapshot ops', a.snapshot_day ?? '—')}
  </table>

  <h2>Receita diária</h2>
  <table>
    <tr><th>Dia</th><th>Receita</th><th>Atendidos</th></tr>
    ${
      f.daily.length
        ? f.daily.map((d) => `<tr><td>${escapeHtml(d.day)}</td><td>${escapeHtml(money(d.revenue))}</td><td>${d.attended}</td></tr>`).join('')
        : '<tr><td colspan="3">(sem dados)</td></tr>'
    }
  </table>

  <h2>Top serviços (snapshot)</h2>
  <table>
    <tr><th>Serviço</th><th>Qtd</th><th>Receita</th></tr>
    ${
      a.top_services.length
        ? a.top_services.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td>${s.quantity}</td><td>${escapeHtml(money(s.revenue))}</td></tr>`).join('')
        : '<tr><td colspan="3">(sem dados)</td></tr>'
    }
  </table>

  <h2>Top profissionais (snapshot)</h2>
  <table>
    <tr><th>Nome</th><th>Receita</th><th>Atendidos</th></tr>
    ${
      a.top_professionals.length
        ? a.top_professionals.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(money(p.revenue))}</td><td>${p.attended}</td></tr>`).join('')
        : '<tr><td colspan="3">(sem dados)</td></tr>'
    }
  </table>

  <p class="note">
    ROM é a fonte de fechamento. Indicadores marcados como snapshot Avec (ocupação, canais, pacotes, retorno)
    não são soma diária. Status ${escapeHtml(statusLabelPt(completeness.status))}.
    Atendidos = comandas/atendimentos (não clientes únicos).
  </p>
  <script>window.onload = function () { window.print(); }</script>
</body>
</html>`
}

export function buildPeriodAnalyticsPrintHtml(period: PeriodAnalytics, unit: string): string {
  const row = (k: string, v: string) =>
    `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Visão analítica ${escapeHtml(period.label)} — ${escapeHtml(unit)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; margin: 24px 0 8px; border-bottom: 1px solid #ccc; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { text-align: left; padding: 4px 6px; border-bottom: 1px solid #eee; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>Visão analítica — ${escapeHtml(unit)}</h1>
  <p>${escapeHtml(period.label)} · snapshot ${escapeHtml(period.snapshot_day ?? '—')}</p>
  <h2>Indicadores</h2>
  <table>
    ${row('Ocupação média', period.occupancy_avg != null ? pct(period.occupancy_avg) : '—')}
    ${row('Cancelamentos', String(period.cancelled))}
    ${row('No-shows', String(period.no_shows))}
    ${row('Ticket médio', money(period.ticket_avg))}
    ${row('Receita perdida', money(period.lost_revenue))}
    ${row('Pacotes vendidos', String(period.packages_sold))}
    ${row('Receita pacotes', money(period.packages_revenue))}
    ${row('Taxa de retorno', period.return_rate != null ? pct(period.return_rate) : '—')}
    ${row('Novos no período', String(period.new_clients_period))}
  </table>
  <h2>Top serviços</h2>
  <table>
    <tr><th>Serviço</th><th>Qtd</th><th>Receita</th></tr>
    ${period.top_services.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td>${s.quantity}</td><td>${escapeHtml(money(s.revenue))}</td></tr>`).join('')}
  </table>
  <h2>Top profissionais</h2>
  <table>
    <tr><th>Nome</th><th>Receita</th><th>Atendidos</th></tr>
    ${period.top_professionals.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(money(p.revenue))}</td><td>${p.attended}</td></tr>`).join('')}
  </table>
  <script>window.onload = function () { window.print(); }</script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Dispara download de CSV no browser. */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Abre HTML em nova janela e aciona diálogo de impressão (salvar como PDF). */
export function openPrintHtml(html: string) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}
