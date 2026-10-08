import { describe, expect, it } from 'vitest'
import { buildRuleBriefing } from '@/lib/curriculos/brief'

describe('buildRuleBriefing', () => {
  it('monta briefing com nome, cargo e tags', () => {
    const brief = buildRuleBriefing({
      candidateName: 'Ana',
      desiredRole: 'manicure',
      extractedText: 'Trabalhou como manicure em spa por 3 anos',
      keywords: ['spa'],
    })
    expect(brief).toContain('Ana')
    expect(brief).toContain('manicure')
    expect(brief).toContain('Tags:')
  })
})
