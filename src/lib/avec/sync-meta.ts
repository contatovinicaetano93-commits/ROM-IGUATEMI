import { getLastAvecSync, type AvecSyncRun, type AvecSyncStage } from '@/lib/avec/sync'
import { isCleanBudgetAbortPartial } from '@/lib/avec/messages'
import { pickNewestUsableAvecRun } from '@/lib/avec/sync-run-health'
import type { AvecSyncMeta } from '@/lib/avec/sync-meta-surface'
import { cachedFetch } from '@/lib/cache'
import { kpiSourceFromSyncStatus } from '@/lib/kpi-source'

export type { AvecSyncMeta } from '@/lib/avec/sync-meta-surface'
export {
  financeiroSyncStaleMessage,
  isFinanceiroStale,
  isRelatoriosStale,
  isVisaoStale,
  relatoriosSyncStaleMessage,
  visaoSyncFastInfoMessage,
  visaoSyncStaleMessage,
} from '@/lib/avec/sync-meta-surface'

function ageHours(iso: string | null | undefined, nowMs: number): number | null {
  if (iso == null) return null
  return (nowMs - new Date(iso).getTime()) / 3_600_000
}

/** Estágio fatiado; se ainda não rodou, cai no full monolítico legado (`stage=all`). */
export async function getLastFullStage(stage: AvecSyncStage): Promise<AvecSyncRun | null> {
  const staged = await getLastAvecSync('full', { finishedOnly: true, stage }).catch(() => null)
  if (staged) return staged
  if (stage === 'all') return null
  return getLastAvecSync('full', { finishedOnly: true, stage: 'all' }).catch(() => null)
}

/**
 * Metadados de sync para banners em Visão/Financeiro/Relatórios.
 *
 * Stale top-level (`stale`): OR de ops + fast — backward compat Cérebro/Hoje.
 * UI por superfície: use isFinanceiroStale / isVisaoStale / isRelatoriosStale.
 *
 * Empty-kill (Sync interrompido / abandoned) não mascara ok/partial saudável
 * entre os finished disponíveis — paridade Cérebro.
 */
export async function loadAvecSyncMeta(): Promise<AvecSyncMeta> {
  return cachedFetch(
    'avec:sync-meta:v5',
    async () => {
      const nowMs = Date.now()
      const [ops, agenda, catalog, fast] = await Promise.all([
        getLastFullStage('ops'),
        getLastFullStage('agenda'),
        getLastFullStage('catalog'),
        getLastAvecSync('fast', { finishedOnly: true }).catch(() => null),
      ])

      const opsAge = ageHours(ops?.created_at, nowMs)
      const agendaAge = ageHours(agenda?.created_at, nowMs)
      const catalogAge = ageHours(catalog?.created_at, nowMs)
      const fastAge = ageHours(fast?.created_at, nowMs)

      const never_synced = ops == null && agenda == null && catalog == null && fast == null
      const ops_stale = never_synced || ops == null || (opsAge != null && opsAge > 24)
      const fast_stale = never_synced || (fastAge != null && fastAge > 1)
      // Agenda do dia: stage recente OU fast fresco.
      const agendaStageFresh = agenda != null && agendaAge != null && agendaAge <= 24
      const agenda_stale = never_synced || (!agendaStageFresh && fast_stale)
      const catalog_stale =
        never_synced || catalog == null || (catalogAge != null && catalogAge > 24)

      // Visão/Financeiro: ops >24h OU fast >1h (caixa do dia) — agenda_stale fica só no campo dedicado.
      const stale = never_synced || ops_stale || fast_stale

      const latest = pickNewestUsableAvecRun([ops, agenda, fast])
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
        fast_stale,
        never_synced,
        ops_created_at: ops?.created_at ?? null,
        ops_stale,
        agenda_created_at: agenda?.created_at ?? null,
        agenda_stale,
        catalog_created_at: catalog?.created_at ?? null,
        catalog_stale,
      }
    },
    30,
  )
}
