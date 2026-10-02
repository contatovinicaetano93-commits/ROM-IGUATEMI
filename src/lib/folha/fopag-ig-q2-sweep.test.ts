/**
 * Full Fopag IG Q2 sweep — vitest harness (avoids server-only via db).
 * Fixture versionada em `fixtures/`; opcionalmente grava artifact local.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import {
  resolveFopagIgQ2Target,
  synthesizeFopagIgQ2,
  type FopagBonusRow,
  type FopagIgQ2Row,
  type FopagPattern,
} from '@/lib/folha/fopag-ig-q2-synthesize'

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/fopag-ig-q2-parsed.json',
)
const parsed = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  fopag_ig_q2: FopagIgQ2Row[]
  bonus_romeu_ig: FopagBonusRow[]
}

describe('Fopag IG Q2 full sweep', () => {
  it('writes artifact and reports match rate; key people match', () => {
    const people: Array<{
      name: string
      cargo: string | null
      fopag_liq: number
      target_liq: number
      motor_proposed: number | null
      diff: number | null
      pattern: FopagPattern
      status: 'match' | 'gap' | 'needs_rh_input'
      notes: string[]
      rh_extras: string[]
      flags: string[]
    }> = []

    for (const f of parsed.fopag_ig_q2) {
      if (f.liquido <= 0.005 && f.faturado <= 0.005) continue
      const syn0 = synthesizeFopagIgQ2(f, parsed.bonus_romeu_ig)
      const { target, syn } = resolveFopagIgQ2Target(
        f,
        syn0,
        parsed.bonus_romeu_ig,
      )
      const line = buildFolhaDraftLine('iguatemi', syn.row, syn.extras, {
        applyTaxExtras: false,
      })
      const proposed = line.proposed_pay
      const diff = proposed == null ? null : proposed - target
      let status: 'match' | 'gap' | 'needs_rh_input' = 'gap'
      if (proposed != null && Math.abs(diff!) <= 0.5) status = 'match'
      else if (
        syn.notes.some((n) => n.startsWith('meio_rate_mismatch')) ||
        syn.pattern === 'unknown'
      ) {
        status = 'needs_rh_input'
      } else if (proposed != null && Math.abs(diff!) <= 3) {
        status = 'match'
      }
      people.push({
        name: f.name,
        cargo: f.cargo,
        fopag_liq: f.liquido,
        target_liq: target,
        motor_proposed: proposed,
        diff,
        pattern: syn.pattern,
        status,
        notes: syn.notes,
        rh_extras: syn.rhExtras,
        flags: line.flags,
      })
    }

    const matches = people.filter((p) => p.status === 'match')
    const gaps = people.filter((p) => p.status === 'gap')
    const rh = people.filter((p) => p.status === 'needs_rh_input')
    const highlightKeys = [
      'brunna fabricio',
      'daniel chabaribery',
      'daniela machado rocha',
      'gabriela da silva santos',
      'lucas rodrigues',
      'maykon',
      'joanides',
      'gildenice',
      'romeu felipe',
      'pedro e f diello',
      'liria pereira',
    ]
    const highlight = people.filter((p) =>
      highlightKeys.some((h) => p.name.toLowerCase().includes(h)),
    )

    const out = {
      period: '2026-09-q2',
      panel: 'iguatemi',
      source: 'fopag_synthetic_8123',
      match_rate: `${matches.length}/${people.length}`,
      counts: {
        total: people.length,
        match: matches.length,
        gap: gaps.length,
        needs_rh_input: rh.length,
      },
      highlight,
      gaps: gaps.map((g) => ({
        name: g.name,
        cargo: g.cargo,
        fopag_liq: g.fopag_liq,
        target_liq: g.target_liq,
        motor_proposed: g.motor_proposed,
        diff: g.diff,
        pattern: g.pattern,
        notes: g.notes,
        rh_extras: g.rh_extras,
      })),
      people,
    }
    const artifactDir = '/opt/cursor/artifacts'
    if (existsSync(artifactDir) || existsSync('/opt/cursor')) {
      try {
        mkdirSync(artifactDir, { recursive: true })
        writeFileSync(
          join(artifactDir, 'fopag-ig-q2-full-sweep.json'),
          JSON.stringify(out, null, 2),
        )
      } catch {
        // CI / ambientes sem /opt/cursor — fixture + asserts bastam.
      }
    }

    const by = (substr: string) =>
      highlight.find((h) => h.name.toLowerCase().includes(substr))

    expect(by('brunna')?.motor_proposed).toBeCloseTo(68976.53, 0)
    expect(by('daniel chabaribery')?.motor_proposed).toBeCloseTo(17611.26, 0)
    expect(by('daniela machado')?.motor_proposed).toBeCloseTo(19755.805, 0)
    expect(by('gabriela da silva santos')?.motor_proposed).toBeCloseTo(
      2137.77,
      0,
    )
    expect(by('gabriela da silva santos')?.status).toBe('match')
    expect(by('lucas rodrigues')?.motor_proposed).toBeCloseTo(777.56, 0)
    expect(by('maykon')?.motor_proposed).toBeCloseTo(22723.17, 0)
    expect(by('joanides')?.motor_proposed).toBeCloseTo(47658.4, 0)
    expect(by('gildenice')?.motor_proposed).toBeCloseTo(
      12253.695 - 2892.875 + 289.2875,
      0,
    )
    expect(by('gildenice')?.status).toBe('match')
    expect(by('romeu felipe')?.motor_proposed).toBeCloseTo(542.1, 0)
    expect(by('diello')?.motor_proposed).toBeCloseTo(
      12071.51 - 2127.3 + 212.73,
      0,
    )
    expect(by('liria')?.motor_proposed).toBeCloseTo(2598.12, 0)
    expect(by('daniela machado')?.status).toBe('match')
    expect(by('diello')?.status).toBe('match')
    expect(by('liria')?.status).toBe('match')

    expect(matches.length / people.length).toBeGreaterThanOrEqual(0.95)
    expect(rh.length).toBe(0)
  })
})
