import { describe, expect, it } from 'vitest'
import { asJsonArray, asJsonObject } from '@/lib/jsonb'

describe('asJsonArray', () => {
  it('returns arrays as-is', () => {
    expect(asJsonArray([{ a: 1 }])).toEqual([{ a: 1 }])
  })

  it('unwraps double-encoded jsonb strings', () => {
    const raw = JSON.stringify([{ channel: 'instagram', clients: 2 }])
    expect(asJsonArray(raw)).toEqual([{ channel: 'instagram', clients: 2 }])
  })

  it('unwraps nested string encoding', () => {
    const raw = JSON.stringify(JSON.stringify([{ x: 1 }]))
    expect(asJsonArray(raw)).toEqual([{ x: 1 }])
  })

  it('returns empty for junk', () => {
    expect(asJsonArray(null)).toEqual([])
    expect(asJsonArray('nope')).toEqual([])
  })
})

describe('asJsonObject', () => {
  it('parses object strings', () => {
    expect(asJsonObject(JSON.stringify({ a: 1 }))).toEqual({ a: 1 })
  })
})
