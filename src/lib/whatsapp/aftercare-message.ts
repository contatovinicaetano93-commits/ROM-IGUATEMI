import { getBrand } from '@/lib/brand'

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
  const link = (input.bookingLink ?? process.env.WHATSAPP_BOOKING_LINK ?? '').trim()
  if (link) {
    lines.push(`Quer já garantir o próximo horário? ${link}`)
  } else {
    lines.push('Quer já garantir o próximo horário? É só responder esta mensagem.')
  }
  return lines.join('\n\n')
}
