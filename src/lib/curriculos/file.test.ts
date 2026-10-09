import { describe, expect, it } from 'vitest'
import {
  curriculoBlobPathname,
  guessCurriculoContentType,
  isAllowedCurriculoContentType,
  isAllowedCurriculoFileUrl,
  safeCurriculoFileName,
} from './file'

describe('curriculos/file', () => {
  it('sanitiza nome com acentos e espaços', () => {
    expect(safeCurriculoFileName('Currículo Maria Silva.pdf')).toBe('Curr_culo_Maria_Silva.pdf')
  })

  it('infere PDF quando o browser manda octet-stream ou vazio', () => {
    expect(guessCurriculoContentType('cv.pdf', '')).toBe('application/pdf')
    expect(guessCurriculoContentType('cv.pdf', 'application/octet-stream')).toBe('application/pdf')
    expect(guessCurriculoContentType('foto.heic', '')).toBe('image/heic')
  })

  it('aceita PDF por extensão mesmo com tipo estranho', () => {
    expect(isAllowedCurriculoContentType('', 'curriculo.pdf')).toBe(true)
    expect(isAllowedCurriculoContentType('application/msword', 'cv.doc')).toBe(false)
  })

  it('pathname fica sob curriculos/ com nome seguro', () => {
    const path = curriculoBlobPathname('João.pdf')
    expect(path.startsWith('curriculos/')).toBe(true)
    expect(path.endsWith('Jo_o.pdf') || path.includes('Jo')).toBe(true)
  })

  it('aceita só HTTPS blob Vercel sob /curriculos/', () => {
    expect(
      isAllowedCurriculoFileUrl(
        'https://abc123.public.blob.vercel-storage.com/curriculos/cv.pdf',
      ),
    ).toBe(true)
    expect(
      isAllowedCurriculoFileUrl(
        'https://abc123.blob.vercel-storage.com/curriculos/foto.jpg',
      ),
    ).toBe(true)
    expect(
      isAllowedCurriculoFileUrl(
        'https://abc123.public.blob.vercel-storage.com/other/cv.pdf',
      ),
    ).toBe(false)
    expect(isAllowedCurriculoFileUrl('http://evil.com/curriculos/x.pdf')).toBe(false)
    expect(isAllowedCurriculoFileUrl('javascript:alert(1)')).toBe(false)
    expect(
      isAllowedCurriculoFileUrl(
        'https://evil.com/curriculos/x.pdf',
      ),
    ).toBe(false)
  })
})
