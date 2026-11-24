import { describe, expect, it } from 'vitest'
import { LAST_DONE_BACKFILL_MAX_DAYS } from '@/lib/avec/last-done-backfill'

describe('last-done-backfill limits', () => {
  it('permite até 2 anos (730d) via fatias — Avec limita só cada request', () => {
    expect(LAST_DONE_BACKFILL_MAX_DAYS).toBe(730)
  })
})
