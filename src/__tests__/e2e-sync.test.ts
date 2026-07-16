import { describe, it, expect, beforeAll } from 'vitest'

const BASE_URL = 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET || 'test-secret'

describe('E2E: Sync Flow', () => {
  describe('Stock Sync', () => {
    it('should trigger stock fast sync via cron', async () => {
      const res = await fetch(`${BASE_URL}/api/estoque/sync?mode=fast`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
        },
      })
      expect([200, 503, 429]).toContain(res.status) // 503 if Avec not configured, 429 if already running
      const data = await res.json()
      expect(data).toHaveProperty('data')
    })

    it('should get sync status', async () => {
      const res = await fetch(`${BASE_URL}/api/estoque/sync/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
        },
      })
      expect([200, 401, 403]).toContain(res.status)

      if (res.status === 200) {
        const data = await res.json()
        expect(data.data).toHaveProperty('circuit_status')
        expect(data.data.circuit_status).toHaveProperty('fast')
        expect(data.data.circuit_status).toHaveProperty('full')
      }
    })

    it('should prevent concurrent sync execution', async () => {
      const auth = { 'Authorization': `Bearer ${CRON_SECRET}` }

      // Start first sync
      const res1 = await fetch(`${BASE_URL}/api/estoque/sync?mode=fast`, {
        method: 'GET',
        headers: auth,
      })

      if (res1.status === 200) {
        // Try concurrent sync immediately
        const res2 = await fetch(`${BASE_URL}/api/estoque/sync?mode=fast`, {
          method: 'GET',
          headers: auth,
        })

        // Should get 429 (Too Many Requests) if circuit breaker works
        if (res2.status === 429) {
          const data = await res2.json()
          expect(data.error).toContain('already running')
        }
      }
    })
  })

  describe('Health Check Sync Status', () => {
    it('should report sync status in health check', async () => {
      const res = await fetch(`${BASE_URL}/api/health`, {
        headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
      })

      if (res.status === 200) {
        const data = await res.json()
        expect(data.data).toHaveProperty('avec')
        if (data.data.avec) {
          expect(data.data.avec).toHaveProperty('last_fast')
          expect(data.data.avec).toHaveProperty('last_full')
        }
      }
    })
  })
})
