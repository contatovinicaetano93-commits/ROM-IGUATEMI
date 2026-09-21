'use client'

import { whatsAppUrl } from '@/lib/salon/format'
import { getRhWhatsAppNumber, RH_WHATSAPP_PREFILL } from '@/lib/intranet/rh-whatsapp'

/**
 * Bolinha RH → WhatsApp.
 * Mobile: acima da bottom nav. Desktop: canto inferior direito.
 * Fora do Flow (chrome próprio).
 */
export function RhWhatsAppFab() {
  const href = whatsAppUrl(getRhWhatsAppNumber(), RH_WHATSAPP_PREFILL)
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com o RH no WhatsApp"
      title="Falar com o RH no WhatsApp"
      className="fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-sm font-semibold tracking-[0.12em] text-background shadow-md transition-colors hover:bg-gold-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold bottom-[calc(4.5rem+env(safe-area-inset-bottom)+0.75rem)] lg:bottom-6 lg:right-6"
    >
      RH
    </a>
  )
}
