import { describe, expect, it } from 'vitest'
import {
  avecReportHeaders,
  extractRows,
  formatTruncationWarning,
  getAvecSyncMaxPages,
  isAvecWafForbiddenError,
  normalizeAvecApiToken,
  calendarMonthRangeBr,
  periodRangeEndingOn,
  wasPaginationTruncated,
  withRequiredAvecReportParams,
  type AvecReportFetchResult,
} from '@/lib/avec/client'

describe('normalizeAvecApiToken / WAF helpers', () => {
  it('remove prefixo Bearer', () => {
    expect(normalizeAvecApiToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(normalizeAvecApiToken('abc.def.ghi')).toBe('abc.def.ghi')
  })

  it('monta headers com Origin/User-Agent do admin Avec', () => {
    const h = avecReportHeaders('Bearer tok')
    expect(h.Authorization).toBe('tok')
    expect(h.Origin).toBe('https://admin.avec.beauty')
    expect(h['User-Agent']).toMatch(/Safari/)
  })

  it('detecta 403 HTML de WAF', () => {
    const err = new Error('Avec 0004 HTTP 403: <html><title>403 Forbidden</title></html>')
    ;(err as Error & { status?: number }).status = 403
    expect(isAvecWafForbiddenError(err)).toBe(true)
    const json = new Error('Avec 0004 HTTP 403: {"error":"forbidden"}')
    ;(json as Error & { status?: number }).status = 403
    expect(isAvecWafForbiddenError(json)).toBe(false)
  })
})

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

  it('0011 exige salao_id (AVEC_UNIT_ID)', () => {
    const prev = process.env.AVEC_UNIT_ID
    process.env.AVEC_UNIT_ID = '99801'
    expect(
      withRequiredAvecReportParams('0011', {
        inicio: '01/04/2026',
        fim: '30/06/2026',
        limit: 250,
      }),
    ).toMatchObject({
      salao_id: '99801',
      inicio: '01/04/2026',
      fim: '30/06/2026',
      limit: 250,
    })
    process.env.AVEC_UNIT_ID = prev
  })

  it('0051 usa site como origem Online/Local (não AVEC_UNIT_ID)', () => {
    expect(withRequiredAvecReportParams('0051', { site: '40613', inicio: '24/07/2026' })).toMatchObject({
      site: '',
      profissional_id: '',
    })
    expect(withRequiredAvecReportParams('0051', { site: '1' })).toMatchObject({ site: '1' })
  })

  it('0248 default status Faltou (0.6)', () => {
    expect(withRequiredAvecReportParams('0248', { inicio: '01/07/2026', fim: '24/07/2026' })).toMatchObject({
      status: '0.6',
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
      startPage: 1,
      endPage: 20,
      hasMore: true,
      nextPage: 21,
    }
    const msg = formatTruncationWarning('0004', result)
    expect(msg).toContain('clientes')
    expect(msg).toContain('5000')
    expect(msg).toContain('páginas 1–20')
    expect(msg).toContain('Continuar sync')
  })

  it('nomeia relatórios de estoque no aviso de truncamento', () => {
    const result: AvecReportFetchResult = {
      rows: new Array(250).fill({}),
      truncated: true,
      pagesFetched: 200,
      maxPages: 200,
      limit: 250,
      startPage: 1,
      endPage: 200,
      hasMore: true,
      nextPage: 201,
    }
    expect(formatTruncationWarning('0046', result)).toContain('alertas de estoque')
    expect(formatTruncationWarning('0149', result)).toContain('posição de estoque')
    expect(formatTruncationWarning('0046', result)).toContain('página 201')
  })

  it('usa padrão 80 páginas e respeita env', () => {
    const prev = process.env.AVEC_SYNC_MAX_PAGES
    delete process.env.AVEC_SYNC_MAX_PAGES
    expect(getAvecSyncMaxPages()).toBe(80)
    process.env.AVEC_SYNC_MAX_PAGES = '350'
    expect(getAvecSyncMaxPages()).toBe(350)
    process.env.AVEC_SYNC_MAX_PAGES = '9999'
    expect(getAvecSyncMaxPages()).toBe(500)
    if (prev === undefined) delete process.env.AVEC_SYNC_MAX_PAGES
    else process.env.AVEC_SYNC_MAX_PAGES = prev
  })

  it('calcula hasMore/nextPage a partir do lote (startPage + maxPages)', () => {
    const startPage = 201
    const maxPages = 200
    const endPage = 400
    const hasMore = wasPaginationTruncated(250, 250, maxPages, maxPages)
    const nextPage = hasMore ? endPage + 1 : null
    expect(hasMore).toBe(true)
    expect(nextPage).toBe(401)
    expect(endPage - startPage + 1).toBe(maxPages)
  })

  it('nextPage fica null quando última página não está cheia', () => {
    const hasMore = wasPaginationTruncated(100, 250, 4, 10)
    expect(hasMore).toBe(false)
  })
})

describe('periodRangeEndingOn', () => {
  it('ancora janela ~30d no fim do mês', () => {
    expect(periodRangeEndingOn('2026-04-30', 30)).toEqual({
      inicio: '31/03/2026',
      fim: '30/04/2026',
    })
  })

  it('aceita daysBack 0 (só o dia âncora)', () => {
    expect(periodRangeEndingOn('2026-01-15', 0)).toEqual({
      inicio: '15/01/2026',
      fim: '15/01/2026',
    })
  })
})

describe('calendarMonthRangeBr', () => {
  it('mês fechado: 1º → último dia', () => {
    expect(calendarMonthRangeBr('2026-07-31')).toEqual({
      inicio: '01/07/2026',
      fim: '31/07/2026',
    })
  })

  it('mês em aberto: 1º → âncora (MTD)', () => {
    expect(calendarMonthRangeBr('2026-08-06')).toEqual({
      inicio: '01/08/2026',
      fim: '06/08/2026',
    })
  })
})
