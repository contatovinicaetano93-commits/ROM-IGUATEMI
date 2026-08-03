import { getLastAvecSync, type AvecSyncRun, type AvecSyncStage } from '@/lib/avec/sync'
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
  /** Full/ops (P1/P2/P3) — Visão analítica. */
  ops_created_at: string | null
  ops_stale: boolean
  /** Full/agenda — ou fast fresco cobre o dia. */
  agenda_created_at: string | null
  agenda_stale: boolean
  /** Full/catalog (0004). Não entra no stale top-level da Visão. */
  catalog_created_at: string | null
  catalog_stale: boolean
}

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
 * Stale top-level: nunca syncou OU ops >24h OU (agenda stage velha E fast >1h).
 * Catalog velho não assusta Visão (só campo dedicado).
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

      // Visão: ops velho assusta; caixa do dia só se fast/agenda falharam juntos.
      const stale = never_synced || ops_stale || (agenda_stale && fast_stale)

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
