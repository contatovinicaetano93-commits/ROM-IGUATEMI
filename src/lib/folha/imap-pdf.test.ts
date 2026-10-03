import { describe, expect, it } from 'vitest'
import { extractPdfText } from '@/lib/folha/imap-pdf'

describe('extractPdfText', () => {
  it('PDF inválido → texto vazio, mantém o nome', async () => {
    const out = await extractPdfText(Buffer.from('not-a-pdf'), 'guia.pdf')
    expect(out.fileName).toBe('guia.pdf')
    expect(out.text).toBe('')
  })
})
