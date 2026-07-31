import { describe, expect, it } from 'vitest'
import {
  avecHadCoreProgress,
  resolveAvecFinishStatus,
} from '@/lib/avec/sync-finish-status'

describe('avecHadCoreProgress', () => {
  it('detecta progresso core', () => {
    expect(
      avecHadCoreProgress({
        clients_upserted: 0,
        appointments_synced: 2,
        attendances_synced: 0,
        revenue_rows: 0,
        cancellation_rows: 0,
      }),
    ).toBe(true)
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
})

describe('resolveAvecFinishStatus', () => {
  it('retorna ok sem erros/hard warnings/abort', () => {
    expect(
      resolveAvecFinishStatus({
        errorCount: 0,
        hardWarningCount: 0,
        aborted: false,
        hadCoreRows: true,
      }),
    ).toBe('ok')
  })

  it('retorna error sem progresso core', () => {
    expect(
      resolveAvecFinishStatus({
        errorCount: 1,
        hardWarningCount: 0,
        aborted: false,
        hadCoreRows: false,
      }),
    ).toBe('error')
  })

  it('retorna partial com progresso core + erro', () => {
    expect(
      resolveAvecFinishStatus({
        errorCount: 1,
        hardWarningCount: 0,
        aborted: false,
        hadCoreRows: true,
      }),
    ).toBe('partial')
  })

  it('catch com progresso → partial', () => {
    expect(
      resolveAvecFinishStatus({
        errorCount: 1,
        hardWarningCount: 0,
        aborted: false,
        hadCoreRows: true,
        thrown: true,
      }),
    ).toBe('partial')
  })

  it('catch sem progresso → error', () => {
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

  it('retorna partial quando aborted mesmo sem core rows', () => {
    expect(
      resolveAvecFinishStatus({
        errorCount: 1,
        hardWarningCount: 0,
        aborted: true,
        hadCoreRows: false,
      }),
    ).toBe('partial')
  })

  it('trata hard warning como partial', () => {
    expect(
      resolveAvecFinishStatus({
        errorCount: 0,
        hardWarningCount: 1,
        aborted: false,
        hadCoreRows: false,
      }),
    ).toBe('partial')
  })
})
