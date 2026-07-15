export async function sendTelegramMessage(chatId: number | string, text: string, botToken?: string) {
  const token = botToken ?? process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN não configurado')

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })

  if (!res.ok) {
    throw new Error(`Telegram API respondeu ${res.status}: ${await res.text()}`)
  }
}

/** Bot dedicado do financeiro — token e webhook próprios, separados do bot da equipe. */
export async function sendTelegramFinanceMessage(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_FINANCE_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_FINANCE_BOT_TOKEN não configurado')

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })

  if (!res.ok) {
    throw new Error(`Telegram API respondeu ${res.status}: ${await res.text()}`)
  }
}

/** Envia arquivo texto/CSV como documento. */
export async function sendTelegramDocument(
  chatId: number | string,
  filename: string,
  content: string,
  caption?: string
) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN não configurado')

  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append('document', new Blob([content], { type: 'text/csv;charset=utf-8' }), filename)
  if (caption) form.append('caption', caption.slice(0, 1024))

  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    throw new Error(`Telegram sendDocument ${res.status}: ${await res.text()}`)
  }
}
