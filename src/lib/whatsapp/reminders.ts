import { getWhatsAppAdapter } from './adapter'
import { getBrand } from '@/lib/brand'
import { defaultProductionHost } from '@/lib/deployment'

function getFinanceReminderNumbers(): string[] {
  const numbers = [process.env.FINANCE_WHATSAPP_NUMBER, process.env.ADMIN_WHATSAPP_NUMBER].filter(
    (n): n is string => Boolean(n?.trim())
  )
  return Array.from(new Set(numbers))
}

export async function sendFinanceReminder() {
  const numbers = getFinanceReminderNumbers()
  if (numbers.length === 0) {
    return { sent: false, reason: 'nenhum_numero_configurado', sent_to: [], failed: 0 }
  }

  const brand = getBrand()
  const text = [
    `💰 Lembrete Financeiro — ${brand.displayName}`,
    '',
    'Já lançou as despesas da semana no painel?',
    `https://${defaultProductionHost()}/financeiro`,
  ].join('\n')

  const adapter = getWhatsAppAdapter()
  const results = await Promise.allSettled(numbers.map((n) => adapter.sendMessage(n, text)))
  const sentTo = numbers.filter((_, i) => results[i].status === 'fulfilled')
  return { sent: sentTo.length > 0, sent_to: sentTo, failed: numbers.length - sentTo.length }
}
