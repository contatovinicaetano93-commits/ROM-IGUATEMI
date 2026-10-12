import { describe, expect, it } from 'vitest'
import { LoginRequestSchema } from './schemas'

describe('LoginRequestSchema', () => {
  it('aceita user + password', () => {
    const r = LoginRequestSchema.safeParse({ user: 'ADMIN-IGUATEMI', password: 'Senha@123' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.user).toBe('ADMIN-IGUATEMI')
  })

  it('aceita username (form) + password', () => {
    const r = LoginRequestSchema.safeParse({ username: 'ADMIN-IGUATEMI', password: 'Senha@123' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.user).toBe('ADMIN-IGUATEMI')
  })

  it('falha sem usuário', () => {
    const r = LoginRequestSchema.safeParse({ password: 'Senha@123' })
    expect(r.success).toBe(false)
  })
})
