import { describe, expect, it } from 'vitest'
import { calculateFolhaLine, roundFolha } from '@/lib/folha/calc'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import {
  quinzenaMetaHit,
  resolveAssistantAdminTaxRate,
  resolveFolhaPersonRules,
  resolveMeioAMeioRate,
  resolveProfessionalServiceTaxRate,
  romeuAssistantCommissionRate,
  romeuAssistantMetaTopUp,
} from '@/lib/folha/exceptions'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

function row(
  name: string,
  overrides?: Partial<CommissionProfessionalRow>,
): CommissionProfessionalRow {
  return {
    name,
    role: 'Cabeleireiro',
    charged: 10_000,
    service_share: null,
    product_share: null,
    other_share: null,
    tip: null,
    product_spend: null,
    card_fee: null,
    admin_fee: null,
    assistant_discount: -1000,
    other_discounts: null,
    net_payable: 5000,
    house_share: null,
    ...overrides,
  }
}

describe('resolveFolhaPersonRules', () => {
  it('casa Pedro Diello (5%) e não Pedro Cardi (assistente Romeu)', () => {
    expect(resolveFolhaPersonRules('Pedro Diello')?.id).toBe('pedro_diello')
    expect(resolveFolhaPersonRules('Pedro Henrique Sousa Cardi')?.id).toBe(
      'romeu_assistant',
    )
  })

  it('casa Dayana/Gildenice 5%, Romeu 50%, Walter 30% assistente, Dani meio 50% + comissão 55%', () => {
    expect(resolveMeioAMeioRate(resolveFolhaPersonRules('Dayana Marques'))).toBe(0.05)
    expect(resolveMeioAMeioRate(resolveFolhaPersonRules('Daiana'))).toBe(0.05)
    expect(resolveMeioAMeioRate(resolveFolhaPersonRules('Gildenice Teixeira'))).toBe(
      0.05,
    )
    expect(resolveFolhaPersonRules('Gildenice')?.id).toBe('gildenice')
    expect(resolveMeioAMeioRate(resolveFolhaPersonRules('Romeu Felipe'))).toBe(0.5)
    expect(resolveMeioAMeioRate(resolveFolhaPersonRules('Walter Leal'))).toBe(0.7)
    expect(resolveMeioAMeioRate(resolveFolhaPersonRules('Daniela Machado Rocha'))).toBe(
      0.5,
    )
    expect(resolveFolhaPersonRules('Walter Leal')?.proCommissionRate).toBe(0.6)
    expect(resolveFolhaPersonRules('Dani Rocha')?.assistantRemitRate).toBeNull()
    expect(resolveFolhaPersonRules('Dani Rocha')?.proCommissionRate).toBe(0.55)
  })

  it('Liria: taxa adm 7%, sem bônus esteticista', () => {
    const r = resolveFolhaPersonRules('Liria Pereira Colman')
    expect(r?.id).toBe('liria')
    expect(r?.suppressEsteticistaBonus).toBe(true)
    expect(r?.adminFeeRate).toBe(0.07)
  })

  it('não confunde Walter Junior com Walter Leal', () => {
    expect(resolveFolhaPersonRules('Walter Junior')).toBeNull()
  })

  it('Brunna / Joanides / Marcela com split 2%+3% e taxa adm bruta 5%', () => {
    for (const name of [
      'Brunna Fabricio',
      'Joanides Mendes Pontes Junior',
      'Marcela De Araujo Guedes',
    ]) {
      const r = resolveFolhaPersonRules(name)
      expect(r?.serviceTaxSplit).toEqual({
        total: 0.05,
        assistant: 0.02,
        professional: 0.03,
      })
      expect(r?.adminFeeRate).toBe(0.05)
      expect(resolveProfessionalServiceTaxRate('iguatemi', r)).toBe(0.03)
      expect(resolveAssistantAdminTaxRate('iguatemi', r)).toBe(0.02)
    }
  })

  it('metas Lucas Campos e Juscelino existem sem valor (null)', () => {
    const lucas = resolveFolhaPersonRules('Lucas Campos De Macedo')
    expect(lucas?.hasQuinzenaMeta).toBe(true)
    expect(lucas?.quinzenaMeta).toBeNull()
    expect(quinzenaMetaHit(lucas, 50_000)).toBeNull()

    const jus = resolveFolhaPersonRules('Juscelino')
    expect(jus?.hasQuinzenaMeta).toBe(true)
    expect(jus?.quinzenaMeta).toBeNull()
  })

  it('Jefferson / Gabriela / Lucas / Nicole / Jonathan são assistentes do Romeu', () => {
    for (const name of [
      'JEFFERSON POLICARPO DOS SANTOS',
      'GABRIELA DA SILVA SANTOS',
      'LUCAS RODRIGUES DE SOUZA',
      'NICOLE MOURA DE OLIVEIRA',
      'JONATHAN DIAS DOS SANTOS',
    ]) {
      expect(resolveFolhaPersonRules(name)?.isRomeuAssistant).toBe(true)
      expect(resolveFolhaPersonRules(name)?.id).toBe('romeu_assistant')
    }
  })

  it('Gabriela Martins / Graciele / Camila / Tatiana / Patrícia: split 2%+3% sem adm 5% sobre C', () => {
    for (const [name, id] of [
      ['GABRIELA MARTINS DA SILVA', 'gabriela_martins'],
      ['GRACIELE DA SILVA SANTOS', 'graciele'],
      ['CAMILA ORNELAS SANTOS', 'camila_ornelas'],
      ['TATIANA CRISTINA DOS SANTOS MOURA', 'tatiana_moura'],
      ['PATRICIA AGUIAR PINTO', 'patricia_aguiar'],
    ] as const) {
      const r = resolveFolhaPersonRules(name)
      expect(r?.id).toBe(id)
      expect(r?.serviceTaxSplit).toEqual({
        total: 0.05,
        assistant: 0.02,
        professional: 0.03,
      })
      expect(r?.adminFeeRate).toBeNull()
      expect(resolveProfessionalServiceTaxRate('iguatemi', r)).toBe(0.03)
      expect(resolveAssistantAdminTaxRate('iguatemi', r)).toBe(0.02)
    }
    // Não confundir com Gabriela Santos (Romeu).
    expect(resolveFolhaPersonRules('GABRIELA DA SILVA SANTOS')?.id).toBe(
      'romeu_assistant',
    )
  })
})

