import { describe, expect, it } from 'vitest'
import {
  findUniqueFolhaTaxLineName,
  folhaTaxNameMatches,
} from '@/lib/folha/tax-name-match'

describe('folhaTaxNameMatches', () => {
  it('nome completo exato', () => {
    expect(
      folhaTaxNameMatches('Maria Gabriela dos Santos', 'Maria Gabriela dos Santos'),
    ).toBe(true)
  })

  it('iniciais + sobrenome (padrão contabilidade)', () => {
    expect(
      folhaTaxNameMatches('M. G. DOS SANTOS', 'Maria Gabriela dos Santos'),
    ).toBe(true)
    expect(
      folhaTaxNameMatches('M. G. dos Santos - DARF INSS', 'Maria Gabriela dos Santos'),
    ).toBe(true)
  })

  it('uma inicial + sobrenome único', () => {
    expect(folhaTaxNameMatches('B. Silva', 'Brunna Silva')).toBe(true)
  })

  it('não casa sobrenome diferente', () => {
    expect(
      folhaTaxNameMatches('M. G. DOS SANTOS', 'Maria Gabriela Oliveira'),
    ).toBe(false)
  })
})

describe('findUniqueFolhaTaxLineName', () => {
  it('único hit com abreviação', () => {
    expect(
      findUniqueFolhaTaxLineName(
        ['Maria Gabriela dos Santos', 'Brunna Silva', 'Alan Fernando'],
        'M. G. DOS SANTOS',
      ),
    ).toBe('Maria Gabriela dos Santos')
  })

  it('ambíguo (mesmas iniciais + sobrenome) → null', () => {
    expect(
      findUniqueFolhaTaxLineName(
        ['Maria Gabriela dos Santos', 'Marcos Gonçalves dos Santos'],
        'M. G. DOS SANTOS',
      ),
    ).toBeNull()
  })

  it('duas Silvas com B. → null', () => {
    expect(
      findUniqueFolhaTaxLineName(['Brunna Silva', 'Beatriz Silva'], 'B. Silva'),
    ).toBeNull()
  })

  it('exact vence loose (Mauricio ≠ Mauri)', () => {
    expect(
      findUniqueFolhaTaxLineName(
        ['Mauri Lima', 'Mauricio De Carvalho Lima'],
        'MAURICIO DE CARVALHO LIMA',
      ),
    ).toBe('Mauricio De Carvalho Lima')
  })
})
