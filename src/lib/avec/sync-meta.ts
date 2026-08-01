import { getLastAvecSync } from '@/lib/avec/sync'
import { isCleanBudgetAbortPartial } from '@/lib/avec/messages'
import { pickNewestUsableAvecRun } from '@/lib/avec/sync-run-health'
import { cachedFetch } from '@/lib/cache'
import { kpiSourceFromSyncStatus } from '@/lib/kpi-source'

export type AvecSyncMeta = {
  status: string | null
  created_at: string | null
  stale: boolean
  hint: string | null
  /** Mensagem de erro do último finished (timeout/kill etc.). */
  error: string | null
  /** Último fast (caixa/Hoje). */
  fast_created_at: string | null
  fast_stale: boolean
  /** Nenhum sync finished ainda. */
  never_synced: boolean
}

/**
 * Metadados de sync para banners em Visão/Financeiro/Relatórios.
 * Full >24h OU fast >1h OU nunca syncou → stale.
 *
 * Empty-kill (Sync interrompido / abandoned) não mascara ok/partial saudável
 * entre os finished disponíveis — paridade Cérebro.
 */
export async function loadAvecSyncMeta(): Promise<AvecSyncMeta> {
  return cachedFetch(
    'avec:sync-meta:v4',
    async () => {
      const [full, fast] = await Promise.all([
        getLastAvecSync('full', { finishedOnly: true }).catch(() => null),
        getLastAvecSync('fast', { finishedOnly: true }).catch(() => null),
      ])

      const fullAgeHours =
        full?.created_at != null
          ? (Date.now() - new Date(full.created_at).getTime()) / 3_600_000
          : null
      const fastAgeHours =
        fast?.created_at != null
          ? (Date.now() - new Date(fast.created_at).getTime()) / 3_600_000
          : null

      const never_synced = full == null && fast == null
      const fullStale = fullAgeHours != null && fullAgeHours > 24
      const fastStale = fastAgeHours != null && fastAgeHours > 1
      const stale = never_synced || fullStale || fastStale

      const latest = pickNewestUsableAvecRun([full, fast])
      // Abort limpo por orçamento (comum no BR) não deve acender “parcial” na Visão.
      const syncStatus =
        latest != null && isCleanBudgetAbortPartial(latest)
          ? 'ok'
          : (latest?.status ?? null)
      const created_at = latest?.created_at ?? null

      return {
        status: syncStatus,
        created_at,
        stale,
        hint: kpiSourceFromSyncStatus(stale ? 'stale' : syncStatus),
        error: latest?.error ?? null,
        fast_created_at: fast?.created_at ?? null,
        fast_stale: never_synced || fastStale,
        never_synced,
      }
    },
    30,
  )
}
