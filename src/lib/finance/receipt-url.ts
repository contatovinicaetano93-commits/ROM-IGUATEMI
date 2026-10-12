/** Prefixo de pathname no Vercel Blob para notas/recibos do financeiro. */
export const FINANCE_RECEIPT_BLOB_PREFIX = 'financeiro/'

export function safeFinanceReceiptFileName(name: string): string {
  const base = name.trim().replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_')
  const cleaned = base.replace(/^\.+/, '').slice(0, 80)
  return cleaned || 'recibo.pdf'
}

export function financeReceiptBlobPathname(fileName: string): string {
  return `${FINANCE_RECEIPT_BLOB_PREFIX}${Date.now()}-${safeFinanceReceiptFileName(fileName)}`
}

export function isFinanceReceiptBlobPathname(pathname: string): boolean {
  const normalized = pathname.replace(/^\/+/, '')
  if (!normalized.startsWith(FINANCE_RECEIPT_BLOB_PREFIX)) return false
  if (normalized.includes('..')) return false
  return normalized.length > FINANCE_RECEIPT_BLOB_PREFIX.length
}

function isVercelBlobStorageHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host.endsWith('.public.blob.vercel-storage.com') ||
    host.endsWith('.private.blob.vercel-storage.com') ||
    host.endsWith('.blob.vercel-storage.com')
  )
}

/**
 * Aceita null/omit/string vazia (recibo opcional).
 * Strings não vazias: https em host Blob da Vercel sob `financeiro/`.
 */
export function isAllowedFinanceReceiptUrl(receiptUrl: string | null | undefined): boolean {
  if (receiptUrl == null) return true
  const trimmed = receiptUrl.trim()
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
  return isFinanceReceiptBlobPathname(path)
}

export function assertFinanceReceiptBlobPathname(pathname: string): void {
  if (!isFinanceReceiptBlobPathname(pathname)) {
    throw new Error('Pathname inválido para recibo financeiro')
  }
}

/**
 * Leitura de recibos antigos (upload sem prefixo `financeiro/`).
 * Só para proxy autenticado — create continua exigindo allowlist estrita.
 */
export function isVercelBlobHostForLegacyReceipt(receiptUrl: string): boolean {
  const trimmed = receiptUrl.trim()
  if (!trimmed) return false
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
  return path.length > 1 && !path.includes('..')
}
