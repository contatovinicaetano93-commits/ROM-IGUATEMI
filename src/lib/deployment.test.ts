import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { validateDeploymentEnv } from '@/lib/deployment'

describe('validateDeploymentEnv', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
  })

  afterEach(() => {
    process.env = env
  })

  it('alerta quando ROM_PANEL e NEXT_PUBLIC_ROM_PANEL divergem', () => {
    process.env.ROM_PANEL = 'iguatemi'
    process.env.NEXT_PUBLIC_ROM_PANEL = 'brasil'
    process.env.DATABASE_URL = 'postgres://x'
    process.env.AVEC_API_TOKEN = 'token'

    const result = validateDeploymentEnv()
    expect(result.ok).toBe(false)
    expect(result.warnings.some((w) => w.includes('ROM_PANEL'))).toBe(true)
  })

  it('ok quando painel e integrações estão alinhados', () => {
    process.env.ROM_PANEL = 'iguatemi'
    process.env.NEXT_PUBLIC_ROM_PANEL = 'iguatemi'
    process.env.DATABASE_URL = 'postgres://x'
    process.env.AVEC_API_TOKEN = 'token'
    process.env.AVEC_UNIT_ID = '123'
    delete process.env.VERCEL_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.ROM_EXPECTED_DB_HOST

    const result = validateDeploymentEnv()
    expect(result.ok).toBe(true)
  })

  it('alerta quando host Vercel parece outra unidade', () => {
    process.env.ROM_PANEL = 'iguatemi'
    process.env.NEXT_PUBLIC_ROM_PANEL = 'iguatemi'
    process.env.DATABASE_URL = 'postgres://x'
    process.env.AVEC_API_TOKEN = 'token'
    process.env.AVEC_UNIT_ID = '123'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'rom-club.vercel.app'

    const result = validateDeploymentEnv()
    expect(result.ok).toBe(false)
    expect(result.warnings.some((w) => w.includes('rom-club'))).toBe(true)
  })

  it('alerta quando DATABASE_URL não casa com ROM_EXPECTED_DB_HOST', () => {
    process.env.ROM_PANEL = 'iguatemi'
    process.env.NEXT_PUBLIC_ROM_PANEL = 'iguatemi'
    process.env.DATABASE_URL = 'postgres://ep-other.neon.tech/db' // exemplo errado: BR/IG devem usar Supabase
    process.env.AVEC_API_TOKEN = 'token'
    process.env.AVEC_UNIT_ID = '123'
    process.env.ROM_EXPECTED_DB_HOST = 'ep-iguatemi'
    delete process.env.VERCEL_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL

    const result = validateDeploymentEnv()
    expect(result.ok).toBe(false)
    expect(result.warnings.some((w) => w.includes('ROM_EXPECTED_DB_HOST'))).toBe(true)
  })
})
