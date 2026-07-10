export type RomPanelId = 'brasil' | 'iguatemi'
export type RomSeedPreset = RomPanelId

export interface RomBrand {
  panel: RomPanelId
  displayName: string
  productName: string
  shortMonogram: string
  locationSubtitle: string
  tagline: string
  hojeTitle: string
  dashboardTitle: string
  loginSubtitle: string
  receptionLabel: string
  aiPersonaName: string
}

const BRANDS: Record<RomPanelId, RomBrand> = {
  brasil: {
    panel: 'brasil',
    displayName: 'ROM CLUB BRASIL',
    productName: 'ROM CLUB BRASIL',
    shortMonogram: 'ROM',
    locationSubtitle: 'BRASIL',
    tagline: 'Frente de caixa · contatos, KPIs e ações guiadas',
    hojeTitle: 'Hoje no ROM CLUB BRASIL',
    dashboardTitle: 'Atendimento do ROM CLUB BRASIL',
    loginSubtitle: 'Painel, contatos e playbook do ROM CLUB BRASIL.',
    receptionLabel: 'ROM CLUB BRASIL · Operação',
    aiPersonaName: 'ROM CLUB BRASIL',
  },
  iguatemi: {
    panel: 'iguatemi',
    displayName: 'ROM CLUB IGUATEMI',
    productName: 'ROM CLUB BRASIL',
    shortMonogram: 'ROM',
    locationSubtitle: 'IGUATEMI',
    tagline: 'Unidade Iguatemi · playbook, contatos e KPIs',
    hojeTitle: 'Hoje no ROM CLUB IGUATEMI',
    dashboardTitle: 'Atendimento do ROM CLUB IGUATEMI',
    loginSubtitle: 'Painel da unidade Iguatemi do ROM CLUB BRASIL.',
    receptionLabel: 'ROM CLUB IGUATEMI · Operação',
    aiPersonaName: 'ROM CLUB IGUATEMI',
  },
}

export function parseRomPanelId(value: string | undefined | null): RomPanelId {
  const v = value?.toLowerCase()
  if (v === 'iguatemi' || v === 'iguatuemi') return 'iguatemi'
  return 'brasil'
}

/** Painel ativo — `ROM_PANEL` no servidor, `NEXT_PUBLIC_ROM_PANEL` no cliente. */
export function getRomPanelId(): RomPanelId {
  const fromServer = typeof window === 'undefined' ? process.env.ROM_PANEL : undefined
  return parseRomPanelId(fromServer ?? process.env.NEXT_PUBLIC_ROM_PANEL)
}

export function getBrand(panel?: RomPanelId): RomBrand {
  return BRANDS[panel ?? getRomPanelId()]
}

export function getDefaultSeedPreset(): RomSeedPreset {
  return parseSeedPreset(process.env.ROM_SEED_PRESET) ?? getRomPanelId()
}

/** ID da unidade no Avec (quando configurado) — escopa o sync pra não misturar unidades. */
export function getAvecUnitId(): string | null {
  return process.env.AVEC_UNIT_ID?.trim() || null
}

/** Valor do param `site` nos relatórios Avec (vazio se não configurado). */
export function avecSiteParam(): string {
  return getAvecUnitId() ?? ''
}

export function parseSeedPreset(value: string | undefined | null): RomSeedPreset | null {
  if (!value) return null
  const v = value.toLowerCase()
  if (v === 'brasil') return 'brasil'
  if (v === 'iguatemi' || v === 'iguatuemi') return 'iguatemi'
  return null
}
