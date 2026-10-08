import { describe, expect, it } from 'vitest'
import {
  curriculoBlobPathname,
  guessCurriculoContentType,
  isAllowedCurriculoContentType,
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
})
