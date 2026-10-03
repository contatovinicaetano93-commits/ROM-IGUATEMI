/**
 * Poll IMAP → parse DARF/DAS/mensalidade (texto + PDF) → aplica no Q1 (dia 20).
 * Busca por lookback em todas as pastas de trabalho — não depende de UNSEEN.
 */

import type { RomPanelId } from '@/lib/brand'
import {
  FOLHA_IMAP_FETCH_CAP,
  canonicalFolhaImapSource,
  fetchFolhaImapMessages,
  folhaImapSourceKeys,
  listFolhaImapCandidates,
  markFolhaTaxEmailsSeen,
  readFolhaImapConfig,
  type FolhaImapCandidate,
  type FolhaImapMessage,
} from '@/lib/folha/imap-client'
import {
  acceptsFolhaTaxExtras,
  defaultFolhaTaxQuinzena,
  parseFolhaPeriodId,
  todayIsoSaoPaulo,
} from '@/lib/folha/period'
import {
  applyFolhaTaxParsedToPeriod,
  ingestFolhaTaxEmail,
  loadOrCreateFolhaDraft,
} from '@/lib/folha/service'
import { extractCnpjFromText } from '@/lib/folha/tax-cnpj'
import {
  getFolhaPeriod,
  getFolhaTaxDocumentByAnySource,
  type FolhaTaxDocumentRow,
} from '@/lib/folha/store'

export type FolhaImapPollResult = {
  configured: boolean
  skipped?: 'not_configured' | 'no_period' | 'awaiting_daily_slot'
  fetched: number
  ingested: number
  applied: number
  marked_seen: number
  errors: string[]
  period_id: string | null
  tax_period_id?: string | null
  pay_watch_period_id?: string | null
  cadence?: 'frequent' | 'daily'
  cron_trigger?: 'pay_watch' | 'daily_slot' | 'manual' | 'skip'
  pay_date?: string | null
  window_from?: string | null
  window_to?: string | null
}

function taxKindCanRetry(kind: string): boolean {
  return kind === 'darf' || kind === 'das' || kind === 'mensalidade'
}

function cnpjFromStoredTaxDoc(doc: FolhaTaxDocumentRow): string | null {
  const blob = `${doc.raw_subject ?? ''}\n${doc.raw_body ?? ''}`
  return extractCnpjFromText(blob)
}

