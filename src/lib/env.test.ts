import { afterEach, describe, expect, it } from 'vitest'
import { isProduction, isVercelDeploy } from '@/lib/env'

const ENV_KEYS = ['VERCEL', 'VERCEL_ENV', 'NODE_ENV'] as const

const snapshot = new Map<string, string | undefined>()

function setEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    if (!snapshot.has(key)) snapshot.set(key, process.env[key])
    const value = vars[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const prev = snapshot.get(key)
    if (prev === undefined) delete process.env[key]
    else process.env[key] = prev
  }
  snapshot.clear()
})

describe('isVercelDeploy', () => {
  it('é true com VERCEL=1', () => {
    setEnv({ VERCEL: '1', VERCEL_ENV: undefined, NODE_ENV: 'development' })
    expect(isVercelDeploy()).toBe(true)
  })

  it('é true com VERCEL_ENV=preview', () => {
    setEnv({ VERCEL: undefined, VERCEL_ENV: 'preview', NODE_ENV: 'production' })
    expect(isVercelDeploy()).toBe(true)
  })

  it('é true com VERCEL_ENV=production', () => {
    setEnv({ VERCEL: undefined, VERCEL_ENV: 'production', NODE_ENV: 'production' })
    expect(isVercelDeploy()).toBe(true)
  })

  it('é false em dev local (sem Vercel)', () => {
    setEnv({ VERCEL: undefined, VERCEL_ENV: undefined, NODE_ENV: 'development' })
    expect(isVercelDeploy()).toBe(false)
  })

  it('é false com VERCEL_ENV=development', () => {
    setEnv({ VERCEL: undefined, VERCEL_ENV: 'development', NODE_ENV: 'development' })
    expect(isVercelDeploy()).toBe(false)
  })
})

describe('isProduction', () => {
  it('distingue preview de production na Vercel', () => {
    setEnv({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })
    expect(isProduction()).toBe(false)
    setEnv({ VERCEL_ENV: 'production', NODE_ENV: 'production' })
    expect(isProduction()).toBe(true)
  })
})
