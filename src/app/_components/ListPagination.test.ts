import { describe, expect, it } from 'vitest'
import { buildPageTokens, listPageSlice, LIST_PAGE_SIZE } from './ListPagination'

describe('buildPageTokens', () => {
  it('lista todas as páginas quando cabem', () => {
    expect(buildPageTokens(1, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('usa reticências em listas longas', () => {
    expect(buildPageTokens(1, 8)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 8])
    expect(buildPageTokens(5, 8)).toEqual([1, 'ellipsis', 3, 4, 5, 6, 7, 8])
    expect(buildPageTokens(8, 8)).toEqual([1, 'ellipsis', 4, 5, 6, 7, 8])
  })
})

describe('listPageSlice', () => {
  it('corta 200 por página', () => {
    const items = Array.from({ length: 450 }, (_, i) => i + 1)
    expect(listPageSlice(items, 1)).toHaveLength(LIST_PAGE_SIZE)
    expect(listPageSlice(items, 1)[0]).toBe(1)
    expect(listPageSlice(items, 2)[0]).toBe(201)
    expect(listPageSlice(items, 3)).toEqual(
      Array.from({ length: 50 }, (_, i) => 401 + i),
    )
  })
})
