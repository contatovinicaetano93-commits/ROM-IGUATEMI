import { afterEach, describe, expect, it } from 'vitest'
import {
  AUTH_COOKIE,
  buildAuthSession,
  canViewRevenue,
  createSessionToken,
  createV3SessionToken,
  getSessionSigningSecret,
  isAuthEnabled,
  isStaffAuthConfigured,
  requirePanelModule,
  validateCredentials,
} from '@/lib/auth'
import type { NextRequest } from 'next/server'

const ENV_KEYS = [
  'ROM_ADMIN_USER',
  'ROM_ADMIN_PASSWORD',
  'ROM_ACCESS_TOKEN',
  'ROM_STAFF_USER',
  'ROM_STAFF_PASSWORD',
] as const

const snapshot = new Map<string, string | undefined>()

function setEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
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

describe('auth dual login', () => {
  it('valida admin e staff com roles distintas', () => {
    setEnv({
      ROM_ADMIN_USER: 'ADMIN-BRASIL',
      ROM_ADMIN_PASSWORD: 'Senha@brasil',
      ROM_STAFF_USER: 'FUNC-BRASIL',
      ROM_STAFF_PASSWORD: 'Senha@func',
    })

    expect(isAuthEnabled()).toBe(true)
    expect(isStaffAuthConfigured()).toBe(true)
    expect(validateCredentials('ADMIN-BRASIL', 'Senha@brasil')).toEqual({
      user: 'ADMIN-BRASIL',
      role: 'admin',
    })
    expect(validateCredentials('FUNC-BRASIL', 'Senha@func')).toEqual({
      user: 'FUNC-BRASIL',
      role: 'staff',
    })
    expect(validateCredentials('admin-brasil', 'Senha@brasil')).toEqual({
      user: 'ADMIN-BRASIL',
      role: 'admin',
    })
    expect(validateCredentials('FUNC-BRASIL', 'Senha@brasil')).toBeNull()
    expect(canViewRevenue('admin')).toBe(true)
    expect(canViewRevenue('staff')).toBe(false)
  })

  it('gera tokens de sessão diferentes por role', async () => {
    setEnv({
      ROM_ADMIN_USER: 'admin',
      ROM_ADMIN_PASSWORD: 'admin-pass',
      ROM_STAFF_USER: 'staff',
      ROM_STAFF_PASSWORD: 'staff-pass',
    })

    const adminTok = await createSessionToken('admin', 'admin')
    const staffTok = await createSessionToken('staff', 'staff')
    // Formato v2.<expiraEmMs>.<hmac hex de 64 chars>
    expect(adminTok).toMatch(/^v2\.\d+\.[0-9a-f]{64}$/)
    expect(staffTok).toMatch(/^v2\.\d+\.[0-9a-f]{64}$/)
    expect(adminTok).not.toEqual(staffTok)
  })

  it('token de sessão expira e é determinístico para um exp fixo', async () => {
    setEnv({ ROM_ADMIN_USER: 'admin', ROM_ADMIN_PASSWORD: 'admin-pass' })

    const token = await createSessionToken('admin', 'admin')
    const exp = Number(token.split('.')[1])
    expect(exp).toBeGreaterThan(Date.now())

    // Verificação recomputa o esperado a partir do exp do cookie.
    expect(await createSessionToken('admin', 'admin', exp)).toEqual(token)

    // Trocar o exp muda a assinatura — cookie adulterado não valida.
    const forged = await createSessionToken('admin', 'admin', exp + 60_000)
    expect(forged).not.toEqual(token)
  })

  it('emite token v3 com nome do colaborador', async () => {
    setEnv({ ROM_ADMIN_USER: 'admin', ROM_ADMIN_PASSWORD: 'admin-pass' })
    const session = buildAuthSession('ana@rom', 'staff', { displayName: 'Ana Souza', employeeId: 'emp-1' })
    const token = await createV3SessionToken(session)
    expect(token).toMatch(/^v3\.\d+\.[A-Za-z0-9_-]+\.[0-9a-f]{64}$/)
  })

  it('guarda extras de módulo no token v3', async () => {
    setEnv({ ROM_ADMIN_USER: 'admin', ROM_ADMIN_PASSWORD: 'admin-pass' })
    const session = buildAuthSession('ana@rom', 'staff', {
      displayName: 'Ana',
      employeeId: 'emp-1',
      modules: ['financeiro'],
    })
    expect(session.modules).toEqual(['financeiro'])
    const token = await createV3SessionToken(session)
    expect(token).toMatch(/^v3\.\d+\.[A-Za-z0-9_-]+\.[0-9a-f]{64}$/)
  })
})


