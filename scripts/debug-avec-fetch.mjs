#!/usr/bin/env node
import { Module } from 'node:module'
import { readFileSync } from 'node:fs'

const orig = Module._load
Module._load = function (req, parent, isMain) {
  if (req === 'server-only') return {}
  return orig(req, parent, isMain)
}

const overlay = readFileSync('secrets/database-url.txt', 'utf8').trim().replace(':6543', ':5432')
process.env.DATABASE_URL = overlay
process.env.AVEC_UNIT_ID = process.env.AVEC_UNIT_ID || '99801'
process.env.ROM_PANEL = 'iguatemi'
process.env.NEXT_PUBLIC_ROM_PANEL = 'iguatemi'

console.log('boot', new Date().toISOString(), 'dbhost', overlay.split('@')[1]?.split('/')[0])

const db = await import('../src/lib/db.ts')
const getSql = db.getSql || db.default?.getSql || db.default
console.log('db exports', Object.keys(db))
const sql = typeof getSql === 'function' ? getSql() : getSql
await sql`select 1 as ok`
console.log('db ok')

const { loadRuntimeAvecApiToken } = await import('../src/lib/avec/token-store.ts')
const tok = await loadRuntimeAvecApiToken()
console.log('token len', tok?.length ?? 0)
process.env.AVEC_API_TOKEN = tok || ''

const { fetchAvecReport, extractRows, fetchAllAvecReport } = await import('../src/lib/avec/client.ts')
console.time('0088')
const p = await fetchAvecReport('0088', {
  page: 1,
  limit: 10,
  inicio: '01/07/2026',
  fim: '27/07/2026',
  site: '99801',
})
console.timeEnd('0088')
console.log('0088 rows', extractRows(p).length)

console.time('0004-page1')
const c = await fetchAvecReport('0004', { page: 1, limit: 5, site: '99801' })
console.timeEnd('0004-page1')
console.log('0004 rows', extractRows(c).length)

console.time('0051-today')
const a = await fetchAllAvecReport('0051', {
  inicio: '27/07/2026',
  fim: '27/07/2026',
  site: '',
  profissional_id: '',
  limit: 250,
})
console.timeEnd('0051-today')
console.log('0051', a.rows.length, 'pages', a.pagesFetched)

console.log('client path ok')
process.exit(0)
