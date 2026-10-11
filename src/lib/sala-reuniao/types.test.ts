import { describe, expect, it } from 'vitest'
import {
  isEndAfterStart,
  normalizeClockTime,
  rangesOverlap,
} from '@/lib/sala-reuniao/types'

describe('sala-reuniao types', () => {
  it('normaliza HH:MM e HH:MM:SS', () => {
    expect(normalizeClockTime('9:30')).toBe('09:30')
    expect(normalizeClockTime('14:05:00')).toBe('14:05')
    expect(normalizeClockTime('25:00')).toBe(null)
  })

  it('exige término depois do início', () => {
    expect(isEndAfterStart('09:00', '10:00')).toBe(true)
    expect(isEndAfterStart('10:00', '10:00')).toBe(false)
  })

  it('detecta overlap de intervalos', () => {
    expect(rangesOverlap('09:00', '10:00', '09:30', '10:30')).toBe(true)
    expect(rangesOverlap('09:00', '10:00', '10:00', '11:00')).toBe(false)
    expect(rangesOverlap('09:00', '12:00', '10:00', '11:00')).toBe(true)
  })
})
