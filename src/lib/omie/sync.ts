/**
 * Sync Contas a Pagar Omie → finance_expenses (por data de vencimento).
 */

import { createCategory } from '@/lib/finance'
import {
  consultarClienteOmie,
  isOmieConfigured,
  isOmieMock,
  listarCategoriasOmie,
  pesquisarContasPagar,
} from '@/lib/omie/client'
import { omieBrToIso, omieFullMonthRange, omieIsoToBr } from '@/lib/omie/dates'
import {
  deleteOmieExpenseByExternalId,
  ensureOmieExpenseSchema,
  pruneOmieExpensesMissingFromSync,
  upsertOmieExpense,
} from '@/lib/omie/store'
import type { OmieNormalizedExpense, OmieTituloEncontrado } from '@/lib/omie/types'

const CANCELLED_STATUSES = new Set(['CANCELADO', 'CANCELADA'])

export interface OmieSyncResult {
  month: string
  from: string
  to: string
  fetched: number
  upserted: number
  created: number
  updated: number
  skipped_cancelled: number
  removed: number
  pages: number
  configured: boolean
  mock?: boolean
  error?: string
}

async function loadCategoryMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let page = 1
  let totalPages = 1
  while (page <= totalPages) {
    const res = await listarCategoriasOmie(page, 100)
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
  codigo: number | undefined,
  cache: Map<number, string | null>,
): Promise<string | null> {
  if (codigo == null || !(codigo > 0)) return null
  if (cache.has(codigo)) return cache.get(codigo) ?? null
  try {
    const cli = await consultarClienteOmie(codigo)
    const name =
      cli.nome_fantasia?.trim() ||
      cli.razao_social?.trim() ||
      null
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

  const doc =
    cab.cNumDocumento?.trim() ||
    cab.cNumDocFiscal?.trim() ||
    null
  const parcela = cab.cNumParcela?.trim() || null

  const parts = [categoryName]
  if (supplierName) parts.push(supplierName)
  if (doc) parts.push(`doc ${doc}`)
  if (parcela && parcela !== '001/001') parts.push(`parcela ${parcela}`)

  const notesParts = [
    `Omie #${cab.nCodTitulo}`,
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
  }
}

function mockTitulosForMonth(month: string): OmieTituloEncontrado[] {
  const { from } = omieFullMonthRange(month)
  const day = `${from.slice(0, 8)}10`
  const br = omieIsoToBr(day)
  return [
    {
      cabecTitulo: {
        nCodTitulo: 900001,
        cStatus: 'PAGO',
        nValorTitulo: 1500,
        dDtVenc: br,
        dDtEmissao: br,
        cCodCateg: '2.04.04',
        nCodCliente: 1,
        cNumParcela: '001/001',
      },
    },
    {
      cabecTitulo: {
        nCodTitulo: 900002,
        cStatus: 'CANCELADO',
        nValorTitulo: 99,
        dDtVenc: br,
        cCodCateg: '2.04.99',
      },
    },
  ]
}

export async function syncOmieExpensesForMonth(month: string): Promise<OmieSyncResult> {
  const range = omieFullMonthRange(month)
  const base: OmieSyncResult = {
    month,
    from: range.from,
    to: range.to,
    fetched: 0,
    upserted: 0,
    created: 0,
    updated: 0,
    skipped_cancelled: 0,
    removed: 0,
    pages: 0,
    configured: isOmieConfigured() || isOmieMock(),
  }

  if (!base.configured) {
    return { ...base, error: 'OMIE_APP_KEY / OMIE_APP_SECRET não configurados' }
  }

  await ensureOmieExpenseSchema()

  const categoryMap = isOmieMock()
    ? new Map([['2.04.04', 'Energia Elétrica'], ['2.04.99', 'Sistemas']])
    : await loadCategoryMap()

  const supplierCache = new Map<number, string | null>()
  const keepIds = new Set<string>()
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const res = isOmieMock()
      ? {
          nPagina: 1,
          nTotPaginas: 1,
          nRegistros: 2,
          nTotRegistros: 2,
          titulosEncontrados: mockTitulosForMonth(month),
        }
      : await pesquisarContasPagar({
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
      const supplier = await resolveSupplierName(titulo.cabecTitulo?.nCodCliente, supplierCache)
      const normalized = normalizeOmieTitulo(titulo, categoryMap, supplier)
      if (!normalized) continue

      keepIds.add(normalized.externalId)

      if (CANCELLED_STATUSES.has(normalized.status)) {
        base.skipped_cancelled += 1
        await deleteOmieExpenseByExternalId(normalized.externalId)
        continue
      }

      const category = await createCategory(normalized.categoryName)
      const result = await upsertOmieExpense({
        externalId: normalized.externalId,
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
    if (isOmieMock() || page > 200) break
  }

  base.removed = await pruneOmieExpensesMissingFromSync(range.from, range.to, keepIds)
  return base
}

/** Cron: mês atual + mês anterior (títulos reabertos / alterados). */
export async function syncOmieExpensesRecent(): Promise<{
  runs: OmieSyncResult[]
  configured: boolean
}> {
  if (!isOmieConfigured() && !isOmieMock()) {
    return { runs: [], configured: false }
  }

  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1
  const current = `${y}-${String(m).padStart(2, '0')}`
  const prevDate = new Date(Date.UTC(y, m - 2, 1))
  const previous = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`

  const runs = [
    await syncOmieExpensesForMonth(previous),
    await syncOmieExpensesForMonth(current),
  ]
  return { runs, configured: true }
}
