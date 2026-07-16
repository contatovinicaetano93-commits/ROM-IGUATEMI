import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const BASE_URL = 'http://localhost:3000'
const TEST_USER = process.env.ROM_ADMIN_USER || 'admin'
const TEST_PASS = process.env.ROM_ADMIN_PASSWORD || 'test123'

describe('E2E: Auth Flow', () => {
  let cookie: string

  describe('Login', () => {
    it('should reject invalid credentials', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'invalid', password: 'wrong' }),
      })
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBeDefined()
    })

    it('should accept valid credentials and set cookie', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: TEST_USER, password: TEST_PASS }),
      })
      expect(res.status).toBe(200)

      const setCookie = res.headers.get('set-cookie')
      expect(setCookie).toBeDefined()
      cookie = setCookie!.split(';')[0]

      const data = await res.json()
      expect(data.data?.auth).toBe('ok')
    })
  })

  describe('Protected Routes', () => {
    it('should reject request without cookie', async () => {
      const res = await fetch(`${BASE_URL}/api/health`)
      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it('should allow request with valid cookie', async () => {
      const res = await fetch(`${BASE_URL}/api/health`, {
        headers: { Cookie: cookie },
      })
      expect(res.status).toBe(200)
    })

    it('should access admin-only endpoints with auth', async () => {
      const res = await fetch(`${BASE_URL}/api/financeiro/kpis`, {
        headers: { Cookie: cookie },
      })
      expect([200, 403]).toContain(res.status) // 403 if not admin
    })
  })

  describe('Logout', () => {
    it('should clear auth cookie', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Cookie: cookie },
      })
      expect(res.status).toBe(200)

      const setCookie = res.headers.get('set-cookie')
      expect(setCookie).toContain('maxAge=0')
    })

    it('should reject requests after logout', async () => {
      const res = await fetch(`${BASE_URL}/api/health`, {
        headers: { Cookie: cookie },
      })
      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })
})
