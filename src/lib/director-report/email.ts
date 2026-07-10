import { getBrand } from '@/lib/brand'
import type { DirectorReport, DirectorReportStage } from './types'
import { reactivationCsv, returnCompareCsv, revenueCompareCsv } from './csv'
import {
  labelMonth,
  orderMonths,
  reportSubject0011,
  reportSubject0021,
  slug0011,
  slug0021,
} from './period'
import { formatCurrency, formatPercent } from '@/lib/salon/format'

export function getDirectorReportRecipients() {
  const raw =
    process.env.DIRECTOR_REPORT_EMAIL?.trim() ||
    process.env.DIRECTOR_REPORT_TO?.trim() ||
    ''
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean)
}

export function isDirectorEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && getDirectorReportRecipients().length)
}

function toBase64(text: string) {
  return Buffer.from(text, 'utf8').toString('base64')
}

function mockBanner(report: DirectorReport) {
  if (report.source !== 'mock') return ''
  return `<p style="margin:0 0 16px;padding:10px 12px;background:#fff4ce;border:1px solid #e6c200;border-radius:8px;font-size:13px;color:#5c4b00"><b>DADOS DE DEMONSTRAÇÃO (mock)</b> — não usar para decisão financeira até o mapper Avec 0011/0021 estar ativo. Fonte interna: fixture / série sintética.</p>`
}

function html0011(report: DirectorReport) {
  const unitName = getBrand().displayName
  const rows = report.return_blocks
    .map((b) => {
      const sel = b.quarters.find((q) => q.quarter === report.period.selected_quarter)
      const cmp = b.quarters.find((q) => q.quarter === report.period.compare_quarter)
      const delta =
        sel && cmp ? Math.round((sel.return_rate - cmp.return_rate) * 1000) / 10 : null
      return { name: b.professional.name, sel, cmp, delta, n: b.reactivation.length }
    })
    .sort((a, b) => (b.sel?.return_rate ?? 0) - (a.sel?.return_rate ?? 0))
    .slice(0, 12)

  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${r.name}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatPercent(r.sel?.return_rate, 1)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatPercent(r.cmp?.return_rate, 1)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${r.delta == null ? '—' : `${r.delta > 0 ? '+' : ''}${r.delta} p.p.`}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${r.n}</td></tr>`
    )
    .join('')

  return `<!doctype html><html><body style="font-family:Georgia,serif;color:#1a1a1a;line-height:1.45">
  <p style="font-size:12px;color:#888;margin:0 0 4px">ETAPA 1 DE 2</p>
  ${mockBanner(report)}
  <h1 style="font-size:20px;margin:0 0 8px">${unitName} · Relatório 0011</h1>
  <p style="margin:0 0 4px;font-size:15px"><b>Comparativo trimestre a trimestre:</b> ${report.period.label_0011}</p>
  <p style="margin:0 0 16px;font-size:14px"><b>Data de referência:</b> ${report.period.reference_date}</p>
  <p><b>${report.summary.professionals}</b> profissionais · retorno médio <b>${formatPercent(report.summary.avg_return_rate, 1)}</b></p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:16px">
    <thead><tr style="text-align:left;color:#666">
      <th style="padding:6px 10px">Profissional</th>
      <th style="padding:6px 10px">${report.period.selected_quarter}</th>
      <th style="padding:6px 10px">${report.period.compare_quarter}</th>
      <th style="padding:6px 10px">Δ</th>
      <th style="padding:6px 10px">Lista clientes</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>
  <p style="margin-top:24px;font-size:12px;color:#666">Anexos: comparativo trimestre + lista 0011 (Cliente / E-mail / Telefone / Celular / Sexo / Data última comanda).</p>
  </body></html>`
}

function html0021(report: DirectorReport) {
  const unitName = getBrand().displayName
  const focus = report.period.selected_month
  const other = report.period.compare_month
  const compare = report.period.compare_months && Boolean(other)

  if (!compare || !other) {
    const rows = report.revenue_blocks
      .map((block) => {
        const row = block.months.find((m) => m.month === focus)
        return {
          name: block.professional.name,
          fat: row?.revenue ?? 0,
          tick: row?.ticket_avg ?? 0,
          attended: row?.attended ?? 0,
        }
      })
      .sort((x, y) => y.fat - x.fat)
      .slice(0, 12)

    const body = rows
      .map(
        (r) =>
          `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${r.name}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatCurrency(r.fat)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatCurrency(r.tick)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${r.attended}</td></tr>`
      )
      .join('')

    return `<!doctype html><html><body style="font-family:Georgia,serif;color:#1a1a1a;line-height:1.45">
  <p style="font-size:12px;color:#888;margin:0 0 4px">ETAPA 2 DE 2</p>
  ${mockBanner(report)}
  <h1 style="font-size:20px;margin:0 0 8px">${unitName} · Relatório 0021</h1>
  <p style="margin:0 0 4px;font-size:15px"><b>Mês:</b> ${labelMonth(focus)}</p>
  <p style="margin:0 0 16px;font-size:14px"><b>Data de referência:</b> ${report.period.reference_date}</p>
  <p>Fat. <b>${formatCurrency(report.summary.total_revenue_selected_month)}</b> · ticket médio <b>${formatCurrency(report.summary.avg_ticket_selected_month)}</b></p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:16px">
    <thead><tr style="text-align:left;color:#666">
      <th style="padding:6px 10px">Profissional</th>
      <th style="padding:6px 10px">Faturamento</th>
      <th style="padding:6px 10px">Ticket</th>
      <th style="padding:6px 10px">Atendimentos</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>
  <p style="margin-top:24px;font-size:12px;color:#666">Anexo: faturamento + ticket do mês (sem comparativo).</p>
  </body></html>`
  }

  const [older, newer] = orderMonths(focus, other)
  const rows = report.revenue_blocks
    .map((block) => {
      const by = new Map(block.months.map((m) => [m.month, m]))
      const ro = by.get(older)
      const rn = by.get(newer)
      return {
        name: block.professional.name,
        fatOlder: ro?.revenue ?? 0,
        tickOlder: ro?.ticket_avg ?? 0,
        fatNewer: rn?.revenue ?? 0,
        tickNewer: rn?.ticket_avg ?? 0,
      }
    })
    .sort((x, y) => y.fatNewer - x.fatNewer)
    .slice(0, 12)

  const body = rows
    .map((r) => {
      const delta = r.fatNewer - r.fatOlder
      return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${r.name}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatCurrency(r.fatOlder)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatCurrency(r.tickOlder)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatCurrency(r.fatNewer)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatCurrency(r.tickNewer)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${formatCurrency(delta)}</td></tr>`
    })
    .join('')

  return `<!doctype html><html><body style="font-family:Georgia,serif;color:#1a1a1a;line-height:1.45">
  <p style="font-size:12px;color:#888;margin:0 0 4px">ETAPA 2 DE 2</p>
  ${mockBanner(report)}
  <h1 style="font-size:20px;margin:0 0 8px">${unitName} · Relatório 0021</h1>
  <p style="margin:0 0 4px;font-size:15px"><b>Comparativo mês a mês:</b> ${report.period.label_0021}</p>
  <p style="margin:0 0 8px;font-size:13px;color:#666">Δ Fat = mês mais recente − mês anterior (crescimento positivo em verde)</p>
  <p style="margin:0 0 16px;font-size:14px"><b>Data de referência:</b> ${report.period.reference_date}</p>
  <p>Fat. mês foco <b>${formatCurrency(report.summary.total_revenue_selected_month)}</b> · ticket médio <b>${formatCurrency(report.summary.avg_ticket_selected_month)}</b></p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:16px">
    <thead><tr style="text-align:left;color:#666">
      <th style="padding:6px 10px">Profissional</th>
      <th style="padding:6px 10px">Fat ${labelMonth(older)}</th>
      <th style="padding:6px 10px">Ticket ${labelMonth(older)}</th>
      <th style="padding:6px 10px">Fat ${labelMonth(newer)}</th>
      <th style="padding:6px 10px">Ticket ${labelMonth(newer)}</th>
      <th style="padding:6px 10px">Δ Fat</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>
  <p style="margin-top:24px;font-size:12px;color:#666">Anexo: comparativo mês a mês (faturamento + ticket médio).</p>
  </body></html>`
}

