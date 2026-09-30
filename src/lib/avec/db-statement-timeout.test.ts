import { describe, expect, it, afterEach } from 'vitest'
import {
  PG_STATEMENT_TIMEOUT_CODE,
  isPostgresStatementTimeoutError,
  noteStatementTimeoutSoftFail,
  statementTimeoutSoftMessage,
} from '@/lib/avec/db-statement-timeout'
import {
  resolveAvecFinishStatus,
} from '@/lib/avec/sync-finish-status'
import {
  getSyncBudgetRemainingMs,
  hasSyncBudgetForHeavyStep,
  setActiveSyncDeadlineAt,
  SYNC_HEAVY_STEP_MIN_MS,
} from '@/lib/avec/sync-budget'

afterEach(() => {
  setActiveSyncDeadlineAt(null)
})

describe('isPostgresStatementTimeoutError', () => {
  it('reconhece code 57014 (string e number)', () => {
    expect(isPostgresStatementTimeoutError({ code: PG_STATEMENT_TIMEOUT_CODE })).toBe(true)
    expect(isPostgresStatementTimeoutError({ code: 57014 })).toBe(true)
  })

  it('reconhece mensagem canceling statement due to statement timeout', () => {
    expect(
      isPostgresStatementTimeoutError(
        new Error('canceling statement due to statement timeout'),
      ),
    ).toBe(true)
    expect(
      isPostgresStatementTimeoutError(new Error('PostgresError: statement timeout')),
    ).toBe(true)
  })

  it('não marca erros comuns', () => {
    expect(isPostgresStatementTimeoutError(new Error('relation does not exist'))).toBe(false)
    expect(isPostgresStatementTimeoutError({ code: '23505' })).toBe(false)
    expect(isPostgresStatementTimeoutError(null)).toBe(false)
  })
})

describe('noteStatementTimeoutSoftFail → finish status', () => {
  it('vira partial (não error) com abort + progresso', () => {
    const stats = { aborted: false as boolean | undefined, warnings: [] as string[], errors: [] as string[] }
    noteStatementTimeoutSoftFail(stats, 'full/catalog')
    expect(stats.aborted).toBe(true)
    expect(stats.warnings[0]).toBe(statementTimeoutSoftMessage('full/catalog'))
    expect(
      resolveAvecFinishStatus({
        errorCount: 0,
        hardWarningCount: 0,
        aborted: true,
        hadCoreRows: true,
        thrown: true,
      }),
    ).toBe('partial')
  })

  it('sem core e thrown+aborted → partial', () => {
    expect(
      resolveAvecFinishStatus({
        errorCount: 0,
        hardWarningCount: 0,
        aborted: true,
        hadCoreRows: false,
        thrown: true,
      }),
    ).toBe('partial')
  })
})

describe('hasSyncBudgetForHeavyStep', () => {
  it('sem deadline → true', () => {
    expect(hasSyncBudgetForHeavyStep()).toBe(true)
  })

  it('recusa iniciar passo pesado com <30s restantes', () => {
    const now = Date.now()
    setActiveSyncDeadlineAt(now + 20_000)
    expect(hasSyncBudgetForHeavyStep(SYNC_HEAVY_STEP_MIN_MS, now)).toBe(false)
    expect(getSyncBudgetRemainingMs(now)).toBe(20_000)
  })

  it('aceita com ≥30s restantes', () => {
    const now = Date.now()
    setActiveSyncDeadlineAt(now + 45_000)
    expect(hasSyncBudgetForHeavyStep(SYNC_HEAVY_STEP_MIN_MS, now)).toBe(true)
  })
})
