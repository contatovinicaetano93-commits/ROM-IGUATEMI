import { NextRequest, NextResponse } from 'next/server'
import { err, handleError, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { canAccessFolha } from '@/lib/folha/access'
import { applyFolhaTaxSpreadsheetToPeriod } from '@/lib/folha/service'
import { buildFolhaTaxSpreadsheetTemplate } from '@/lib/folha/tax-spreadsheet'

const MAX_BYTES = 2 * 1024 * 1024

/**
 * GET — baixa modelo .xlsx (Profissional | CNPJ | DARF | DAS | Mensalidade).
 * POST multipart — `file` (.xlsx) + `period_id` → preenche colunas na Folha (Q1).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)
    if (!canAccessFolha(auth.session)) {
      return err('Acesso restrito à Folha de pagamento', 403)
    }

    const { buffer, filename } = await buildFolhaTaxSpreadsheetTemplate()
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)
    if (!canAccessFolha(auth.session)) {
      return err('Acesso restrito à Folha de pagamento', 403)
    }

    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return err('Envie multipart/form-data com file + period_id', 415)
    }

    const form = await req.formData()
    const periodId = String(form.get('period_id') ?? '').trim()
    if (!periodId) return err('period_id obrigatório', 422)

    const file = form.get('file')
    if (!(file instanceof File) || file.size <= 0) {
      return err('Anexe a planilha .xlsx de impostos', 400)
    }
    if (file.size > MAX_BYTES) {
      return err('Arquivo acima de 2 MB', 413)
    }
    const name = (file.name || '').toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xlsm')) {
      return err('Formato inválido — use .xlsx', 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await applyFolhaTaxSpreadsheetToPeriod(getRomPanelId(), {
      periodId,
      buffer,
      actor: auth.session.user,
    })

    return ok({
      applied: result.report.applied,
      unmatched: result.report.unmatched,
      updated_names: result.report.updatedNames,
      mapped_headers: result.report.parsed.mapped,
      draft: result.draft,
      period_id: result.period.id,
      period_status: result.period.status,
    })
  } catch (e) {
    if (e instanceof Error) {
      if (/não encontrado/i.test(e.message)) return err(e.message, 404)
      if (
        /já pago|1ª quinzena|vazia|Nenhuma linha|cabeçalho|Formato/i.test(
          e.message,
        )
      ) {
        return err(e.message, 422)
      }
    }
    return handleError(e)
  }
}
