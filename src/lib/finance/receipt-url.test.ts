import { describe, expect, it } from 'vitest'
import {
  FINANCE_RECEIPT_BLOB_PREFIX,
  assertFinanceReceiptBlobPathname,
  financeReceiptBlobPathname,
  isAllowedFinanceReceiptUrl,
  isFinanceReceiptBlobPathname,
  isVercelBlobHostForLegacyReceipt,
  safeFinanceReceiptFileName,
} from './receipt-url'

describe('finance/receipt-url', () => {
  it('sanitiza nome do arquivo', () => {
    expect(safeFinanceReceiptFileName('Nota Fiscal #1.pdf')).toBe('Nota_Fiscal_1.pdf')
    expect(safeFinanceReceiptFileName('...')).toBe('recibo.pdf')
  })

  it('pathname fica sob financeiro/', () => {
    const path = financeReceiptBlobPathname('nota.jpg')
    expect(path.startsWith(FINANCE_RECEIPT_BLOB_PREFIX)).toBe(true)
    expect(isFinanceReceiptBlobPathname(path)).toBe(true)
  })

  it('rejeita pathname fora do prefixo', () => {
    expect(isFinanceReceiptBlobPathname('curriculos/x.pdf')).toBe(false)
    expect(isFinanceReceiptBlobPathname('financeiro/')).toBe(false)
    expect(isFinanceReceiptBlobPathname('financeiro/../x.pdf')).toBe(false)
    expect(() => assertFinanceReceiptBlobPathname('other/x.pdf')).toThrow(/Pathname inválido/)
  })

  it('null/omit/vazio OK (recibo opcional)', () => {
    expect(isAllowedFinanceReceiptUrl(null)).toBe(true)
    expect(isAllowedFinanceReceiptUrl(undefined)).toBe(true)
    expect(isAllowedFinanceReceiptUrl('')).toBe(true)
  })

  it('aceita só https blob sob /financeiro/', () => {
    expect(
      isAllowedFinanceReceiptUrl(
        'https://abc.public.blob.vercel-storage.com/financeiro/1-nota.pdf',
      ),
    ).toBe(true)
    expect(
      isAllowedFinanceReceiptUrl('https://abc.blob.vercel-storage.com/financeiro/1-nota.pdf'),
    ).toBe(true)
    expect(
      isAllowedFinanceReceiptUrl(
        'https://abc.public.blob.vercel-storage.com/curriculos/cv.pdf',
      ),
    ).toBe(false)
    expect(isAllowedFinanceReceiptUrl('https://evil.com/financeiro/x.pdf')).toBe(false)
  })

  it('legado: host blob sem prefixo financeiro só para proxy', () => {
    expect(
      isVercelBlobHostForLegacyReceipt(
        'https://abc.public.blob.vercel-storage.com/nota-antiga.pdf',
      ),
    ).toBe(true)
    expect(isVercelBlobHostForLegacyReceipt('https://evil.com/nota.pdf')).toBe(false)
  })
})
