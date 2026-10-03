import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { checksHomeSummary } from '@/lib/checks-diario/service'
import { listUnreadNotifications, markNotificationsRead, listPublishedPosts } from '@/lib/cms'
import { loadWeekKpis } from '@/lib/intranet/load-week-kpis'
import { notificationAudienceKeys } from '@/lib/intranet/notifications'
import { readerKey, resolveFlowUser } from '@/lib/flow/from-session'
import { listVisibleExpenses } from '@/lib/flow/store'
import { allowedActions, isAdminInbox, isSolicitanteInbox } from '@/lib/flow/workflow'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  try {
    const user = await resolveFlowUser(auth.session)
    const canViewRevenue = auth.session.can_view_revenue
    const reader = readerKey(auth.session)
    const audience = notificationAudienceKeys({
      readerKey: reader,
      panelRole: auth.session.role,
      flowRole: user.role,
      areaIds: user.areaIds,
    })
    const [kpis, posts, notifications, expenses] = await Promise.all([
      loadWeekKpis({ includeRevenue: canViewRevenue }),
      listPublishedPosts(),
      listUnreadNotifications(reader, audience),
      listVisibleExpenses(user).catch(() => []),
    ])
    const flowTasks = expenses
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
    const tasks: Array<{
      id: string
      title: string
      area: string
      status: string
      href: string
      actions: ReturnType<typeof allowedActions>
    }> = [...flowTasks]
    const role = auth.session.role as 'admin' | 'staff' | 'financeiro' | 'estoque' | 'mkt'
    if (hasPanelModule(role, parseGrantableModules(auth.session.modules), 'checks_diario')) {
      const checks = await checksHomeSummary(auth.session).catch(() => null)
      if (checks) {
        tasks.unshift({
          id: 'checks-diario-home',
          title: checks.label,
          area: 'checks',
          status: checks.pending > 0 ? 'pendente' : 'ok',
          href: checks.href,
          actions: [],
        })
      }
    }

    return ok({
      greetingName: auth.session.displayName,
      can_view_revenue: canViewRevenue,
      canPublish: auth.session.canPublish || auth.session.role === 'admin' || auth.session.role === 'mkt',
      kpis: canViewRevenue ? kpis : { ...kpis, revenue: null },
      posts,
      notifications,
      tasks,
      areas: user.areaIds,
    })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao carregar a intranet', 500)
  }
}

export async function POST(req: NextRequest) {
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
    await markNotificationsRead(reader, audience)
    return ok({ ok: true })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao marcar notificação', 500)
  }
}
