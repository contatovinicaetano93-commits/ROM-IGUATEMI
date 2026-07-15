import { describe, expect, it, vi } from 'vitest'
import { buildRuleBrief, generateBrief } from '@/lib/brief'
import type { ContactRow } from '@/lib/contacts'

vi.mock('@/lib/ai/client', () => ({
  isAiConfigured: vi.fn(() => false),
  askAI: vi.fn(),
}))

const contact: ContactRow = {
  id: 'c1',
  name: 'Maria',
  phone: '11999990000',
  email: null,
  channel: 'whatsapp',
  source: 'manual',
  status: 'novo',
  avec_client_id: null,
  notes: null,
  preferred_manicurist: null,
  preferred_hairstylist: null,
  first_contact_at: new Date().toISOString(),
  last_contact_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  anonymized_at: null,
}

describe('buildRuleBrief', () => {
  it('inclui recomendações quando existem', () => {
    const text = buildRuleBrief(contact, [], [
      { type: 'overdue', title: 'Retorno atrasado', detail: 'Corte venceu há 5 dias' },
    ])
    expect(text).toContain('Maria')
    expect(text).toContain('Retorno atrasado')
  })
})

describe('generateBrief', () => {
  it('usa regras quando IA não está configurada', async () => {
    const result = await generateBrief(contact, [], [])
    expect(result.source).toBe('rules')
    expect(result.brief).toContain('Maria')
  })
})
