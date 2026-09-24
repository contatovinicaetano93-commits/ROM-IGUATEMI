import { describe, expect, it } from 'vitest'
import {
  computePanelSyncOk,
  computeCommissions8123Health,
  hardTimeoutHealthMessage,
  isClassic300sHardTimeout,
  isCommissions8123BudgetSkipWarning,
  isEmptyKillAvecRun,
  isHardPlatformTimeoutAvecRun,
  pickHojeAvecSyncRun,
  pickNewestUsableAvecRun,
} from '@/lib/avec/sync-run-health'

const NOW = Date.parse('2026-07-31T12:00:00.000Z')

function iso(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString()
}

describe('isEmptyKillAvecRun', () => {
  it('detecta kill/abandon como empty-kill', () => {
    expect(
      isEmptyKillAvecRun({ status: 'error', error: 'Sync interrompido (timeout/kill)' }),
    ).toBe(true)
    expect(isEmptyKillAvecRun({ status: 'error', error: 'abandoned_partial_timeout' })).toBe(
      true,
    )
    expect(isEmptyKillAvecRun({ status: 'error', error: 'P3 falhou' })).toBe(false)
    expect(isEmptyKillAvecRun({ status: 'ok', error: null })).toBe(false)
  })
})

describe('isHardPlatformTimeoutAvecRun', () => {
  it('marca kill duro sem aborted', () => {
    expect(
      isHardPlatformTimeoutAvecRun({
        status: 'error',
        error: 'Sync interrompido (timeout/kill)',
        stats: { platform_kill_age_s: 305 },
      }),
    ).toBe(true)
  })

  it('ignora abort limpo por orçamento', () => {
    expect(
      isHardPlatformTimeoutAvecRun({
        status: 'partial',
        error: 'orçamento esgotado',
        stats: { aborted: true },
      }),
    ).toBe(false)
  })

  it('classic300 só na janela ~280-320s', () => {
    expect(
      isClassic300sHardTimeout({
        status: 'error',
        error: 'abandoned_partial_timeout',
        stats: { platform_kill_age_s: 305 },
      }),
    ).toBe(true)
    expect(
      isClassic300sHardTimeout({
        status: 'error',
        error: 'abandoned_partial_timeout',
        stats: { platform_kill_age_s: 720 },
      }),
    ).toBe(false)
  })

  it('mensagem de health aponta Fluid quando classic300', () => {
    const msg = hardTimeoutHealthMessage({ count: 2, classic300: 1 })
    expect(msg).toMatch(/Fluid Compute/)
    expect(hardTimeoutHealthMessage({ count: 0, classic300: 0 })).toBeNull()
  })
})

describe('pickNewestUsableAvecRun', () => {
  it('ignora empty-kill recente quando há ok mais antigo', () => {
    const picked = pickNewestUsableAvecRun([
      {
        status: 'error',
        created_at: iso(5),
        error: 'Sync interrompido (timeout/kill)',
        kind: 'fast',
      },
      { status: 'ok', created_at: iso(40), error: null, kind: 'full' },
    ])
    expect(picked?.status).toBe('ok')
    expect(picked?.kind).toBe('full')
  })

  it('mantém erro real mais recente', () => {
    const picked = pickNewestUsableAvecRun([
      { status: 'error', created_at: iso(5), error: 'P3 falhou', kind: 'full' },
      { status: 'ok', created_at: iso(40), error: null, kind: 'fast' },
    ])
    expect(picked?.status).toBe('error')
    expect(picked?.error).toBe('P3 falhou')
  })

  it('se só há empty-kill, devolve o mais recente', () => {
    const picked = pickNewestUsableAvecRun([
      {
        status: 'error',
        created_at: iso(5),
        error: 'abandoned_partial_timeout',
        kind: 'fast',
      },
    ])
    expect(picked?.kind).toBe('fast')
  })
})

