import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { listUnreadNotifications, markNotificationsRead, listPublishedPosts } from '@/lib/cms'
import { loadWeekKpis } from '@/lib/intranet/load-week-kpis'
import { readerKey, resolveFlowUser } from '@/lib/flow/from-session'
import { listVisibleExpenses } from '@/lib/flow/store'
import { allowedActions, isAdminInbox, isSolicitanteInbox } from '@/lib/flow/workflow'

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  try {
    const user = await resolveFlowUser(auth.session)
    const canViewRevenue = auth.session.can_view_revenue
    const [kpis, posts, notifications, expenses] = await Promise.all([
      loadWeekKpis({ includeRevenue: canViewRevenue }),
      listPublishedPosts(),
      listUnreadNotifications(readerKey(auth.session)),
      listVisibleExpenses(user).catch(() => []),
    ])
    const tasks = expenses
      .filter((expense) =>
        user.role === 'solicitante' ? isSolicitanteInbox(expense) : isAdminInbox(expense),
      )
      .slice(0, 8)
      .map((expense) => ({
        id: expense.id,
        title: expense.title,
        area: expense.area,
        status: expense.status,
        href: `/flow/${expense.id}`,
        actions: allowedActions(user, expense),
      }))
    return ok({
      greetingName: auth.session.displayName,
      can_view_revenue: canViewRevenue,
      canPublish: auth.session.canPublish || auth.session.role === 'admin' || auth.session.role === 'mkt',
      kpis: canViewRevenue ? kpis : { ...kpis, revenue: null },
      posts,
      notifications,
      tasks,
    })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao carregar a intranet', 500)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  await markNotificationsRead(readerKey(auth.session))
  return ok({ ok: true })
}
