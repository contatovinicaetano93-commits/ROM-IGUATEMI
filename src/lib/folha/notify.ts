/**
 * E-mail de liberação da Folha (Resend) — ops financeiro / RH.
 * Destinatários: FOLHA_NOTIFY_EMAIL (vírgula). Sem env → skip.
 */

import { getBrand } from '@/lib/brand'
import type { FolhaDraft } from '@/lib/folha/draft-from-8123'
import type { FolhaPeriodStatus } from '@/lib/folha/types'

export function getFolhaNotifyRecipients(): string[] {
  const raw = process.env.FOLHA_NOTIFY_EMAIL?.trim() || ''
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean)
}

export function isFolhaNotifyConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && getFolhaNotifyRecipients().length)
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function resendFrom(): string {
  return (
    process.env.RESEND_FROM?.trim() ||
    process.env.FOLHA_NOTIFY_FROM?.trim() ||
    `${getBrand().displayName} <onboarding@resend.dev>`
  )
}

export type FolhaNotifyResult =
  | { ok: true; to: string[]; subject: string; skipped?: undefined }
  | { ok: false; skipped: 'not_configured' | 'send_failed'; error?: string; to: string[] }

export type FolhaNotifyClientPayload = {
  ok?: boolean
  skipped?: string
  to?: string[]
  error?: string
} | null

export function formatFolhaNotifyError(error?: string | null): string {
  const raw = error?.trim()
  if (!raw) return 'erro de envio'
  if (/domain is not verified/i.test(raw)) {
    return 'domínio de envio não verificado no Resend'
  }
  return raw
}

export function folhaApprovedNotifyMessage(notify: FolhaNotifyClientPayload): {
  text: string
  tone: 'ok' | 'warn'
} {
  if (notify?.ok) {
    const to = (notify.to ?? []).join(', ')
    return {
      text: to ? `Aprovado · aviso enviado a ${to}` : 'Aprovado · aviso enviado',
      tone: 'ok',
    }
  }
  if (notify?.skipped === 'not_configured') {
    return {
      text: 'Aprovado. O pagamento ficou gravado; o aviso por e-mail não está configurado.',
      tone: 'warn',
    }
  }
  return {
    text: `Aprovado. O pagamento ficou gravado; o aviso por e-mail não saiu (${formatFolhaNotifyError(notify?.error)}).`,
    tone: 'warn',
  }
}

export function folhaResendNotifyMessage(notify: FolhaNotifyClientPayload): {
  text: string
  tone: 'ok' | 'warn'
} {
  if (notify?.ok) {
    const to = (notify.to ?? []).join(', ')
    return {
      text: to ? `Aviso reenviado a ${to}` : 'Aviso reenviado',
      tone: 'ok',
    }
  }
  if (notify?.skipped === 'not_configured') {
    return {
      text: 'Aviso por e-mail não está configurado (FOLHA_NOTIFY_EMAIL / RESEND_API_KEY).',
      tone: 'warn',
    }
  }
  return {
    text: `Aviso não saiu (${formatFolhaNotifyError(notify?.error)}). O pagamento continua aprovado.`,
    tone: 'warn',
  }
}

export function buildFolhaNotifyHtml(args: {
  draft: FolhaDraft
  status: FolhaPeriodStatus
  actor?: string | null
}): { subject: string; html: string } {
  const brand = getBrand().displayName
  const subject = `[Folha] ${args.draft.quinzena.label} · ${args.status} · ${brand}`
  const rows = args.draft.lines
    .slice()
    .sort((a, b) => (b.proposed_pay ?? 0) - (a.proposed_pay ?? 0))
    .slice(0, 40)
    .map(
      (l) =>
        `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${l.name}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${l.cargo_raw ?? '—'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${formatMoney(l.avec.net_payable)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${formatMoney(l.folha_extras.darf)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${formatMoney(l.folha_extras.das)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right"><b>${formatMoney(l.proposed_pay)}</b></td>
        </tr>`,
    )
    .join('')

  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#1a1a1a;line-height:1.45">
  <h1 style="font-size:20px;margin:0 0 8px">${brand} · Folha de pagamento</h1>
  <p style="margin:0 0 4px"><b>${args.draft.quinzena.label}</b> · status <b>${args.status}</b></p>
  <p style="margin:0 0 4px">Ref. 8123: ${args.draft.reference_day}</p>
  <p style="margin:0 0 16px">${args.draft.line_count} profissionais · total proposto <b>${formatMoney(args.draft.total_proposed_pay)}</b>${args.actor ? ` · por ${args.actor}` : ''}</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px">
    <thead><tr style="text-align:left;color:#666">
      <th style="padding:6px 10px">Profissional</th>
      <th style="padding:6px 10px">Cargo</th>
      <th style="padding:6px 10px;text-align:right">a_pagar</th>
      <th style="padding:6px 10px;text-align:right">DARF</th>
      <th style="padding:6px 10px;text-align:right">DAS</th>
      <th style="padding:6px 10px;text-align:right">Proposto</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:20px;font-size:12px;color:#666">Conferir e liberar o pagamento no painel · /folha</p>
  </body></html>`

  return { subject, html }
}

export async function sendFolhaNotifyEmail(args: {
  draft: FolhaDraft
  status: FolhaPeriodStatus
  actor?: string | null
}): Promise<FolhaNotifyResult> {
  const to = getFolhaNotifyRecipients()
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey || to.length === 0) {
    return { ok: false, skipped: 'not_configured', to }
  }

  const { subject, html } = buildFolhaNotifyHtml(args)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFrom(),
        to,
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message?: string }
      return {
        ok: false,
        skipped: 'send_failed',
        error: json.message ?? `Resend HTTP ${res.status}`,
        to,
      }
    }
    return { ok: true, to, subject }
  } catch (e) {
    return {
      ok: false,
      skipped: 'send_failed',
      error: e instanceof Error ? e.message : String(e),
      to,
    }
  }
}
