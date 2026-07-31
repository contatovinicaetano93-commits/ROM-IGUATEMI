import { getBrand } from '@/lib/brand'

/**
 * Link de remarcação no aftercare.
 * Recusa links claramente do BR — evita env herdado (WHATSAPP_BOOKING_LINK do rom-club)
 * mandar cliente Iguatemi remarcar na unidade errada.
 */
export function resolveAftercareBookingLink(explicit?: string | null): string {
  const link = (explicit ?? process.env.WHATSAPP_BOOKING_LINK ?? '').trim()
  if (!link) return ''
  let decoded = link
  try {
    decoded = decodeURIComponent(link)
  } catch {
    // link malformado — ainda testa o raw
  }
  const haystack = `${link}\n${decoded}`
  if (/\bbrasil\b|av\.?\s*brasil|40613|rom[-_]?club[-_]?brasil/i.test(haystack)) {
    return ''
  }
  return link
}

export function buildAftercareWhatsAppMessage(input: {
  contactName: string | null
  serviceName: string
  cadenceDays: number | null
  bookingLink?: string | null
}): string {
  const brand = getBrand()
  const first = (input.contactName ?? '').trim().split(/\s+/)[0] || 'oi'
  const lines = [
    `Oi, ${first}! Esperamos que tenha gostado da experiência ${brand.displayName} no ${input.serviceName}.`,
  ]
  if (input.cadenceDays != null && input.cadenceDays > 0) {
    lines.push(`Seu retorno ideal costuma ser em cerca de ${input.cadenceDays} dias.`)
  }
  const link = resolveAftercareBookingLink(input.bookingLink)
  if (link) {
    lines.push(`Quer já garantir o próximo horário? ${link}`)
  } else {
    lines.push('Quer já garantir o próximo horário? É só responder esta mensagem.')
  }
  return lines.join('\n\n')
}
