import { describe, expect, it, afterEach } from 'vitest'
import {
  CLIENT_DUMP_MIN_GAP_MS,
  CATALOG_MAX_PAGES_PER_RUN_DEFAULT,
  catalog0004PendingNextPage,
  catalogPaginationAfterIncompleteUpsert,
  getCatalogMaxPagesPerRun,
  shouldRunClientCatalogDump,
} from '@/lib/avec/sync-catalog'

describe('getCatalogMaxPagesPerRun', () => {
  afterEach(() => {
    delete process.env.AVEC_CATALOG_MAX_PAGES
  })

  it('default 20', () => {
    delete process.env.AVEC_CATALOG_MAX_PAGES
    expect(getCatalogMaxPagesPerRun()).toBe(CATALOG_MAX_PAGES_PER_RUN_DEFAULT)
  })

  it('respeita env e capa em 80', () => {
    process.env.AVEC_CATALOG_MAX_PAGES = '40'
    expect(getCatalogMaxPagesPerRun()).toBe(40)
    process.env.AVEC_CATALOG_MAX_PAGES = '999'
    expect(getCatalogMaxPagesPerRun()).toBe(80)
  })
})

describe('catalog0004PendingNextPage', () => {
  it('null sem pagination / sem hasMore', () => {
    expect(catalog0004PendingNextPage(null)).toBeNull()
    expect(catalog0004PendingNextPage({})).toBeNull()
    expect(
      catalog0004PendingNextPage({
        pagination: { '0004': { hasMore: false, nextPage: 21 } },
      }),
    ).toBeNull()
  })

  it('retorna nextPage quando hasMore', () => {
    expect(
      catalog0004PendingNextPage({
        pagination: { '0004': { hasMore: true, nextPage: 21 } },
      }),
    ).toBe(21)
  })
})

describe('shouldRunClientCatalogDump', () => {
  const now = Date.parse('2026-10-12T12:00:00.000Z')

  it('force env', () => {
    expect(shouldRunClientCatalogDump({ envFlag: '1', lastRun: null, now })).toBe(true)
    expect(shouldRunClientCatalogDump({ envFlag: '0', lastRun: null, now })).toBe(false)
  })

  it('sem last run → true', () => {
    expect(shouldRunClientCatalogDump({ lastRun: null, now })).toBe(true)
  })

  it('lote pendente ignora min-gap', () => {
    const recent = new Date(now - 60_000).toISOString()
    expect(
      shouldRunClientCatalogDump({
        lastRun: {
          created_at: recent,
          stats: {
            clients_upserted: 5000,
            pagination: { '0004': { hasMore: true, nextPage: 21 } },
          },
        },
        now,
        minGapMs: CLIENT_DUMP_MIN_GAP_MS,
      }),
    ).toBe(true)
  })

  it('dump completo recente → false', () => {
    const recent = new Date(now - 60_000).toISOString()
    expect(
      shouldRunClientCatalogDump({
        lastRun: {
          created_at: recent,
          stats: {
            clients_upserted: 5000,
            pagination: { '0004': { hasMore: false, nextPage: null } },
          },
        },
        now,
      }),
    ).toBe(false)
  })

  it('dump completo antigo → true', () => {
    const old = new Date(now - CLIENT_DUMP_MIN_GAP_MS - 1).toISOString()
    expect(
      shouldRunClientCatalogDump({
        lastRun: {
          created_at: old,
          stats: { clients_upserted: 5000 },
        },
        now,
      }),
    ).toBe(true)
  })

  it('stats JSON string (row PG)', () => {
    const recent = new Date(now - 60_000).toISOString()
    expect(
      shouldRunClientCatalogDump({
        lastRun: {
          created_at: recent,
          stats: JSON.stringify({
            clients_upserted: 100,
            pagination: { '0004': { hasMore: true, nextPage: 41 } },
          }),
        },
        now,
      }),
    ).toBe(true)
  })
})

describe('catalogPaginationAfterIncompleteUpsert', () => {
  it('mantém nextPage = startPage para refazer o lote', () => {
    const pag = catalogPaginationAfterIncompleteUpsert({
      startPage: 21,
      endPage: 40,
      maxPages: 20,
      limit: 250,
      rowsThisBatch: 5000,
    })
    expect(pag.hasMore).toBe(true)
    expect(pag.nextPage).toBe(21)
    expect(pag.startPage).toBe(21)
  })
})
