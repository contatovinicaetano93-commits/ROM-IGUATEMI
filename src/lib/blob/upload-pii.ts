'use client'

import { upload, type UploadOptions } from '@vercel/blob/client'
import {
  isPublicStorePrivateAccessError,
  rememberBlobUploadAccess,
  requirePrivateBlobStore,
  resolveBlobUploadAccess,
  rewriteBlobUploadError,
  type BlobUploadAccess,
} from '@/lib/blob/access'

type UploadPiiOptions = Omit<UploadOptions, 'access'> & {
  access?: BlobUploadAccess
}

/**
 * Client upload para PII: tenta private (ou access resolvido) e, se o store
 * for público, faz soft-fallback para public (salvo BLOB_REQUIRE_PRIVATE).
 */
export async function uploadPiiBlob(
  pathname: string,
  body: Parameters<typeof upload>[1],
  options: UploadPiiOptions,
): Promise<Awaited<ReturnType<typeof upload>>> {
  const { access: accessOverride, ...rest } = options
  const preferred = accessOverride ?? resolveBlobUploadAccess()

  try {
    const result = await upload(pathname, body, { ...rest, access: preferred })
    rememberBlobUploadAccess(preferred)
    return result
  } catch (error) {
    if (
      preferred === 'private' &&
      isPublicStorePrivateAccessError(error) &&
      !requirePrivateBlobStore()
    ) {
      console.warn(
        '[blob] store público detectado — upload com access=public. ' +
          'Para PII real, crie um Blob store Private (docs/blob-private-store.md).',
      )
      rememberBlobUploadAccess('public')
      return upload(pathname, body, { ...rest, access: 'public' })
    }
    throw rewriteBlobUploadError(error)
  }
}
