/**
 * Cadência do cron IMAP Folha.
 *
 * Vercel só aceita cron estático — a cada 10 min dispara sempre.
 * A rota conecta na caixa 1×/dia; nos 5 dias até o pagamento Q1 (dia 20)
 * e Q2 (dia 05) passa a cada 10 min.
 */
import type { RomPanelId } from '@/lib/brand'
import { defaultFolhaTaxQuinzena, listRecentQuinzenas } from '@/lib/folha/period'

export const FOLHA_IMAP_PAY_WATCH_LEAD_DAYS = 5
export const FOLHA_IMAP_CRON_DAILY_UTC_HOUR = 12
export const FOLHA_IMAP_CRON_DAILY_UTC_MINUTE: Record<RomPanelId, number> = {
  brasil: 0,
  iguatemi: 10,
}

export type FolhaImapCronCadence = 'frequent' | 'daily'
export type FolhaImapCronTrigger = 'pay_watch' | 'daily_slot' | 'manual' | 'skip'

export type FolhaImapCronWindow = {
  cadence: FolhaImapCronCadence
  periodId: string
  payDate: string
  windowFrom: string
  windowTo: string
}

export type FolhaImapCronDecision = FolhaImapCronWindow & {
  shouldPoll: boolean
  trigger: FolhaImapCronTrigger
  skipped?: 'awaiting_daily_slot'
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Soma dias civis em ISO `YYYY-MM-DD` (UTC, sem horário). */
export function isoAddDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`dia ISO inválido: ${iso}`)
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days)
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export function folhaImapPayWatchWindow(payDate: string): { from: string; to: string } {
  return {
    from: isoAddDays(payDate, -FOLHA_IMAP_PAY_WATCH_LEAD_DAYS),
    to: payDate,
  }
}

export function resolveFolhaImapCronWindow(today: string): FolhaImapCronWindow {
  const recent = listRecentQuinzenas({ today, count: 8 })
  const inWindow = recent
    .map((q) => {
      const w = folhaImapPayWatchWindow(q.payDate)
      return { q, ...w }
    })
    .filter((row) => today >= row.from && today <= row.to)
    .sort((a, b) => a.q.payDate.localeCompare(b.q.payDate))

  const hit = inWindow[0]
  if (hit) {
    return {
      cadence: 'frequent',
      periodId: hit.q.id,
      payDate: hit.q.payDate,
      windowFrom: hit.from,
      windowTo: hit.to,
    }
  }

  const upcoming = recent
    .filter((q) => q.payDate > today)
    .sort((a, b) => a.payDate.localeCompare(b.payDate))
  const next = upcoming[0] ?? recent[0]
  if (!next) {
    throw new Error(`sem quinzena Folha para ${today}`)
  }
  const w = folhaImapPayWatchWindow(next.payDate)
  return {
    cadence: 'daily',
    periodId: next.id,
    payDate: next.payDate,
    windowFrom: w.from,
    windowTo: w.to,
  }
}

export function isFolhaImapDailyCronSlot(now: Date, panel: RomPanelId): boolean {
  if (now.getUTCHours() !== FOLHA_IMAP_CRON_DAILY_UTC_HOUR) return false
  const minute = now.getUTCMinutes()
  switch (panel) {
    case 'brasil':
      return minute === FOLHA_IMAP_CRON_DAILY_UTC_MINUTE.brasil
    case 'iguatemi':
      return minute === FOLHA_IMAP_CRON_DAILY_UTC_MINUTE.iguatemi
    default: {
      const _never: never = panel
      throw new Error(`painel IMAP desconhecido: ${String(_never)}`)
    }
  }
}

/**
 * `period_id` na API IMAP é o Q1 (DARF/DAS/mensalidade, dia 20).
 * A janela de cadência Q1/Q2 vai em `pay_watch_period_id` — não misturar.
 */
export function folhaImapTaxPeriodIds(opts: {
  today: string
  payWatchPeriodId: string | null
}): {
  period_id: string | null
  tax_period_id: string | null
  pay_watch_period_id: string | null
} {
  const taxPeriodId = defaultFolhaTaxQuinzena(opts.today).id
  return {
    period_id: taxPeriodId,
    tax_period_id: taxPeriodId,
    pay_watch_period_id: opts.payWatchPeriodId,
  }
}

export function decideFolhaImapCronRun(opts: {
  today: string
  now: Date
  panel: RomPanelId
  /** Sessão/UI ou `?force=1` — ignora cadência. */
  force?: boolean
}): FolhaImapCronDecision {
  const window = resolveFolhaImapCronWindow(opts.today)
  if (opts.force) {
    return { ...window, shouldPoll: true, trigger: 'manual' }
  }
  switch (window.cadence) {
    case 'frequent':
      return { ...window, shouldPoll: true, trigger: 'pay_watch' }
    case 'daily': {
      if (isFolhaImapDailyCronSlot(opts.now, opts.panel)) {
        return { ...window, shouldPoll: true, trigger: 'daily_slot' }
      }
      return {
        ...window,
        shouldPoll: false,
        trigger: 'skip',
        skipped: 'awaiting_daily_slot',
      }
    }
    default: {
      const _never: never = window.cadence
      throw new Error(`cadência IMAP desconhecida: ${String(_never)}`)
    }
  }
}
