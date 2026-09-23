import { describe, expect, it } from 'vitest'
import {
  computeAvecLinkCoverage,
  coveragePercent,
} from '@/lib/intranet/avec-link-coverage'

describe('coveragePercent', () => {
  it('denominador 0 ou inválido → null (não inventa 0%)', () => {
    expect(coveragePercent(0, 0)).toBeNull()
    expect(coveragePercent(5, 0)).toBeNull()
    expect(coveragePercent(1, -1)).toBeNull()
  })

  it('calcula percentual com 1 casa', () => {
    expect(coveragePercent(1, 2)).toBe(50)
    expect(coveragePercent(1, 3)).toBe(33.3)
    expect(coveragePercent(0, 10)).toBe(0)
  })
})

describe('computeAvecLinkCoverage', () => {
  it('staff ativo com vs sem professional_name', () => {
    const coverage = computeAvecLinkCoverage(
      [
        { status: 'active', panel_role: 'staff', professional_name: 'Ana Souza' },
        { status: 'active', panel_role: 'staff', professional_name: null },
        { status: 'active', panel_role: 'staff', professional_name: '  ' },
        { status: 'inactive', panel_role: 'staff', professional_name: 'Old Pro' },
        { status: 'active', panel_role: 'admin', professional_name: 'Boss' },
      ],
      [],
    )
    expect(coverage.staff_active).toBe(3)
    expect(coverage.staff_with_professional_name).toBe(1)
    expect(coverage.staff_without_professional_name).toBe(2)
    expect(coverage.pct_staff_with_professional_name).toBe(33.3)
    expect(coverage.floor_roster_size).toBe(0)
    expect(coverage.pct_floor_linked).toBeNull()
    expect(coverage.pct_floor_with_avec_pro_id).toBeNull()
  })

  it('roster de piso: avec_pro_id e % linked', () => {
    const coverage = computeAvecLinkCoverage(
      [
        { status: 'active', panel_role: 'staff', professional_name: 'Ana Souza - Colorista' },
        { status: 'active', panel_role: 'staff', professional_name: 'Cida' },
      ],
      [
        { name: 'Ana Souza', avec_pro_id: '101' },
        { name: 'Beto', avec_pro_id: null },
        { name: 'Cida', avec_pro_id: '202' },
      ],
    )
    expect(coverage.floor_roster_size).toBe(3)
    expect(coverage.floor_with_avec_pro_id).toBe(2)
    expect(coverage.floor_without_avec_pro_id).toBe(1)
    expect(coverage.pct_floor_with_avec_pro_id).toBe(66.7)
    expect(coverage.floor_linked_to_employee).toBe(2)
    expect(coverage.pct_floor_linked).toBe(66.7)
  })

  it('sem staff ativo → pct staff null', () => {
    const coverage = computeAvecLinkCoverage(
      [{ status: 'active', panel_role: 'admin', professional_name: null }],
      [{ name: 'Solo', avec_pro_id: '1' }],
    )
    expect(coverage.staff_active).toBe(0)
    expect(coverage.pct_staff_with_professional_name).toBeNull()
    expect(coverage.floor_linked_to_employee).toBe(0)
    expect(coverage.pct_floor_linked).toBe(0)
  })
})
