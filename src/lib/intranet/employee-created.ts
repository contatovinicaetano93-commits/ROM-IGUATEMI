import 'server-only'

import { AuditLogger } from '@/lib/audit'
import { getBrand } from '@/lib/brand'
import { notifyIntranet } from '@/lib/cms'
import { listEmployees, type EmployeeRecord } from '@/lib/employees'
import { AREA_LABEL } from '@/lib/flow/format'
import type { RequestArea } from '@/lib/flow/types'
import { flowAudienceKey } from '@/lib/intranet/notifications'
import { Logger } from '@/lib/logger'

const logger = new Logger('employee-created')

export type CreateUserAuditPerson = Pick<
  Omit<EmployeeRecord, 'password_hash'>,
  'id' | 'email' | 'name' | 'panel_role' | 'flow_role' | 'status' | 'areaIds'
>

export type CreateUserAuditActor = {
  email: string
  role: string
}

/** Destinatários de e-mail: ativos com área em comum, admin do painel ou master do Flow — sem o próprio cadastro. */
export function selectCreateUserAuditRecipients(
  created: Pick<CreateUserAuditPerson, 'id' | 'areaIds'>,
  people: readonly CreateUserAuditPerson[],
): CreateUserAuditPerson[] {
  const createdAreas = new Set(created.areaIds)
  return people.filter((person) => {
    if (person.id === created.id) return false
    if (person.status !== 'active') return false
    if (person.panel_role === 'admin') return true
    if (person.flow_role === 'master') return true
    return person.areaIds.some((area) => createdAreas.has(area))
  })
}

function formatAreas(areas: readonly RequestArea[]): string {
  if (areas.length === 0) return 'sem área'
  return areas.map((area) => AREA_LABEL[area]).join(', ')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function resendFrom(): string {
  return (
    process.env.RESEND_FROM?.trim() ||
    process.env.DIRECTOR_REPORT_FROM?.trim() ||
    `${getBrand().displayName} <onboarding@resend.dev>`
  )
}

function createUserNotifyBody(employee: Omit<EmployeeRecord, 'password_hash'>): string {
  return `${employee.name} (${employee.email}) · áreas: ${formatAreas(employee.areaIds)}`
}

function createUserEmailContent(input: {
  actor: CreateUserAuditActor
  employee: Omit<EmployeeRecord, 'password_hash'>
}): { subject: string; text: string; html: string } {
  const { actor, employee } = input
  const brand = getBrand().displayName
  const areas = formatAreas(employee.areaIds)
  const subject = `[Intranet] Novo acesso: ${employee.name}`
  const text = [
    `Foi criado um novo acesso na intranet ${brand}.`,
    ``,
    `Colaborador: ${employee.name}`,
    `E-mail: ${employee.email}`,
    `Perfil painel: ${employee.panel_role}`,
    `Perfil Flow: ${employee.flow_role}`,
    `Áreas: ${areas}`,
    `Criado por: ${actor.email} (${actor.role})`,
    ``,
    `Ver auditoria: /auditoria`,
    `Esta mensagem não inclui senha.`,
  ].join('\n')
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#1a1a1a;line-height:1.45">
  <h1 style="font-size:18px;margin:0 0 12px">Novo acesso criado</h1>
  <p style="margin:0 0 8px">Intranet <b>${escapeHtml(brand)}</b></p>
  <p style="margin:0 0 8px"><b>Colaborador:</b> ${escapeHtml(employee.name)}</p>
  <p style="margin:0 0 8px"><b>E-mail:</b> ${escapeHtml(employee.email)}</p>
  <p style="margin:0 0 8px"><b>Perfil painel:</b> ${escapeHtml(employee.panel_role)}</p>
  <p style="margin:0 0 8px"><b>Perfil Flow:</b> ${escapeHtml(employee.flow_role)}</p>
  <p style="margin:0 0 8px"><b>Áreas:</b> ${escapeHtml(areas)}</p>
  <p style="margin:0 0 16px"><b>Criado por:</b> ${escapeHtml(actor.email)} (${escapeHtml(actor.role)})</p>
  <p style="font-size:13px;color:#666">Abra /auditoria na intranet. Esta mensagem não inclui senha.</p>
</body></html>`
  return { subject, text, html }
}

async function sendCreateUserEmail(input: {
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

export async function announceEmployeeCreated(input: {
  actor: CreateUserAuditActor
  employee: Omit<EmployeeRecord, 'password_hash'>
}): Promise<void> {
  const { actor, employee } = input
  const title = 'Novo acesso criado'
  const body = createUserNotifyBody(employee)
  const href = '/auditoria'

  await AuditLogger.log(actor.email, actor.role, 'CREATE_USER', `flow:user:${employee.id}`, {
    name: employee.name,
    email: employee.email,
    panel_role: employee.panel_role,
    flow_role: employee.flow_role,
    areas: employee.areaIds,
    modules: employee.modules,
    companies: employee.companyIds,
  })

  for (const area of employee.areaIds) {
    await notifyIntranet({
      title,
      body,
      href,
      audience_key: flowAudienceKey(area),
    })
  }
  await notifyIntranet({
    title,
    body,
    href,
    audience_key: 'role:admin',
  })

  try {
    if (!process.env.RESEND_API_KEY?.trim()) return

    const people = await listEmployees()
    const recipients = selectCreateUserAuditRecipients(employee, people)
    const content = createUserEmailContent({ actor, employee })

    for (const recipient of recipients) {
      const email = recipient.email.trim()
      if (!email) continue
      try {
        await sendCreateUserEmail({ to: email, ...content })
      } catch (error) {
        logger.warn('Falha ao enviar e-mail de novo acesso', {
          to: email,
          employeeId: employee.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  } catch (error) {
    logger.warn('Falha no fan-out de e-mail de novo acesso', {
      employeeId: employee.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
