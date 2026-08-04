import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { isCronAuthorized } from '@/lib/cron-auth'

function req(headers: Record<string, string>) {
  return new Request('https://rom-club.vercel.app/api/director-report', {
    headers,
  }) as unknown as import('next/server').NextRequest
}

describe('isCronAuthorized', () => {
  const prev = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret'
  })

  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = prev
  })

  it('aceita Bearer CRON_SECRET', () => {
    expect(isCronAuthorized(req({ authorization: 'Bearer test-cron-secret' }))).toBe(true)
  })

  it('aceita x-cron-secret', () => {
    expect(isCronAuthorized(req({ 'x-cron-secret': 'test-cron-secret' }))).toBe(true)
  })

  it('rejeita só x-vercel-cron sem secret', () => {
    expect(isCronAuthorized(req({ 'x-vercel-cron': '1' }))).toBe(false)
  })

  it('rejeita secret errado', () => {
    expect(isCronAuthorized(req({ authorization: 'Bearer wrong' }))).toBe(false)
  })

  it('fail-closed sem CRON_SECRET', () => {
    delete process.env.CRON_SECRET
    expect(isCronAuthorized(req({ authorization: 'Bearer test-cron-secret' }))).toBe(false)
  })
})
