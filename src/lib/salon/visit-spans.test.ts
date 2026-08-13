import { describe, expect, it } from 'vitest'
import {
  addCalendarDaysYmd,
  computeComandaDurationMinutes,
  shouldStartComandaClock,
} from '@/lib/salon/visit-spans'

describe('computeComandaDurationMinutes', () => {
  it('arredonda para 1 casa', () => {
    expect(
      computeComandaDurationMinutes('2026-08-13T12:00:00.000Z', '2026-08-13T13:30:00.000Z'),
    ).toBe(90)
  })

  it('rejeita < 1 min e > 8h', () => {
    expect(
      computeComandaDurationMinutes('2026-08-13T12:00:00.000Z', '2026-08-13T12:00:30.000Z'),
    ).toBeNull()
    expect(
      computeComandaDurationMinutes('2026-08-13T12:00:00.000Z', '2026-08-13T21:00:01.000Z'),
    ).toBeNull()
  })
})

describe('shouldStartComandaClock', () => {
  const base = {
    apptDay: '2026-08-13',
    today: '2026-08-13',
    yesterday: '2026-08-12',
    isPaid: false,
    isLost: false,
    isOpenComanda: true,
    inSalonOpen: true,
    scheduleOrigin: 'agenda' as const,
  }

  it('começa em Em Atendimento no dia da visita', () => {
    expect(shouldStartComandaClock(base)).toBe(true)
  })

  it('começa walk-in/comanda sem relógio', () => {
    expect(
      shouldStartComandaClock({
        ...base,
        inSalonOpen: false,
        scheduleOrigin: 'comanda',
      }),
    ).toBe(true)
  })

  it('não começa em Agendado com horário (booking)', () => {
    expect(
      shouldStartComandaClock({
        ...base,
        inSalonOpen: false,
        scheduleOrigin: 'agenda',
      }),
    ).toBe(false)
  })

  it('não começa em dia futuro', () => {
    expect(shouldStartComandaClock({ ...base, apptDay: '2026-08-20' })).toBe(false)
  })

  it('não começa se já está Pago', () => {
    expect(shouldStartComandaClock({ ...base, isPaid: true })).toBe(false)
  })
})

describe('addCalendarDaysYmd', () => {
  it('volta um dia', () => {
    expect(addCalendarDaysYmd('2026-08-13', -1)).toBe('2026-08-12')
  })
})
