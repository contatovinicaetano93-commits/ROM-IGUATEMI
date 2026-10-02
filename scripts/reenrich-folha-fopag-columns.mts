/**
 * Reenrich Folha Q2: U/Baru (e acumulado Romeu) da Fopag + rehydrate colunas
 * (Tx adm / Meio / Outros) sem reabater Baru embutido.
 *
 * Run (IG):
 *   node --import ./scripts/mock-server-only.cjs --import tsx scripts/reenrich-folha-fopag-columns.mts
 * Run (BR DB):
 *   DATABASE_URL=$DATABASE_URL_BR PANEL=brasil node --import ./scripts/mock-server-only.cjs --import tsx scripts/reenrich-folha-fopag-columns.mts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import { occupancyMergeKey } from '../src/lib/director-report/match-pro'
import { rehydrateFolhaDraftFromPeriod } from '../src/lib/folha/workflow'
import type { FolhaDraftLine } from '../src/lib/folha/draft-from-8123'
import type { RomPanelId } from '../src/lib/brand'

type FopagRow = {
  name: string
  U: number
  baru: number
  liquido: number
}

type BonusRow = {
  name: string
  total: number
}

async function main() {
  const panel = (process.env.PANEL?.trim() || 'iguatemi') as RomPanelId
  const periodId = process.env.PERIOD_ID?.trim() || '2026-09-q2'
  const dry = process.env.DRY_RUN === '1'
  const dbUrl =
    panel === 'brasil'
      ? process.env.DATABASE_URL_BR || process.env.DATABASE_URL
      : process.env.DATABASE_URL
  if (!dbUrl) throw new Error('DATABASE_URL missing')

  const fixture = JSON.parse(
    readFileSync(
      join(process.cwd(), 'src/lib/folha/fixtures/fopag-ig-q2-parsed.json'),
      'utf8',
    ),
  ) as { fopag_ig_q2: FopagRow[]; bonus_romeu_ig?: BonusRow[] }

  const fopagByKey = new Map<string, FopagRow>()
  for (const r of fixture.fopag_ig_q2) {
    const k = occupancyMergeKey(r.name)
    if (k) fopagByKey.set(k, r)
  }
  const bonusByKey = new Map<string, BonusRow>()
  for (const b of fixture.bonus_romeu_ig ?? []) {
    const k = occupancyMergeKey(b.name)
    if (k) bonusByKey.set(k, b)
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false })
  try {
    const rows = await sql`
      select id, half, to_day::text as to_day, reference_day::text as reference_day,
             lines, source_professionals, total_proposed_pay
      from folha_periods where id = ${periodId}
    `
    const row = rows[0]
    if (!row) throw new Error(`period ${periodId} missing`)

    const lines = (
      typeof row.lines === 'string' ? JSON.parse(row.lines) : row.lines
    ) as FolhaDraftLine[]
    const source =
      typeof row.source_professionals === 'string'
        ? JSON.parse(row.source_professionals)
        : row.source_professionals

    let patchedU = 0
    let patchedBaru = 0
    let clearedBaru = 0
    let patchedBonus = 0

    const withExtras = lines.map((line) => {
      const key = occupancyMergeKey(line.name)
      const f = key ? fopagByKey.get(key) : null
      const bonus = key ? bonusByKey.get(key) : null
      const extras = { ...line.folha_extras }
      if (f) {
        if (f.U > 0.005) {
          extras.servicos_assistente_como_pro = f.U
          patchedU++
        }
        if (f.baru > 0.005) {
          extras.consumo_baru = f.baru
          patchedBaru++
        } else if (extras.consumo_baru != null) {
          // Fopag manda 0 — limpa Baru espúrio (ex.: match Zig errado).
          extras.consumo_baru = null
          clearedBaru++
        }
      }
      if (bonus && extras.acumulado_mes == null) {
        extras.acumulado_mes = bonus.total
        patchedBonus++
      }
      return { ...line, folha_extras: extras }
    })

    const { lines: rehydrated, total } = rehydrateFolhaDraftFromPeriod(panel, {
      half: row.half as 1 | 2,
      to_day: String(row.to_day),
      reference_day:
        row.reference_day == null ? null : String(row.reference_day),
      lines: withExtras,
      source_professionals: source as never,
    })

    const sample = [
      'ANA CRISTINA MATSUMOTO',
      'BRUNNA FABRICIO',
      'DANIEL CHABARIBERY',
      'GABRIELA DA SILVA',
      'LUCAS RODRIGUES',
    ]
    for (const p of sample) {
      const L = rehydrated.find((x) =>
        x.name.toUpperCase().includes(p.toUpperCase().slice(0, 12)),
      )
      if (!L) continue
      console.log(
        JSON.stringify({
          name: L.name,
          taxa_adm: L.taxa_administrativa,
          meio: L.meio_a_meio,
          outros: L.outros_descontos,
          baru: L.folha_extras.consumo_baru,
          U: L.folha_extras.servicos_assistente_como_pro,
          W: L.folha_extras.taxa_servicos,
          proposed: L.proposed_pay,
        }),
      )
    }

    console.log(
      JSON.stringify({
        panel,
        periodId,
        dry,
        patchedU,
        patchedBaru,
        clearedBaru,
        patchedBonus,
        total_before: row.total_proposed_pay,
        total_after: total,
        with_taxa_adm: rehydrated.filter((l) => l.taxa_administrativa != null)
          .length,
        with_baru: rehydrated.filter((l) => l.folha_extras.consumo_baru != null)
          .length,
        with_U: rehydrated.filter(
          (l) => l.folha_extras.servicos_assistente_como_pro != null,
        ).length,
      }),
    )

    if (!dry) {
      await sql`
        update folha_periods set
          lines = ${sql.json(rehydrated as never)},
          total_proposed_pay = ${total},
          updated_by = ${'reenrich-fopag-columns'},
          updated_at = now()
        where id = ${periodId}
      `
      console.log('saved')
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
