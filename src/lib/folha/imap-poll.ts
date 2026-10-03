/**
 * Poll IMAP → parse DARF/DAS/mensalidade → aplica no período Folha Q1 (dia 20).
 */

import type { RomPanelId } from '@/lib/brand'
import {
  fetchUnseenFolhaTaxEmails,
  markFolhaTaxEmailsSeen,
  readFolhaImapConfig,
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
import {
  folhaTaxSourceExists,
  getFolhaPeriod,
  getFolhaTaxDocumentBySource,
} from '@/lib/folha/store'

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
): Promise<{ ingested: boolean; applied: boolean; markSeen: boolean; error?: string }> {
  const source = `imap:${msg.uid}`
  if (await folhaTaxSourceExists(source)) {
    // Doc já gravado (ex.: nome não bateu no 1º poll) — tenta aplicar de novo.
    const doc = await getFolhaTaxDocumentBySource(source)
    if (!doc) {
      return { ingested: false, applied: false, markSeen: true }
    }
    try {
      const result = await applyFolhaTaxParsedToPeriod(panel, {
        periodId: doc.period_id ?? periodId,
        kind: doc.kind,
        amount: doc.amount,
        professionalName: doc.professional_name,
        actor: 'imap-cron',
      })
      // Marca visto se aplicou, ou se não dá mais para aplicar (sem nome/valor/tipo).
      const canRetry =
        doc.amount != null &&
        doc.professional_name != null &&
        (doc.kind === 'darf' || doc.kind === 'das' || doc.kind === 'mensalidade')
      return {
        ingested: false,
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
  try {
    const result = await ingestFolhaTaxEmail(panel, {
      periodId,
      subject: msg.subject,
      body: msg.body || msg.subject,
      source,
      actor: 'imap-cron',
      applyToLine: true,
    })
    const canRetry =
      !result.applied &&
      result.parsed.amount != null &&
      result.parsed.professional_name != null &&
      (result.parsed.kind === 'darf' ||
        result.parsed.kind === 'das' ||
        result.parsed.kind === 'mensalidade')
    return {
      ingested: true,
      applied: result.applied,
      // Não marca Seen se ainda dá para tentar no próximo cron (nome/linha ausente).
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
  // DARF/DAS/mensalidade só abatem no pagamento do dia 20 (Q1).
  // E-mails até o dia 15 → alvo = Q1 do mês (ou próxima Q1 após o dia 20).
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
    return {
      configured: true,
      skipped: 'no_period',
      fetched: 0,
      ingested: 0,
      applied: 0,
      marked_seen: 0,
      errors: ['Período Folha Q1 (dia 20) ausente — rode refresh 8123'],
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
    if (r.markSeen) seenUids.push(msg.uid)
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
