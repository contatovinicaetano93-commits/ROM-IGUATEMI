import { afterEach, describe, expect, it } from 'vitest'
import { shouldRunBootMigrations } from './boot-migrations'

describe('shouldRunBootMigrations', () => {
  const prev = {
    DATABASE_URL: process.env.DATABASE_URL,
    ROM_SKIP_BOOT_MIGRATIONS: process.env.ROM_SKIP_BOOT_MIGRATIONS,
    VERCEL: process.env.VERCEL,
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('returns false without DATABASE_URL', () => {
    delete process.env.DATABASE_URL
    expect(shouldRunBootMigrations()).toBe(false)
  })

  it('returns false when ROM_SKIP_BOOT_MIGRATIONS=1', () => {
    process.env.DATABASE_URL = 'postgres://local/test'
    process.env.ROM_SKIP_BOOT_MIGRATIONS = '1'
    expect(shouldRunBootMigrations()).toBe(false)
  })

  it('returns false on Vercel serverless', () => {
    process.env.DATABASE_URL = 'postgres://local/test'
    process.env.VERCEL = '1'
    expect(shouldRunBootMigrations()).toBe(false)
  })

  it('returns true for local dev with DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgres://local/test'
    delete process.env.ROM_SKIP_BOOT_MIGRATIONS
    delete process.env.VERCEL
    expect(shouldRunBootMigrations()).toBe(true)
  })
})
