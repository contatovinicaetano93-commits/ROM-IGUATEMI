import { describe, expect, it } from 'vitest'
import { buildWeekKpis, formatKpiCount, formatKpiMoney, formatKpiPercent } from '@/lib/intranet/week-kpis'

describe('week kpis', () => {
  it('não inventa 0 quando não há medição', () => {
    const empty = buildWeekKpis({ revenues: [null, null], attended: [null], occupancies: [null] })
    expect(empty.revenue).toBeNull()
    expect(empty.attended).toBeNull()
    expect(empty.occupancy).toBeNull()
    expect(empty.nps).toBeNull()
    expect(formatKpiMoney(null)).toBe('—')
    expect(formatKpiCount(null)).toBe('—')
    expect(formatKpiPercent(null)).toBe('—')
  })

  it('soma só o que veio medido', () => {
    const kpis = buildWeekKpis({
      revenues: [100, null, 50],
      attended: [10, 5],
      occupancies: [0.8, 0.6],
    })
    expect(kpis.revenue).toBe(150)
    expect(kpis.attended).toBe(15)
    expect(kpis.occupancy).toBe(0.7)
    expect(kpis.nps).toBeNull()
  })
})
