/**
 * Overlay da Fopag fechada sobre extras sticky do rascunho.
 *
 * Legado de Setembro/2026: o motor (Y) fecha 125/125 quando os extras vêm da
 * planilha. Rascunhos vivos às vezes guardam U/Baru de seed antigo — aí o
 * líquido diverge mesmo com o 8123 certo.
 *
 * Escopo fixo: só `2026-09-q2` + linhas com referência Fopag.
 * Outubro+ fecha só com motor + Avec (janela) + Zig + IMAP — este overlay
 * é no-op para qualquer outro `periodId`.
 */

import type { RomPanelId } from '@/lib/brand'
import {
  firstAndLastTokenKey,
  occupancyMergeKey,
} from '@/lib/director-report/match-pro'
import type { FolhaDraftLine } from '@/lib/folha/draft-from-8123'
import { roundFolha } from '@/lib/folha/calc'
import { normalizeFolhaCargo } from '@/lib/folha/rules'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'
import fopagClosedFixture from '@/lib/folha/fixtures/fopag-ig-q2-parsed.json'

export const CLOSED_FOPAG_PERIOD_ID = '2026-09-q2'

type ClosedFopagRow = {
  name: string
  cargo?: string | null
  faturado?: number
  fat_liquido?: number
  produto?: number
  taxa_adm?: number
  baru: number
  U: number
  V?: number
  W?: number
  parc?: number
  das?: number
  darf?: number
  div_ativa?: number
  mensalidade?: number
  desc_assistente?: number
  desc_diversos_02?: number
  liquido: number
}

type ClosedFixtureFile = {
  fopag_br_q2?: ClosedFopagRow[]
  fopag_ig_q2?: ClosedFopagRow[]
}

const fixture = fopagClosedFixture as ClosedFixtureFile

function isAssistLike(
  cargo: string | null | undefined,
  lineCargo: string | null | undefined,
): boolean {
  const normalized = normalizeFolhaCargo(cargo ?? lineCargo ?? null)
  switch (normalized) {
    case 'assistente':
    case 'multiplicador':
    case 'colorista':
      return true
    case 'profissional':
    case 'cabeleireiro':
    case 'maquiador':
    case 'manicure':
    case 'esteticista':
    case 'outro':
      return false
    default: {
      const _never: never = normalized
      return _never
    }
  }
}

function hasFopagRefs(line: FolhaDraftLine): boolean {
  const extras = line.folha_extras
  const marked = (value: number | null | undefined) =>
    value != null && !Number.isNaN(value) && Math.abs(value) > 0.02
  return (
    marked(extras.liquido_referencia) ||
    marked(extras.faturado_referencia) ||
    marked(extras.fat_liquido_referencia)
  )
}

function lookupByNameKey(
  map: Map<string, ClosedFopagRow>,
  name: string,
): ClosedFopagRow | null {
  const key = occupancyMergeKey(name)
  if (key && map.has(key)) return map.get(key) ?? null
  const fl = firstAndLastTokenKey(key ?? '')
  const hits: ClosedFopagRow[] = []
  for (const [k, v] of map) {
    if (fl && firstAndLastTokenKey(k) === fl) hits.push(v)
    else if (
      key &&
      (key === k || key.startsWith(`${k} `) || k.startsWith(`${key} `))
    ) {
      hits.push(v)
    }
  }
  const uniq = [...new Set(hits)]
  return uniq.length === 1 ? uniq[0]! : null
}

const mapsByPanel: Partial<Record<RomPanelId, Map<string, ClosedFopagRow>>> = {}

function fopagMapFor(panel: RomPanelId): Map<string, ClosedFopagRow> {
  const cached = mapsByPanel[panel]
  if (cached) return cached
  const rows =
    panel === 'brasil' ? (fixture.fopag_br_q2 ?? []) : (fixture.fopag_ig_q2 ?? [])
  const map = new Map<string, ClosedFopagRow>()
  for (const row of rows) {
    const key = occupancyMergeKey(row.name)
    if (key) map.set(key, row)
  }
  mapsByPanel[panel] = map
  return map
}

function sameAmount(
  left: number | null | undefined,
  right: number | null | undefined,
): boolean {
  if (left == null && right == null) return true
  if (left == null || right == null) return false
  return Math.abs(left - right) <= 0.005
}

function looksLikeFopagSeededAvec(line: FolhaDraftLine): boolean {
  return line.avec.card_fee == null && line.avec.service_share == null
}

function syntheticNet(row: ClosedFopagRow): number | null {
  if (row.fat_liquido == null || Number.isNaN(row.fat_liquido)) return null
  const net =
    row.fat_liquido - (row.produto ?? 0) - (row.desc_assistente ?? 0)
  return roundFolha(net, 4)
}

function overlaySeededAvec(
  line: FolhaDraftLine,
  row: ClosedFopagRow,
): { avec: FolhaDraftLine['avec']; changed: boolean } {
  if (!looksLikeFopagSeededAvec(line)) {
    return { avec: line.avec, changed: false }
  }
  const avec = { ...line.avec }
  let changed = false
  const net = syntheticNet(row)
  if (net != null && !sameAmount(avec.net_payable, net)) {
    avec.net_payable = net
    changed = true
  }
  const prod = row.produto ?? 0
  if (prod > 0.02) {
    const spend = -prod
    if (!sameAmount(avec.product_spend, spend)) {
      avec.product_spend = spend
      changed = true
    }
  }
  const assist = row.desc_assistente ?? 0
  if (assist > 0.02) {
    const k = -assist
    if (!sameAmount(avec.assistant_discount, k)) {
      avec.assistant_discount = k
      changed = true
    }
  }
  if (row.faturado != null && row.faturado > 0.02 && !sameAmount(avec.charged, row.faturado)) {
    avec.charged = row.faturado
    changed = true
  }
  return { avec, changed }
}

