/**
 * Sync 0002 → salon_client_visits (histórico cliente×pro×dia).
 * Sem essa tabela o Relatório gerência 0011 só existia via Avec ao vivo.
 */

import { extractRows, fetchAvecReport } from '@/lib/avec/client'
import { normalizeAttendanceRow } from '@/lib/avec/normalize'
import type { AvecSyncStats } from '@/lib/avec/sync'
import { getSql } from '@/lib/db'
import { quarterRangeBr } from '@/lib/director-report/avec-live'
import {
  local0011ClientKey,
  previousQuarterKey,
  splitAvecProfessionalNames,
} from '@/lib/director-report/local-0011'
import { currentQuarterKeySp } from '@/lib/director-report/period'
import type { QuarterKey } from '@/lib/director-report/types'

const MAX_PAGES_PER_QUARTER = 40

function avecBrToIso(ddmmYYYY: string): string {
  const [d, m, y] = ddmmYYYY.split('/')
  if (!d || !m || !y) throw new Error(`Data Avec inválida: ${ddmmYYYY}`)
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function quartersToSync(now = new Date()): QuarterKey[] {
  const current = currentQuarterKeySp(now)
  const prior = previousQuarterKey(current)
  const yoy = `${Number(current.slice(0, 4)) - 1}-${current.slice(5)}` as QuarterKey
  const yoyPrior = previousQuarterKey(yoy)
  return [...new Set([current, prior, yoy, yoyPrior])]
}

async function syncOneQuarter(
  quarter: QuarterKey,
  stats: AvecSyncStats,
  syncRunId?: string,
): Promise<void> {
  const sql = getSql()
  const { inicio, fim } = quarterRangeBr(quarter)
  const periodStart = avecBrToIso(inicio)
  const periodEnd = avecBrToIso(fim)

  let pagesFetched = 0
  let rowCount = 0
  let truncated = false
  const seen = new Set<string>()

  for (let page = 1; page <= MAX_PAGES_PER_QUARTER; page++) {
    const payload = await fetchAvecReport(
      '0002',
      { inicio, fim, como_conheceu: '', limit: 250, page },
      { timeoutMs: 55_000 },
    )
    pagesFetched = page
    const rows = extractRows(payload)
    if (rows.length === 0) break

    for (const row of rows) {
      const att = normalizeAttendanceRow(row)
      if (!att?.clientName || !att.lastVisitDay) continue
      const phone = att.phone
      const key = local0011ClientKey(phone, att.clientName)
      if (!key) continue
      const dedupe = `${key}|${att.lastVisitDay}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)

      const proRaw =
        typeof row.todas_os_profissionais === 'string'
          ? row.todas_os_profissionais
          : att.professional
      const pros = splitAvecProfessionalNames(proRaw)
      const email =
        typeof row.email === 'string' && row.email.trim() ? row.email.trim() : null

      await sql`
        insert into salon_client_visits (
          client_key, visited_on, client_name, phone, mobile, email,
          professional_names, source_report, synced_at
        ) values (
          ${key},
          ${att.lastVisitDay}::date,
          ${att.clientName},
          ${phone},
          ${phone},
          ${email},
          ${pros},
          ${'0002'},
          now()
        )
        on conflict (client_key, visited_on, source_report) do update set
          client_name = excluded.client_name,
          phone = coalesce(excluded.phone, salon_client_visits.phone),
          mobile = coalesce(excluded.mobile, salon_client_visits.mobile),
          email = coalesce(excluded.email, salon_client_visits.email),
          professional_names = excluded.professional_names,
          synced_at = now()
      `
      rowCount++
      stats.director_visits_upserted = (stats.director_visits_upserted ?? 0) + 1
    }

    if (rows.length < 250) break
    if (page === MAX_PAGES_PER_QUARTER) truncated = true
  }

  await sql`
    insert into salon_visit_sync_coverage (
      period_key, period_start, period_end, pages_fetched, row_count, truncated, synced_at
    ) values (
      ${quarter},
      ${periodStart}::date,
      ${periodEnd}::date,
      ${pagesFetched},
      ${rowCount},
      ${truncated},
      now()
    )
    on conflict (period_key) do update set
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      pages_fetched = excluded.pages_fetched,
      row_count = excluded.row_count,
      truncated = excluded.truncated,
      synced_at = now()
  `

  if (truncated) {
    stats.warnings.push(`director-visits ${quarter}: truncado em ${MAX_PAGES_PER_QUARTER} páginas 0002`)
  } else {
    stats.warnings.push(
      `director-visits ${quarter}: ${rowCount} visitas (${pagesFetched} pág.)${syncRunId ? '' : ''}`,
    )
  }
}

/**
 * Full sync: grava trimestres corrente + anterior + YoY (para comparativo gerência).
 * Best-effort — falha de um trimestre não aborta o sync.
 */
export async function syncDirectorVisits(
  stats: AvecSyncStats,
  syncRunId?: string,
): Promise<void> {
  const quarters = quartersToSync()
  for (const q of quarters) {
    try {
      await syncOneQuarter(q, stats, syncRunId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Tabela ainda não migrada — não derruba o sync full.
      if (/salon_client_visits|salon_visit_sync_coverage/i.test(msg)) {
        stats.warnings.push(`director-visits: schema pendente (${msg.slice(0, 80)})`)
        return
      }
      stats.errors.push(`director-visits ${q}: ${msg.slice(0, 160)}`)
    }
  }
}

/** Helper de teste / admin — intervalo Avec de um trimestre. */
export function directorVisitQuarterWindow(quarter: QuarterKey): {
  inicio: string
  fim: string
  isoStart: string
  isoEnd: string
} {
  const { inicio, fim } = quarterRangeBr(quarter)
  return { inicio, fim, isoStart: avecBrToIso(inicio), isoEnd: avecBrToIso(fim) }
}
