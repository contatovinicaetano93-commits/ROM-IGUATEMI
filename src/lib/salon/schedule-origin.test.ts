import { describe, expect, it } from 'vitest'
import {
  COMANDA_ORIGIN_TAG,
  COMANDA_SERVICE_NAME,
  isComandaOrigin,
  notesWithScheduleOrigin,
} from '@/lib/salon/schedule-origin'

describe('schedule-origin', () => {
  it('marca e limpa tag de comanda nas notes', () => {
    expect(notesWithScheduleOrigin(null, 'comanda')).toBe(COMANDA_ORIGIN_TAG)
    expect(notesWithScheduleOrigin('obs', 'comanda')).toBe(`${COMANDA_ORIGIN_TAG} obs`)
    expect(notesWithScheduleOrigin(`${COMANDA_ORIGIN_TAG} obs`, 'agenda')).toBe('obs')
  })

  it('detecta origem comanda por tag ou nome', () => {
    expect(isComandaOrigin({ notes: COMANDA_ORIGIN_TAG })).toBe(true)
    expect(isComandaOrigin({ name: COMANDA_SERVICE_NAME })).toBe(true)
    expect(isComandaOrigin({ name: 'Corte', notes: null })).toBe(false)
  })
})
