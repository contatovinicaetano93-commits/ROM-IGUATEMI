/**
 * Probe: rehydrate Folha Q2 from Neon (mocks server-only).
 * Run: node --import ./scripts/mock-server-only.cjs --import tsx scripts/rehydrate-probe.mts
 */
import postgres from 'postgres'
import { rehydrateFolhaDraftFromPeriod } from '../src/lib/folha/workflow'

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
  try {
    const rows = await sql`
      select id, half, to_day::text as to_day, reference_day::text as reference_day,
             lines, source_professionals
      from folha_periods where id = ${'2026-09-q2'}
    `
    const row = rows[0]
    if (!row) throw new Error('period missing')
    const { lines, total } = rehydrateFolhaDraftFromPeriod('iguatemi', {
      half: row.half as 1 | 2,
      to_day: String(row.to_day),
      reference_day: row.reference_day == null ? null : String(row.reference_day),
      lines: (typeof row.lines === 'string'
        ? JSON.parse(row.lines)
        : row.lines) as never,
      source_professionals: (typeof row.source_professionals === 'string'
        ? JSON.parse(row.source_professionals)
        : row.source_professionals) as never,
    })
    const people = [
      'ANA CRISTINA MATSUMOTO',
      'BRUNNA FABRICIO',
      'DANIEL CHABARIBERY',
      'GABRIELA DA SILVA',
      'LUCAS RODRIGUES',
      'AMAURI',
      'Pedro E F Diello',
    ]
    for (const p of people) {
      const L = lines.find((x) => x.name.toUpperCase().includes(p.toUpperCase().slice(0, 12)))
      if (!L) {
        console.log('MISSING', p)
        continue
      }
      console.log(
        JSON.stringify({
          name: L.name,
          taxa_adm: L.taxa_administrativa,
          taxa_adm_rate: L.taxa_administrativa_rate,
          meio: L.meio_a_meio,
          outros: L.outros_descontos,
          baru: L.folha_extras.consumo_baru,
          U: L.folha_extras.servicos_assistente_como_pro,
          W: L.folha_extras.taxa_servicos,
          proposed: L.proposed_pay,
          flags: L.flags,
        }),
      )
    }
    console.log(
      JSON.stringify({
        total,
        with_taxa_adm: lines.filter((l) => l.taxa_administrativa != null).length,
        with_baru: lines.filter((l) => l.folha_extras.consumo_baru != null).length,
        with_U: lines.filter(
          (l) => l.folha_extras.servicos_assistente_como_pro != null,
        ).length,
        with_outros: lines.filter((l) => l.outros_descontos != null).length,
      }),
    )
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
