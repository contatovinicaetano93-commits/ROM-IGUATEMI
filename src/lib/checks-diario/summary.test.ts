import { describe, expect, it } from 'vitest'
import {
  checksDayProgressLabel,
  summarizeChecksPeople,
} from '@/lib/checks-diario/summary'

describe('summarizeChecksPeople', () => {
  it('não conta pessoa sem rotina como pendente', () => {
    const summary = summarizeChecksPeople(
      [
        { total_tasks: 0, done_tasks: 0 },
        { total_tasks: 0, done_tasks: 0 },
        { total_tasks: 2, done_tasks: 2 },
        { total_tasks: 3, done_tasks: 1 },
        { total_tasks: 1, done_tasks: 0 },
      ],
      4,
    )
    expect(summary).toEqual({
      people: 5,
      complete: 1,
      partial: 1,
      pending: 1,
      no_routine: 2,
      with_routine: 3,
      logs_today: 4,
    })
  })

  it('equipe só com cards vazios fica 0 pendentes', () => {
    const summary = summarizeChecksPeople([
      { total_tasks: 0, done_tasks: 0 },
      { total_tasks: 0, done_tasks: 0 },
    ])
    expect(summary.pending).toBe(0)
    expect(summary.complete).toBe(0)
    expect(summary.with_routine).toBe(0)
    expect(summary.no_routine).toBe(2)
  })
})

describe('checksDayProgressLabel', () => {
  it('não diz 0/2 ok quando ninguém tem check', () => {
    expect(
      checksDayProgressLabel({
        people: 2,
        complete: 0,
        partial: 0,
        pending: 0,
        no_routine: 2,
        with_routine: 0,
        logs_today: 0,
      }),
    ).toBe('sem rotina · 2 na equipe')
  })

  it('separa ok da rotina e quem ainda não tem check', () => {
    expect(
      checksDayProgressLabel({
        people: 4,
        complete: 2,
        partial: 0,
        pending: 1,
        no_routine: 1,
        with_routine: 3,
        logs_today: 2,
      }),
    ).toBe('2/3 ok · 1 sem rotina')
  })
})
