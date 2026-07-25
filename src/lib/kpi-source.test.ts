import { describe, expect, it } from 'vitest'
import { formatKpiSources, kpiSourceFromSyncStatus } from '@/lib/kpi-source'

describe('formatKpiSources', () => {
  it('junta rótulos PT sem duplicar', () => {
    expect(formatKpiSources('proxy', 'avec')).toBe('proxy · Avec')
    expect(formatKpiSources('avec', 'avec', 'stale')).toBe('Avec · desatualizado')
  })
})

describe('kpiSourceFromSyncStatus', () => {
  it('mapeia partial/stale', () => {
    expect(kpiSourceFromSyncStatus('partial')).toBe('incomplete')
    expect(kpiSourceFromSyncStatus('stale')).toBe('stale')
    expect(kpiSourceFromSyncStatus('ok')).toBeNull()
  })
})
