/**
 * Rehydrate Folha BR Q2 columns (Tx adm / Meio / Outros / Baru) and persist.
 * Does NOT overlay IG Fopag U values.
 */
import postgres from 'postgres'
import { rehydrateFolhaDraftFromPeriod } from '../src/lib/folha/workflow'

async function main() {
  const dbUrl = process.env.DATABASE_URL_BR || process.env.DATABASE_URL
  if (!dbUrl) throw new Error('DATABASE_URL_BR missing')
  const periodId = process.env.PERIOD_ID?.trim() || '2026-09-q2'
  const sql = postgres(dbUrl, { max: 1, prepare: false })
  try {
    const rows = await sql`
      select id, half, to_day::text as to_day, reference_day::text as reference_day,
             lines, source_professionals, total_proposed_pay
      from folha_periods where id = ${periodId}
    `
    const row = rows[0]
    if (!row) throw new Error(`period ${periodId} missing on BR`)
    const lines =
      typeof row.lines === 'string' ? JSON.parse(row.lines) : row.lines
    const source =
      typeof row.source_professionals === 'string'
        ? JSON.parse(row.source_professionals)
        : row.source_professionals
    console.log(
      'before',
      JSON.stringify({
        total: row.total_proposed_pay,
        with_taxa_adm: lines.filter(
          (l: { taxa_administrativa: unknown }) => l.taxa_administrativa != null,
        ).length,
        with_baru: lines.filter(
          (l: { folha_extras?: { consumo_baru: unknown } }) =>
            l.folha_extras?.consumo_baru != null,
        ).length,
      }),
    )
    const { lines: next, total } = rehydrateFolhaDraftFromPeriod('brasil', {
      half: row.half as 1 | 2,
      to_day: String(row.to_day),
      reference_day:
        row.reference_day == null ? null : String(row.reference_day),
      lines,
      source_professionals: source,
    })
    const alison = next.find((l) => l.name.toUpperCase().includes('ALISON'))
    console.log(
      'alison',
      JSON.stringify(
        alison && {
          taxa: alison.taxa_administrativa,
          meio: alison.meio_a_meio,
          outros: alison.outros_descontos,
          baru: alison.folha_extras.consumo_baru,
          prop: alison.proposed_pay,
          flags: alison.flags,
        },
      ),
    )
    console.log(
      'after',
      JSON.stringify({
        total,
        with_taxa_adm: next.filter((l) => l.taxa_administrativa != null).length,
        with_baru: next.filter((l) => l.folha_extras.consumo_baru != null)
          .length,
        with_outros: next.filter((l) => l.outros_descontos != null).length,
      }),
    )
    await sql`
      update folha_periods set
        lines = ${sql.json(next as never)},
        total_proposed_pay = ${total},
        updated_by = ${'reenrich-fopag-columns'},
        updated_at = now()
      where id = ${periodId}
    `
    console.log('saved BR')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
