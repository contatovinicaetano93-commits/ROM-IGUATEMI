/**
 * Helpers de access mode do Vercel Blob (seguros para client e server).
 *
 * O access mode do *store* é imutável após criação. Se o store for público,
 * `access: 'private'` falha com "Cannot use private access on a public store".
 * Preferimos private (PII); fazemos soft-fallback para public quando o store
 * não suporta private — downloads continuam via proxy autenticado.
 */

export type BlobUploadAccess = 'public' | 'private'

/** Acesso preferido para uploads com PII (currículos, recibos, fotos de checks). */
export const BLOB_PRIVATE_ACCESS: BlobUploadAccess = 'private'

const PUBLIC_STORE_PRIVATE_ACCESS_RE =
  /Cannot use private access on a public store/i

/** Mensagem acionável quando o store é público e o app exige private. */
export const BLOB_PUBLIC_STORE_CONFIG_MESSAGE =
  'Upload bloqueado: o Blob store da Vercel está público, mas o app usa access=private para PII. ' +
  'Não dá para mudar Access de um store existente — crie um store Private (Storage → Create → Blob → Private), ' +
  'conecte ao projeto e atualize BLOB_READ_WRITE_TOKEN. ' +
  'Enquanto isso, remova BLOB_REQUIRE_PRIVATE (fallback público) ou defina BLOB_UPLOAD_ACCESS=public. ' +
  'Guia: docs/blob-private-store.md'

export function isPublicStorePrivateAccessError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return PUBLIC_STORE_PRIVATE_ACCESS_RE.test(message)
}

export function rewriteBlobUploadError(error: unknown): Error {
  if (isPublicStorePrivateAccessError(error)) {
    return new Error(BLOB_PUBLIC_STORE_CONFIG_MESSAGE)
  }
  return error instanceof Error ? error : new Error(String(error ?? 'Erro no upload Blob'))
}

function envBlobUploadAccess(): BlobUploadAccess | null {
  if (typeof process === 'undefined') return null
  const raw = (
    process.env.BLOB_UPLOAD_ACCESS ||
    process.env.NEXT_PUBLIC_BLOB_UPLOAD_ACCESS ||
    ''
  )
    .trim()
    .toLowerCase()
  if (raw === 'public' || raw === 'private') return raw
  return null
}

/**
 * Access preferido para upload.
 * - `BLOB_UPLOAD_ACCESS` / `NEXT_PUBLIC_BLOB_UPLOAD_ACCESS` = public|private força o modo
 * - default: private
 */
export function preferredBlobUploadAccess(): BlobUploadAccess {
  return envBlobUploadAccess() ?? BLOB_PRIVATE_ACCESS
}

/** Se true, não faz fallback para public quando o store rejeita private. */
export function requirePrivateBlobStore(): boolean {
  if (typeof process === 'undefined') return false
  const raw = (process.env.BLOB_REQUIRE_PRIVATE || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

let cachedUploadAccess: BlobUploadAccess | null = null

/** Access efetivo (env forçado, senão cache de soft-detect, senão private). */
export function resolveBlobUploadAccess(): BlobUploadAccess {
  const forced = envBlobUploadAccess()
  if (forced) return forced
  return cachedUploadAccess ?? BLOB_PRIVATE_ACCESS
}

export function rememberBlobUploadAccess(access: BlobUploadAccess): void {
  cachedUploadAccess = access
}

/** Só para testes — limpa cache de soft-detect. */
export function resetBlobUploadAccessCacheForTests(): void {
  cachedUploadAccess = null
}
