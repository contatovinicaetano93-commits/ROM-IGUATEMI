import { describe, expect, it } from 'vitest'
import {
  decideFolhaImapCronRun,
  folhaImapPayWatchWindow,
  isoAddDays,
  resolveFolhaImapCronWindow,
} from '@/lib/folha/imap-cron-window'

describe('folha IMAP cron window', () => {
  it('isoAddDays atravessa mês', () => {
    expect(isoAddDays('2026-10-05', -5)).toBe('2026-09-30')
    expect(isoAddDays('2026-10-20', -5)).toBe('2026-10-15')
  })

  it('Q1 dia 20: frequente 15–20', () => {
    expect(folhaImapPayWatchWindow('2026-10-20')).toEqual({
      from: '2026-10-15',
      to: '2026-10-20',
    })
    expect(resolveFolhaImapCronWindow('2026-10-14').cadence).toBe('daily')
    expect(resolveFolhaImapCronWindow('2026-10-15')).toMatchObject({
      cadence: 'frequent',
      payDate: '2026-10-20',
      periodId: '2026-10-q1',
    })
    expect(resolveFolhaImapCronWindow('2026-10-20').cadence).toBe('frequent')
    expect(resolveFolhaImapCronWindow('2026-10-21').cadence).toBe('daily')
  })

  it('Q2 dia 05: frequente 30–05 (mês anterior → pagamento)', () => {
    expect(resolveFolhaImapCronWindow('2026-09-29').cadence).toBe('daily')
    expect(resolveFolhaImapCronWindow('2026-09-30')).toMatchObject({
      cadence: 'frequent',
      payDate: '2026-10-05',
      periodId: '2026-09-q2',
      windowFrom: '2026-09-30',
    })
    expect(resolveFolhaImapCronWindow('2026-10-01').cadence).toBe('frequent')
    expect(resolveFolhaImapCronWindow('2026-10-05').cadence).toBe('frequent')
    expect(resolveFolhaImapCronWindow('2026-10-06')).toMatchObject({
      cadence: 'daily',
      payDate: '2026-10-20',
    })
  })

  it('cron: 1×/dia fora da janela; a cada tick dentro', () => {
    const dailyNoonBr = new Date('2026-10-10T12:00:00.000Z')
    const dailyNoonIg = new Date('2026-10-10T12:10:00.000Z')
    const offSlot = new Date('2026-10-10T12:20:00.000Z')
    const watchTick = new Date('2026-10-18T03:40:00.000Z')

    expect(
      decideFolhaImapCronRun({
        today: '2026-10-10',
        now: dailyNoonBr,
        panel: 'brasil',
      }),
    ).toMatchObject({ shouldPoll: true, trigger: 'daily_slot', cadence: 'daily' })

    expect(
      decideFolhaImapCronRun({
        today: '2026-10-10',
        now: dailyNoonIg,
        panel: 'brasil',
      }),
    ).toMatchObject({ shouldPoll: false, trigger: 'skip' })

    expect(
      decideFolhaImapCronRun({
        today: '2026-10-10',
        now: dailyNoonIg,
        panel: 'iguatemi',
      }),
    ).toMatchObject({ shouldPoll: true, trigger: 'daily_slot' })

    expect(
      decideFolhaImapCronRun({
        today: '2026-10-10',
        now: offSlot,
        panel: 'brasil',
      }),
    ).toMatchObject({
      shouldPoll: false,
      trigger: 'skip',
      skipped: 'awaiting_daily_slot',
    })

    expect(
      decideFolhaImapCronRun({
        today: '2026-10-18',
        now: watchTick,
        panel: 'brasil',
      }),
    ).toMatchObject({ shouldPoll: true, trigger: 'pay_watch', cadence: 'frequent' })

    expect(
      decideFolhaImapCronRun({
        today: '2026-10-10',
        now: offSlot,
        panel: 'brasil',
        force: true,
      }),
    ).toMatchObject({ shouldPoll: true, trigger: 'manual' })
  })
})
