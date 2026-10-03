import { NextRequest } from 'next/server'
import { z } from 'zod'
import { err, handleError, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { canAccessFolha } from '@/lib/folha/access'
import { ingestFolhaTaxEmail } from '@/lib/folha/service'

const bodySchema = z.object({
  period_id: z.string().min(1),
  subject: z.string().optional().nullable(),
  body: z.string().min(1),
  apply_to_line: z.boolean().optional(),
})

/**
 * Ingesta texto de e-mail fiscal (paste manual).
 * Cron IMAP: GET /api/folha/imap-poll (FOLHA_IMAP_*).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)
    if (!canAccessFolha(auth.session)) return err('Acesso restrito à Folha de pagamento', 403)

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return err(parsed.error.issues.map((i) => i.message).join(', '), 422)

    const result = await ingestFolhaTaxEmail(getRomPanelId(), {
      periodId: parsed.data.period_id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      applyToLine: parsed.data.apply_to_line,
      actor: auth.session.user,
      source: 'paste',
    })

    return ok({
      parsed: result.parsed,
      document_id: result.documentId,
      applied: result.applied,
      draft: result.draft,
      period_id: result.period.id,
      period_status: result.period.status,
    })
  } catch (e) {
    if (e instanceof Error && /não encontrado/i.test(e.message)) {
      return err(e.message, 404)
    }
    return handleError(e)
  }
}
