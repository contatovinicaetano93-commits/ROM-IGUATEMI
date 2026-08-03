import { describe, expect, it } from 'vitest'
import {
  avecHadCoreProgress,
  resolveAvecFinishStatus,
} from '@/lib/avec/sync-finish-status'

describe('avecHadCoreProgress', () => {
  it('é false sem linhas core', () => {
    expect(
      avecHadCoreProgress({
        clients_upserted: 0,
        appointments_synced: 0,
        attendances_synced: 0,
        revenue_rows: 0,
        cancellation_rows: 0,
      }),
    ).toBe(false)
  })

  it('é true com qualquer contador core > 0', () => {
    expect(
      avecHadCoreProgress({
        clients_upserted: 0,
        appointments_synced: 0,
        attendances_synced: 0,
        revenue_rows: 3,
        cancellation_rows: 0,
      }),
    ).toBe(true)
  })

  it('é true com P1/P2/P3 no estágio ops', () => {
    expect(
      avecHadCoreProgress({
        clients_upserted: 0,
        appointments_synced: 0,
        attendances_synced: 0,
        revenue_rows: 0,
        cancellation_rows: 0,
        p1_rows: 12,
      }),
    ).toBe(true)
  })
})

describe('resolveAvecFinishStatus', () => {
  it('ok quando limpo', () => {
    expect(
      resolveAvecFinishStatus({
        errorCount: 0,
        hardWarningCount: 0,
        aborted: false,
        hadCoreRows: true,
      }),
    ).toBe('ok')
  })

  it('partial com hard warning; abort sem core', () => {
    expect(
      resolveAvecFinishStatus({
        errorCount: 0,
        hardWarningCount: 1,
        aborted: false,
        hadCoreRows: true,
      }),
    ).toBe('partial')
    expect(
      resolveAvecFinishStatus({
        errorCount: 0,
        hardWarningCount: 0,
        aborted: true,
        hadCoreRows: false,
      }),
    ).toBe('partial')
  })

  it('ok quando abort limpo com core e sem hard warning', () => {
    expect(
      resolveAvecFinishStatus({
        errorCount: 0,
        hardWarningCount: 0,
        aborted: true,
        hadCoreRows: true,
      }),
    ).toBe('ok')
  })

  it('error só quando erros sem progresso core', () => {
    expect(
      resolveAvecFinishStatus({
        errorCount: 1,
        hardWarningCount: 0,
        aborted: false,
        hadCoreRows: false,
      }),
    ).toBe('error')
    expect(
      resolveAvecFinishStatus({
        errorCount: 1,
        hardWarningCount: 0,
        aborted: false,
        hadCoreRows: true,
      }),
    ).toBe('partial')
    expect(
      resolveAvecFinishStatus({
        errorCount: 1,
        hardWarningCount: 0,
        aborted: true,
        hadCoreRows: false,
      }),
    ).toBe('partial')
  })

  it('catch: partial se teve progresso ou abort; senão error', () => {
    expect(
      resolveAvecFinishStatus({
        errorCount: 1,
        hardWarningCount: 0,
        aborted: false,
        hadCoreRows: true,
        thrown: true,
      }),
    ).toBe('partial')
    expect(
      resolveAvecFinishStatus({
        errorCount: 1,
        hardWarningCount: 0,
        aborted: true,
        hadCoreRows: false,
        thrown: true,
      }),
    ).toBe('partial')
    expect(
      resolveAvecFinishStatus({
        errorCount: 1,
        hardWarningCount: 0,
        aborted: false,
        hadCoreRows: false,
        thrown: true,
      }),
    ).toBe('error')
  })
})
