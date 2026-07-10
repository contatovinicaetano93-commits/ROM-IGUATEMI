import { getSalonUnit } from '@/lib/salon/unit'
import type { Recommendation } from '@/lib/recommendations'

export interface ClientMessageContact {
  name: string | null
  preferred_manicurist?: string | null
  preferred_hairstylist?: string | null
}

export interface ClientMessageService {
  name: string
  category: string
  last_done_at: string | null
  scheduled_at: string | null
  professional_name?: string | null
}

interface LastHint {
  service_name: string
  last_done_at: string
  professional_name: string | null
}

function firstName(full: string | null | undefined) {
  if (!full?.trim()) return null
  return full.trim().split(/\s+/)[0] ?? null
}

function formatVisitDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
  })
}

function daysSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

function softHook(days: number) {
  if (days > 120) return 'faz um tempinho que não te vemos por aqui'
  if (days > 60) return 'sentimos sua falta por aqui'
  if (days > 30) return 'já está na hora de te receber de novo'
  return 'seria um prazer te receber novamente'
}

function pickLast(services: ClientMessageService[]): LastHint | null {
  let best: ClientMessageService | null = null
  for (const s of services) {
    if (!s.last_done_at) continue
    if (!best?.last_done_at || s.last_done_at > best.last_done_at) best = s
  }
  if (!best?.last_done_at) return null
  return {
    service_name: best.name,
    last_done_at: best.last_done_at,
    professional_name: best.professional_name ?? null,
  }
}

/** Inferência leve do que o cliente costuma buscar. */
function inferInterest(
  services: ClientMessageService[],
  last: LastHint | null,
  recs: Recommendation[]
): string | null {
  const overdue = recs.find((r) => r.type === 'overdue' || r.type === 'due_soon')
  if (overdue) {
    const name = overdue.title.replace(/\s+(atrasado|vencendo)$/i, '').trim()
    if (name) return name
  }

  if (last?.service_name) return last.service_name

  const scheduled = services.find((s) => s.scheduled_at)
  if (scheduled) return scheduled.name

  const byCat = (cat: string) => services.find((s) => s.category === cat)?.name
  return byCat('coloracao') ?? byCat('corte') ?? byCat('tratamento') ?? byCat('bem_estar') ?? services[0]?.name ?? null
}

function preferredProLine(contact: ClientMessageContact, interest: string | null): string | null {
  const nail =
    interest &&
    /mani|pedi|unha|nail|esmalte|gel|fibra|blindagem/i.test(interest)
  const hair =
    interest &&
    /corte|color|mecha|tintura|escova|hidrat|cabel/i.test(interest)

  if (nail && contact.preferred_manicurist) {
    return `Se quiser, já deixo com ${contact.preferred_manicurist}`
  }
  if (hair && contact.preferred_hairstylist) {
    return `Se quiser, já deixo com ${contact.preferred_hairstylist}`
  }
  if (contact.preferred_hairstylist) {
    return `Seu horário pode ser com ${contact.preferred_hairstylist}, se preferir`
  }
  if (contact.preferred_manicurist) {
    return `Seu horário pode ser com ${contact.preferred_manicurist}, se preferir`
  }
  return null
}

/**
 * Mensagem orgânica para o cliente (WhatsApp) — nunca usa briefing interno.
 * Tom de reativação / remarcar, com o que a pessoa costuma buscar.
 */
export function buildClientWhatsAppMessage(input: {
  contact: ClientMessageContact
  services?: ClientMessageService[]
  recommendations?: Recommendation[]
  /** Fallback quando só temos lista 0011 */
  lastVisitDate?: string | null
  professionalHint?: string | null
  daysSinceVisit?: number | null
}): string {
  const brand = getSalonUnit().name
  const nome = firstName(input.contact.name)
  const hi = nome ? `Oi, ${nome}` : 'Oi'
  const services = input.services ?? []
  const recs = input.recommendations ?? []
  const last =
    pickLast(services) ??
    (input.lastVisitDate
      ? {
          service_name: '',
          last_done_at: input.lastVisitDate,
          professional_name: input.professionalHint ?? null,
        }
      : null)

  const interest = inferInterest(services, last, recs)
  const days =
    input.daysSinceVisit ??
    (last?.last_done_at ? daysSince(last.last_done_at) : null)
  const proFromVisit = last?.professional_name ?? input.professionalHint ?? null
  const proLine = preferredProLine(input.contact, interest)

  const parts: string[] = []
  parts.push(`${hi}! Tudo bem? Aqui é do ${brand} ✨`)

  if (last?.last_done_at && last.service_name) {
    const when = formatVisitDate(last.last_done_at)
    const withPro = proFromVisit ? ` com ${proFromVisit}` : ''
    parts.push(
      `Lembrei de você — sua última vez foi ${last.service_name}${withPro}, em ${when}. ` +
        `${softHook(days ?? 45)}.`
    )
    if (interest && interest.toLowerCase() !== last.service_name.toLowerCase()) {
      parts.push(
        `Pensei em te oferecer um horário de ${interest} — combina com o que você costuma gostar.`
      )
    } else {
      parts.push(`Posso te ajudar a remarcar?`)
    }
  } else if (last?.last_done_at) {
    const when = formatVisitDate(last.last_done_at)
    const withPro = proFromVisit ? ` com ${proFromVisit}` : ''
    parts.push(
      `Lembrei de você — sua última visita${withPro} foi em ${when}. ${softHook(days ?? 45)}.`
    )
    if (interest) parts.push(`Posso te ajudar a remarcar um ${interest}?`)
    else parts.push(`Posso te ajudar a remarcar?`)
  } else if (interest) {
    parts.push(
      `Vi que você costuma buscar ${interest} com a gente e queria te ajudar a encaixar um horário.`
    )
  } else {
    parts.push(`Queremos te receber de novo e cuidar de você com carinho.`)
  }

  if (proLine) parts.push(`${proLine}.`)

  parts.push(`Me conta um dia/horário que funcione pra você que eu vejo por aqui 💛`)

  return parts.join('\n\n')
}
