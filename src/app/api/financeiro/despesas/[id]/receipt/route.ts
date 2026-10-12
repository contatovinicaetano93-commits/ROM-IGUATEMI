import { NextRequest } from 'next/server'
import { err } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { blobProxyResponse } from '@/lib/blob/private'
import { getExpenseById } from '@/lib/finance'
import {
  isAllowedFinanceReceiptUrl,
  isVercelBlobHostForLegacyReceipt,
} from '@/lib/finance/receipt-url'

type Ctx = { params: Promise<{ id: string }> }

/** Download autenticado do recibo (privado novo ou legado público no Blob). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireFinance(req)
  if (!auth.ok) return err(auth.message, auth.status)

  const { id } = await ctx.params
  if (!id) return err('Id inválido', 400)

  try {
    const expense = await getExpenseById(id)
    if (!expense?.receipt_url) return err('Recibo não encontrado', 404)
    const url = expense.receipt_url.trim()
    if (!isAllowedFinanceReceiptUrl(url) && !isVercelBlobHostForLegacyReceipt(url)) {
      return err('URL do recibo inválida', 400)
    }
    return blobProxyResponse(url)
  } catch (error) {
    console.error('[financeiro/receipt]', error instanceof Error ? error.message : error)
    return err(error instanceof Error ? error.message : 'Falha ao abrir recibo', 500)
  }
}
