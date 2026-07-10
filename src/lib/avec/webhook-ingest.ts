import { z } from 'zod'
import {
  upsertContact,
  updateContact,
  logEvent,
  setPreferredManicurist,
  setPreferredHairstylist,
} from '@/lib/contacts'
import {
  listServices,
  addService,
  scheduleService,
  markServiceDone,
  clearServiceSchedule,
} from '@/lib/services'
import {
  guessServiceCategory,
  isNailService,
  isHairService,
  parseOptionalMoney,
  parseAvecDateTime,
} from '@/lib/avec/normalize'

const EVENT_ALIASES: Record<string, string> = {
  'client.upsert': 'client.upsert',
  'client.created': 'client.upsert',
  'client.updated': 'client.upsert',
  cliente: 'client.upsert',
  'appointment.created': 'appointment.created',
  'appointment.updated': 'appointment.updated',
  'appointment.cancelled': 'appointment.cancelled',
  agendamento: 'appointment.created',
  'agendamento.criado': 'appointment.created',
  'agendamento.atualizado': 'appointment.updated',
  'agendamento.cancelado': 'appointment.cancelled',
  'service.completed': 'service.completed',
  'attendance.completed': 'service.completed',
  atendimento: 'service.completed',
  'atendimento.finalizado': 'service.completed',
  finalizado: 'service.completed',
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return undefined
}

function pickNested(obj: Record<string, unknown> | null, path: string[]): unknown {
  let cur: unknown = obj
  for (const key of path) {
    const r = asRecord(cur)
    if (!r) return undefined
    cur = r[key]
  }
  return cur
}

/**
 * Como pickStr(), mas preserva o tipo original (sem stringificar) — usado para
 * valores monetários, onde number puro (API/webhook JSON) e string BR
 * ("120,00") têm que ser tratados de forma diferente por parseOptionalMoney.
 */
function pickRaw(...vals: unknown[]): unknown {
  for (const v of vals) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') continue
    return v
  }
  return undefined
}

export type NormalizedAvecWebhook = {
  event: string
  client_id: string
  name?: string
  phone?: string
  email?: string
  service_name?: string
  scheduled_at?: string
  completed_at?: string
  professional_name?: string
  price?: number
  status?: 'novo' | 'em_atendimento' | 'agendado' | 'convertido' | 'perdido'
}

/** Normaliza payloads Avec / Zapier / Make / bridge manual para o formato ROM. */
export function normalizeAvecWebhookBody(raw: unknown): NormalizedAvecWebhook {
  const body = asRecord(raw) ?? {}
  const data = asRecord(body.data) ?? asRecord(body.payload) ?? body
  const cliente = asRecord(data.cliente) ?? asRecord(body.cliente) ?? data
  const agendamento = asRecord(data.agendamento) ?? asRecord(body.agendamento) ?? data

  const eventRaw = pickStr(body.event, body.tipo, body.type, body.acao, body.action) ?? 'client.upsert'
  const event = EVENT_ALIASES[eventRaw.toLowerCase()] ?? eventRaw

  const client_id = pickStr(
    data.client_id,
    data.cliente_id,
    data.id_cliente,
    data.codigo_cliente,
    body.client_id,
    body.cliente_id,
    pickNested(cliente, ['id']),
    pickNested(cliente, ['cliente_id']),
    pickNested(agendamento, ['cliente_id'])
  )

  if (!client_id) {
    throw new Error('Webhook Avec sem client_id / cliente_id')
  }

  const name = pickStr(
    data.name,
    data.nome,
    data.nome_cliente,
    data.cliente_nome,
    pickNested(cliente, ['nome']),
    pickNested(cliente, ['name'])
  )
  const phone = pickStr(
    data.phone,
    data.celular,
    data.telefone,
    data.mobile,
    pickNested(cliente, ['celular']),
    pickNested(cliente, ['telefone'])
  )
  const emailRaw = pickStr(data.email, pickNested(cliente, ['email']))
  const email = emailRaw && z.string().email().safeParse(emailRaw).success ? emailRaw : undefined

  const service_name = pickStr(
    data.service_name,
    data.servico,
    data.serviço,
    data.procedimento,
    pickNested(agendamento, ['servico']),
    pickNested(agendamento, ['serviço'])
  )
  const professional_name = pickStr(
    data.professional_name,
    data.profissional,
    data.profissional_nome,
    pickNested(agendamento, ['profissional'])
  )

  const scheduledRaw = pickStr(
    data.scheduled_at,
    data.data_hora,
    data.datetime,
    pickNested(agendamento, ['data_hora']),
    pickNested(agendamento, ['scheduled_at'])
  )
  const datePart = pickStr(data.data, pickNested(agendamento, ['data']))
  const timePart = pickStr(data.hora, pickNested(agendamento, ['hora']))
  const scheduled_at =
    (scheduledRaw && !Number.isNaN(new Date(scheduledRaw).getTime())
      ? new Date(scheduledRaw).toISOString()
      : null) ?? parseAvecDateTime(datePart ?? null, timePart ?? null) ?? undefined

  const completedRaw = pickStr(data.completed_at, data.attended_at, data.finalizado_em)
  const completed_at =
    completedRaw && !Number.isNaN(new Date(completedRaw).getTime())
      ? new Date(completedRaw).toISOString()
      : undefined

  const priceRaw = pickRaw(
    data.price,
    data.valor,
    data.preco,
    data.preço,
    pickNested(agendamento, ['valor']),
    pickNested(agendamento, ['preco']),
    pickNested(agendamento, ['preço']),
    pickNested(agendamento, ['price']),
  )
  const priceNum = parseOptionalMoney(priceRaw)

  const statusRaw = pickStr(data.status, body.status)?.toLowerCase()
  const statusMap: Record<string, NormalizedAvecWebhook['status']> = {
    novo: 'novo',
    em_atendimento: 'em_atendimento',
    agendado: 'agendado',
    convertido: 'convertido',
    perdido: 'perdido',
    finalizado: 'convertido',
    atendido: 'convertido',
    cancelado: 'perdido',
  }
  const status = statusRaw ? statusMap[statusRaw] : undefined

  return {
    event,
    client_id,
    name,
    phone,
    email,
    service_name,
    scheduled_at,
    completed_at,
    professional_name,
    price: priceNum && priceNum > 0 ? priceNum : undefined,
    status,
  }
}

