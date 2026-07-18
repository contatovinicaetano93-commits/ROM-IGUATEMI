import { describe, expect, it } from 'vitest'
import { LoginRequestSchema } from './schemas'

describe('LoginRequestSchema', () => {
  it('aceita user + password', () => {
    const r = LoginRequestSchema.safeParse({ user: 'ADMIN-BRASIL', password: 'Senha@123' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.user).toBe('ADMIN-BRASIL')
  })

  it('aceita username (form) + password', () => {
    const r = LoginRequestSchema.safeParse({ username: 'ADMIN-BRASIL', password: 'Senha@123' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.user).toBe('ADMIN-BRASIL')
  })

  it('falha sem usuário', () => {
    const r = LoginRequestSchema.safeParse({ password: 'Senha@123' })
    expect(r.success).toBe(false)
  })
})
