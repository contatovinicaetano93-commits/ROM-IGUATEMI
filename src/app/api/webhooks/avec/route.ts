import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { verifyAvecWebhook } from '@/lib/webhooks'
import { ingestAvecWebhook } from '@/lib/avec/webhook-ingest'
import { isAuthorized } from '@/lib/auth'

/**
 * Webhook Avec — tempo real (push).
 * URL: https://rom-club.vercel.app/api/webhooks/avec
 * Header: x-avec-secret: <AVEC_WEBHOOK_SECRET>
 * (também aceita Authorization: Bearer … ou x-webhook-secret)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = verifyAvecWebhook(req)
    if (!auth.ok) return err(auth.reason, 401)

    const body = await req.json()
    const result = await ingestAvecWebhook(body)
    return ok(result)
  } catch (e) {
    return handleError(e)
  }
}

/** Status + instruções (admin logado ou secret). */
export async function GET(req: NextRequest) {
  try {
    const secretOk = verifyAvecWebhook(req).ok
    const sessionOk = await isAuthorized(req)
    if (!secretOk && !sessionOk) return err('Não autorizado', 401)

    const configured = Boolean(process.env.AVEC_WEBHOOK_SECRET?.trim())
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'rom-club.vercel.app'
    const proto = req.headers.get('x-forwarded-proto') ?? 'https'
    const url = `${proto}://${host}/api/webhooks/avec`

    return ok({
      configured,
      mode: 'realtime',
      url,
      headers: {
        preferred: 'x-avec-secret',
        also: ['Authorization: Bearer …', 'x-webhook-secret'],
      },
      events: [
        'client.upsert',
        'appointment.created',
        'appointment.updated',
        'appointment.cancelled',
        'service.completed',
      ],
      example: {
        event: 'appointment.created',
        client_id: '12345',
        name: 'Maria Silva',
        phone: '11999998888',
        service_name: 'Corte feminino',
        scheduled_at: '2026-07-10T14:00:00.000Z',
        professional_name: 'Walter',
        price: 180,
      },
      note:
        'Configure este URL no painel Avec (ou Zapier/Make bridge). Cron /api/avec/sync fica como backup.',
    })
  } catch (e) {
    return handleError(e)
  }
}
