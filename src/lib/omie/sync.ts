/**
 * Sync Contas a Pagar Omie → finance_expenses (por data de vencimento).
 * Roda para cada CNPJ configurado: serviços (salão) e comércio (produtos).
 */

import { createCategory } from '@/lib/finance'
import {
  consultarClienteOmie,
  isOmieConfigured,
  isOmieMock,
  listarCategoriasOmie,
  listConfiguredOmieCredentials,
  OMIE_CNPJ_KINDS,
  OMIE_CNPJ_LABEL,
  pesquisarContasPagar,
  type OmieCnpjKind,
  type OmieCredentials,
} from '@/lib/omie/client'
import { omieBrToIso, omieFullMonthRange, omieIsoToBr } from '@/lib/omie/dates'
import {
  deleteOmieExpenseByExternalId,
  ensureOmieExpenseSchema,
  pruneOmieExpensesMissingFromSync,
  upsertOmieExpense,
} from '@/lib/omie/store'
import type { OmieNormalizedExpense, OmieTituloEncontrado } from '@/lib/omie/types'
import { todayIso } from '@/lib/salon/format'
import { SYNC_LOCK_KEYS, withSyncLock } from '@/lib/sync-lock'

const CANCELLED_STATUSES = new Set(['CANCELADO', 'CANCELADA'])

export interface OmieSyncKindResult {
  kind: OmieCnpjKind
  label: string
  fetched: number
  upserted: number
  created: number
  updated: number
  skipped_cancelled: number
  removed: number
  pages: number
  error?: string
}

export interface OmieSyncResult {
  month: string
  from: string
  to: string
  configured: boolean
  mock?: boolean
  /** Soma dos dois CNPJs. */
  fetched: number
  upserted: number
  created: number
  updated: number
  skipped_cancelled: number
  removed: number
  kinds: OmieSyncKindResult[]
  error?: string
}

async function loadCategoryMap(creds: OmieCredentials): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let page = 1
  let totalPages = 1
  while (page <= totalPages) {
    const res = await listarCategoriasOmie(creds, page, 100)
    totalPages = Math.max(1, res.total_de_paginas || 1)
    for (const cat of res.categoria_cadastro ?? []) {
      if (cat.codigo && cat.descricao) {
        map.set(cat.codigo, cat.descricao.trim())
      }
    }
    page += 1
    if (page > 50) break
  }
  return map
}

async function resolveSupplierName(
  creds: OmieCredentials,
  codigo: number | undefined,
  cache: Map<number, string | null>,
): Promise<string | null> {
  if (process.env.OMIE_RESOLVE_SUPPLIERS?.trim() !== '1') return null
  if (codigo == null || !(codigo > 0)) return null
  if (cache.has(codigo)) return cache.get(codigo) ?? null
  try {
    const cli = await consultarClienteOmie(creds, codigo)
    const name = cli.nome_fantasia?.trim() || cli.razao_social?.trim() || null
    cache.set(codigo, name)
    return name
  } catch {
    cache.set(codigo, null)
    return null
  }
}

