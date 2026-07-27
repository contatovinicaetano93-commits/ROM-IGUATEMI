import { describe, expect, it } from 'vitest'
import { isNeonQuotaError, neonQuotaUserMessage } from '@/lib/avec/neon-errors'
import { SNAPSHOT_PAYLOAD_REPORT_IDS } from '@/lib/avec/snapshots'

describe('isNeonQuotaError', () => {
  it('detecta data transfer quota 402', () => {
    expect(
      isNeonQuotaError(
        new Error(
          'Server error (HTTP status 402): {"message":"Your project has exceeded the data transfer quota. Upgrade your plan to increase limits."}'
        )
      )
    ).toBe(true)
  })

  it('detecta size limit', () => {
    expect(
      isNeonQuotaError(
        new Error('could not extend file because project size limit (512 MB) has been exceeded')
      )
    ).toBe(true)
  })

  it('detecta 402 Payment Required genérico', () => {
    expect(isNeonQuotaError(new Error('FetcherError: 402 Payment Required'))).toBe(true)
  })

  it('detecta http status 402 sem neon no texto', () => {
    expect(isNeonQuotaError(new Error('Server error (HTTP status 402): blocked'))).toBe(true)
  })

  it('ignora erros comuns', () => {
    expect(isNeonQuotaError(new Error('relation does not exist'))).toBe(false)
  })
})

describe('neonQuotaUserMessage', () => {
  it('mensagens distintas para size vs transfer', () => {
    expect(neonQuotaUserMessage(new Error('project size limit'))).toMatch(/espaço/i)
    expect(neonQuotaUserMessage(new Error('data transfer quota'))).toMatch(/transferência/i)
  })
})

describe('SNAPSHOT_PAYLOAD_REPORT_IDS', () => {
  it('só valorização de estoque mantém payload', () => {
    expect(SNAPSHOT_PAYLOAD_REPORT_IDS.has('0045')).toBe(true)
    expect(SNAPSHOT_PAYLOAD_REPORT_IDS.has('0004')).toBe(false)
    expect(SNAPSHOT_PAYLOAD_REPORT_IDS.has('0051')).toBe(false)
  })
})
