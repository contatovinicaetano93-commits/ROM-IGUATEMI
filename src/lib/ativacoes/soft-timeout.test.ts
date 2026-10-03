import { describe, expect, it } from 'vitest'
import { softTimeout } from '@/lib/ativacoes/soft-timeout'

describe('softTimeout', () => {
  it('devolve o trabalho quando resolve a tempo', async () => {
    const value = await softTimeout(Promise.resolve('ok'), 50, () => 'fallback')
    expect(value).toBe('ok')
  })

  it('devolve fallback quando estoura o prazo', async () => {
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve('late'), 80)
    })
    const value = await softTimeout(slow, 15, () => 'fallback')
    expect(value).toBe('fallback')
  })
})
