#!/bin/sh
# Install overlay opcional na Vercel (SHA pinado).
#
# Fonte de verdade do banco: env Vercel (DATABASE_URL / NEON_* / UNIT_*).
# NÃO grava connection string em src/lib/db-url.generated.ts — o stub no git
# permanece `null`. Nunca commitar URL real.
#
# secrets/database-url.txt (gitignore) é só overlay local de agente; não entra
# no bundle serverless (outputFileTracingIncludes não inclui secrets/).
set -eu
SHA="${ROM_DEPLOY_SHA:?ROM_DEPLOY_SHA obrigatório}"

mkdir -p /tmp/rom-secrets
if [ -f secrets/database-url.txt ]; then
  cp -f secrets/database-url.txt /tmp/rom-secrets/database-url.txt
fi

curl -fsSL "https://codeload.github.com/contatovinicaetano93-commits/ROM-IGUATEMI/tar.gz/${SHA}" \
  | tar -xz --strip-components=1

# Restaura overlay local (gitignore) se existir — não sobrescreve o stub gerado.
if [ -f /tmp/rom-secrets/database-url.txt ]; then
  mkdir -p secrets
  cp -f /tmp/rom-secrets/database-url.txt secrets/database-url.txt
fi

# Prefere env Vercel; overlay local só como fallback de build. Nunca bake no git tree.
node <<'NODE'
const fs = require('fs')

const fromEnv = [
  process.env.DATABASE_URL,
  process.env.NEON_DATABASE_URL,
  process.env.NEON_IGUATEMI_DATABASE_URL,
  process.env.UNIT_DATABASE_URL,
  process.env.UNIT_IGUATEMI_DATABASE_URL,
]
  .map((v) => (typeof v === 'string' ? v.trim() : ''))
  .find((v) => v.startsWith('postgres'))

let fromOverlay = ''
try {
  fromOverlay = fs.readFileSync('secrets/database-url.txt', 'utf8').trim()
} catch {
  // sem overlay
}

const url = fromEnv || (fromOverlay.startsWith('postgres') ? fromOverlay : '')

if (!url) {
  console.warn(
    'v-install: sem DATABASE_URL/NEON_*/UNIT_* nem secrets/database-url.txt — build usa só env Vercel em runtime',
  )
} else {
  // .env* é gitignore; útil no build se o projeto puxar env de arquivo.
  // NÃO escreve src/lib/db-url.generated.ts (stub null permanente no git).
  fs.writeFileSync('.env.production', `DATABASE_URL=${url}\n`)
  const source = fromEnv ? 'vercel-env' : 'overlay-local'
  console.log('v-install: DATABASE_URL host via', source, new URL(url).hostname)
}

// Garante stub null no tree (idempotente se já estiver correto).
fs.writeFileSync(
  'src/lib/db-url.generated.ts',
  `/**
 * Stub permanente no git — connection string só via env Vercel.
 * Não editar com URL real; scripts/v-install.sh não bakeia mais aqui.
 */
export const DEPLOY_DATABASE_URL: string | null = null
`,
)
NODE

npm ci
