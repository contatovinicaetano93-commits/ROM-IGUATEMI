import { describe, expect, it } from 'vitest'
import {
  compareByNamePtBr,
  compareScheduleByNameThenTime,
  compareScheduleByTimeThenName,
} from '@/lib/salon/sort'

describe('salon sort helpers', () => {
  it('compara nomes em pt-BR ignorando acento', () => {
    expect(compareByNamePtBr('Ána', 'Bruno')).toBeLessThan(0)
    expect(compareByNamePtBr('zé', 'Ana')).toBeGreaterThan(0)
  })

  it('agenda do dia: A–Z depois horário', () => {
    const rows = [
      { contact_name: 'Zelia', scheduled_at: '2026-07-22T09:00:00.000Z' },
      { contact_name: 'Ana', scheduled_at: '2026-07-22T11:00:00.000Z' },
      { contact_name: 'Ana', scheduled_at: '2026-07-22T09:00:00.000Z' },
    ]
    const sorted = [...rows].sort(compareScheduleByNameThenTime)
    expect(sorted.map((r) => `${r.contact_name}-${r.scheduled_at.slice(11, 16)}`)).toEqual([
      'Ana-09:00',
      'Ana-11:00',
      'Zelia-09:00',
    ])
  })

  it('próximos: horário depois A–Z', () => {
    const rows = [
      { contact_name: 'Zelia', scheduled_at: '2026-07-22T09:00:00.000Z' },
      { contact_name: 'Ana', scheduled_at: '2026-07-22T09:00:00.000Z' },
      { contact_name: 'Bruno', scheduled_at: '2026-07-22T08:00:00.000Z' },
    ]
    const sorted = [...rows].sort(compareScheduleByTimeThenName)
    expect(sorted.map((r) => r.contact_name)).toEqual(['Bruno', 'Ana', 'Zelia'])
  })
})