describe('pickHojeAvecSyncRun', () => {
  it('prefere fast ok mesmo com full mais novo', () => {
    const picked = pickHojeAvecSyncRun(
      { status: 'ok', created_at: iso(40), error: null, kind: 'fast' },
      { status: 'partial', created_at: iso(5), error: null, kind: 'full' },
    )
    expect(picked?.kind).toBe('fast')
  })

  it('pula fast empty-kill e usa full ok', () => {
    const picked = pickHojeAvecSyncRun(
      {
        status: 'error',
        created_at: iso(5),
        error: 'Sync interrompido (timeout/kill)',
        kind: 'fast',
      },
      { status: 'ok', created_at: iso(40), error: null, kind: 'full' },
    )
    expect(picked?.kind).toBe('full')
  })
})

describe('computePanelSyncOk', () => {
  it('falha sem runs', () => {
    expect(computePanelSyncOk(null, null, NOW).ok).toBe(false)
  })

  it('falha em erro real no fast', () => {
    const r = computePanelSyncOk(
      { status: 'error', created_at: iso(10), error: 'P3 falhou' },
      { status: 'ok', created_at: iso(60), error: null },
      NOW,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/fast status=error/)
  })

  it('aceita partial com abort limpo e fast fresco', () => {
    const r = computePanelSyncOk(
      { status: 'ok', created_at: iso(20), error: null },
      {
        status: 'partial',
        created_at: iso(120),
        error: 'orçamento esgotado',
        stats: { aborted: true },
      },
      NOW,
    )
    expect(r.ok).toBe(true)
  })

  it('falha quando fast está stale', () => {
    const r = computePanelSyncOk(
      { status: 'ok', created_at: iso(90), error: null },
      { status: 'ok', created_at: iso(120), error: null },
      NOW,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/fast stale/)
  })

  it('empty-kill recente não mascara fast stale', () => {
    const r = computePanelSyncOk(
      {
        status: 'error',
        created_at: iso(5),
        error: 'Sync interrompido (timeout/kill)',
      },
      { status: 'ok', created_at: iso(120), error: null },
      NOW,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/no fast sync|only empty-kill/)
  })

  it('running órfão antigo não mascara stale', () => {
    const r = computePanelSyncOk(
      {
        status: 'partial',
        created_at: iso(90),
        error: null,
        stats: { running: true },
      },
      { status: 'ok', created_at: iso(120), error: null },
      NOW,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/fast stale/)
  })
})

describe('computeCommissions8123Health', () => {
  it('sem stats → ok null (não inventa verde)', () => {
    expect(computeCommissions8123Health(null).ok).toBeNull()
    expect(computeCommissions8123Health(undefined).ok).toBeNull()
    expect(computeCommissions8123Health({}).ok).toBeNull()
  })

  it('budget skip → ok false (pode ficar vermelho)', () => {
    const h = computeCommissions8123Health({
      warnings: [
        'sync: orçamento esgotado em P1 (abort limpo)',
        '8123: comissões puladas — orçamento esgotado (Meu faturamento sem refresh)',
      ],
    })
    expect(h.ok).toBe(false)
    expect(h.skipped_budget).toBe(true)
    expect(h.message).toMatch(/8123/)
    expect(isCommissions8123BudgetSkipWarning(h.message!)).toBe(true)
  })

  it('erro 8123 → ok false', () => {
    const h = computeCommissions8123Health({
      errors: ['8123 commissions: HTTP 500'],
      commissions_rows: null,
    })
    expect(h.ok).toBe(false)
    expect(h.has_errors).toBe(true)
    expect(h.skipped_budget).toBe(false)
  })

  it('commissions_rows presente sem erro → ok true', () => {
    const h = computeCommissions8123Health({ commissions_rows: 12, warnings: [], errors: [] })
    expect(h.ok).toBe(true)
    expect(h.rows).toBe(12)
    expect(h.message).toBeNull()
  })
})
