import { describe, expect, it } from 'vitest'
import { countDistinctContactIds } from '@/lib/salon/headcount'

describe('countDistinctContactIds', () => {
  it('conta pessoas únicas, não linhas', () => {
    expect(
      countDistinctContactIds([
        { contact_id: 'a' },
        { contact_id: 'a' },
        { contact_id: 'b' },
        { contact_id: null },
        { contact_id: '  ' },
      ]),
    ).toBe(2)
  })

  it('retorna 0 para lista vazia', () => {
    expect(countDistinctContactIds([])).toBe(0)
  })
})
