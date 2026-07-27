import { describe, expect, it } from 'vitest'
import {
  buildContactsPerDayChart,
  contactKpiWindow,
  eachDayInclusive,
} from '@/lib/salon/contact-kpi-chart'

describe('contact-kpi-chart', () => {
  it('janela de N dias inclui o dia de referência', () => {
    expect(contactKpiWindow(30, '2026-07-26')).toEqual({
      from: '2026-06-27',
      to: '2026-07-26',
      days: 30,
    })
  })

  it('lista dias inclusivos', () => {
    expect(eachDayInclusive('2026-07-29', '2026-07-31')).toEqual([
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
    ])
  })

  it('preenche zeros e ignora dias fora da janela', () => {
    const chart = buildContactsPerDayChart(
      [
        { day: '2026-07-29T03:00:00.000Z', channel: 'avec', contacts_count: 2 },
        { day: '2026-07-31', channel: 'whatsapp', contacts_count: 5 },
        { day: '2026-07-31', channel: 'avec', contacts_count: 1 },
        { day: '2026-06-01', channel: 'avec', contacts_count: 999 },
      ],
      '2026-07-29',
      '2026-07-31',
    )
    expect(chart).toEqual([
      { day: '2026-07-29', label: '07-29', total: 2 },
      { day: '2026-07-30', label: '07-30', total: 0 },
      { day: '2026-07-31', label: '07-31', total: 6 },
    ])
  })
})
