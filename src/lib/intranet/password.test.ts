import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/intranet/password'

describe('intranet password', () => {
  it('verifica hash PBKDF2', async () => {
    const hash = await hashPassword('Senha@forte1')
    expect(hash.startsWith('pbkdf2$')).toBe(true)
    expect(await verifyPassword('Senha@forte1', hash)).toBe(true)
    expect(await verifyPassword('outra', hash)).toBe(false)
  })
})
