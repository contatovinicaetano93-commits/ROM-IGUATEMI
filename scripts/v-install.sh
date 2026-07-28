#!/bin/sh
# Install na Vercel (deploy overlay): extrai o SHA do GitHub + injeta DATABASE_URL.
set -eu
SHA="${ROM_DEPLOY_SHA:?ROM_DEPLOY_SHA obrigatório}"

mkdir -p /tmp/rom-secrets
cp -f secrets/database-url.txt /tmp/rom-secrets/database-url.txt

curl -fsSL "https://codeload.github.com/contatovinicaetano93-commits/ROM-IGUATEMI/tar.gz/${SHA}" \
  | tar -xz --strip-components=1

mkdir -p secrets
cp -f /tmp/rom-secrets/database-url.txt secrets/database-url.txt

# Garante Supabase no bundle serverless (não depende de env Vercel desatualizado/Neon).
node <<'NODE'
const fs = require('fs')
const url = fs.readFileSync('secrets/database-url.txt', 'utf8').trim()
if (!url.startsWith('postgres')) {
  console.error('secrets/database-url.txt inválida')
  process.exit(1)
}
fs.writeFileSync(
  'src/lib/db-url.generated.ts',
  `/** Gerado no install Vercel — não editar. */\nexport const DEPLOY_DATABASE_URL: string | null = ${JSON.stringify(url)}\n`,
)
fs.writeFileSync('.env.production', `DATABASE_URL=${url}\n`)
console.log('baked DATABASE_URL host', new URL(url).hostname)
NODE

npm ci
