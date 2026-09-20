import 'server-only'

import { AuditLogger } from '@/lib/audit'
import { getBrand } from '@/lib/brand'
import { notifyIntranet } from '@/lib/cms'
import type { EmployeeRecord } from '@/lib/employees'
import { listEmployees } from '@/lib/employees'
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
  created: CreateUserAuditPerson,
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

function createUserNotifyBody(employee: Omit<EmployeeRecord, 'password_hash'>): string {
  return `${employee.name} (${employee.email}) · áreas: ${formatAreas(employee.areaIds)}`
}

function createUserEmailHtml(employee: Omit<EmployeeRecord, 'password_hash'>): string {
  const brand = getBrand().displayName
  const areas = formatAreas(employee.areaIds)
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim() || ''
  const auditoriaHref = host ? `https://${host.replace(/^https?:\/\//, '')}/auditoria` : '/auditoria'
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#111">
  <p>Um novo acesso foi criado na intranet ${brand}.</p>
  <p><strong>Nome:</strong> ${escapeHtml(employee.name)}<br/>
  <strong>E-mail:</strong> ${escapeHtml(employee.email)}<br/>
  <strong>Áreas:</strong> ${escapeHtml(areas)}</p>
  <p><a href="${auditoriaHref}">Ver auditoria</a></p>
  <p style="font-size:12px;color:#666">Esta mensagem não inclui senha. Não responda este e-mail.</p>
  </body></html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function sendCreateUserEmail(
  employee: Omit<EmployeeRecord, 'password_hash'>,
  recipients: readonly CreateUserAuditPerson[],
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return
  if (recipients.length === 0) return

  const from =
    process.env.RESEND_FROM?.trim() ||
    process.env.DIRECTOR_REPORT_FROM?.trim() ||
    `${getBrand().displayName} <onboarding@resend.dev>`
  const subject = `Novo acesso criado — ${employee.name}`
  const html = createUserEmailHtml(employee)

  for (const recipient of recipients) {
    const to = recipient.email.trim()
    if (!to) continue
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message?: string }
      throw new Error(json.message ?? `Resend HTTP ${res.status}`)
    }
  }
}

export async function announceEmployeeCreated(input: {
  actor: CreateUserAuditActor
  employee: Omit<EmployeeRecord, 'password_hash'>
}): Promise<void> {
  const { actor, employee } = input

  await AuditLogger.log(actor.email, actor.role, 'CREATE_USER', `flow:user:${employee.id}`, {
    name: employee.name,
    email: employee.email,
    panel_role: employee.panel_role,
    flow_role: employee.flow_role,
    areas: employee.areaIds,
    modules: employee.modules,
    companies: employee.companyIds,
  })

  const title = 'Novo acesso criado'
  const body = createUserNotifyBody(employee)
  const href = '/auditoria'
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
    const people = await listEmployees()
    const recipients = selectCreateUserAuditRecipients(employee, people)
    await sendCreateUserEmail(employee, recipients)
  } catch (error) {
    logger.error('Falha ao enviar e-mail de CREATE_USER', {
      employeeId: employee.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
