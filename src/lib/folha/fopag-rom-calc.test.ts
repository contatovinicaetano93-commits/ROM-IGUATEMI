import { describe, expect, it } from 'vitest'
import {
  applyFopagRomManualExtras,
  calculateFopagRom,
  computeFopagRomFatLiquido,
  roundFopagRom,
} from '@/lib/folha/fopag-rom-calc'
import { resolveRhCommissionRate } from '@/lib/folha/rh-commission-rates'

describe('FOPAG ROM calc — PDF exemplo ilustrativo (50%)', () => {
  it('passos 1–4 → FL = 10.500', () => {
    const r = computeFopagRomFatLiquido({
      report0123: 20_000,
      report041: 2_000,
      report029: 400,
      report026: null,
      comissaoProfissional: 0.5,
    })
    expect(roundFopagRom(r.servicoBruto, 2)).toBe(18_000)
    expect(roundFopagRom(r.comissaoSalao, 2)).toBe(9_000)
    expect(roundFopagRom(r.taxaProdutos, 2)).toBe(100)
    expect(roundFopagRom(r.resultadoPasso3, 2)).toBe(10_900)
    expect(roundFopagRom(r.fatLiquido, 2)).toBe(10_500)
  })

  it('passos 1–6: −026 e −50%×029', () => {
    const r = calculateFopagRom({
      report0123: 20_000,
      report041: 2_000,
      report029: 400,
      report026: 300,
      comissaoProfissional: 0.5,
    })
    // FL 10500 − 300 − 200 = 10000
    expect(roundFopagRom(r.meioAMeio, 2)).toBe(200)
    expect(roundFopagRom(r.liquidoPadrao, 2)).toBe(10_000)
  })

  it('manuais (impostos/Baru/0186) só depois do LP padrão', () => {
    const base = calculateFopagRom({
      report0123: 20_000,
      report041: 2_000,
      report029: 400,
      report026: 300,
      comissaoProfissional: 0.5,
    }).liquidoPadrao
    const y = applyFopagRomManualExtras(base, {
      consumoBaru: 50,
      das: 100,
      servicoAssistenteBonus: 40,
    })
    expect(roundFopagRom(y, 2)).toBe(9_890)
  })

  it('sem alíquota → liquido null (não inventa)', () => {
    const r = calculateFopagRom({
      report0123: 20_000,
      report041: 2_000,
      report029: 400,
      report026: 0,
      comissaoProfissional: null,
    })
    expect(r.liquidoPadrao).toBeNull()
  })
})

describe('Planilha Base RH — alíquotas', () => {
  it('resolve Brunna IG 70% e Romeu 100%', () => {
    expect(
      resolveRhCommissionRate({ panel: 'iguatemi', name: 'BRUNNA FABRICIO DA SILVA' }),
    ).toBe(0.7)
    expect(resolveRhCommissionRate({ panel: 'iguatemi', name: 'ROMEU FELIPE' })).toBe(1)
  })

  it('Alan BR 55%', () => {
    expect(
      resolveRhCommissionRate({
        panel: 'brasil',
        name: 'ALAN FERNADO DE ALBUQUERQUE',
      }),
    ).toBe(0.55)
  })

  it('Romeu 100%: FL = serviço + 95% produtos − cartão', () => {
    const r = computeFopagRomFatLiquido({
      report0123: 10_000,
      report041: 1_000,
      report029: 100,
      report026: null,
      comissaoProfissional: 1,
    })
    // salão 0% → passo3 = 10000 − 50 = 9950; FL = 9850
    expect(roundFopagRom(r.fatLiquido, 2)).toBe(9_850)
  })
})
