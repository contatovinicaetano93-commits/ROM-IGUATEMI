import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BLOB_PRIVATE_ACCESS,
  BLOB_PUBLIC_STORE_CONFIG_MESSAGE,
  isPublicStorePrivateAccessError,
  preferredBlobUploadAccess,
  requirePrivateBlobStore,
  resetBlobUploadAccessCacheForTests,
  resolveBlobUploadAccess,
  rememberBlobUploadAccess,
  rewriteBlobUploadError,
} from './access'

const ENV_KEYS = [
  'BLOB_UPLOAD_ACCESS',
  'NEXT_PUBLIC_BLOB_UPLOAD_ACCESS',
  'BLOB_REQUIRE_PRIVATE',
] as const

const previousEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    previousEnv[key] = process.env[key]
    delete process.env[key]
  }
  resetBlobUploadAccessCacheForTests()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = previousEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetBlobUploadAccessCacheForTests()
})

describe('blob/access', () => {
  it('detecta erro de private em store público', () => {
    expect(
      isPublicStorePrivateAccessError(
        new Error(
          'Vercel Blob: Cannot use private access on a public store. The store must be configured with private access.',
        ),
      ),
    ).toBe(true)
    expect(isPublicStorePrivateAccessError(new Error('network timeout'))).toBe(false)
  })

  it('reescreve erro com mensagem acionável', () => {
    const rewritten = rewriteBlobUploadError(
      new Error('Cannot use private access on a public store'),
    )
    expect(rewritten.message).toBe(BLOB_PUBLIC_STORE_CONFIG_MESSAGE)
    expect(rewritten.message).toContain('docs/blob-private-store.md')
  })

  it('default prefer private; env força public/private', () => {
    expect(preferredBlobUploadAccess()).toBe(BLOB_PRIVATE_ACCESS)

    process.env.BLOB_UPLOAD_ACCESS = 'public'
    expect(preferredBlobUploadAccess()).toBe('public')
    expect(resolveBlobUploadAccess()).toBe('public')

    process.env.BLOB_UPLOAD_ACCESS = 'private'
    expect(resolveBlobUploadAccess()).toBe('private')
  })

  it('cache de soft-detect só vale sem env forçado', () => {
    rememberBlobUploadAccess('public')
    expect(resolveBlobUploadAccess()).toBe('public')

    process.env.BLOB_UPLOAD_ACCESS = 'private'
    expect(resolveBlobUploadAccess()).toBe('private')
  })

  it('BLOB_REQUIRE_PRIVATE liga fail-closed', () => {
    expect(requirePrivateBlobStore()).toBe(false)
    process.env.BLOB_REQUIRE_PRIVATE = '1'
    expect(requirePrivateBlobStore()).toBe(true)
  })
})
