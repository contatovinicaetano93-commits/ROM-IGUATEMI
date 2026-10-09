import { describe, expect, it } from 'vitest'
import {
  CHECKS_DIARIO_BLOB_PREFIX,
  assertChecksDiarioBlobPathname,
  checksDiarioBlobPathname,
  isAllowedChecksDiarioPhotoUrl,
  isChecksDiarioBlobPathname,
  safeChecksPhotoFileName,
} from './photo'

describe('checks-diario/photo', () => {
  it('sanitiza nome do arquivo', () => {
    expect(safeChecksPhotoFileName('Foto Check #1.jpg')).toBe('Foto_Check_1.jpg')
    expect(safeChecksPhotoFileName('...')).toBe('check.jpg')
  })

  it('pathname fica sob checks-diario/ com nome seguro', () => {
    const path = checksDiarioBlobPathname('check tarefa.jpg')
    expect(path.startsWith(CHECKS_DIARIO_BLOB_PREFIX)).toBe(true)
    expect(path).toContain('check_tarefa.jpg')
    expect(isChecksDiarioBlobPathname(path)).toBe(true)
  })

  it('rejeita pathname fora do prefixo ou com traversal', () => {
    expect(isChecksDiarioBlobPathname('curriculos/x.jpg')).toBe(false)
    expect(isChecksDiarioBlobPathname('checks-diario/')).toBe(false)
    expect(isChecksDiarioBlobPathname('checks-diario/../evil.jpg')).toBe(false)
    expect(isChecksDiarioBlobPathname('/checks-diario/ok.jpg')).toBe(true)
    expect(() => assertChecksDiarioBlobPathname('other/x.jpg')).toThrow(/Pathname inválido/)
  })

  it('null/omit/vazio são OK (foto opcional)', () => {
    expect(isAllowedChecksDiarioPhotoUrl(null)).toBe(true)
    expect(isAllowedChecksDiarioPhotoUrl(undefined)).toBe(true)
    expect(isAllowedChecksDiarioPhotoUrl('')).toBe(true)
    expect(isAllowedChecksDiarioPhotoUrl('   ')).toBe(true)
  })

  it('aceita só https em host Blob com prefixo checks-diario/', () => {
    const okPublic =
      'https://abc123.public.blob.vercel-storage.com/checks-diario/1710000000-check.jpg'
    const okPrivate =
      'https://abc123.blob.vercel-storage.com/checks-diario/foto.webp'
    expect(isAllowedChecksDiarioPhotoUrl(okPublic)).toBe(true)
    expect(isAllowedChecksDiarioPhotoUrl(okPrivate)).toBe(true)
  })

  it('rejeita hosts, schemes e pathnames arbitrários', () => {
    expect(
      isAllowedChecksDiarioPhotoUrl('https://evil.com/checks-diario/x.jpg'),
    ).toBe(false)
    expect(
      isAllowedChecksDiarioPhotoUrl(
        'http://abc.public.blob.vercel-storage.com/checks-diario/x.jpg',
      ),
    ).toBe(false)
    expect(
      isAllowedChecksDiarioPhotoUrl(
        'https://abc.public.blob.vercel-storage.com/curriculos/x.jpg',
      ),
    ).toBe(false)
    expect(
      isAllowedChecksDiarioPhotoUrl(
        'https://abc.public.blob.vercel-storage.com/checks-diario/../x.jpg',
      ),
    ).toBe(false)
    expect(isAllowedChecksDiarioPhotoUrl('not-a-url')).toBe(false)
    expect(
      isAllowedChecksDiarioPhotoUrl(
        'https://user:pass@abc.public.blob.vercel-storage.com/checks-diario/x.jpg',
      ),
    ).toBe(false)
  })
})
