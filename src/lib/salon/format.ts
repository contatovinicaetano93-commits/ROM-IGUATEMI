export const SALON_TIMEZONE = 'America/Sao_Paulo'

/** Data calendária de hoje no fuso do salão (YYYY-MM-DD). */
export function todayIso(timeZone = SALON_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** YYYY-MM-DD no fuso do salão a partir de ISO/Date (não usar slice UTC). */
export function toSalonDateIso(
  value: string | Date | null | undefined,
  timeZone = SALON_TIMEZONE,
): string | null {
  if (value == null || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Valor para `<input type="datetime-local">` no fuso do salão (não UTC). */
export function toDatetimeLocalValue(
  value: string | Date,
  timeZone = SALON_TIMEZONE,
): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/**
 * Interpreta `datetime-local` (parede SP) como instante ISO UTC.
 * Brasil sem DST desde 2019 → offset fixo −03:00.
 */
export function fromDatetimeLocalValue(local: string): string {
  const m = local.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
  if (!m) return new Date(local).toISOString()
  const iso = `${m[1]}T${m[2]}:${m[3]}:00-03:00`
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? new Date(local).toISOString() : parsed.toISOString()
}

export function fmtSchedule(iso: string) {
  const d = new Date(iso)
  const timeOpts: Intl.DateTimeFormatOptions = {
    timeZone: SALON_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }
  if (toSalonDateIso(d) === todayIso()) {
    return `Hoje, ${d.toLocaleTimeString('pt-BR', timeOpts)}`
  }
  return d.toLocaleString('pt-BR', {
    timeZone: SALON_TIMEZONE,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Partes do horário pra cards de agenda (hora em destaque). */
export function fmtScheduleParts(iso: string, timeZone = SALON_TIMEZONE) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  })
  const dayIso = toSalonDateIso(d, timeZone)
  const isToday = dayIso === todayIso(timeZone)
  const day = isToday
    ? 'Hoje'
    : d.toLocaleDateString('pt-BR', {
        timeZone,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      })
  return { time, day, isToday }
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Número pt-BR com casas decimais (ex.: 2.111.249,31). */
export function formatNumberBr(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Percentual pt-BR (ex.: 45,2%). Valor já em pontos percentuais (0–100), não fração. */
export function formatPercentPoints(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`
}

/** YYYY-MM-DD → DD/MM/YYYY para relatórios. */
export function formatDateBr(iso: string | null | undefined) {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

export function formatVisitDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: SALON_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatPercent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

function whatsAppDigits(phone: string | null): string | null {
  if (!phone) return null
  const hasPlus = phone.trim().startsWith('+')
  let digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return null
  // Já BR com DDI, ou E.164 com + (ex.: +1 NANP) — não prefixar 55 de novo.
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (hasPlus && digits.length >= 11) return digits
  // Celular BR local sem DDI → assume 55
  if (digits.length <= 11 && !digits.startsWith('55')) digits = `55${digits}`
  return digits
}

/** Link genérico (app ou web). */
export function whatsAppUrl(phone: string | null, text?: string) {
  const digits = whatsAppDigits(phone)
  if (!digits) return null
  const base = `https://wa.me/${digits}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

/** Abre WhatsApp Web com mensagem pronta. */
export function whatsAppWebUrl(phone: string | null, text?: string) {
  const digits = whatsAppDigits(phone)
  if (!digits) return null
  const base = `https://web.whatsapp.com/send?phone=${digits}`
  return text ? `${base}&text=${encodeURIComponent(text)}` : base
}
