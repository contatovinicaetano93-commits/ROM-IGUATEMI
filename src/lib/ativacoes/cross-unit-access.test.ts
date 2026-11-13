import { describe, expect, it } from 'vitest'
import {
  canWritePeerAtivacoes,
  listCrossUnitWriteEmailsForTests,
  normalizeAtivacaoActorEmail,
} from '@/lib/ativacoes/cross-unit-access'

describe('ativacoes cross-unit access', () => {
  it('normaliza e-mail', () => {
    expect(normalizeAtivacaoActorEmail(' Amanda.Souza@RomConcept.com.br ')).toBe(
      'amanda.souza@romconcept.com.br',
    )
  })

  it('libera só Amanda', () => {
    expect(canWritePeerAtivacoes({ user: 'amanda.souza@romconcept.com.br' })).toBe(true)
    expect(canWritePeerAtivacoes({ user: 'Amanda.Souza@romconcept.com.br' })).toBe(true)
    expect(canWritePeerAtivacoes({ user: 'outra@romconcept.com.br' })).toBe(false)
    expect(canWritePeerAtivacoes({ user: 'admin' })).toBe(false)
    expect(canWritePeerAtivacoes(null)).toBe(false)
  })

  it('allowlist contém Amanda', () => {
    expect(listCrossUnitWriteEmailsForTests()).toContain('amanda.souza@romconcept.com.br')
  })
})
