const ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_BITS = 256

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const bits = await derive(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterRaw, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'pbkdf2' || !iterRaw || !saltHex || !hashHex) return false
  const iterations = Number(iterRaw)
  if (!Number.isFinite(iterations) || iterations < 1) return false
  const bits = await derive(password, fromHex(saltHex), iterations)
  const computed = toHex(bits)
  if (computed.length !== hashHex.length) return false
  let out = 0
  for (let i = 0; i < computed.length; i++) out |= computed.charCodeAt(i) ^ hashHex.charCodeAt(i)
  return out === 0
}

export const MIN_EMPLOYEE_PASSWORD = 8
