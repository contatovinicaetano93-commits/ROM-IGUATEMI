/** Prefixo de pathname no Vercel Blob para fotos de Checks diários. */
export const CHECKS_DIARIO_BLOB_PREFIX = 'checks-diario/'

export function safeChecksPhotoFileName(name: string): string {
  const base = name.trim().replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_')
  const cleaned = base.replace(/^\.+/, '').slice(0, 80)
  return cleaned || 'check.jpg'
}

export function checksDiarioBlobPathname(fileName: string): string {
  return `${CHECKS_DIARIO_BLOB_PREFIX}${Date.now()}-${safeChecksPhotoFileName(fileName)}`
}

export function isChecksDiarioBlobPathname(pathname: string): boolean {
  const normalized = pathname.replace(/^\/+/, '')
  if (!normalized.startsWith(CHECKS_DIARIO_BLOB_PREFIX)) return false
  if (normalized.includes('..')) return false
  return normalized.length > CHECKS_DIARIO_BLOB_PREFIX.length
}

function isVercelBlobStorageHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host.endsWith('.public.blob.vercel-storage.com') ||
    host.endsWith('.blob.vercel-storage.com')
  )
}

/**
 * Aceita null/omit/string vazia (foto opcional).
 * Strings não vazias precisam ser https em host Blob da Vercel sob `checks-diario/`.
 */
export function isAllowedChecksDiarioPhotoUrl(photoUrl: string | null | undefined): boolean {
  if (photoUrl == null) return true
  const trimmed = photoUrl.trim()
  if (!trimmed) return true

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return false
  }

  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  if (!isVercelBlobStorageHost(url.hostname)) return false

  const path = decodeURIComponent(url.pathname)
  return isChecksDiarioBlobPathname(path)
}

export function assertChecksDiarioBlobPathname(pathname: string): void {
  if (!isChecksDiarioBlobPathname(pathname)) {
    throw new Error('Pathname inválido para foto de check')
  }
}
