import { describe, expect, it } from 'vitest'
import {
  acceptsFolhaTaxExtras,
  clampQuinzenaFetchEnd,
  defaultFolhaQuinzena,
  defaultFolhaTaxQuinzena,
  folhaQuinzenasForDailyRefresh,
  formatPayDateBr,
  isoToBrDay,
  listRecentQuinzenas,
  parseFolhaPeriodId,
  payDateForHalf,
  quinzenaAvecRangeBr,
  quinzenaForDay,
  resolveFolhaQuinzena,
} from '@/lib/folha/period'

describe('folha period pay dates', () => {
  it('Q1 paga dia 20 do mesmo mês', () => {
    expect(payDateForHalf('2026-09', 1)).toBe('2026-09-20')
    expect(quinzenaForDay('2026-09-10').payDate).toBe('2026-09-20')
  })

  it('Q2 paga dia 05 do mês seguinte', () => {
    expect(payDateForHalf('2026-09', 2)).toBe('2026-10-05')
    expect(quinzenaForDay('2026-09-30').payDate).toBe('2026-10-05')
    expect(payDateForHalf('2026-12', 2)).toBe('2027-01-05')
  })

  it('default em 01/10 → Q2/09 (pagamento 05/10)', () => {
    const q = defaultFolhaQuinzena('2026-10-01')
    expect(q.id).toBe('2026-09-q2')
    expect(q.payDate).toBe('2026-10-05')
  })

  it('default em 06/10 → Q1/10 (pagamento 20/10)', () => {
    const q = defaultFolhaQuinzena('2026-10-06')
    expect(q.id).toBe('2026-10-q1')
    expect(q.payDate).toBe('2026-10-20')
  })

  it('parse e resolve period id', () => {
    expect(parseFolhaPeriodId('2026-09-q2')?.from).toBe('2026-09-16')
    expect(resolveFolhaQuinzena({ periodId: '2026-10-q1' }).payDate).toBe('2026-10-20')
    expect(formatPayDateBr('2026-10-05')).toBe('05/10/2026')
  })

  it('lista recentes inclui mês passado', () => {
    const list = listRecentQuinzenas({ today: '2026-10-01', count: 4 })
    expect(list.map((q) => q.id)).toEqual([
      '2026-10-q1',
      '2026-09-q2',
      '2026-09-q1',
      '2026-08-q2',
    ])
  })

  it('janela Avec da quinzena corta no fim do período (fechada)', () => {
    const q = quinzenaForDay('2026-09-30')
    expect(clampQuinzenaFetchEnd(q, '2026-10-01')).toBe('2026-09-30')
    expect(quinzenaAvecRangeBr(q, '2026-10-01')).toEqual({
      inicio: '16/09/2026',
      fim: '30/09/2026',
      fimIso: '2026-09-30',
    })
    expect(isoToBrDay('2026-09-16')).toBe('16/09/2026')
  })

  it('janela Avec da quinzena em curso corta em hoje', () => {
    const q = quinzenaForDay('2026-09-20')
    expect(clampQuinzenaFetchEnd(q, '2026-09-22')).toBe('2026-09-22')
    expect(quinzenaAvecRangeBr(q, '2026-09-22').fim).toBe('22/09/2026')
  })

  it('DARF/DAS/mensalidade só na Q1 (pagamento dia 20)', () => {
    expect(acceptsFolhaTaxExtras(1)).toBe(true)
    expect(acceptsFolhaTaxExtras(2)).toBe(false)
    expect(defaultFolhaTaxQuinzena('2026-10-01').id).toBe('2026-10-q1')
    expect(defaultFolhaTaxQuinzena('2026-10-15').payDate).toBe('2026-10-20')
    expect(defaultFolhaTaxQuinzena('2026-10-21').id).toBe('2026-11-q1')
  })

  it('cron diário: em 01/10 atualiza Q2/09 (paga 05) + Q1/10 (calendário)', () => {
    expect(folhaQuinzenasForDailyRefresh('2026-10-01').map((q) => q.id)).toEqual([
      '2026-09-q2',
      '2026-10-q1',
    ])
  })

  it('cron diário: em 10/10 só Q1/10 (próximo pagamento = calendário)', () => {
    expect(folhaQuinzenasForDailyRefresh('2026-10-10').map((q) => q.id)).toEqual([
      '2026-10-q1',
    ])
  })
})
