#!/usr/bin/env node
/**
 * Renova AVEC_API_TOKEN (JWT SalaoVIP ~12h) a partir do Cognito refresh token
 * salvo no storage state do Playwright + re-emissão via admin.avec.beauty.
 *
 * Uso:
 *   AVEC_STORAGE_STATE=/tmp/avec-br-state.json \
 *   VERCEL_TOKEN=... VERCEL_PROJECT=rom-brasil \
 *   node scripts/refresh-avec-token.mjs
 *
 * Opcional: AVEC_COGNITO_REFRESH_TOKEN / AVEC_COGNITO_CLIENT_ID
 * Se VERCEL_TOKEN+VERCEL_PROJECT estiverem setados, atualiza env de produção.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const STORAGE =
  process.env.AVEC_STORAGE_STATE ||
  process.env.AVEC_BR_STATE ||
  '/tmp/avec-br-state.json'
const CLIENT_ID =
  process.env.AVEC_COGNITO_CLIENT_ID || '4i7bsfv96ocgkv5umr6tr9mfrd'
const COGNITO_URL = 'https://cognito-idp.us-east-1.amazonaws.com/'

function decodeJwt(token) {
  const [, payload] = token.split('.')
  const pad = '='.repeat((4 - (payload.length % 4)) % 4)
  return JSON.parse(Buffer.from(payload + pad, 'base64url').toString('utf8'))
}

function hoursLeft(token) {
  try {
    const exp = decodeJwt(token).exp
    return (exp - Date.now() / 1000) / 3600
  } catch {
    return -1
  }
}

async function refreshCognito(refreshToken) {
  const res = await fetch(COGNITO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      ClientId: CLIENT_ID,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }),
  })
  if (!res.ok) {
    throw new Error(`Cognito refresh HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data = await res.json()
  return data.AuthenticationResult
}

function loadState() {
  if (!existsSync(STORAGE)) throw new Error(`Storage state não encontrado: ${STORAGE}`)
  return JSON.parse(readFileSync(STORAGE, 'utf8'))
}

function getLocalStorageMap(state) {
  const origin = (state.origins || []).find((o) => String(o.origin || '').includes('admin.avec'))
  if (!origin) throw new Error('origin admin.avec.* ausente no storage state')
  const map = Object.fromEntries((origin.localStorage || []).map((x) => [x.name, x.value]))
  return { origin, map }
}

function setLocalStorage(origin, map) {
  origin.localStorage = Object.entries(map).map(([name, value]) => ({ name, value }))
}

async function mintSalonTokenWithPlaywright(statePath) {
  const script = `
const { chromium } = require('playwright');
(async () => {
  const statePath = process.argv[1];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();
  await page.goto('https://admin.avec.beauty/admin/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  if (!token) {
    console.error('NO_TOKEN');
    process.exit(2);
  }
  process.stdout.write(token);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
`
  const tmpJs = '/tmp/avec-mint-token-playwright.js'
  writeFileSync(tmpJs, script)
  // Garante browser + roda o script com o pacote playwright.
  spawnSync('npx', ['--yes', 'playwright@1.49.1', 'install', 'chromium'], {
    encoding: 'utf8',
    stdio: 'ignore',
  })
  const r2 = spawnSync(
    'npx',
    ['--yes', '-p', 'playwright@1.49.1', 'node', tmpJs, statePath],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  )
  const out = (r2.stdout || '').trim()
  if (r2.status !== 0 || !out || out.includes('NO_TOKEN')) {
    throw new Error(
      `Playwright falhou ao emitir token: ${(r2.stderr || out || '').slice(0, 400)}`,
    )
  }
  return out
}

async function updateVercelEnv(token) {
  const vercelToken = process.env.VERCEL_TOKEN || process.env.VTOKEN
  const project = process.env.VERCEL_PROJECT
  const team = process.env.VERCEL_TEAM_ID || process.env.VERCEL_TEAM
  if (!vercelToken || !project) {
    console.log('Vercel: skip (defina VERCEL_TOKEN/VTOKEN + VERCEL_PROJECT para publicar)')
    return
  }
  const qs = team ? `?teamId=${encodeURIComponent(team)}` : ''
  const listRes = await fetch(`https://api.vercel.com/v9/projects/${project}/env${qs}`, {
    headers: { Authorization: `Bearer ${vercelToken}` },
  })
  if (!listRes.ok) throw new Error(`Vercel list env HTTP ${listRes.status}`)
  const envs = (await listRes.json()).envs || []
  const existing = envs.find((e) => e.key === 'AVEC_API_TOKEN' && e.target?.includes('production'))
  const body = {
    key: 'AVEC_API_TOKEN',
    value: token,
    type: 'encrypted',
    target: ['production', 'preview', 'development'],
  }
  if (existing) {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${project}/env/${existing.id}${qs}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: token }),
      },
    )
    if (!res.ok) throw new Error(`Vercel patch env HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    console.log('Vercel: AVEC_API_TOKEN atualizado (patch)')
  } else {
    const res = await fetch(`https://api.vercel.com/v10/projects/${project}/env${qs}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Vercel create env HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    console.log('Vercel: AVEC_API_TOKEN criado')
  }
}

async function main() {
  const state = loadState()
  const { origin, map } = getLocalStorageMap(state)
  const current = map.token || ''
  const left = hoursLeft(current)
  console.log(`token atual: ${left.toFixed(2)}h restantes`)

  const refreshKey = Object.keys(map).find((k) => k.endsWith('.refreshToken'))
  const refreshToken = process.env.AVEC_COGNITO_REFRESH_TOKEN || (refreshKey ? map[refreshKey] : null)
  if (!refreshToken) throw new Error('Cognito refresh token ausente')

  const auth = await refreshCognito(refreshToken)
  console.log('Cognito: Access/Id renovados')

  // Atualiza tokens Cognito no storage state para o browser reemitir o JWT SalaoVIP.
  for (const [k, v] of Object.entries(map)) {
    if (k.endsWith('.accessToken')) map[k] = auth.AccessToken
    if (k.endsWith('.idToken')) map[k] = auth.IdToken
  }
  map.cognitoToken = auth.IdToken
  setLocalStorage(origin, map)
  writeFileSync(STORAGE, JSON.stringify(state, null, 2))

  let salonToken = current
  try {
    salonToken = await mintSalonTokenWithPlaywright(STORAGE)
    console.log(`SalaoVIP token: ${hoursLeft(salonToken).toFixed(2)}h`)
  } catch (e) {
    console.warn(String(e.message || e))
    if (left < 0.25) throw e
    console.warn('Mantendo token atual (ainda válido)')
  }

  writeFileSync('/tmp/avec-br-api-token.txt', salonToken)
  // espelha no storage
  map.token = salonToken
  setLocalStorage(origin, map)
  writeFileSync(STORAGE, JSON.stringify(state, null, 2))

  await updateVercelEnv(salonToken)
  console.log('OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