describe('romeuAssistantCommissionRate', () => {
  it('faixas 30 / 40 / 50 no acumulado do mês', () => {
    expect(romeuAssistantCommissionRate(999)).toBeNull()
    expect(romeuAssistantCommissionRate(1000)).toBe(0.3)
    expect(romeuAssistantCommissionRate(10_000)).toBe(0.3)
    expect(romeuAssistantCommissionRate(10_001)).toBe(0.4)
    expect(romeuAssistantCommissionRate(20_000)).toBe(0.4)
    expect(romeuAssistantCommissionRate(20_001)).toBe(0.5)
    expect(romeuAssistantCommissionRate(30_000)).toBe(0.5)
    expect(romeuAssistantCommissionRate(40_000)).toBe(0.5)
  })
})

describe('romeuAssistantMetaTopUp — Bonus Sep/2026', () => {
  it('topUp = monthTotal × (rate − 0.30); 30% já pago nas quinzenas', () => {
    // Gabriela IG: Q1+Q2 = 10230.03 → faixa 40% → +10%
    const gabi = romeuAssistantMetaTopUp(10_230.03)
    expect(gabi.rate).toBe(0.4)
    expect(gabi.topUp).toBeCloseTo(1023.003, 5)

    // Lucas IG: 4980 → faixa 30% → top-up 0
    expect(romeuAssistantMetaTopUp(4980)).toEqual({
      rate: 0.3,
      monthTotal: 4980,
      topUp: 0,
    })

    // Jefferson IG: 1689.99 → faixa 30% → top-up 0
    expect(romeuAssistantMetaTopUp(1689.99).topUp).toBe(0)

    // Faixa 50%: 25000 → +20% = 5000
    const band50 = romeuAssistantMetaTopUp(25_000)
    expect(band50.rate).toBe(0.5)
    expect(band50.topUp).toBe(5000)

    // &lt; 1000 → null
    expect(romeuAssistantMetaTopUp(999)).toEqual({
      rate: null,
      monthTotal: null,
      topUp: null,
    })
  })

  it('BR Sep: Jefferson 17958.05 → 10%; Gabriela band math 24700.03 → 20%', () => {
    // Jefferson BR bate a planilha (10%)
    expect(romeuAssistantMetaTopUp(17_958.05).topUp).toBeCloseTo(1795.805, 5)

    // Gabriela BR: aba Bonus E14 mostra 2470 (10%), mas faixa 20k–30k = 50%
    // → top-up canônico = +20% = 4940.006 (preferir band math)
    const gabiBr = romeuAssistantMetaTopUp(24_700.03)
    expect(gabiBr.rate).toBe(0.5)
    expect(gabiBr.topUp).toBeCloseTo(4940.006, 5)

    // Lucas BR: 5950 → 0
    expect(romeuAssistantMetaTopUp(5950).topUp).toBe(0)
  })
})