export function normalizeOmieTitulo(
  titulo: OmieTituloEncontrado,
  categoryMap: Map<string, string>,
  supplierName: string | null,
  cnpjKind: OmieCnpjKind,
): OmieNormalizedExpense | null {
  const cab = titulo.cabecTitulo
  if (!cab?.nCodTitulo) return null

  const status = (cab.cStatus ?? '').trim().toUpperCase()
  if (CANCELLED_STATUSES.has(status)) {
    return {
      externalId: String(cab.nCodTitulo),
      amount: 0,
      expenseDate: '',
      description: '',
      notes: '',
      categoryName: '',
      categoryCode: cab.cCodCateg ?? null,
      status,
      supplierName: null,
      cnpjKind,
    }
  }

  const amount = Number(cab.nValorTitulo)
  if (!(amount > 0)) return null

  const expenseDate = omieBrToIso(cab.dDtVenc)
  if (!expenseDate) return null

  const categoryCode = cab.cCodCateg?.trim() || null
  const categoryName =
    (categoryCode && categoryMap.get(categoryCode)) ||
    (categoryCode ? `Omie ${categoryCode}` : 'Outros')

  const doc = cab.cNumDocumento?.trim() || cab.cNumDocFiscal?.trim() || null
  const parcela = cab.cNumParcela?.trim() || null
  const kindLabel = OMIE_CNPJ_LABEL[cnpjKind]

  const parts = [kindLabel, categoryName]
  if (supplierName) parts.push(supplierName)
  else if (cab.cCPFCNPJCliente?.trim()) parts.push(cab.cCPFCNPJCliente.trim())
  if (doc) parts.push(`doc ${doc}`)
  if (parcela && parcela !== '001/001') parts.push(`parcela ${parcela}`)

  const notesParts = [
    `Omie ${cnpjKind} #${cab.nCodTitulo}`,
    `status ${status}`,
    cab.dDtEmissao ? `emissão ${cab.dDtEmissao}` : null,
    cab.cCPFCNPJCliente ? `CNPJ/CPF ${cab.cCPFCNPJCliente}` : null,
  ].filter(Boolean)

  return {
    externalId: String(cab.nCodTitulo),
    amount: Math.round(amount * 100) / 100,
    expenseDate,
    description: parts.join(' · ').slice(0, 500),
    notes: notesParts.join(' · '),
    categoryName,
    categoryCode,
    status,
    supplierName,
    cnpjKind,
  }
}

function mockTitulosForMonth(month: string, kind: OmieCnpjKind): OmieTituloEncontrado[] {
  const { from } = omieFullMonthRange(month)
  const day = `${from.slice(0, 8)}10`
  const br = omieIsoToBr(day)
  const baseId = kind === 'servicos' ? 900001 : 910001
  return [
    {
      cabecTitulo: {
        nCodTitulo: baseId,
        cStatus: 'PAGO',
        nValorTitulo: kind === 'servicos' ? 1500 : 320,
        dDtVenc: br,
        dDtEmissao: br,
        cCodCateg: kind === 'servicos' ? '2.04.04' : '2.01.98',
        nCodCliente: 1,
        cNumParcela: '001/001',
      },
    },
    {
      cabecTitulo: {
        nCodTitulo: baseId + 1,
        cStatus: 'CANCELADO',
        nValorTitulo: 99,
        dDtVenc: br,
        cCodCateg: '2.04.99',
      },
    },
  ]
}