describe('session signing secret fail-closed', () => {
  const keys = ['ROM_SESSION_SECRET', 'ROM_ADMIN_PASSWORD', 'VERCEL', 'VERCEL_ENV', 'NODE_ENV'] as const
  const snap = new Map<string, string | undefined>()

  function set(vars: Partial<Record<(typeof keys)[number], string | undefined>>) {
    for (const key of keys) {
      if (!snap.has(key)) snap.set(key, process.env[key])
      const value = vars[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }

  afterEach(() => {
    for (const key of keys) {
      const prev = snap.get(key)
      if (prev === undefined) delete process.env[key]
      else process.env[key] = prev
    }
    snap.clear()
  })

  it('exige ROM_SESSION_SECRET em preview/production Vercel (sem fallback da senha)', async () => {
    set({
      ROM_ADMIN_PASSWORD: 'admin-pass',
      ROM_SESSION_SECRET: undefined,
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      NODE_ENV: 'production',
    })
    expect(getSessionSigningSecret()).toBe('')
  })

  it('aceita ROM_SESSION_SECRET dedicado em Vercel', async () => {
    set({
      ROM_ADMIN_PASSWORD: 'admin-pass',
      ROM_SESSION_SECRET: 'dedicated-secret',
      VERCEL: '1',
      VERCEL_ENV: 'production',
      NODE_ENV: 'production',
    })
    expect(getSessionSigningSecret()).toBe('dedicated-secret')
  })

  it('em dev local ainda faz fallback na senha admin', async () => {
    set({
      ROM_ADMIN_PASSWORD: 'admin-pass',
      ROM_SESSION_SECRET: undefined,
      VERCEL: undefined,
      VERCEL_ENV: undefined,
      NODE_ENV: 'development',
    })
    expect(getSessionSigningSecret()).toBe('admin-pass')
  })
})

describe('requirePanelModule', () => {
  const keys = [
    'ROM_ADMIN_USER',
    'ROM_ADMIN_PASSWORD',
    'ROM_STAFF_USER',
    'ROM_STAFF_PASSWORD',
    'ROM_FINANCE_USER',
    'ROM_FINANCE_PASSWORD',
    'ROM_SESSION_SECRET',
    'VERCEL',
    'VERCEL_ENV',
    'NODE_ENV',
  ] as const
  const snap = new Map<string, string | undefined>()

  function set(vars: Partial<Record<(typeof keys)[number], string | undefined>>) {
    for (const key of keys) {
      if (!snap.has(key)) snap.set(key, process.env[key])
      const value = vars[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }

  afterEach(() => {
    for (const key of keys) {
      const prev = snap.get(key)
      if (prev === undefined) delete process.env[key]
      else process.env[key] = prev
    }
    snap.clear()
  })

  it('bloqueia financeiro sem módulo contatos', async () => {
    set({
      ROM_ADMIN_USER: 'admin',
      ROM_ADMIN_PASSWORD: 'admin-pass',
      ROM_STAFF_USER: undefined,
      ROM_STAFF_PASSWORD: undefined,
      ROM_FINANCE_USER: 'fin',
      ROM_FINANCE_PASSWORD: 'fin-pass',
      ROM_SESSION_SECRET: 'test-session-secret',
      VERCEL: undefined,
      VERCEL_ENV: undefined,
      NODE_ENV: 'test',
    })
const session = buildAuthSession('fin', 'financeiro')
    const token = await createV3SessionToken(session)
    const req = {
      cookies: { get: (name: string) => (name === AUTH_COOKIE ? { value: token } : undefined) },
    } as unknown as NextRequest
    const result = await requirePanelModule(req, 'contatos')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })

  it('permite staff com módulo contatos no pacote', async () => {
    set({
      ROM_ADMIN_USER: 'admin',
      ROM_ADMIN_PASSWORD: 'admin-pass',
      ROM_STAFF_USER: 'staff',
      ROM_STAFF_PASSWORD: 'staff-pass',
      ROM_FINANCE_USER: undefined,
      ROM_FINANCE_PASSWORD: undefined,
      ROM_SESSION_SECRET: 'test-session-secret',
      VERCEL: undefined,
      VERCEL_ENV: undefined,
      NODE_ENV: 'test',
    })
const session = buildAuthSession('staff', 'staff')
    const token = await createV3SessionToken(session)
    const req = {
      cookies: { get: (name: string) => (name === AUTH_COOKIE ? { value: token } : undefined) },
    } as unknown as NextRequest
    const result = await requirePanelModule(req, 'contatos')
    expect(result.ok).toBe(true)
  })
})
