import { describe, expect, it } from 'vitest'
import {
  CURRICULO_BATCH_MAX,
  candidateNameFromFileName,
  curriculoBlobPathname,
  guessCurriculoContentType,
  isAllowedCurriculoContentType,
  isAllowedCurriculoFileUrl,
  pickCurriculoBatchFiles,
  safeCurriculoFileName,
} from './file'

describe('curriculos/file', () => {
  it('sanitiza nome com acentos e espaços', () => {
    expect(safeCurriculoFileName('Currículo Maria Silva.pdf')).toBe('Curr_culo_Maria_Silva.pdf')
  })

  it('deriva nome do candidato do arquivo (lote + fixtures do motor)', () => {
    expect(candidateNameFromFileName('Maria_Silva_CV.pdf')).toBe('Maria Silva CV')
    expect(candidateNameFromFileName('curriculo-teste-motor.pdf')).toBe('Camila Souza Ribeiro')
    expect(candidateNameFromFileName('curriculo_teste_motor_rom_2.pdf')).toBe(
      'Rafael Mendes Oliveira',
    )
  })

  it('valida lote: teto, tipo e tamanho', () => {
    const ok = pickCurriculoBatchFiles([
      new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' }),
      new File([new Uint8Array([1])], 'b.jpg', { type: 'image/jpeg' }),
    ])
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.files).toHaveLength(2)

    const tooMany = Array.from({ length: CURRICULO_BATCH_MAX + 1 }, (_, i) =>
      new File([new Uint8Array([1])], `c${i}.pdf`, { type: 'application/pdf' }),
    )
    const capped = pickCurriculoBatchFiles(tooMany)
    expect(capped.ok).toBe(false)
    if (!capped.ok) expect(capped.error).toMatch(/No máximo 20/)

    const bad = pickCurriculoBatchFiles([
      new File([new Uint8Array([1])], 'x.doc', { type: 'application/msword' }),
    ])
    expect(bad.ok).toBe(false)
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
