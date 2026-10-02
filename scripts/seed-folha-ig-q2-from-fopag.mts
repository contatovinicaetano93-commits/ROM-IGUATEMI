/**
 * Seed Folha 2026-09-q2 no Neon IG a partir da fixture Base Folha Iguatemi.
 *
 * Uso:
 *   DATABASE_URL=<neon-ig> node --import ./scripts/mock-server-only.cjs --import tsx \
 *     scripts/seed-folha-ig-q2-from-fopag.mts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import { buildFolhaDraftLine } from '../src/lib/folha/draft-from-8123'
import {
  resolveFopagIgQ2Target,
  synthesizeFopagIgQ2,
  type FopagBonusRow,
  type FopagIgQ2Row,
} from '../src/lib/folha/fopag-ig-q2-synthesize'
import { quinzenaForYearMonthHalf } from '../src/lib/folha/period'

async function main() {
  const dbUrl = process.env.DATABASE_URL?.trim()
  if (!dbUrl) throw new Error('DATABASE_URL required (Neon IG)')
  const dry = process.env.DRY_RUN === '1'
  const periodId = process.env.PERIOD_ID?.trim() || '2026-09-q2'

  const fixture = JSON.parse(
    readFileSync(
      join(process.cwd(), 'src/lib/folha/fixtures/fopag-ig-q2-parsed.json'),
      'utf8',
    ),
  ) as { fopag_ig_q2: FopagIgQ2Row[]; bonus_romeu_ig: FopagBonusRow[] }

  const q = quinzenaForYearMonthHalf('2026-09', 2)
  if (q.id !== periodId) {
    throw new Error(`period mismatch: expected ${q.id}, got ${periodId}`)
  }

  const lines = []
  const source = []
  let match = 0
  let gap = 0
  const gaps: Array<{ name: string; y: number; prop: number | null; d: number | null }> =
    []

  for (const f of fixture.fopag_ig_q2) {
    if (f.liquido <= 0.005 && f.faturado <= 0.005) continue
    const syn0 = synthesizeFopagIgQ2(f, fixture.bonus_romeu_ig)
    const { target, syn } = resolveFopagIgQ2Target(
      f,
      syn0,
      fixture.bonus_romeu_ig,
    )
    const line = buildFolhaDraftLine('iguatemi', syn.row, syn.extras, {
      applyTaxExtras: false,
    })
    // Quinzena fechada: Y da planilha é a verdade do pagamento.
    // Motor (meio 5% Diello/Gildenice etc.) pode divergir do Y Fopag —
    // no seed fechado, congela proposed_pay = Y da aba.
    line.folha_extras.liquido_referencia = f.liquido
    if (f.fat_liquido > 0.005) {
      line.folha_extras.fat_liquido_referencia = f.fat_liquido
    }
    if (f.produto > 0.005) {
      line.folha_extras.produto_referencia = f.produto
    }
    if (
      line.proposed_pay == null ||
      Math.abs(Number(line.proposed_pay) - f.liquido) > 0.05
    ) {
      line.proposed_pay = f.liquido
      syn.notes.push(`seed_snap_proposed_to_fopag_y=${f.liquido}`)
    }
    const prop = line.proposed_pay
    const d = prop == null ? null : prop - f.liquido
    if (prop != null && Math.abs(d!) <= 0.05) match++
    else {
      gap++
      gaps.push({ name: f.name, y: f.liquido, prop, d })
    }
    void target
    lines.push(line)
    source.push(syn.row)
  }

  const total = lines.reduce(
    (acc, l) => acc + (l.proposed_pay == null ? 0 : Number(l.proposed_pay)),
    0,
  )

  const summary = {
    panel: 'iguatemi',
    periodId,
    dry,
    lines: lines.length,
    match,
    gap,
    match_rate: `${match}/${lines.length}`,
    total_proposed_pay: Math.round(total * 10000) / 10000,
    gaps: gaps.slice(0, 40),
  }
  console.log(JSON.stringify(summary, null, 2))
  writeFileSync(
    '/opt/cursor/artifacts/seed-folha-ig-q2-from-fopag.json',
    JSON.stringify(summary, null, 2),
  )

  if (dry) {
    console.log('DRY_RUN — not saved')
    return
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false, ssl: 'require' })
  try {
    await sql`
      create table if not exists folha_periods (
        id text primary key,
        year_month text not null,
        half smallint not null check (half in (1, 2)),
        from_day date not null,
        to_day date not null,
        reference_day date,
        status text not null check (
          status in ('draft', 'ready_for_review', 'approved', 'paid')
        ),
        lines jsonb not null default '[]'::jsonb,
        source_professionals jsonb not null default '[]'::jsonb,
        total_proposed_pay numeric,
        updated_by text,
        approved_by text,
        approved_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `
    await sql`
      insert into folha_periods (
        id, year_month, half, from_day, to_day, reference_day,
        status, lines, source_professionals, total_proposed_pay,
        updated_by, updated_at
      ) values (
        ${q.id},
        ${q.yearMonth},
        ${q.half},
        ${q.from}::date,
        ${q.to}::date,
        ${q.payDate}::date,
        ${'ready_for_review'},
        ${sql.json(lines as never)},
        ${sql.json(source as never)},
        ${total},
        ${'seed-folha-ig-q2-from-fopag'},
        now()
      )
      on conflict (id) do update set
        reference_day = excluded.reference_day,
        status = excluded.status,
        lines = excluded.lines,
        source_professionals = excluded.source_professionals,
        total_proposed_pay = excluded.total_proposed_pay,
        updated_by = excluded.updated_by,
        updated_at = now()
    `
    console.log('saved', q.id)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