async function syncKindForMonth(
  month: string,
  range: { from: string; to: string },
  creds: OmieCredentials | null,
  mock: boolean,
): Promise<OmieSyncKindResult> {
  const kind = creds?.kind ?? 'servicos'
  const base: OmieSyncKindResult = {
    kind,
    label: OMIE_CNPJ_LABEL[kind],
    fetched: 0,
    upserted: 0,
    created: 0,
    updated: 0,
    skipped_cancelled: 0,
    removed: 0,
    pages: 0,
  }

  if (!mock && !creds) {
    return { ...base, error: `Credenciais Omie ${kind} não configuradas` }
  }

  try {
    const categoryMap =
      mock || !creds
        ? new Map([
            ['2.04.04', 'Energia Elétrica'],
            ['2.01.98', 'Insumos - Consumo Interno'],
            ['2.04.99', 'Sistemas'],
          ])
        : await loadCategoryMap(creds)

    const supplierCache = new Map<number, string | null>()
    const keepIds = new Set<string>()
    let page = 1
    let totalPages = 1

    while (page <= totalPages) {
      const res =
        mock || !creds
          ? {
              nPagina: 1,
              nTotPaginas: 1,
              nRegistros: 2,
              nTotRegistros: 2,
              titulosEncontrados: mockTitulosForMonth(month, kind),
            }
          : await pesquisarContasPagar(creds, {
              page,
              perPage: 100,
              fromBr: omieIsoToBr(range.from),
              toBr: omieIsoToBr(range.to),
            })

      totalPages = Math.max(1, res.nTotPaginas || 1)
      base.pages = page
      const titulos = res.titulosEncontrados ?? []
      base.fetched += titulos.length

      for (const titulo of titulos) {
        const supplier = creds
          ? await resolveSupplierName(creds, titulo.cabecTitulo?.nCodCliente, supplierCache)
          : null
        const normalized = normalizeOmieTitulo(titulo, categoryMap, supplier, kind)
        if (!normalized) continue

        keepIds.add(normalized.externalId)

        if (CANCELLED_STATUSES.has(normalized.status)) {
          base.skipped_cancelled += 1
          await deleteOmieExpenseByExternalId(kind, normalized.externalId)
          continue
        }

        const category = await createCategory(normalized.categoryName)
        const result = await upsertOmieExpense({
          externalId: normalized.externalId,
          cnpjKind: kind,
          categoryId: category.id,
          description: normalized.description,
          amount: normalized.amount,
          expenseDate: normalized.expenseDate,
          notes: normalized.notes,
          omieStatus: normalized.status,
          omieCategoryCode: normalized.categoryCode,
        })
        base.upserted += 1
        if (result.created) base.created += 1
        else base.updated += 1
      }

      page += 1
      if (mock || page > 200) break
    }

    base.removed = await pruneOmieExpensesMissingFromSync(kind, range.from, range.to, keepIds)
    return base
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function syncOmieExpensesForMonthUnlocked(month: string): Promise<OmieSyncResult> {
  const range = omieFullMonthRange(month)
  const mock = isOmieMock()
  const configuredList = listConfiguredOmieCredentials()
  const configured = configuredList.length > 0 || mock

  const empty: OmieSyncResult = {
    month,
    from: range.from,
    to: range.to,
    configured,
    mock: mock || undefined,
    fetched: 0,
    upserted: 0,
    created: 0,
    updated: 0,
    skipped_cancelled: 0,
    removed: 0,
    kinds: [],
  }

  if (!configured) {
    return {
      ...empty,
      error:
        'Configure OMIE_SERVICOS_APP_KEY/SECRET e OMIE_COMERCIO_APP_KEY/SECRET',
    }
  }

  await ensureOmieExpenseSchema()

  const targets: (OmieCredentials | null)[] = mock
    ? OMIE_CNPJ_KINDS.map((kind) => ({ kind, appKey: 'mock', appSecret: 'mock' }))
    : configuredList

  const kinds: OmieSyncKindResult[] = []
  for (const creds of targets) {
    kinds.push(await syncKindForMonth(month, range, creds, mock))
  }

  const sum = (fn: (k: OmieSyncKindResult) => number) =>
    kinds.reduce((acc, k) => acc + fn(k), 0)

  const errors = kinds.filter((k) => k.error).map((k) => `${k.kind}: ${k.error}`)

  return {
    month,
    from: range.from,
    to: range.to,
    configured: true,
    mock: mock || undefined,
    fetched: sum((k) => k.fetched),
    upserted: sum((k) => k.upserted),
    created: sum((k) => k.created),
    updated: sum((k) => k.updated),
    skipped_cancelled: sum((k) => k.skipped_cancelled),
    removed: sum((k) => k.removed),
    kinds,
    error: errors.length ? errors.join(' · ') : undefined,
  }
}

export async function syncOmieExpensesForMonth(month: string): Promise<OmieSyncResult> {
  return withSyncLock(
    SYNC_LOCK_KEYS.omie,
    () => syncOmieExpensesForMonthUnlocked(month),
    { ttlMs: 6 * 60 * 1000, owner: `omie-${month}` },
  )
}

async function syncOmieExpensesRecentUnlocked(): Promise<{
  runs: OmieSyncResult[]
  configured: boolean
}> {
  if (!isOmieConfigured() && !isOmieMock()) {
    return { runs: [], configured: false }
  }

  const today = todayIso()
  const current = today.slice(0, 7)
  const [y, m] = current.split('-').map(Number)
  const prevDate = new Date(Date.UTC(y!, m! - 2, 1))
  const previous = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`

  // Unlocked internals — um único lease cobre mês anterior + atual.
  const runs = [
    await syncOmieExpensesForMonthUnlocked(previous),
    await syncOmieExpensesForMonthUnlocked(current),
  ]
  return { runs, configured: true }
}

/** Cron: mês atual + mês anterior (títulos reabertos / alterados). */
export async function syncOmieExpensesRecent(): Promise<{
  runs: OmieSyncResult[]
  configured: boolean
}> {
  return withSyncLock(SYNC_LOCK_KEYS.omie, () => syncOmieExpensesRecentUnlocked(), {
    ttlMs: 6 * 60 * 1000,
    owner: 'omie-recent',
  })
}
