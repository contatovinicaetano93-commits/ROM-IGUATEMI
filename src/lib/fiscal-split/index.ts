export type {
  FiscalArrangement,
  FiscalSplitRawPayload,
  FiscalSplitRecord,
  FiscalSplitStatus,
  FiscalSplitSummary,
  NormalizedFiscalSplit,
} from './types'

export {
  normalizeSplitSettlement,
  normalizeSplitSettlementBatch,
  maskFiscalPayloadForLog,
} from './normalize'

export {
  fetchSplitSettlements,
  getFiscalSplitClientConfig,
  getSplitStatus,
  isFiscalSplitConfigured,
} from './client'

export {
  ensureFiscalSplitTable,
  getFiscalSplitSummary,
  listFiscalSplits,
  upsertFiscalSplit,
} from './store'

import { fetchSplitSettlements, isFiscalSplitConfigured } from './client'
import { maskFiscalPayloadForLog, normalizeSplitSettlementBatch } from './normalize'
import { ensureFiscalSplitTable, upsertFiscalSplit } from './store'
import type { FiscalSplitRawPayload, FiscalSplitRecord } from './types'

export interface ImportFiscalSplitsResult {
  imported: number
  created: number
  updated: number
  skipped: number
  records: FiscalSplitRecord[]
  error?: string
}

/** Importa settlements do feed configurado ou de um payload explícito (idempotente). */
export async function importFiscalSplits(opts?: {
  from?: string
  to?: string
  payloads?: FiscalSplitRawPayload[]
  source?: string
}): Promise<ImportFiscalSplitsResult> {
  await ensureFiscalSplitTable()

  let payloads = opts?.payloads
  if (!payloads) {
    if (!isFiscalSplitConfigured()) {
      return {
        imported: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        records: [],
        error: 'API fiscal não configurada (defina FISCAL_SPLIT_API_URL ou FISCAL_SPLIT_MOCK=1)',
      }
    }
    try {
      payloads = await fetchSplitSettlements({ from: opts?.from, to: opts?.to })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[fiscal-split] fetch failed', message)
      return {
        imported: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        records: [],
        error: message,
      }
    }
  }

  const normalized = normalizeSplitSettlementBatch(payloads)
  const skipped = payloads.length - normalized.length
  let created = 0
  let updated = 0
  const records: FiscalSplitRecord[] = []

  for (const settlement of normalized) {
    try {
      const result = await upsertFiscalSplit(settlement, opts?.source ?? 'import')
      records.push(result.record)
      if (result.created) created += 1
      else updated += 1
    } catch (e) {
      console.error(
        '[fiscal-split] upsert failed',
        maskFiscalPayloadForLog(settlement.rawPayload),
        e instanceof Error ? e.message : e
      )
    }
  }

  return {
    imported: records.length,
    created,
    updated,
    skipped,
    records,
  }
}