async function sendOne(
  report: DirectorReport,
  stage: '0011' | '0021'
): Promise<{ ok: boolean; to: string[]; id?: string; error?: string; subject?: string; stage: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const to = getDirectorReportRecipients()
  const from =
    process.env.DIRECTOR_REPORT_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    `${getBrand().displayName} <onboarding@resend.dev>`

  if (!apiKey) return { ok: false, to, error: 'RESEND_API_KEY não configurado', stage }
  if (to.length === 0) return { ok: false, to, error: 'DIRECTOR_REPORT_EMAIL não configurado', stage }

  const subject = stage === '0011' ? reportSubject0011(report) : reportSubject0021(report)
  const slug = stage === '0011' ? slug0011(report) : slug0021(report)
  const html = stage === '0011' ? html0011(report) : html0021(report)
  const attachments =
    stage === '0011'
      ? [
          {
            filename: `0011-comparativo-trimestre_${slug}.csv`,
            content: toBase64('\uFEFF' + returnCompareCsv(report)),
          },
          {
            filename: `0011-lista-clientes_${slug}.csv`,
            content: toBase64('\uFEFF' + reactivationCsv(report)),
          },
        ]
      : [
          {
            filename: `0021-comparativo-mes_${slug}.csv`,
            content: toBase64('\uFEFF' + revenueCompareCsv(report)),
          },
        ]

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, attachments }),
  })

  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
  if (!res.ok) {
    return { ok: false, to, error: json.message ?? `Resend HTTP ${res.status}`, subject, stage }
  }
  return { ok: true, to, id: json.id, subject, stage }
}

/** Envia 1 ou 2 e-mails conforme a etapa. */
export async function sendDirectorReportEmail(
  report: DirectorReport,
  stage: DirectorReportStage = 'all'
) {
  const results: Awaited<ReturnType<typeof sendOne>>[] = []

  if (stage === '0011' || stage === 'all') {
    results.push(await sendOne(report, '0011'))
  }
  if (stage === '0021' || stage === 'all') {
    results.push(await sendOne(report, '0021'))
  }

  const ok = results.every((r) => r.ok)
  const to = results[0]?.to ?? getDirectorReportRecipients()
  return {
    ok,
    to,
    stages: results,
    id: results.map((r) => r.id).filter(Boolean).join(','),
    error: results
      .filter((r) => !r.ok)
      .map((r) => `${r.stage}: ${r.error}`)
      .join(' · ') || undefined,
    subject: results.map((r) => r.subject).filter(Boolean).join(' | '),
  }
}
