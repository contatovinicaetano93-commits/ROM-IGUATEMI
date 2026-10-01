import { describe, expect, it } from 'vitest'
import { calculateFolhaLine, roundFolha } from '@/lib/folha/calc'
import {
  ASSISTANT_AS_PRO_EARN_RATE,
  assistantServiceTaxRate,
  defaultAdminFeeRate,
  folhaRulesSummary,
  normalizeFolhaCargo,
} from '@/lib/folha/rules'

describe('folha rules', () => {
  it('taxa serviços assistente-como-pro: BR 3% / IG 4%', () => {
    expect(assistantServiceTaxRate('brasil')).toBe(0.03)
    expect(assistantServiceTaxRate('iguatemi')).toBe(0.04)
  })

  it('manicure sem taxa adm; cabeleireiro default 5% BR / 7% IG', () => {
    expect(defaultAdminFeeRate('brasil', 'manicure')).toBeNull()
    expect(defaultAdminFeeRate('brasil', 'cabeleireiro')).toBe(0.05)
    expect(defaultAdminFeeRate('iguatemi', 'cabeleireiro')).toBe(0.07)
  })

  it('normaliza cargos do caderno', () => {
    expect(normalizeFolhaCargo('Manicure')).toBe('manicure')
    expect(normalizeFolhaCargo('Assistente')).toBe('assistente')
    expect(normalizeFolhaCargo('MULTIPLICADOR')).toBe('multiplicador')
    expect(normalizeFolhaCargo('Esteticista')).toBe('esteticista')
  })

  it('assistente pode ganhar 30% atuando como pro', () => {
    expect(ASSISTANT_AS_PRO_EARN_RATE).toBe(0.3)
  })

  it('summary expõe distinção cartão vs taxa U', () => {
    const s = folhaRulesSummary('brasil')
    expect(s.assistant_service_tax_rate).toBe(0.03)
    expect(s.manicure_admin_fee).toBe('never_unless_depilacao')
    expect(s.card_fee_note).toMatch(/cartão/i)
  })
})

describe('calculateFolhaLine — Fopag Alan (BR)', () => {
  it('Y bate com a fórmula da planilha (+V −W, meio a meio)', () => {
    const result = calculateFolhaLine({
      panel: 'brasil',
      cargo: 'Cabeleireiro',
      faturado: 56365.32,
      pctSalao: 0.55,
      fatLiquido: 30112.59,
      taxaCartaoPix: 1486.71,
      produto: 683.87,
      taxaAdministrativa: 2818.266, // C*5%
      descontoAssistente: 7806.42,
      meioAMeio: null, // deriva L/2
      parc: 355.25,
      darf: 0,
      das: 5183.42,
      divAtiva: 0,
      mensalidadeContabilidade: 120,
      descontosDiversos: 0,
      produtosBlack: 0,
      servicosAssistenteComoPro: 2264.82,
      valorAPagarProfissional: null,
      remitRateOverride: null,
      taxaServicosOverride: null,
      hasDepilacao: false,
      waiveAdminFee: false,
    })

    expect(roundFolha(result.meioAMeio, 2)).toBe(3903.21)
    expect(roundFolha(result.valorAPagarProfissional, 3)).toBe(452.964)
    expect(roundFolha(result.taxaServicos, 4)).toBe(67.9446)
    expect(roundFolha(result.valorLiquido, 4)).toBe(17433.5934)
  })
})

describe('calculateFolhaLine — manicure', () => {
  it('sem taxa adm por padrão', () => {
    const result = calculateFolhaLine({
      panel: 'iguatemi',
      cargo: 'Manicure',
      faturado: 6052,
      pctSalao: 0.5,
      fatLiquido: 3100.22,
      taxaCartaoPix: 154.52,
      produto: 585.1,
      taxaAdministrativa: undefined,
      descontoAssistente: 0,
      meioAMeio: 0,
      parc: 0,
      darf: 0,
      das: 86.05,
      divAtiva: 0,
      mensalidadeContabilidade: 93,
      descontosDiversos: 0,
      produtosBlack: 0,
      servicosAssistenteComoPro: null,
      valorAPagarProfissional: null,
      remitRateOverride: null,
      taxaServicosOverride: null,
      hasDepilacao: false,
      waiveAdminFee: false,
    })
    expect(result.taxaAdministrativa).toBeNull()
    expect(roundFolha(result.valorLiquido, 2)).toBe(2336.07)
  })

  it('com depilação aplica taxa adm default do painel', () => {
    const result = calculateFolhaLine({
      panel: 'brasil',
      cargo: 'Manicure',
      faturado: 1000,
      pctSalao: 0.5,
      fatLiquido: 500,
      taxaCartaoPix: null,
      produto: 0,
      taxaAdministrativa: undefined,
      descontoAssistente: null,
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
      hasDepilacao: true,
      waiveAdminFee: false,
    })
    // Manicure+depilação: usa default cabeleireiro? Caderno diz "paga taxa de adm"
    // mas defaultAdminFeeRate(manicure) é null — apply via hasDepilacao using panel rate on C.
    // Current resolveAdminFee: manicure && !hasDepilacao → null; with hasDepilacao falls through
    // to defaultAdminFeeRate(manicure) which is still null.
    // Fix needed: when hasDepilacao, use panel default for profissional.
    expect(result.taxaAdministrativa).not.toBeNull()
  })
})

describe('calculateFolhaLine — esteticista', () => {
  it('soma bônus 10% do faturado', () => {
    const result = calculateFolhaLine({
      panel: 'iguatemi',
      cargo: 'Esteticista',
      faturado: 1000,
      pctSalao: 0.5,
      fatLiquido: 500,
      taxaCartaoPix: null,
      produto: 50,
      taxaAdministrativa: 70, // 7%
      descontoAssistente: null,
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
    expect(result.esteticistaBonus).toBe(100)
    expect(result.valorLiquido).toBe(500 - 50 - 70 + 100)
  })
})

describe('calculateFolhaLine — IG taxa 4% sobre U', () => {
  it('W = U × 4%', () => {
    const result = calculateFolhaLine({
      panel: 'iguatemi',
      cargo: 'Assistente',
      faturado: 21445,
      pctSalao: 0.13,
      fatLiquido: 2000,
      taxaCartaoPix: null,
      produto: 0,
      taxaAdministrativa: 6.4,
      descontoAssistente: 0,
      meioAMeio: 0,
      parc: 0,
      darf: 0,
      das: 0,
      divAtiva: 0,
      mensalidadeContabilidade: 0,
      descontosDiversos: 0,
      produtosBlack: 0,
      servicosAssistenteComoPro: 320,
      valorAPagarProfissional: null,
      remitRateOverride: null,
      taxaServicosOverride: null,
      hasDepilacao: false,
      waiveAdminFee: false,
    })
    expect(result.valorAPagarProfissional).toBe(64)
    expect(result.taxaServicos).toBe(12.8)
  })
})

describe('calculateFolhaLine — KPI null', () => {
  it('sem fatLiquido → valorLiquido null (não 0)', () => {
    const result = calculateFolhaLine({
      panel: 'brasil',
      cargo: 'Cabeleireiro',
      faturado: null,
      pctSalao: null,
      fatLiquido: null,
      taxaCartaoPix: null,
      produto: null,
      taxaAdministrativa: undefined,
      descontoAssistente: null,
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
    expect(result.valorLiquido).toBeNull()
  })
})
