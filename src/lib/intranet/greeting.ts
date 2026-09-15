import { SALON_TIMEZONE } from '@/lib/salon/format'

export type DayGreeting = 'Bom dia' | 'Boa tarde' | 'Boa noite'

export function greetingPrefix(now = new Date(), timeZone = SALON_TIMEZONE): DayGreeting {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hour12: false }).format(now),
  )
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function firstName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim() ?? ''
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0] ?? trimmed
}

export function homeHeadline(displayName: string | null | undefined, now = new Date()): string {
  const prefix = greetingPrefix(now)
  const name = firstName(displayName)
  return name ? `${prefix}, ${name}!` : `${prefix}!`
}

export const HOME_TAGLINE = 'Grandes resultados nascem de grandes pessoas.'
export const HOME_QUOTE = 'Beleza é sobre pessoas.'
