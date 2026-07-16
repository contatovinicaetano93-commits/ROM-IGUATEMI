import { getSql } from '@/lib/db'

export interface Alert {
  id: string
  type: 'sync_failed' | 'sync_timeout' | 'health_degraded'
  severity: 'warning' | 'error' | 'critical'
  title: string
  message: string
  context: Record<string, any>
  created_at: string
  resolved_at: string | null
}

export class AlertManager {
  static async createAlert(
    type: Alert['type'],
    severity: Alert['severity'],
    title: string,
    message: string,
    context?: Record<string, any>,
  ): Promise<Alert> {
    const sql = getSql()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const alert = {
      id,
      type,
      severity,
      title,
      message,
      context: context || {},
      created_at: now,
      resolved_at: null,
    }

    // Persist only if table exists (graceful degradation)
    try {
      await sql`
        insert into alerts (id, type, severity, title, message, context, created_at)
        values (${id}, ${type}, ${severity}, ${title}, ${message}, ${JSON.stringify(context || {})}, ${now})
      `
    } catch {
      // Table may not exist in all environments — log locally instead
      console.warn(`[ALERT] ${type}: ${title}`)
    }

    return alert
  }

  static async resolveAlert(id: string): Promise<void> {
    const sql = getSql()
    const now = new Date().toISOString()

    try {
      await sql`update alerts set resolved_at = ${now} where id = ${id}`
    } catch {
      console.warn(`[ALERT] Could not resolve alert ${id}`)
    }
  }

  static async getUnresolvedAlerts(): Promise<Alert[]> {
    const sql = getSql()

    try {
      return (await sql`select * from alerts where resolved_at is null order by created_at desc`) as Alert[]
    } catch {
      return []
    }
  }

  static async sendAlert(
    alert: Alert,
    channels?: { telegram?: boolean; email?: boolean; webhook?: string },
  ): Promise<void> {
    const message = this.formatMessage(alert)

    if (channels?.telegram) {
      await this.sendTelegram(message, alert.severity)
    }

    if (channels?.email) {
      await this.sendEmail(message, alert)
    }

    if (channels?.webhook) {
      await this.sendWebhook(channels.webhook, alert)
    }
  }

  private static formatMessage(alert: Alert): string {
    const severity_badge = {
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
    }[alert.severity]

    return `${severity_badge} [${alert.type.toUpperCase()}] ${alert.title}\n\n${alert.message}`
  }

  private static async sendTelegram(message: string, severity: Alert['severity']): Promise<void> {
    const botToken = process.env.TELEGRAM_ALERTS_BOT_TOKEN
    const chatId = process.env.TELEGRAM_ALERTS_CHAT_ID

    if (!botToken || !chatId) {
      console.warn('[ALERT] Telegram not configured')
      return
    }

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      })
    } catch (e) {
      console.error('[ALERT] Failed to send Telegram:', e)
    }
  }

  private static async sendEmail(message: string, alert: Alert): Promise<void> {
    const emailTo = process.env.ALERT_EMAIL_TO

    if (!emailTo) {
      console.warn('[ALERT] Email not configured')
      return
    }

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'alerts@rom.dev',
          to: emailTo,
          subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
          html: `<p>${alert.message}</p><p><small>${alert.context ? JSON.stringify(alert.context) : ''}</small></p>`,
        }),
      })
    } catch (e) {
      console.error('[ALERT] Failed to send email:', e)
    }
  }

  private static async sendWebhook(webhook: string, alert: Alert): Promise<void> {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          timestamp: alert.created_at,
        }),
      })
    } catch (e) {
      console.error('[ALERT] Failed to send webhook:', e)
    }
  }
}
