import 'server-only'

import { getBrand } from '@/lib/brand'
import { listEmployees } from '@/lib/employees'
import {
  conditionLabel,
  type BrandActivation,
  type CreateBrandActivationInput,
} from '@/lib/ativacoes/types'

export type AtivacaoNotifyKind = 'created' | 'cancelled'

function resendFrom(): string {
  return (
    process.env.RESEND_FROM?.trim() ||
    `${getBrand().displayName} <onboarding@resend.dev>`
  )
}

async function sendOne(input: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resendFrom(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  })

  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(json.message ?? `Resend HTTP ${res.status}`)
  }
}

/** Destinatários: Master, MKT e quem tem módulo Ativações (gestoras). */
export async function listAtivacoesNotifyEmails(): Promise<string[]> {
  try {
    const people = await listEmployees()
    const emails = people
      .filter((p) => p.status === 'active')
      .filter(
        (p) =>
          p.panel_role === 'admin' ||
          p.panel_role === 'mkt' ||
          p.modules.includes('ativacoes'),
      )
      .map((p) => p.email.trim().toLowerCase())
      .filter(Boolean)
    return Array.from(new Set(emails))
  } catch {
    return []
  }
}

function formatActivationLines(a: {
  day: string
  start_time: string
  end_time?: string
  brand: string
  condition: BrandActivation['condition']
  created_by_name?: string
  notes?: string | null
}): string[] {
  const window =
    a.end_time && a.end_time !== a.start_time
      ? `${a.start_time}–${a.end_time}`
      : a.start_time
  const lines = [
    `Data: ${a.day}`,
    `Horário: ${window}`,
    `Marca: ${a.brand}`,
    `Condição: ${conditionLabel(a.condition)}`,
  ]
  if (a.created_by_name) lines.push(`Por: ${a.created_by_name}`)
  if (a.notes?.trim()) lines.push(`Obs.: ${a.notes.trim()}`)
  return lines
}

function buildMessage(
  kind: AtivacaoNotifyKind,
  primary: {
    day: string
    start_time: string
    end_time?: string
    brand: string
    condition: BrandActivation['condition']
    created_by_name?: string
    notes?: string | null
  },
  actorName?: string,
): { subject: string; text: string; html: string } {
  const brand = getBrand()
  const unit = brand.displayName
  const lines = formatActivationLines(primary)

  let title: string
  switch (kind) {
    case 'created':
      title = `Nova ativação · ${primary.brand} · ${primary.day}`
      break
    case 'cancelled':
      title = `Ativação cancelada · ${primary.brand} · ${primary.day}`
      if (actorName) lines.push(`Cancelado por: ${actorName}`)
      break
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }

  const text = [`${unit}`, title, '', ...lines, '', 'Abra Ativações no painel da unidade.'].join('\n')
  const html = `<!doctype html><html><body style="font-family:sans-serif;line-height:1.5;color:#111">
  <p style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.08em">${unit}</p>
  <h1 style="font-size:18px;margin:8px 0 16px">${title}</h1>
  <pre style="white-space:pre-wrap;font-family:inherit;margin:0">${lines.join('\n')}</pre>
  <p style="margin-top:20px;font-size:13px;color:#555">Abra <strong>Ativações</strong> no painel da unidade.</p>
  </body></html>`

  return { subject: `[${unit}] ${title}`, text, html }
}

export async function notifyAtivacoesEvent(input: {
  kind: AtivacaoNotifyKind
  activation: BrandActivation | CreateBrandActivationInput
  actorName?: string
}): Promise<{ sent: number; skipped?: string }> {
  const to = await listAtivacoesNotifyEmails()
  if (to.length === 0) return { sent: 0, skipped: 'no_recipients' }
  if (!process.env.RESEND_API_KEY?.trim()) return { sent: 0, skipped: 'no_resend' }

  const primary = {
    day: input.activation.day,
    start_time: input.activation.start_time,
    end_time: input.activation.end_time,
    brand: input.activation.brand,
    condition: input.activation.condition,
    created_by_name:
      'created_by_name' in input.activation ? input.activation.created_by_name : input.actorName,
    notes: 'notes' in input.activation ? input.activation.notes ?? null : null,
  }
  const msg = buildMessage(input.kind, primary, input.actorName)

  let sent = 0
  await Promise.all(
    to.map(async (email) => {
      try {
        await sendOne({ to: email, ...msg })
        sent += 1
      } catch {
        // não falha a API por e-mail
      }
    }),
  )
  return { sent }
}