describe('IG não-Romeu — taxa adm assistente 3%', () => {
  it('profissional comum no IG: W=4% e taxa adm assistente 3% sobre U', () => {
    const line = buildFolhaDraftLine('iguatemi', row('Maykon Teste'), {
      servicos_assistente_como_pro: 1000,
    })
    expect(line.folha_extras.taxa_servicos).toBe(40)
    expect(line.folha_extras.taxa_adm_assistente).toBe(30)
    expect(line.folha_extras.valor_a_pagar_profissional).toBe(200)
  })

  it('assistente Romeu no IG: também taxa adm 3% sobre U', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      row('Jefferson Policarpo Dos Santos', { role: 'MULTIPLICADOR' }),
      { servicos_assistente_como_pro: 1000 },
    )
    expect(line.flags).toContain('assistente_romeu')
    expect(line.folha_extras.taxa_servicos).toBe(40)
    expect(line.folha_extras.taxa_adm_assistente).toBe(30)
    expect(
      resolveAssistantAdminTaxRate(
        'iguatemi',
        resolveFolhaPersonRules('Gabriela Da Silva Santos'),
      ),
    ).toBe(0.03)
  })
})

describe('meio a meio nomeado no draft + calc', () => {
  it('Pedro Diello devolve 5%', () => {
    const line = buildFolhaDraftLine('brasil', row('Pedro Diello'))
    expect(line.meio_a_meio).toBe(50)
    expect(line.meio_a_meio_rate).toBe(0.05)
    expect(line.exception_id).toBe('pedro_diello')
  })

  it('Walter: repasse assistente 30% → meio a meio 70%', () => {
    const line = buildFolhaDraftLine('brasil', row('Walter Martinho Leal Filho Cabeleireiro'))
    expect(line.meio_a_meio_rate).toBe(0.7)
    expect(line.meio_a_meio).toBe(700)

    const y = calculateFolhaLine({
      panel: 'brasil',
      professionalName: 'Walter Leal',
      cargo: 'Cabeleireiro',
      faturado: 10_000,
      pctSalao: 0.4,
      fatLiquido: 6000,
      taxaCartaoPix: null,
      produto: 0,
      taxaAdministrativa: 0,
      descontoAssistente: 1000,
      meioAMeio: null,
      parc: null,
      darf: null,
      das: null,
      divAtiva: null,
      mensalidadeContabilidade: null,
      descontosDiversos: null,
      produtosBlack: null,
      servicosAssistenteComoPro: null,
      valorAPagarProfissional: null,
      remitRateOverride: null,
      taxaServicosOverride: null,
      hasDepilacao: false,
      waiveAdminFee: false,
    })
    expect(roundFolha(y.meioAMeio, 2)).toBe(700)
  })

  it('Brunna: W = U × 3% (não 4% IG)', () => {
    const line = buildFolhaDraftLine('iguatemi', row('Brunna Fabricio Da Silva'), {
      servicos_assistente_como_pro: 2000,
    })
    expect(line.folha_extras.taxa_servicos).toBe(60)
    expect(line.folha_extras.taxa_adm_assistente).toBe(40)
  })
})
