import { describe, expect, it } from 'vitest'
import {
  isEmptyKillAvecRun,
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
