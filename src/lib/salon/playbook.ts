import type { AuthRole } from '@/lib/auth'
import type { RecommendationType } from '@/lib/recommendations'
import type { ActionItem } from '@/lib/salon/recommendations'
import { compareByOverdueThenName } from '@/lib/salon/urgency'

/** Tipos operacionais da recepção (reagendar / confirmar). */
const STAFF_REC_TYPES: RecommendationType[] = ['overdue', 'due_soon', 'scheduled']

const PLAYBOOK_LIMIT = 8

export type PlaybookAudience = 'staff' | 'admin'

export function playbookAudience(role: AuthRole): PlaybookAudience {
  return role === 'staff' ? 'staff' : 'admin'
}

/** Subtítulo da seção — recepção vs gestão. */
export function playbookFocusLabel(audience: PlaybookAudience): string {
  if (audience === 'staff') return 'Recepção — reagendar e confirmar'
  return 'Gestão — prioridades do salão'
}

function staffScore(item: ActionItem): number {
  // Recepção: atrasados + o que vence + agenda de hoje (encaixe no balcão).
  return (
    item.max_overdue_days * 1000 +
    item.overdue * 100 +
    item.scheduled_today * 80 +
    item.due_soon * 40 +
    item.scheduled_soon * 5
  )
}

function adminScore(item: ActionItem): number {
  // Gestão: score de urgência + upsell/cross-sell já embutidos em recommendations.
  return item.urgency_score * 10 + item.recommendations.length
}

/**
 * Fatia e prioriza o playbook do dia por papel.
 * Staff (recepção): só ações de contato (atrasado / vencendo / agendado).
 * Admin (gestão): lista completa (inclui upsell/cross-sell), por urgência.
 */
export function slicePlaybookForRole(
  items: ActionItem[],
  role: AuthRole,
): { items: ActionItem[]; audience: PlaybookAudience; focus: string } {
  const audience = playbookAudience(role)

  if (audience === 'staff') {
    const sliced = items
      .map((item) => {
        const operational = item.recommendations.filter((r) =>
          STAFF_REC_TYPES.includes(r.type as RecommendationType),
        )
        const hasOps =
          operational.length > 0 ||
          item.overdue > 0 ||
          item.due_soon > 0 ||
          item.scheduled_today > 0
        if (!hasOps) return null
        return {
          ...item,
          recommendations: operational.length > 0 ? operational : item.recommendations.slice(0, 1),
        }
      })
      .filter((x): x is ActionItem => x != null)
      .sort((a, b) => {
        const byScore = staffScore(b) - staffScore(a)
        if (byScore !== 0) return byScore
        return compareByOverdueThenName(
          { max_overdue_days: a.max_overdue_days, name: a.contact_name },
          { max_overdue_days: b.max_overdue_days, name: b.contact_name },
        )
      })
      .slice(0, PLAYBOOK_LIMIT)

    return { items: sliced, audience, focus: playbookFocusLabel(audience) }
  }

  const sliced = [...items]
    .sort((a, b) => {
      const byScore = adminScore(b) - adminScore(a)
      if (byScore !== 0) return byScore
      return compareByOverdueThenName(
        { max_overdue_days: a.max_overdue_days, name: a.contact_name },
        { max_overdue_days: b.max_overdue_days, name: b.contact_name },
      )
    })
    .slice(0, PLAYBOOK_LIMIT)

  return { items: sliced, audience, focus: playbookFocusLabel(audience) }
}
