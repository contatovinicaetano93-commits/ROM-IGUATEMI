import { NextRequest } from 'next/server'
import { err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { canAccessFolha } from '@/lib/folha/access'
import { buildFolhaWorkbook } from '@/lib/folha/export-xlsx'
import { loadOrCreateFolhaDraft } from '@/lib/folha/service'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)
    if (!canAccessFolha(auth.session)) return err('Acesso restrito à Folha de pagamento', 403)

    const panel = getRomPanelId()
    const periodParam = req.nextUrl.searchParams.get('period')?.trim()
    const onlyWithPay = req.nextUrl.searchParams.get('only_with_pay') === '1'

    const { draft } = await loadOrCreateFolhaDraft(panel, {
      periodId: periodParam || undefined,
      actor: auth.session.user,
    })

    if (!draft || draft.lines.length === 0) {
      return err('Sem olerite para exportar nesta quinzena', 404)
    }

    const { buffer, filename } = await buildFolhaWorkbook(draft, {
      panel,
      onlyWithPay,
    })

    return new Response(new Uint8Array(buffer), {
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
