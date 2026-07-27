import { describe, expect, it } from 'vitest'
import { displayServiceName, serviceTicketAvg } from '@/lib/salon/service-display'

describe('service-display', () => {
  it('remove preço de tabela do nome', () => {
    expect(displayServiceName('CORTE P - 400,00')).toBe('CORTE P')
    expect(displayServiceName('COLORACAO M - 600,00')).toBe('COLORACAO M')
    expect(displayServiceName('REFLEXO ROMEU - 3.000,00')).toBe('REFLEXO ROMEU')
    expect(displayServiceName('ESCOVA M')).toBe('ESCOVA M')
  })

  it('calcula ticket médio real', () => {
    expect(serviceTicketAvg(247_182, 580)).toBeCloseTo(426.18, 1)
    expect(serviceTicketAvg(9000, 5)).toBe(1800)
    expect(serviceTicketAvg(100, 0)).toBeNull()
  })
})
