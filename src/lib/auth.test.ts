import { afterEach, describe, expect, it } from 'vitest'
import {
  canViewRevenue,
  createSessionToken,
  isAuthEnabled,
  isStaffAuthConfigured,
  validateCredentials,
} from '@/lib/auth'

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
    expect(adminTok).toHaveLength(64)
    expect(staffTok).toHaveLength(64)
    expect(adminTok).not.toEqual(staffTok)
  })
})
