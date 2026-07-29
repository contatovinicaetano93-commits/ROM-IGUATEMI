#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Module } from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}
  return originalLoad(request, parent, isMain)
}

function loadOverlayDatabaseUrl() {
  for (const rel of ['secrets/database-url.txt', '.secrets/database-url.txt']) {
    const p = join(process.cwd(), rel)
    if (!existsSync(p)) continue
    const url = readFileSync(p, 'utf8').trim()
    if (url.startsWith('postgres')) return url
  }
  return null
}

const daysBack = Number(process.argv[2] || 180)
const overlay = loadOverlayDatabaseUrl()
process.env.DATABASE_URL = overlay || process.env.DATABASE_URL?.trim() || ''
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente')
  process.exit(1)
}
try { require('dns').setDefaultResultOrder('ipv4first') } catch {}
if (!process.env.AVEC_API_TOKEN?.trim()) {
  console.error('AVEC_API_TOKEN ausente')
  process.exit(1)
}
console.log('db', process.env.DATABASE_URL.replace(/:[^:@/]+@/, ':***@').split('@')[1]?.split('/')[0], 'unit', process.env.AVEC_UNIT_ID, 'days', daysBack)
const { runLastDoneBackfill } = await import('../src/lib/avec/last-done-backfill.ts')
const stats = await runLastDoneBackfill({ daysBack, maxPages: 100 })
console.log(JSON.stringify(stats, null, 2))
process.exit(stats.errors.length > 20 ? 1 : 0)
