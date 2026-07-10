import type { ReactivationClient } from './types'
import { buildClientWhatsAppMessage } from '@/lib/whatsapp/client-message'

/** Texto pronto para recall 0011 — WhatsApp Web (mensagem ao cliente). */
export function buildRecallWhatsAppMessage(
  client: ReactivationClient,
  professionalName: string
): string {
  return buildClientWhatsAppMessage({
    contact: { name: client.name },
    lastVisitDate: client.last_visit,
    professionalHint: professionalName,
    daysSinceVisit: client.days_since,
  })
}
