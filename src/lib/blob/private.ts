import 'server-only'

import { put, get, type PutBlobResult, type PutCommandOptions } from '@vercel/blob'
import {
  isPublicStorePrivateAccessError,
  rememberBlobUploadAccess,
  requirePrivateBlobStore,
  resolveBlobUploadAccess,
  rewriteBlobUploadError,
  type BlobUploadAccess,
} from '@/lib/blob/access'

export {
  BLOB_PRIVATE_ACCESS,
  BLOB_PUBLIC_STORE_CONFIG_MESSAGE,
  isPublicStorePrivateAccessError,
  preferredBlobUploadAccess,
  requirePrivateBlobStore,
  resolveBlobUploadAccess,
  rewriteBlobUploadError,
  type BlobUploadAccess,
} from '@/lib/blob/access'

export function isVercelBlobStorageHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host.endsWith('.public.blob.vercel-storage.com') ||
    host.endsWith('.private.blob.vercel-storage.com') ||
    host.endsWith('.blob.vercel-storage.com')
  )
}

/** Inferência a partir do host: blobs legados públicos vs novos privados. */
export function blobAccessFromUrl(url: string): 'public' | 'private' {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('.public.blob.')) return 'public'
  } catch {
    /* ignore */
  }
  return 'private'
}

type PutPiiOptions = Omit<PutCommandOptions, 'access'> & {
  access?: BlobUploadAccess
}

/**
 * Server `put` para PII: prefer private; soft-fallback para public se o store
 * for público (salvo BLOB_REQUIRE_PRIVATE=1).
 */
export async function putPiiBlob(
  pathname: string,
  body: Parameters<typeof put>[1],
  options: PutPiiOptions = {},
): Promise<PutBlobResult> {
  const { access: accessOverride, ...rest } = options
  const preferred = accessOverride ?? resolveBlobUploadAccess()

  try {
    const result = await put(pathname, body, { ...rest, access: preferred })
    rememberBlobUploadAccess(preferred)
    return result
  } catch (error) {
    if (
      preferred === 'private' &&
      isPublicStorePrivateAccessError(error) &&
      !requirePrivateBlobStore()
    ) {
      console.warn(
        '[blob] store público detectado — put com access=public. ' +
          'Para PII real, crie um Blob store Private (docs/blob-private-store.md).',
      )
      rememberBlobUploadAccess('public')
      return put(pathname, body, { ...rest, access: 'public' })
    }
    throw rewriteBlobUploadError(error)
  }
}

export async function readBlobBytes(url: string): Promise<{
  buffer: Buffer
  contentType: string | null
} | null> {
  const access = blobAccessFromUrl(url)
  const result = await get(url, { access })
  if (!result?.stream) return null
  const chunks: Uint8Array[] = []
  const reader = result.stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return {
    buffer: Buffer.concat(chunks.map((c) => Buffer.from(c))),
    contentType: result.blob.contentType,
  }
}

/** Resposta HTTP autenticada (proxy) para abrir blob privado no browser. */
export async function blobProxyResponse(url: string): Promise<Response> {
  const access = blobAccessFromUrl(url)
  const result = await get(url, { access })
  if (!result?.stream) {
    return new Response('Arquivo não encontrado', { status: 404 })
  }
  const headers = new Headers()
  headers.set('Cache-Control', 'private, no-store')
  const contentType =
    result.blob.contentType || result.headers.get('content-type') || 'application/octet-stream'
  headers.set('Content-Type', contentType)
  const disposition = result.headers.get('content-disposition')
  if (disposition) headers.set('Content-Disposition', disposition)
  return new Response(result.stream, { status: 200, headers })
}
