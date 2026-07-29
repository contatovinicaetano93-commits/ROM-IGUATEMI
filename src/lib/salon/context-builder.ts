import { createHash } from 'crypto'
import type { ContactRow } from '@/lib/contacts'
import type { EnrichedService, Recommendation } from '@/lib/recommendations'
import { fetchContactKpis } from '@/lib/salon/kpis'
import { getSalonMetrics } from '@/lib/salon/metrics'
import { listActionItems } from '@/lib/salon/recommendations'
import { SALON_TIMEZONE, todayIso } from '@/lib/salon/format'
import { listTodaySchedules, pickLastVisit, type LastVisit } from '@/lib/services'
import { compareScheduleByTimeThenName } from '@/lib/salon/sort'

function fmtService(s: EnrichedService) {
  const parts = [s.name]
  if (s.product) parts.push(`(${s.product})`)
  if (s.cadence_days) parts.push(`a cada ${s.cadence_days}d`)
  if (s.state === 'overdue') parts.push(`ATRASADO ${Math.abs(s.days_until ?? 0)}d`)
  else if (s.state === 'due_soon') parts.push(`vence em ${s.days_until}d`)
  return parts.join(' ')
}

/** Sem preço: contexto IA/brief é staff (≠ admin financeiro). */
function fmtLastVisit(v: LastVisit | null): string | null {
  if (!v) return null
  const when = new Date(v.last_done_at).toLocaleDateString('pt-BR', {
    timeZone: SALON_TIMEZONE,
  })
  const parts = [when, v.service_name]
  if (v.professional_name) parts.push(`com ${v.professional_name}`)
  return parts.join(' · ')
}

export interface ContactContext {
  cliente: {
    nome: string | null
    status: string
    telefone: string | null
    notas: string | null
    manicure_preferida: string | null
    cabeleireiro_preferido: string | null
  }
  ultima_visita: string | null
  servicos: string[]
  recomendacoes: { tipo: string; titulo: string; detalhe: string }[]
}

export interface SalonContext {
  hoje: string
  salon: Awaited<ReturnType<typeof getSalonMetrics>>
  kpis_contato: Awaited<ReturnType<typeof fetchContactKpis>>
  playbook_top5: Awaited<ReturnType<typeof listActionItems>>
  agendamentos_proximos: Awaited<ReturnType<typeof listTodaySchedules>>
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
      manicure_preferida: contact.preferred_manicurist,
      cabeleireiro_preferido: contact.preferred_hairstylist,
    },
    ultima_visita: fmtLastVisit(pickLastVisit(services)),
    servicos: services.map(fmtService),
    recomendacoes: recs.map((r) => ({ tipo: r.type, titulo: r.title, detalhe: r.detail })),
  }
}

export async function buildSalonContext(): Promise<SalonContext> {
  const day = todayIso()
  const [salon, kpis_contato, playbook_top5, agendamentosRaw] = await Promise.all([
    getSalonMetrics(day),
    fetchContactKpis(7),
    listActionItems({ limit: 20 }),
    listTodaySchedules(day, 20),
  ])

  return {
    hoje: day,
    salon,
    kpis_contato,
    playbook_top5: playbook_top5.slice(0, 5),
    agendamentos_proximos: [...agendamentosRaw].sort(compareScheduleByTimeThenName).slice(0, 10),
  }
}

export function hashContactContext(contact: ContactRow, services: EnrichedService[], recs: Recommendation[]) {
  const last = pickLastVisit(services)
  const payload = JSON.stringify({
    status: contact.status,
    notes: contact.notes,
    preferred_manicurist: contact.preferred_manicurist,
    preferred_hairstylist: contact.preferred_hairstylist,
    ultima_visita: last
      ? {
          at: last.last_done_at,
          service: last.service_name,
          pro: last.professional_name,
        }
      : null,
    services: services.map((s) => ({
      id: s.id,
      state: s.state,
      scheduled_at: s.scheduled_at,
      last_done_at: s.last_done_at,
      professional_name: s.professional_name,
    })),
    recs: recs.map((r) => r.type + r.title),
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 24)
}

export function salonContextForAI(ctx: SalonContext) {
  // Bot Telegram da equipe: sem faturamento/ticket (staff ≠ admin financeiro).
  return JSON.stringify({
    data: ctx.hoje,
    salon: ctx.salon
      ? {
          agendamentos: ctx.salon.appointments,
          atendidos: ctx.salon.attended,
          no_shows: ctx.salon.no_shows,
          novos_clientes: ctx.salon.new_clients,
          retornos: ctx.salon.returning_clients,
        }
      : null,
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
