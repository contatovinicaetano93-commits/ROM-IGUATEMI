/**
 * Helpers de saúde de runs Avec — paridade Cérebro empty-kill.
 * Sem DB; usável em sync-meta / Hoje / testes / health.
 */

export type AvecRunHealthRow = {
  status: string
  created_at: string
  error?: string | null
  stats?: { aborted?: boolean; platform_kill_age_s?: number; running?: boolean } | string | null
}

/** Janela clássica do teto Pro ~300s sem Fluid (maxDuration efetivo 300). */
export const HARD_TIMEOUT_AGE_MIN_S = 260
export const HARD_TIMEOUT_AGE_MAX_S = 340

/** Paridade live Cérebro: fast >1h ou full >24h = stale. */
export const FAST_SYNC_STALE_MIN = 60
export const FULL_SYNC_STALE_MIN = 24 * 60

function parseStats(
  stats: AvecRunHealthRow['stats'],
): { aborted?: boolean; platform_kill_age_s?: number; running?: boolean } {
  if (stats == null) return {}
  if (typeof stats === 'string') {
    try {
      return JSON.parse(stats) as {
        aborted?: boolean
        platform_kill_age_s?: number
        running?: boolean
      }
    } catch {
      return {}
    }
  }
  return stats
}

function isKillErrorMessage(error: string | null | undefined): boolean {
  const e = error ?? ''
  return /abandoned|Sync interrompido|timeout\/kill|interrompido/i.test(e)
}

/** Orphan/kill sem progresso útil — não deve mascarar ok/partial mais antigo. */
export function isEmptyKillAvecRun(row: Pick<AvecRunHealthRow, 'status' | 'error'>): boolean {
  if (row.status !== 'error') return false
  return isKillErrorMessage(row.error)
}

/**
 * Kill duro da plataforma (timeout Vercel) — sem `aborted` limpo do budget 720s.
 * Distinto do abort parcial saudável (stats.aborted=true → partial).
 */
export function isHardPlatformTimeoutAvecRun(
  row: Pick<AvecRunHealthRow, 'status' | 'error' | 'stats'>,
): boolean {
  if (row.status !== 'error' && row.status !== 'partial') return false
  const stats = parseStats(row.stats)
  if (stats.aborted === true) return false
  return isKillErrorMessage(row.error)
}

/** Assinatura clássica ~300s (Fluid off / teto default). */
export function isClassic300sHardTimeout(
  row: Pick<AvecRunHealthRow, 'status' | 'error' | 'stats'>,
): boolean {
  if (!isHardPlatformTimeoutAvecRun(row)) return false
  const age = parseStats(row.stats).platform_kill_age_s
  if (age == null || !Number.isFinite(age)) return false
  return age >= HARD_TIMEOUT_AGE_MIN_S && age <= HARD_TIMEOUT_AGE_MAX_S
}

export function hardTimeoutHealthMessage(hits: {
  count: number
  classic300: number
}): string | null {
  if (hits.count <= 0) return null
  if (hits.classic300 > 0) {
    return `Full sync hard-timeout (~300s) sem aborted limpo — possível Fluid Compute off (Settings → Functions → Fluid). hits=${hits.count} classic300=${hits.classic300}`
  }
  return `Full sync hard-timeout (kill/abandon sem aborted) — checar Fluid Compute / maxDuration 800. hits=${hits.count}`
}

function ageMinutes(iso: string, now: number): number | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.floor((now - t) / 60_000)
}

/**
 * Sync operacional do painel (unidade).
 * - erro real (não empty-kill) → false
 * - fast >1h ou full >24h (fora de running) → false
 * - partial com abort limpo de budget NÃO falha (diferente do Cérebro: aqui partial é comum)
 * Hard platform timeout fica em `hard_timeout` separado.
 */
export function computePanelSyncOk(
  lastFast: AvecRunHealthRow | null | undefined,
  lastFull: AvecRunHealthRow | null | undefined,
  now = Date.now(),
): { ok: boolean; reason: string | null } {
  const fast = lastFast ?? null
  const full = lastFull ?? null
  if (!fast && !full) return { ok: false, reason: 'no avec sync runs' }

  const running =
    parseStats(fast?.stats).running === true || parseStats(full?.stats).running === true

  for (const [label, row] of [
    ['fast', fast],
    ['full', full],
  ] as const) {
    if (!row) continue
    if (isEmptyKillAvecRun(row)) continue
    if (row.status === 'error') {
      return { ok: false, reason: `${label} status=error` }
    }
  }

  if (running) return { ok: true, reason: null }

  if (fast) {
    const age = ageMinutes(fast.created_at, now)
    if (age != null && age > FAST_SYNC_STALE_MIN) {
      return { ok: false, reason: `fast stale ${age}m` }
    }
  } else {
    return { ok: false, reason: 'no fast sync' }
  }

  if (full) {
    const age = ageMinutes(full.created_at, now)
    if (age != null && age > FULL_SYNC_STALE_MIN) {
      return { ok: false, reason: `full stale ${age}m` }
    }
  }

  return { ok: true, reason: null }
}

function runTime(row: Pick<AvecRunHealthRow, 'created_at'>): number {
  return new Date(row.created_at).getTime()
}

/** Entre finished, ignora empty-kill se houver candidato mais saudável. */
export function pickNewestUsableAvecRun<T extends AvecRunHealthRow>(
  runs: Array<T | null | undefined>,
): T | null {
  const finished = runs.filter((row): row is T => row != null)
  if (finished.length === 0) return null
  const withoutEmptyKills = finished.filter((row) => !isEmptyKillAvecRun(row))
  const candidates = withoutEmptyKills.length > 0 ? withoutEmptyKills : finished
  return candidates.reduce((latest, row) => (runTime(row) >= runTime(latest) ? row : latest))
}

/**
 * Badge Hoje: preferir fast usável (caixa/agenda); full só se fast for empty-kill/ausente.
 * Evita full parcial em analytics pintar Hoje quando o fast ok ainda vale.
 */
export function pickHojeAvecSyncRun<T extends AvecRunHealthRow>(
  fast: T | null | undefined,
  full: T | null | undefined,
): T | null {
  if (fast != null && !isEmptyKillAvecRun(fast)) return fast
  if (full != null && !isEmptyKillAvecRun(full)) return full
  return fast ?? full ?? null
}
