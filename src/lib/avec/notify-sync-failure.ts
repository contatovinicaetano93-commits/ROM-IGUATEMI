import { getSql } from '@/lib/db'
import { getBrand } from '@/lib/brand'
import { sendTelegramMessage } from '@/lib/telegram/bot'

/**
 * Avisa no Telegram quando o sync passa a falhar (ok/partial → error).
 * Requer TELEGRAM_BOT_TOKEN (ou TELEGRAM_ALERTS_BOT_TOKEN) + chat id.
 * Sem spam: só notifica na transição para erro.
 */
export async function maybeNotifySyncFailure(opts: {
  runId: string
  status: 'ok' | 'partial' | 'error'
  mode: string
  error?: string | null
}): Promise<void> {
  if (opts.status !== 'error') return

  const chatId =
    process.env.TELEGRAM_ALERTS_CHAT_ID?.trim() ||
    process.env.TELEGRAM_STAFF_CHAT_IDS?.split(/[,\s]+/).map((s) => s.trim()).find(Boolean)
  const botToken =
    process.env.TELEGRAM_ALERTS_BOT_TOKEN?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim()

  if (!chatId || !botToken) return

  try {
    const sql = getSql()
    const prev = (await sql`
      select status
      from avec_sync_runs
      where id <> ${opts.runId}::uuid
        and kind in ('fast', 'full')
      order by created_at desc
      limit 1
    `) as { status: string }[]

    // Já estava em erro — não reenvia a cada minuto.
    if (prev[0]?.status === 'error') return

    const brand = getBrand()
    const detail = (opts.error || 'erro desconhecido').slice(0, 240)
    const text = [
      `❌ Sync Avec falhou — ${brand.displayName}`,
      `Modo: ${opts.mode}`,
      detail,
      '',
      'Abra Admin / Hoje e rode sync full se o token expirou.',
    ].join('\n')

    await sendTelegramMessage(chatId, text, botToken)
  } catch (e) {
    console.error(
      '[avec notify]',
      e instanceof Error ? e.message : e,
    )
  }
}
