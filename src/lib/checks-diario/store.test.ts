import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertLivePhotoCapture } from '@/lib/checks-diario/store'

describe('assertLivePhotoCapture', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('aceita foto capturada agora', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T15:00:00.000Z'))
    expect(() => assertLivePhotoCapture('2026-10-03T15:00:30.000Z')).not.toThrow()
  })

  it('rejeita foto antiga (>3 min)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T15:00:00.000Z'))
    expect(() => assertLivePhotoCapture('2026-10-03T14:56:00.000Z')).toThrow(
      /Foto antiga rejeitada/,
    )
  })

  it('exige timestamp', () => {
    expect(() => assertLivePhotoCapture(null)).toThrow(/Foto ao vivo obrigatória/)
  })
})
