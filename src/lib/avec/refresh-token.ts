/**
 * Renova AVEC_API_TOKEN via HTTP (Cognito + auth/amplify/signin).
 * Sem Playwright — seguro para cron Vercel a cada 6h.
 */

const COGNITO_URL = 'https://cognito-idp.us-east-1.amazonaws.com/'
const DEFAULT_CLIENT_ID = '4i7bsfv96ocgkv5umr6tr9mfrd'
const JWT_CLIENT = 'S@laoV1P'

export type AvecTokenRefreshResult =
  | {
      ok: true
      hours_left: number
      salon_id: number
      skipped?: boolean
      reason?: string
    }
  | { ok: false; error: string }

function cognitoClientId() {
  return (process.env.AVEC_COGNITO_CLIENT_ID ?? DEFAULT_CLIENT_ID).trim()
}

function loginEmail() {
  return (process.env.AVEC_LOGIN_EMAIL ?? '').trim()
}

function loginPassword() {
  return (process.env.AVEC_LOGIN_PASSWORD ?? '').trim()
}

function salonId(): number | null {
  const raw = (process.env.AVEC_UNIT_ID ?? '').trim()
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function decodeHoursLeft(token: string): number {
  try {
    const payload = token.split('.')[1]
    if (!payload) return -1
    const pad = '='.repeat((4 - (payload.length % 4)) % 4)
    const json = JSON.parse(Buffer.from(payload + pad, 'base64url').toString('utf8')) as {
      exp?: number
    }
    if (typeof json.exp !== 'number') return -1
    return (json.exp - Date.now() / 1000) / 3600
  } catch {
    return -1
  }
}

async function cognitoPasswordAuth(email: string, password: string): Promise<string> {
  const res = await fetch(COGNITO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      ClientId: cognitoClientId(),
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  })
  if (!res.ok) {
    throw new Error(`Cognito auth HTTP ${res.status}`)
  }
  const data = (await res.json()) as {
    AuthenticationResult?: { AccessToken?: string }
  }
  const access = data.AuthenticationResult?.AccessToken
  if (!access) throw new Error('Cognito sem AccessToken')
  return access
}

async function mintSalonVipToken(opts: {
  email: string
  password: string
  salonId: number
  cognitoAccessToken: string
}): Promise<string> {
  const base = (process.env.AVEC_API_URL ?? 'https://api.avec.beauty').replace(/\/$/, '')
  const res = await fetch(`${base}/auth/amplify/signin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://admin.avec.beauty',
      Referer: 'https://admin.avec.beauty/',
    },
    body: JSON.stringify({
      email: opts.email,
      password: opts.password,
      salon_id: opts.salonId,
      jwt_client: JWT_CLIENT,
      cognito_token: opts.cognitoAccessToken,
    }),
  })
  if (!res.ok) {
    throw new Error(`Avec amplify/signin HTTP ${res.status}`)
  }
  const data = (await res.json()) as { data?: { signin?: { token?: string } } }
  const token = data.data?.signin?.token
  if (!token) throw new Error('Avec amplify/signin sem token')
  return token
}

export function isAvecLoginConfigured(): boolean {
  return Boolean(loginEmail() && loginPassword() && salonId())
}

/**
 * Emite JWT SalaoVIP (~12h) e devolve o token.
 * @param minHoursLeft se o token atual (env/runtime) ainda tem mais que isso, pode skip.
 */
export async function mintAvecApiToken(opts?: {
  force?: boolean
  currentToken?: string | null
  minHoursLeft?: number
}): Promise<{ token: string; hours_left: number; salon_id: number; skipped: boolean }> {
  const email = loginEmail()
  const password = loginPassword()
  const unit = salonId()
  if (!email || !password || !unit) {
    throw new Error(
      'Configure AVEC_LOGIN_EMAIL, AVEC_LOGIN_PASSWORD e AVEC_UNIT_ID na Vercel para refresh automático',
    )
  }

  const minHours = opts?.minHoursLeft ?? 0
  const current = opts?.currentToken ?? process.env.AVEC_API_TOKEN ?? null
  if (!opts?.force && current && minHours > 0) {
    const left = decodeHoursLeft(current)
    if (left >= minHours) {
      return { token: current, hours_left: left, salon_id: unit, skipped: true }
    }
  }

  const cognitoAccess = await cognitoPasswordAuth(email, password)
  const token = await mintSalonVipToken({
    email,
    password,
    salonId: unit,
    cognitoAccessToken: cognitoAccess,
  })
  return {
    token,
    hours_left: decodeHoursLeft(token),
    salon_id: unit,
    skipped: false,
  }
}
