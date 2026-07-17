import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import {
  ensureFiscalSplitTable,
  getFiscalSplitSummary,
  getSplitStatus,
  importFiscalSplits,
  listFiscalSplits,
  type FiscalSplitRawPayload,
} from '@/lib/fiscal-split'

const MAX_SETTLEMENTS_PER_REQUEST = 1000

function monthRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    await ensureFiscalSplitTable()

    const month = req.nextUrl.searchParams.get('month')
    const fromParam = req.nextUrl.searchParams.get('from')
    const toParam = req.nextUrl.searchParams.get('to')

    let from = fromParam
    let to = toParam
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) return err('Parâmetro month inválido (esperado YYYY-MM)', 422)
      const range = monthRange(month)
      from = range.from
      to = range.to
    }
    if (!from || !to) return err('Informe month ou from/to', 422)

    const [status, summary, items] = await Promise.all([
      getSplitStatus(),
      getFiscalSplitSummary(from, to),
      listFiscalSplits(from, to),
    ])

    return ok({ status, summary, items, from, to })
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    await ensureFiscalSplitTable()

    const body = (await req.json().catch(() => ({}))) as {
      from?: string
      to?: string
      month?: string
      settlements?: FiscalSplitRawPayload[]
      source?: string
    }

    if (body.settlements && body.settlements.length > MAX_SETTLEMENTS_PER_REQUEST) {
      return err(`Máximo de ${MAX_SETTLEMENTS_PER_REQUEST} settlements por requisição`, 422)
    }

    let from = body.from
    let to = body.to
    if (body.month) {
      if (!/^\d{4}-\d{2}$/.test(body.month)) return err('Campo month inválido (esperado YYYY-MM)', 422)
      const range = monthRange(body.month)
      from = range.from
      to = range.to
    }

    const result = await importFiscalSplits({
      from,
      to,
      payloads: body.settlements,
      source: body.source ?? (body.settlements ? 'manual' : 'api'),
    })

    if (result.error && result.imported === 0) {
      // API fora / não configurada — financeiro não quebra; sinaliza pendência.
      return ok({ ...result, pending_reconciliation: true })
    }

    return ok(result)
  } catch (e) {
    return handleError(e)
  }
}
