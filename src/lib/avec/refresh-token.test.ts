import { describe, expect, it } from 'vitest'
import { isAvecLoginConfigured } from './refresh-token'

describe('isAvecLoginConfigured', () => {
  it('exige email, senha e unit id', () => {
    const prev = {
      email: process.env.AVEC_LOGIN_EMAIL,
      pass: process.env.AVEC_LOGIN_PASSWORD,
      unit: process.env.AVEC_UNIT_ID,
    }
    try {
      process.env.AVEC_LOGIN_EMAIL = 'a@b.com'
      process.env.AVEC_LOGIN_PASSWORD = 'x'
      process.env.AVEC_UNIT_ID = '40613'
      expect(isAvecLoginConfigured()).toBe(true)
      delete process.env.AVEC_LOGIN_PASSWORD
      expect(isAvecLoginConfigured()).toBe(false)
    } finally {
      process.env.AVEC_LOGIN_EMAIL = prev.email
      process.env.AVEC_LOGIN_PASSWORD = prev.pass
      process.env.AVEC_UNIT_ID = prev.unit
    }
  })
})
