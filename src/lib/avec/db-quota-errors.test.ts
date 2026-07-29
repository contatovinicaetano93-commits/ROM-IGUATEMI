import { describe, expect, it } from 'vitest'
import { isDbQuotaError, dbQuotaUserMessage } from '@/lib/avec/db-quota-errors'

describe('isDbQuotaError', () => {
  it('detecta data transfer quota 402', () => {
    expect(
      isDbQuotaError(
        new Error(
          'Server error (HTTP status 402): {"message":"Your project has exceeded the data transfer quota. Upgrade your plan to increase limits."}'
        )
      )
    ).toBe(true)
  })

  it('detecta project size limit', () => {
    expect(
      isDbQuotaError(
        new Error('could not extend file because project size limit')
      )
    ).toBe(true)
  })

  it('detecta FetcherError 402 Payment Required', () => {
    expect(isDbQuotaError(new Error('FetcherError: 402 Payment Required'))).toBe(true)
  })

  it('detecta http status 402 sem neon no texto', () => {
    expect(isDbQuotaError(new Error('Server error (HTTP status 402): blocked'))).toBe(true)
  })

  it('ignora erros comuns', () => {
    expect(isDbQuotaError(new Error('relation does not exist'))).toBe(false)
  })
})

describe('dbQuotaUserMessage', () => {
  it('diferencia espaço vs transferência', () => {
    expect(dbQuotaUserMessage(new Error('project size limit'))).toMatch(/espaço/i)
    expect(dbQuotaUserMessage(new Error('data transfer quota'))).toMatch(/transferência/i)
  })
})