function taxLikeDiversos(row: ClosedFopagRow): number | null {
  const total =
    (row.das ?? 0) +
    (row.darf ?? 0) +
    (row.div_ativa ?? 0) +
    (row.mensalidade ?? 0) +
    ((row.desc_diversos_02 ?? 0) > 0.02 ? (row.desc_diversos_02 ?? 0) : 0)
  return total > 0.02 ? total : null
}

function overlayLineExtras(
  line: FolhaDraftLine,
  row: ClosedFopagRow,
): { line: FolhaDraftLine; changed: boolean } {
  const extras = { ...line.folha_extras }
  let changed = false
  const touch = (key: keyof FolhaDraftLine['folha_extras'], next: number | null) => {
    if (sameAmount(extras[key] as number | null | undefined, next)) return
    ;(extras[key] as number | null) = next
    changed = true
  }

  let u = row.U
  const assist = isAssistLike(row.cargo, line.cargo_raw ?? line.cargo)
  if (!(u > 0.005) && assist && (row.taxa_adm ?? 0) > 0.005) {
    // Auricaliane: J sem U — não inventar U = J/2%.
    u = 0
  }

  if (u > 0.005) {
    touch('servicos_assistente_como_pro', u)
    // V/W saem do motor a partir de U — zera leftover sticky.
    touch('valor_a_pagar_profissional', null)
    touch('taxa_servicos', null)
  } else {
    touch('servicos_assistente_como_pro', null)
    touch('valor_a_pagar_profissional', null)
    touch('taxa_servicos', null)
    touch('taxa_adm_assistente', null)
  }

  const baru = row.baru > 0.005 ? row.baru : null
  touch('consumo_baru', baru)

  const parc = (row.parc ?? 0) > 0.005 ? row.parc! : null
  touch('parc', parc)

  touch('descontos_diversos', taxLikeDiversos(row))

  const cargo = normalizeFolhaCargo(row.cargo ?? line.cargo_raw ?? line.cargo)
  if (u <= 0.005 && (row.taxa_adm ?? 0) > 0.005 && (assist || cargo === 'manicure')) {
    touch('taxa_administrativa', row.taxa_adm ?? null)
  } else if (!assist && cargo !== 'manicure') {
    // Pro: motor recalcula 5%/7% sobre C — não reusar J sticky.
    touch('taxa_administrativa', null)
  }

  touch('liquido_referencia', row.liquido > 0.005 ? row.liquido : null)
  touch(
    'fat_liquido_referencia',
    row.fat_liquido != null && row.fat_liquido > 0.005 ? row.fat_liquido : null,
  )
  touch(
    'produto_referencia',
    row.produto != null && row.produto > 0.005 ? row.produto : null,
  )
  touch(
    'faturado_referencia',
    row.faturado != null && row.faturado > 0.005 ? row.faturado : null,
  )

  const avecNext = overlaySeededAvec({ ...line, folha_extras: extras }, row)
  if (avecNext.changed) changed = true
  if (!changed) return { line, changed: false }
  return {
    line: { ...line, folha_extras: extras, avec: avecNext.avec },
    changed: true,
  }
}

function overlaySourceProfessionals(
  source: readonly CommissionProfessionalRow[] | undefined,
  lines: readonly FolhaDraftLine[],
): CommissionProfessionalRow[] | undefined {
  if (!source?.length) return source as CommissionProfessionalRow[] | undefined
  const avecByKey = new Map<string, FolhaDraftLine['avec']>()
  for (const line of lines) {
    const key = occupancyMergeKey(line.name) || line.name
    avecByKey.set(key, line.avec)
  }
  return source.map((pro) => {
    const key = occupancyMergeKey(pro.name) || pro.name
    const avec = avecByKey.get(key)
    if (!avec) return pro
    return {
      ...pro,
      charged: avec.charged,
      net_payable: avec.net_payable,
      product_spend: avec.product_spend,
      assistant_discount: avec.assistant_discount,
      card_fee: avec.card_fee,
      service_share: avec.service_share,
      admin_fee: avec.admin_fee,
      other_discounts: avec.other_discounts,
    }
  })
}

export function overlayClosedFopagExtras(args: {
  panel: RomPanelId
  periodId: string | null | undefined
  lines: readonly FolhaDraftLine[]
  sourceProfessionals?: readonly CommissionProfessionalRow[]
}): {
  lines: FolhaDraftLine[]
  sourceProfessionals?: CommissionProfessionalRow[]
  changed: boolean
} {
  if (args.periodId !== CLOSED_FOPAG_PERIOD_ID) {
    return {
      lines: [...args.lines],
      sourceProfessionals: args.sourceProfessionals
        ? [...args.sourceProfessionals]
        : undefined,
      changed: false,
    }
  }
  const map = fopagMapFor(args.panel)
  let changed = false
  const lines = args.lines.map((line) => {
    if (!hasFopagRefs(line)) return line
    const row = lookupByNameKey(map, line.name)
    if (!row) return line
    const next = overlayLineExtras(line, row)
    if (next.changed) changed = true
    return next.line
  })
  const sourceProfessionals = overlaySourceProfessionals(
    args.sourceProfessionals,
    lines,
  )
  return { lines, sourceProfessionals, changed }
}
