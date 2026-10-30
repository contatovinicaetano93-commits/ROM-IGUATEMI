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

  it('LP = FL − 026 (sem meio a meio no cartão)', () => {
    const r = calculateFopagRom({
      report0123: 20_000,
      report041: 2_000,
      report029: 400,
      report026: 300,
      comissaoProfissional: 0.5,
    })
    // FL 10500 − 300 = 10200; cartão já saiu no FL
    expect(r.meioAMeio).toBeNull()
    expect(roundFopagRom(r.liquidoPadrao, 2)).toBe(10_200)
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
    // 10200 − 50 − 100 + 40 = 10090
    expect(roundFopagRom(y, 2)).toBe(10_090)
  })

  it('Daniela: FL − K + 50%K − 026 − adm 7%', () => {
    // FL 32311.74; K=7721.58; 026=778.34; adm=60477×7%=4233.39
    const fl = 32_311.74
    const lp = fl - 778.34
    const y = applyFopagRomManualExtras(lp, {
      descontoAssistente: 7_721.58,
      taxaAdministrativa: 4_233.39,
    })
    expect(roundFopagRom(y, 2)).toBe(23_439.22)
  })

  it('029: cartão só no FL; assistente −K+meio depois', () => {
    const r = calculateFopagRom({
      report0123: 20_000,
      report041: 2_000,
      report029: 400, // só cartão
      report026: 300,
      comissaoProfissional: 0.5,
    })
    expect(roundFopagRom(r.liquidoPadrao, 2)).toBe(10_200)
    const y = applyFopagRomManualExtras(r.liquidoPadrao, {
      descontoAssistente: 1_000,
      taxaAdministrativa: 1_000, // 5%×20000
    })
    // 10200 − 1000 + 500 − 1000 = 8700
    expect(roundFopagRom(y, 2)).toBe(8_700)
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

  it('alíquota em branco ou nome fora da planilha não inventa % de cargo', () => {
    expect(
      resolveRhCommissionRate({
        panel: 'iguatemi',
        name: 'DEISE DE ARAUJO REIS',
        cargo: 'Manicure',
      }),
    ).toBeNull()
    expect(
      resolveRhCommissionRate({
        panel: 'iguatemi',
        name: 'PROFISSIONAL INEXISTENTE XYZ',
        cargo: 'Cabeleireiro',
      }),
    ).toBeNull()
  })

  it('alíquota 0 explícita permanece 0', () => {
    expect(
      resolveRhCommissionRate({
        panel: 'iguatemi',
        name: 'DHANDARA VIEIRA GOMES',
        cargo: 'Assistente',
      }),
    ).toBe(0)
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
