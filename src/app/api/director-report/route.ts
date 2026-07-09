import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { buildDirectorReport } from '@/lib/director-report/build'
import { reactivationCsv, returnCsv, revenueCsv } from '@/lib/director-report/csv'
import type { MonthKey, QuarterKey } from '@/lib/director-report/types'

function asMonth(v: string | null): MonthKey | undefined {
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return undefined
  return v as MonthKey
}

function asQuarter(v: string | null): QuarterKey | undefined {
  if (!v || !/^\d{4}-Q[1-4]$/.test(v)) return undefined
  return v as QuarterKey
}

/** GET /api/director-report — só admin. ?format=json|csv-revenue|csv-return|csv-reactivation */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { searchParams } = req.nextUrl
    const report = await buildDirectorReport({
      selectedMonth: asMonth(searchParams.get('month')),
      selectedQuarter: asQuarter(searchParams.get('quarter')),
      compareQuarter: asQuarter(searchParams.get('compare')),
      professionalId: searchParams.get('professional_id') ?? undefined,
      forceMock: searchParams.get('mock') === '1',
    })

    const format = searchParams.get('format') ?? 'json'
    if (format === 'json') return ok(report)

    let body = ''
    let filename = 'relatorio-diretoria.csv'
    if (format === 'csv-revenue') {
      body = revenueCsv(report)
      filename = 'faturamento-ticket-profissionais.csv'
    } else if (format === 'csv-return') {
      body = returnCsv(report)
      filename = 'retorno-clientes-trimestre.csv'
    } else if (format === 'csv-reactivation') {
      body = reactivationCsv(report)
      filename = 'lista-reativacao-por-profissional.csv'
    } else {
      return err('format inválido', 400)
    }

    return new Response('\uFEFF' + body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    return handleError(e)
  }
}

/** POST — disparo manual / cron (Bearer CRON_SECRET ou sessão admin). */
export async function POST(req: NextRequest) {
  try {
    const cron = process.env.CRON_SECRET?.trim()
    const authHeader = req.headers.get('authorization')
    const isCron = Boolean(cron && authHeader === `Bearer ${cron}`)

    if (!isCron) {
      const auth = await requireAdmin(req)
      if (!auth.ok) return err(auth.message, auth.status)
    }

    const report = await buildDirectorReport({ forceMock: true })
    // Fase 1: gera e registra. Envio e-mail/Telegram entra com destinatários da diretoria.
    console.info('[director-report] weekly run', {
      at: report.generated_at,
      professionals: report.summary.professionals,
      source: report.source,
      cron: isCron,
    })

    return ok({
      ran: true,
      generated_at: report.generated_at,
      professionals: report.summary.professionals,
      summary: report.summary,
      delivery: 'logged',
      note: 'Preview: relatório gerado. Configure destinatários para envio automático.',
    })
  } catch (e) {
    return handleError(e)
  }
}
