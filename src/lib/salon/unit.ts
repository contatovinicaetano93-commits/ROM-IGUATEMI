/** Unidade operacional do ROM — sempre cite a unidade nas respostas e no painel. */
export interface SalonUnit {
  /** Nome exibido: ex. "ROM Iguatemi" */
  name: string
  /** Identificador curto: ex. "rom-iguatemi" */
  slug: string
  /** ID da unidade no Avec (quando configurado) */
  avecUnitId: string | null
  /** Marca do ecossistema */
  brand: string
}

const DEFAULT_UNIT: SalonUnit = {
  name: 'ROM Iguatemi',
  slug: 'rom-iguatemi',
  avecUnitId: null,
  brand: 'ROM Club',
}

export function getSalonUnit(): SalonUnit {
  return {
    name: process.env.SALON_UNIT_NAME?.trim() || DEFAULT_UNIT.name,
    slug: process.env.SALON_UNIT_SLUG?.trim() || DEFAULT_UNIT.slug,
    avecUnitId: process.env.AVEC_UNIT_ID?.trim() || null,
    brand: process.env.SALON_BRAND?.trim() || DEFAULT_UNIT.brand,
  }
}

/** Rótulo completo para UI: "ROM Iguatemi · ROM Club" */
export function unitDisplayLabel(unit = getSalonUnit()) {
  return `${unit.name} · ${unit.brand}`
}

/** Prefixo para mensagens da IA / Telegram */
export function unitContextLine(unit = getSalonUnit()) {
  return `Unidade: ${unit.name}${unit.avecUnitId ? ` (Avec ${unit.avecUnitId})` : ''}`
}
