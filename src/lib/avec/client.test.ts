import { describe, expect, it } from 'vitest'
import {
  extractRows,
  formatTruncationWarning,
  getAvecSyncMaxPages,
  wasPaginationTruncated,
  withRequiredAvecReportParams,
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

describe('withRequiredAvecReportParams', () => {
  it('adiciona defaults exigidos pelos relatórios Avec que aceitam filtros vazios', () => {
    expect(withRequiredAvecReportParams('0149', { inicio: '24/07/2026' })).toMatchObject({
      inicio: '24/07/2026',
      local: '',
    })
    expect(withRequiredAvecReportParams('0021', { inicio: '01/07/2026', fim: '24/07/2026' })).toMatchObject({
      inicio: '01/07/2026',
      fim: '24/07/2026',
      tipo: 'todos',
    })
    expect(withRequiredAvecReportParams('0126', { inicio: '01/07/2026', fim: '24/07/2026' })).toMatchObject({
      minutos: 60,
    })
    expect(withRequiredAvecReportParams('0107', { limit: 250 })).toMatchObject({
      dias: 90,
      limit: 250,
    })
  })

  it('preenche intervalo mensal para aniversariantes quando o caller nao envia datas', () => {
    const params = withRequiredAvecReportParams('0001', { limit: 250 })
    expect(params.limit).toBe(250)
    expect(params.inicio).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    expect(params.fim).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })

  it('converte inicio/fim do 0007 para os quatro parametros exigidos', () => {
    expect(
      withRequiredAvecReportParams('0007', {
        inicio: '01/07/2026',
        fim: '24/07/2026',
        limit: 250,
      }),
    ).toEqual({
      inicio1: '17/05/2026',
      fim1: '01/07/2026',
      inicio2: '01/07/2026',
      fim2: '24/07/2026',
      limit: 250,
    })
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
