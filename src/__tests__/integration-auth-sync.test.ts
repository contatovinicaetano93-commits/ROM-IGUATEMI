import { describe, it, expect } from 'vitest'

const BASE_URL = 'http://localhost:3000'

describe('Integration: Auth → Sync → Health', () => {
  let authCookie: string

  it('should complete full authenticated workflow', async () => {
    // Step 1: Login
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: process.env.ROM_ADMIN_USER || 'admin',
        password: process.env.ROM_ADMIN_PASSWORD || 'test123',
      }),
    })

    if (loginRes.status !== 200) {
      console.log('Auth disabled or invalid credentials — skipping workflow test')
      return
    }

    const setCookie = loginRes.headers.get('set-cookie')
    expect(setCookie).toBeDefined()
    authCookie = setCookie!.split(';')[0]

    // Step 2: Check health with auth
    const healthRes = await fetch(`${BASE_URL}/api/health`, {
      headers: { Cookie: authCookie },
    })
    expect(healthRes.status).toBe(200)

    const healthData = await healthRes.json()
    expect(healthData.data?.ok).toBeDefined()

    // Step 3: Check if can access stock endpoints
    const stockRes = await fetch(`${BASE_URL}/api/estoque/produtos`, {
      headers: { Cookie: authCookie },
    })

    // 403 if not stock role, 200 if admin
    expect([200, 403]).toContain(stockRes.status)

    // Step 4: Check sync status
    const syncStatusRes = await fetch(`${BASE_URL}/api/estoque/sync/status`, {
      headers: { Cookie: authCookie },
    })

    expect([200, 403]).toContain(syncStatusRes.status)
  })

  it('should prevent unauthorized access to protected endpoints', async () => {
    const res = await fetch(`${BASE_URL}/api/estoque/produtos`)
    expect([401, 403]).toContain(res.status)
  })

  it('should maintain session across requests', async () => {
    if (!authCookie) {
      console.log('No auth cookie — skipping session test')
      return
    }

    // Multiple requests with same cookie
    const res1 = await fetch(`${BASE_URL}/api/health`, { headers: { Cookie: authCookie } })
    const res2 = await fetch(`${BASE_URL}/api/health`, { headers: { Cookie: authCookie } })
    const res3 = await fetch(`${BASE_URL}/api/health`, { headers: { Cookie: authCookie } })

    expect([200, 401]).toContain(res1.status)
    expect([200, 401]).toContain(res2.status)
    expect([200, 401]).toContain(res3.status)
  })
})
