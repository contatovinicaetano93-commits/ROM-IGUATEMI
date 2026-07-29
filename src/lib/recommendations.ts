import type { ClientService } from '@/lib/services'
import { DAY_MS, DUE_SOON_DAYS, SCHEDULED_SOON_DAYS } from '@/lib/salon/constants'
import { fmtSchedule } from '@/lib/salon/format'

export type ServiceState = 'overdue' | 'due_soon' | 'ok' | 'no_cadence'

export interface EnrichedService extends ClientService {
  next_due_at: string | null
  days_until: number | null
  state: ServiceState
}

export type RecommendationType = 'overdue' | 'due_soon' | 'scheduled' | 'upsell' | 'crosssell'

export interface Recommendation {
  type: RecommendationType
  title: string
  detail: string
}

// Enriquece cada serviço com o próximo vencimento e o estado (atrasado/vencendo/ok).
// Baseline = última visita real (last_done_at). Sem ela, NÃO usa created_at do sync
// (isso zerava a fila Atrasados após import/sync recente).
export function enrichServices(services: ClientService[]): EnrichedService[] {
  const now = Date.now()
  return services.map((s) => {
    if (!s.cadence_days) {
      return { ...s, next_due_at: null, days_until: null, state: 'no_cadence' as const }
    }

    if (!s.last_done_at) {
      const hasFutureSchedule =
        !!s.scheduled_at && new Date(s.scheduled_at).getTime() >= now
      if (hasFutureSchedule) {
        return { ...s, next_due_at: null, days_until: null, state: 'ok' as const }
      }
      return {
        ...s,
        next_due_at: null,
        days_until: -s.cadence_days,
        state: 'overdue' as const,
      }
    }

    const baseline = new Date(s.last_done_at).getTime()
    const nextDue = baseline + s.cadence_days * DAY_MS
    const daysUntil = Math.round((nextDue - now) / DAY_MS)
    const state: ServiceState =
      daysUntil < 0 ? 'overdue' : daysUntil <= DUE_SOON_DAYS ? 'due_soon' : 'ok'
    return { ...s, next_due_at: new Date(nextDue).toISOString(), days_until: daysUntil, state }
  })
}

// Gera recomendações guiadas de ação (o que fazer AGORA com esse cliente).
export function computeRecommendations(enriched: EnrichedService[]): Recommendation[] {
  const recs: Recommendation[] = []
  const has = (cat: string) => enriched.some((s) => s.category === cat)
  const now = Date.now()

  // 0) Agendamentos confirmados nos próximos N dias
  for (const s of enriched) {
    if (!s.scheduled_at) continue
    const t = new Date(s.scheduled_at).getTime()
    if (t < now) continue
    const daysUntil = Math.round((t - now) / DAY_MS)
    if (daysUntil <= SCHEDULED_SOON_DAYS) {
      recs.push({
        type: 'scheduled',
        title: `${s.name} agendado`,
        detail:
          daysUntil === 0
            ? `${fmtSchedule(s.scheduled_at)} — confirme com o cliente e prepare a equipe.`
            : `${fmtSchedule(s.scheduled_at)} — em ${daysUntil} dia(s).`,
      })
    }
  }

  // 1) Recorrências atrasadas / vencendo (prioridade máxima)
  for (const s of enriched) {
    if (s.state === 'overdue') {
      const missingVisit = !s.last_done_at
      recs.push({
        type: 'overdue',
        title: `${s.name} atrasado`,
        detail: missingVisit
          ? `Sem última visita registrada. Priorize confirmar retorno${
              s.product ? ` e repor ${s.product}` : ''
            }.`
          : `Previsto há ${Math.abs(s.days_until ?? 0)} dia(s). Priorize reagendar${
              s.product ? ` e reponha ${s.product}` : ''
            }.`,
      })
    } else if (s.state === 'due_soon') {
      recs.push({
        type: 'due_soon',
        title: `${s.name} vencendo`,
        detail: `Vence em ${s.days_until} dia(s). Bom momento pra confirmar o próximo horário.`,
      })
    }
  }

  // 2) Up-sell: se faz corte e tem tratamento, encaixar o tratamento no mesmo horário
  const tratamento = enriched.find((s) => s.category === 'tratamento')
  if (has('corte') && tratamento) {
    recs.push({
      type: 'upsell',
      title: 'Up-sell no corte',
      detail: `No corte, ofereça ${tratamento.product ?? tratamento.name} — combina com a rotina do cliente.`,
    })
  }

  // 3) Cross-sell: bem-estar (massagem etc.) pra agendar junto
  const bemEstar = enriched.find((s) => s.category === 'bem_estar')
  if (bemEstar) {
    recs.push({
      type: 'crosssell',
      title: 'Cross-sell de bem-estar',
      detail: `Sugira encaixar ${bemEstar.name}${
        bemEstar.days_until !== null && bemEstar.days_until <= 14 ? ' — já está perto do ciclo.' : '.'
      }`,
    })
  }

  // 4) Cross-sell: faz corte mas não tem coloração cadastrada
  if (has('corte') && !has('coloracao')) {
    recs.push({
      type: 'crosssell',
      title: 'Oportunidade de coloração',
      detail: 'Cliente faz corte e não registra coloração — vale oferecer uma avaliação.',
    })
  }

  return recs
}
