import { describe, expect, it } from 'vitest'
import {
  buildRuleCmsAssistantResponse,
  generateCmsAssistantResponse,
  isCmsAssistantMode,
} from '@/lib/cms-editor-assistant'

describe('cms-editor-assistant', () => {
  it('reconhece modos válidos', () => {
    expect(isCmsAssistantMode('titulo')).toBe(true)
    expect(isCmsAssistantMode('seo')).toBe(true)
    expect(isCmsAssistantMode('outro')).toBe(false)
  })

  it('gera títulos e lead por regras', () => {
    const titles = buildRuleCmsAssistantResponse({
      mode: 'titulo',
      kind: 'news',
      topic: 'Workshop de colorimetria',
      notes: 'Unidade Brasil recebeu a marca parceira. Camila conduziu o treinamento.',
    })
    expect(titles.source).toBe('rules')
    expect(titles.output).toContain('Workshop de colorimetria')
    expect(titles.tips.length).toBeGreaterThan(0)

    const lead = buildRuleCmsAssistantResponse({
      mode: 'lead',
      kind: 'event',
      topic: 'Home Summit interno',
      notes: 'O encontro reuniu profissionais das duas unidades.',
    })
    expect(lead.output.toLowerCase()).toContain('encontro')
  })

  it('valida entrada do generate', async () => {
    const bad = await generateCmsAssistantResponse({
      mode: 'x',
      kind: 'news',
      topic: 'a',
      notes: 'b',
    })
    expect('error' in bad).toBe(true)

    const ok = await generateCmsAssistantResponse({
      mode: 'seo',
      kind: 'news',
      topic: 'ROM News digital',
      notes: 'Substitui o PDF interno por feed em tempo real.',
    })
    expect('error' in ok).toBe(false)
    if (!('error' in ok)) {
      expect(ok.mode).toBe('seo')
      expect(ok.output).toMatch(/Title|ROM News/i)
    }
  })
})
