import { describe, expect, it } from 'vitest'
import {
  extractRows,
  formatTruncationWarning,
  getAvecSyncMaxPages,
  wasPaginationTruncated,
  type AvecReportFetchResult,
} from '@/lib/avec/client'

describe('extractRows', () => {
  it('extrai array direto', () => {
    expect(extractRows([{ id: 1 }])).toEqual([{ id: 1 }])
  })

  it('extrai de chave data', () => {
    expect(extractRows({ data: [{ id: 2 }] })).toEqual([{ id: 2 }])
  })

  it('extrai de data.rows aninhado', () => {
    expect(extractRows({ data: { rows: [{ id: 3 }] } })).toEqual([{ id: 3 }])
  })

  it('extrai de data.report.result (formato oficial Avec Reports)', () => {
    expect(
      extractRows({
        code: 200,
        data: { report: { description: 'x', result: [{ faturamento: 100, data: '2026-07-22' }] } },
      }),
    ).toEqual([{ faturamento: 100, data: '2026-07-22' }])
  })
})

describe('pagination truncation', () => {
  it('detecta quando última página está cheia no limite', () => {
    expect(wasPaginationTruncated(250, 250, 20, 20)).toBe(true)
    expect(wasPaginationTruncated(100, 250, 5, 20)).toBe(false)
    expect(wasPaginationTruncated(250, 250, 19, 20)).toBe(false)
  })

  it('formata aviso legível para o admin', () => {
    const result: AvecReportFetchResult = {
      rows: new Array(5000).fill({}),
      truncated: true,
      pagesFetched: 20,
      maxPages: 20,
      limit: 250,
    }
    const msg = formatTruncationWarning('0004', result)
    expect(msg).toContain('clientes')
    expect(msg).toContain('5000')
    expect(msg).toContain('AVEC_SYNC_MAX_PAGES')
  })

  it('usa padrão 200 páginas e respeita env', () => {
    const env = process.env
    delete process.env.AVEC_SYNC_MAX_PAGES
    expect(getAvecSyncMaxPages()).toBe(200)
    process.env.AVEC_SYNC_MAX_PAGES = '350'
    expect(getAvecSyncMaxPages()).toBe(350)
    process.env.AVEC_SYNC_MAX_PAGES = '9999'
    expect(getAvecSyncMaxPages()).toBe(500)
    process.env = env
  })
})