async function reapplyDocument(
  panel: RomPanelId,
  periodId: string,
  doc: FolhaTaxDocumentRow,
): Promise<{ applied: boolean; markSeen: boolean; error?: string }> {
  try {
    const cnpj = cnpjFromStoredTaxDoc(doc)
    const result = await applyFolhaTaxParsedToPeriod(panel, {
      periodId: doc.period_id ?? periodId,
      kind: doc.kind,
      amount: doc.amount,
      professionalName: doc.professional_name,
      cnpj,
      actor: 'imap-cron',
    })
    const canRetry =
      doc.amount != null &&
      (doc.professional_name != null || cnpj != null) &&
      taxKindCanRetry(doc.kind)
    return { applied: result.applied, markSeen: result.applied || !canRetry }
  } catch (e) {
    return {
      applied: false,
      markSeen: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function ingestMessage(
  panel: RomPanelId,
  periodId: string,
  msg: FolhaImapMessage,
): Promise<{ ingested: boolean; applied: boolean; markSeen: boolean; error?: string }> {
  const source = canonicalFolhaImapSource(msg.mailbox, msg.uid)
  try {
    const result = await ingestFolhaTaxEmail(panel, {
      periodId,
      subject: msg.subject,
      body: msg.body || msg.subject,
      filenames: msg.filenames,
      source,
      actor: 'imap-cron',
      applyToLine: true,
    })
    const canRetry =
      !result.applied &&
      result.parsed.amount != null &&
      (result.parsed.professional_name != null || result.parsed.cnpj != null) &&
      taxKindCanRetry(result.parsed.kind)
    return {
      ingested: true,
      applied: result.applied,
      markSeen: result.applied || !canRetry,
    }
  } catch (e) {
    return {
      ingested: false,
      applied: false,
      markSeen: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

function emptyPoll(partial: Partial<FolhaImapPollResult> & { period_id: string | null }): FolhaImapPollResult {
  return {
    configured: true,
    fetched: 0,
    ingested: 0,
    applied: 0,
    marked_seen: 0,
    errors: [],
    tax_period_id: partial.period_id,
    ...partial,
  }
}

export async function pollFolhaImapInbox(
  panel: RomPanelId,
  opts?: { day?: string; periodId?: string; markSeen?: boolean },
): Promise<FolhaImapPollResult> {
  const cfg = readFolhaImapConfig()
  if (!cfg) {
    return emptyPoll({
      configured: false,
      skipped: 'not_configured',
      period_id: null,
      tax_period_id: null,
    })
  }

  const today = opts?.day ?? todayIsoSaoPaulo()
  let quinzena =
    (opts?.periodId ? parseFolhaPeriodId(opts.periodId) : null) ??
    defaultFolhaTaxQuinzena(today)
  if (!acceptsFolhaTaxExtras(quinzena.half)) {
    quinzena = defaultFolhaTaxQuinzena(today)
  }

  await loadOrCreateFolhaDraft(panel, {
    periodId: quinzena.id,
    actor: 'imap-cron',
    today,
  })
  const period = await getFolhaPeriod(quinzena.id)
  if (!period) {
    return emptyPoll({
      skipped: 'no_period',
      errors: ['Período Folha Q1 (dia 20) ausente — rode refresh 8123'],
      period_id: quinzena.id,
      tax_period_id: quinzena.id,
    })
  }

  const errors: string[] = []
  let candidates: FolhaImapCandidate[] = []
  try {
    candidates = await listFolhaImapCandidates(cfg)
  } catch (e) {
    return emptyPoll({
      errors: [e instanceof Error ? e.message : String(e)],
      period_id: quinzena.id,
      tax_period_id: quinzena.id,
    })
  }

  const toFetch: FolhaImapCandidate[] = []
  let ingested = 0
  let applied = 0
  const seen: FolhaImapCandidate[] = []

  for (const cand of candidates) {
    const keys = folhaImapSourceKeys(cand.mailbox, cand.uid)
    const doc = await getFolhaTaxDocumentByAnySource(keys)
    if (doc) {
      const r = await reapplyDocument(panel, quinzena.id, doc)
      if (r.error) errors.push(`${cand.mailbox}#${cand.uid}: ${r.error}`)
      if (r.applied) applied += 1
      if (r.markSeen) seen.push(cand)
      continue
    }
    if (toFetch.length < FOLHA_IMAP_FETCH_CAP) toFetch.push(cand)
  }

  let messages: FolhaImapMessage[] = []
  try {
    messages = await fetchFolhaImapMessages(cfg, toFetch)
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  for (const msg of messages) {
    const keys = folhaImapSourceKeys(msg.mailbox, msg.uid, msg.messageId)
    const doc = await getFolhaTaxDocumentByAnySource(keys)
    const r = doc
      ? await reapplyDocument(panel, quinzena.id, doc)
      : await ingestMessage(panel, quinzena.id, msg)
    if (r.error) errors.push(`${msg.mailbox}#${msg.uid}: ${r.error}`)
    if ('ingested' in r && r.ingested) ingested += 1
    if (r.applied) applied += 1
    if (r.markSeen) seen.push({ mailbox: msg.mailbox, uid: msg.uid })
  }

  let marked = 0
  if (opts?.markSeen !== false && seen.length > 0) {
    try {
      await markFolhaTaxEmailsSeen(cfg, seen)
      marked = seen.length
    } catch (e) {
      errors.push(`markSeen: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return {
    configured: true,
    fetched: messages.length,
    ingested,
    applied,
    marked_seen: marked,
    errors,
    period_id: quinzena.id,
    tax_period_id: quinzena.id,
  }
}
