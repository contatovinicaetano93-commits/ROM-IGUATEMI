import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api-response'
import { sendTelegramFinanceMessage } from '@/lib/telegram/bot'
import { verifyTelegramFinanceWebhook, isTelegramFinanceChatAllowed } from '@/lib/webhooks'
import { computeFinanceKpis } from '@/lib/finance'
import { computeStockKpis, listAlerts } from '@/lib/stock'
import { formatCurrency } from '@/lib/salon/format'
import { getBrand } from '@/lib/brand'

interface TelegramUpdate {
  message?: {
    chat: { id: number }
    text?: string
  }
}

function welcomeMessage() {
  const brand = getBrand()
  return `Oi! 👋 Sou o bot financeiro do ${brand.displayName}.

Comandos:
/financeiro — receita, despesas, margem e formas de pagamento do mês
/estoque — valor em estoque, alertas de reposição ativos`
}

function staffOnlyMessage() {
  return 'Este bot é exclusivo do time financeiro/estoque. Peça ao admin para incluir seu chat ID em TELEGRAM_FINANCE_CHAT_IDS.'
}

async function financeSummary(): Promise<string> {
  const kpis = await computeFinanceKpis()
  const c = kpis.current
  const lines = [
    `💰 *Financeiro — ${c.label}*`,
    `Receita: ${formatCurrency(c.revenue)}`,
    `Despesas: ${formatCurrency(c.expenses)}`,
    `Margem bruta: ${c.gross_margin != null ? `${c.gross_margin}%` : '—'}`,
    `Fluxo: ${formatCurrency(c.cash_flow)}`,
  ]
  if (c.revenue === 0) {
    lines.push('', '_Receita ainda não sincronizada pela Avec esse mês._')
  }
  return lines.join('\n')
}

async function stockSummary(): Promise<string> {
  const [kpis, alerts] = await Promise.all([computeStockKpis(), listAlerts('ativo')])
  const lines = [
    `📦 *Estoque*`,
    `Produtos: ${kpis.total_products}`,
    `Valor em estoque: ${formatCurrency(kpis.total_value)}`,
    `Alertas ativos: ${kpis.active_alerts}`,
  ]
  if (kpis.last_synced_at) {
    lines.push(`Última sync: ${new Date(kpis.last_synced_at).toLocaleString('pt-BR')}`)
  } else {
    lines.push('_Ainda sem sincronização com a Avec._')
  }
  if (alerts.length > 0) {
    lines.push('', '*Reposição sugerida:*')
    for (const a of alerts.slice(0, 8)) {
      const suggestion = a.suggested_reposition != null ? ` (repor ${a.suggested_reposition})` : ''
      lines.push(`• ${a.product_name}: ${a.current_qty}/${a.minimum_qty}${suggestion}`)
    }
    if (alerts.length > 8) lines.push(`_+${alerts.length - 8} outros_`)
  }
  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  const verify = verifyTelegramFinanceWebhook(req)
  if (!verify.ok) return err(verify.reason, 401)

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null
  const chatId = update?.message?.chat?.id
  const text = update?.message?.text?.trim()
  if (!chatId || !text) return ok({ ignored: true })

  const allowed = isTelegramFinanceChatAllowed(chatId)
  if (!allowed.ok) {
    await sendTelegramFinanceMessage(chatId, staffOnlyMessage()).catch(() => {})
    return ok({ blocked: true })
  }

  try {
    if (text.startsWith('/start') || text.startsWith('/help')) {
      await sendTelegramFinanceMessage(chatId, welcomeMessage())
    } else if (text.startsWith('/financeiro')) {
      await sendTelegramFinanceMessage(chatId, await financeSummary())
    } else if (text.startsWith('/estoque')) {
      await sendTelegramFinanceMessage(chatId, await stockSummary())
    } else {
      await sendTelegramFinanceMessage(chatId, welcomeMessage())
    }
  } catch (e) {
    await sendTelegramFinanceMessage(chatId, `Erro: ${e instanceof Error ? e.message : String(e)}`).catch(() => {})
  }

  return ok({ received: true })
}