async function applyPreferredPro(contactId: string, serviceName: string | undefined, pro: string | undefined) {
  if (!pro || !serviceName) return
  if (isNailService(serviceName)) await setPreferredManicurist(contactId, pro)
  else if (isHairService(serviceName)) await setPreferredHairstylist(contactId, pro)
}

export async function ingestAvecWebhook(rawBody: unknown) {
  const payload = normalizeAvecWebhookBody(rawBody)
  const event = payload.event

  const contact = await upsertContact({
    phone: payload.phone,
    name: payload.name,
    email: payload.email,
    channel: 'avec',
    source: 'avec_webhook',
    avecClientId: payload.client_id,
    status: payload.status,
  })

  if (payload.status) {
    await updateContact(contact.id, { status: payload.status })
  }

  if (event === 'appointment.created' || event === 'appointment.updated') {
    if (payload.service_name && payload.scheduled_at) {
      const services = await listServices(contact.id)
      let service = services.find((s) => s.name.toLowerCase() === payload.service_name!.toLowerCase())
      if (!service) {
        service = await addService(contact.id, {
          name: payload.service_name,
          category: guessServiceCategory(payload.service_name),
        })
      }
      await scheduleService(service.id, payload.scheduled_at, payload.professional_name)
      await applyPreferredPro(contact.id, payload.service_name, payload.professional_name)
      await updateContact(contact.id, { status: 'agendado' })
    }
  }

  if (event === 'appointment.cancelled' && payload.service_name) {
    const services = await listServices(contact.id)
    const service = services.find((s) => s.name.toLowerCase() === payload.service_name!.toLowerCase())
    if (service?.scheduled_at) await clearServiceSchedule(service.id)
  }

  if (event === 'service.completed' && payload.service_name) {
    const services = await listServices(contact.id)
    let service = services.find((s) => s.name.toLowerCase() === payload.service_name!.toLowerCase())
    if (!service) {
      service = await addService(contact.id, {
        name: payload.service_name,
        category: guessServiceCategory(payload.service_name),
      })
    }
    await markServiceDone(service.id, {
      doneAt: payload.completed_at,
      professionalName: payload.professional_name,
      lastPrice: payload.price,
    })
    await applyPreferredPro(contact.id, payload.service_name, payload.professional_name)
    await updateContact(contact.id, { status: 'convertido' })
  }

  await logEvent({
    contactId: contact.id,
    channel: 'avec',
    direction: 'in',
    handledBy: 'system',
    payload: { event, normalized: payload, raw: rawBody },
  })

  return { contact_id: contact.id, event, realtime: true as const }
}
