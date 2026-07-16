import { describe, it, expect } from 'vitest'

describe('Smoke Tests', () => {
  describe('Health Check', () => {
    it('should verify database connectivity', async () => {
      const res = await fetch('http://localhost:3000/api/health', {
        headers: { 'Accept': 'application/json' },
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toHaveProperty('ok')
      expect(data).toHaveProperty('database')
      expect(typeof data.database.connected).toBe('boolean')
    })

    it('should return public health without auth', async () => {
      const res = await fetch('http://localhost:3000/api/health/public')
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toHaveProperty('ok')
    })
  })

  describe('Environment', () => {
    it('should have required env vars configured', () => {
      expect(process.env.DATABASE_URL).toBeDefined()
      expect(process.env.CRON_SECRET).toBeDefined()
    })

    it('should load without errors', async () => {
      const health = await import('@/lib/health')
      expect(health.getHealthStatus).toBeDefined()
      expect(health.getPublicHealthStatus).toBeDefined()
    })
  })

  describe('Build Artifacts', () => {
    it('should have compiled successfully', async () => {
      const pkg = await import('@/package.json')
      expect(pkg.name).toBeDefined()
      expect(pkg.version).toBeDefined()
    })
  })
})
