/**
 * Poll IMAP → parse DARF/DAS → aplica no período Folha aberto (próximo pagamento).
 */

import type { RomPanelId } from '@/lib/brand'
import {
  fetchUnseenFolhaTaxEmails,
  markFolhaTaxEmailsSeen,
  readFolhaImapConfig,
  type FolhaImapMessage,
} from '@/lib/folha/imap-client'
import {
  defaultFolhaQuinzena,
  parseFolhaPeriodId,
  todayIsoSaoPaulo,
} from '@/lib/folha/period'
import { ingestFolhaTaxEmail, loadOrCreateFolhaDraft } from '@/lib/folha/service'
import { folhaTaxSourceExists, getFolhaPeriod } from '@/lib/folha/store'

export type FolhaImapPollResult = {
  configured: boolean
  skipped?: 'not_configured' | 'no_period'
  fetched: number
  ingested: number
  applied: number
  marked_seen: number
  errors: string[]
  period_id: string | null
}

async function processMessage(
  panel: RomPanelId,
  periodId: string,
  msg: FolhaImapMessage,
): Promise<{ ingested: boolean; applied: boolean; error?: string }> {
  const source = `imap:${msg.uid}`
  if (await folhaTaxSourceExists(source)) {
    return { ingested: false, applied: false }
  }
  try {
    const result = await ingestFolhaTaxEmail(panel, {
      periodId,
      subject: msg.subject,
      body: msg.body || msg.subject,
      source,
      actor: 'imap-cron',
      applyToLine: true,
    })
    return { ingested: true, applied: result.applied }
  } catch (e) {
    return {
      ingested: false,
      applied: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function pollFolhaImapInbox(
  panel: RomPanelId,
  opts?: { day?: string; periodId?: string; markSeen?: boolean },
): Promise<FolhaImapPollResult> {
  const cfg = readFolhaImapConfig()
  if (!cfg) {
    return {
      configured: false,
      skipped: 'not_configured',
      fetched: 0,
      ingested: 0,
      applied: 0,
      marked_seen: 0,
      errors: [],
      period_id: null,
    }
  }

  const today = opts?.day ?? todayIsoSaoPaulo()
  // DARFs chegam para o olerite a pagar — não a quinzena civil de "hoje".
  // Ex.: em 01/10 → aplica em 2026-09-q2 (paga 05/10), não em 2026-10-q1.
  const quinzena =
    (opts?.periodId ? parseFolhaPeriodId(opts.periodId) : null) ??
    defaultFolhaQuinzena(today)

  await loadOrCreateFolhaDraft(panel, {
    periodId: quinzena.id,
    actor: 'imap-cron',
    today,
  })
  const period = await getFolhaPeriod(quinzena.id)
  if (!period) {
    return {
      configured: true,
      skipped: 'no_period',
      fetched: 0,
      ingested: 0,
      applied: 0,
      marked_seen: 0,
      errors: ['Período Folha ausente — rode refresh 8123'],
      period_id: quinzena.id,
    }
  }

  const errors: string[] = []
  let messages: FolhaImapMessage[] = []
  try {
    messages = await fetchUnseenFolhaTaxEmails(cfg)
  } catch (e) {
    return {
      configured: true,
      fetched: 0,
      ingested: 0,
      applied: 0,
      marked_seen: 0,
      errors: [e instanceof Error ? e.message : String(e)],
      period_id: quinzena.id,
    }
  }

  let ingested = 0
  let applied = 0
  const seenUids: number[] = []

  for (const msg of messages) {
    const r = await processMessage(panel, quinzena.id, msg)
    if (r.error) errors.push(`uid ${msg.uid}: ${r.error}`)
    if (r.ingested) ingested += 1
    if (r.applied) applied += 1
    // Marca visto mesmo se já existia (evita reprocessar).
    if (r.ingested || !r.error) seenUids.push(msg.uid)
  }

  let marked = 0
  if (opts?.markSeen !== false && seenUids.length > 0) {
    try {
      await markFolhaTaxEmailsSeen(cfg, seenUids)
      marked = seenUids.length
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
  }
}
