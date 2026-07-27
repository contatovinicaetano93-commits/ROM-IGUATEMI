#!/usr/bin/env node
/**
 * Roda sync Avec fora da Vercel (útil quando o WAF bloqueia egress serverless).
 *
 * Uso:
 *   DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=99801 ROM_PANEL=iguatemi \
 *     node --import tsx scripts/run-avec-sync.mjs [fast|full]
 *
 * Se AVEC_API_TOKEN estiver vazio, lê app_runtime_secrets.avec_api_token.
 * Prefere secrets/database-url.txt (pooler) sobre DATABASE_URL IPv6-only.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Module } from 'node:module'

const require = createRequire(import.meta.url)

// Stub Next `server-only` para CLI.
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

const mode = process.argv[2] === 'full' ? 'full' : 'fast'
process.env.ROM_PANEL = process.env.ROM_PANEL || 'iguatemi'
process.env.NEXT_PUBLIC_ROM_PANEL = process.env.NEXT_PUBLIC_ROM_PANEL || 'iguatemi'
process.env.AVEC_UNIT_ID = process.env.AVEC_UNIT_ID || '99801'
process.env.AVEC_SYNC_DEBUG = process.env.AVEC_SYNC_DEBUG || '1'

const overlay = loadOverlayDatabaseUrl()
const envUrl = process.env.DATABASE_URL?.trim() || ''
// Preferir pooler overlay — db.*.supabase.co:5432 é IPv6-only e quebra neste agente.
process.env.DATABASE_URL = overlay || envUrl || ''

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente (env ou secrets/database-url.txt)')
  process.exit(1)
}

console.log(
  'db',
  process.env.DATABASE_URL.replace(/:[^:@/]+@/, ':***@').split('@')[1]?.split('/')[0],
)

try {
  require('dns').setDefaultResultOrder('ipv4first')
} catch {
  // ignore
}

if (!process.env.AVEC_API_TOKEN?.trim()) {
  const { loadRuntimeAvecApiToken, saveAvecApiToken } = await import('../src/lib/avec/token-store.ts')
  const { isAvecLoginConfigured, mintAvecApiToken } = await import('../src/lib/avec/refresh-token.ts')
  let token = await loadRuntimeAvecApiToken()
  if (token) {
    process.env.AVEC_API_TOKEN = token
    console.log('token: carregado de app_runtime_secrets')
  } else if (isAvecLoginConfigured()) {
    const minted = await mintAvecApiToken({ force: true })
    token = minted.token
    await saveAvecApiToken(token)
    process.env.AVEC_API_TOKEN = token
    console.log('token: renovado via Cognito')
  } else {
    console.error('AVEC_API_TOKEN ausente e app_runtime_secrets inválido/expirado')
    process.exit(1)
  }
}

const { runAvecSync } = await import('../src/lib/avec/sync.ts')
console.log(`sync start mode=${mode}`)
const started = Date.now()
const result = await runAvecSync(mode)
console.log(
  JSON.stringify(
    {
      elapsed_ms: Date.now() - started,
      kind: result.kind,
      status: result.status,
      error: result.error,
      stats: result.stats,
    },
    null,
    2,
  ),
)
process.exit(result.status === 'error' ? 1 : 0)
