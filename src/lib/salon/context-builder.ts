import { createHash } from 'crypto'
import type { ContactRow } from '@/lib/contacts'
import type { EnrichedService, Recommendation } from '@/lib/recommendations'
import { fetchContactKpis } from '@/lib/salon/kpis'
import { getSalonMetrics } from '@/lib/salon/metrics'
import { todayIso } from '@/lib/salon/format'
import { computeSalonIntelligence } from '@/lib/salon/intelligence'
import { getSalonUnit, unitContextLine } from '@/lib/salon/unit'
import { listActionItems } from '@/lib/salon/recommendations'
import { listSchedulesForDay } from '@/lib/services'

function fmtService(s: EnrichedService) {
  const parts = [s.name]
  if (s.product) parts.push(`(${s.product})`)
  if (s.cadence_days) parts.push(`a cada ${s.cadence_days}d`)
  if (s.state === 'overdue') parts.push(`ATRASADO ${Math.abs(s.days_until ?? 0)}d`)
  else if (s.state === 'due_soon') parts.push(`vence em ${s.days_until}d`)
  return parts.join(' ')
}

export interface ContactContext {
  cliente: {
    nome: string | null
    status: string
    telefone: string | null
    notas: string | null
  }
  servicos: string[]
  recomendacoes: { tipo: string; titulo: string; detalhe: string }[]
}

export interface SalonContext {
  hoje: string
  salon: Awaited<ReturnType<typeof getSalonMetrics>>
  kpis_contato: Awaited<ReturnType<typeof fetchContactKpis>>
  playbook_top5: Awaited<ReturnType<typeof listActionItems>>
  agendamentos_proximos: Awaited<ReturnType<typeof listSchedulesForDay>>
}

export function buildContactContext(
  contact: ContactRow,
  services: EnrichedService[],
  recs: Recommendation[]
): ContactContext {
  return {
    cliente: {
      nome: contact.name,
      status: contact.status,
      telefone: contact.phone,
      notas: contact.notes,
    },
    servicos: services.map(fmtService),
    recomendacoes: recs.map((r) => ({ tipo: r.type, titulo: r.title, detalhe: r.detail })),
  }
}

export async function buildSalonContext(): Promise<SalonContext> {
  const day = todayIso()
  const [salon, kpis_contato, playbook_top5, agendamentos_proximos] = await Promise.all([
    getSalonMetrics(day),
    fetchContactKpis(7),
    listActionItems(),
    listSchedulesForDay(day, 10),
  ])

  return {
    hoje: day,
    salon,
    kpis_contato,
    playbook_top5: playbook_top5.slice(0, 5),
    agendamentos_proximos,
  }
}

export function hashContactContext(contact: ContactRow, services: EnrichedService[], recs: Recommendation[]) {
  const payload = JSON.stringify({
    status: contact.status,
    notes: contact.notes,
    services: services.map((s) => ({
      id: s.id,
      state: s.state,
      scheduled_at: s.scheduled_at,
      last_done_at: s.last_done_at,
    })),
    recs: recs.map((r) => r.type + r.title),
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 24)
}

export function salonContextForAI(ctx: SalonContext) {
  const intel = computeSalonIntelligence(ctx.salon)
  const unit = getSalonUnit()

  return JSON.stringify({
    unidade: unitContextLine(unit),
    data: ctx.hoje,
    salon: ctx.salon
      ? {
          faturamento: ctx.salon.revenue,
          agendamentos: ctx.salon.appointments,
          atendidos: ctx.salon.attended,
          no_shows: ctx.salon.no_shows,
          ticket_medio: ctx.salon.ticket_avg,
          novos_clientes: ctx.salon.new_clients,
          retornos: ctx.salon.returning_clients,
        }
      : null,
    kpis_inteligentes: {
      taxa_comparecimento: intel.attendance_rate,
      receita_em_risco: intel.revenue_at_risk,
      meta_dia: intel.daily_goal,
      progresso_meta: intel.goal_progress,
      falta_meta: intel.goal_gap,
    },
    contatos: {
      por_status: ctx.kpis_contato.byStatus,
      conversao: ctx.kpis_contato.conversion,
    },
    playbook: ctx.playbook_top5.map((a) => ({
      cliente: a.contact_name,
      acao: a.recommendations[0]?.title,
      urgencia: a.urgency_score,
    })),
    agendamentos_hoje: ctx.agendamentos_proximos.map((s) => ({
      cliente: s.contact_name,
      servico: s.name,
      horario: s.scheduled_at,
    })),
  })
}

export function contactContextForAI(ctx: ContactContext) {
  return JSON.stringify(ctx)
}
