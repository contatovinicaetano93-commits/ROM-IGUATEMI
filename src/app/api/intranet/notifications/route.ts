import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { sanitizeRedirectPath } from '@/lib/auth-redirect'
import { listUnreadNotifications, markNotificationRead, markNotificationsRead } from '@/lib/cms'
import { readerKey, resolveFlowUser } from '@/lib/flow/from-session'
import { isNotificationId, notificationAudienceKeys } from '@/lib/intranet/notifications'

function mapNotification(item: { id: string; title: string; body: string; href: string | null; created_at: string }) {
  const href = item.href ? sanitizeRedirectPath(item.href, '') : ''
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    href: href || null,
    created_at: item.created_at,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  try {
    const user = await resolveFlowUser(auth.session)
    const reader = readerKey(auth.session)
    const audience = notificationAudienceKeys({
      readerKey: reader,
      panelRole: auth.session.role,
      flowRole: user.role,
      areaIds: user.areaIds,
    })
    const notifications = (await listUnreadNotifications(reader, audience)).map(mapNotification)
    return ok({ notifications, count: notifications.length })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao ler notificações', 500)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const reader = readerKey(auth.session)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)
  try {
    if (body.all === true) {
      await markNotificationsRead(reader)
      return ok({ ok: true })
    }
    const id = typeof body.id === 'string' ? body.id : ''
    if (!isNotificationId(id)) return err('Notificação inválida', 400)
    await markNotificationRead(reader, id)
    return ok({ ok: true })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao marcar notificação', 500)
  }
}
