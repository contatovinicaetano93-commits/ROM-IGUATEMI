import { NextRequest } from 'next/server'
import { ok } from '@/lib/api-response'
import { getSql } from '@/lib/db'
import { sendTelegramMessage } from '@/lib/telegram/bot'
import { askAI } from '@/lib/ai/client'
import { isStaffChat } from '@/lib/telegram/staff'
import type { ContactRow } from '@/lib/contacts'
import { listServices } from '@/lib/services'
import { enrichServices } from '@/lib/recommendations'
import { getContactRecommendations } from '@/lib/salon/recommendations'
import { resolveBriefCache } from '@/lib/salon/brief-cache'
import { generateBrief } from '@/lib/brief'
import { buildSalonContext, salonContextForAI } from '@/lib/salon/context-builder'
import { normalizeSearchText } from '@/lib/search'

const WELCOME_MESSAGE = `Oi! 👋 Sou a secretária virtual do ROM Club — unidade ROM Brasil.

Posso te ajudar com KPIs do salão: faturamento, comparecimento, meta do dia e playbook.

💡 Dica: use /cliente nome ou telefone para ver o briefing de um cliente.`

const STAFF_ONLY_MESSAGE =
  'Este bot é exclusivo da equipe ROM Club · ROM Brasil. Se você é da equipe, peça ao admin para incluir seu chat ID em TELEGRAM_STAFF_CHAT_IDS.'

const SECRETARIA_PROMPT = `Você é a secretária virtual do ROM Club — unidade ROM Brasil — para a equipe interna.
Responda perguntas práticas sobre a operação do salão (faturamento, comparecimento, meta do dia,
receita em risco, agendamentos) usando SOMENTE os dados fornecidos.
Sempre mencione que os dados são da unidade ROM Brasil quando relevante.
Seja direta, em português, no máximo 4 linhas. Se a pergunta não tiver relação
com os dados fornecidos, diga que só responde sobre a operação do salão por enquanto.
Dica: use "/cliente nome ou telefone" pra receber o briefing de um cliente.`

interface TelegramUpdate {
  message?: {
    chat: { id: number }
    text?: string
  }
}

async function handleClienteCommand(chatId: number, query: string) {
  const sql = getSql()
  const normalized = normalizeSearchText(query)
  const digits = normalized.replace(/\D/g, '')
  const rows = (await sql`
    select * from contacts
    where name ilike ${'%' + normalized + '%'}
       or (${digits} <> '' and regexp_replace(coalesce(phone,''), '\\D', '', 'g') like ${'%' + digits + '%'})
    order by last_contact_at desc
    limit 1
  `) as ContactRow[]

  const contact = rows[0]
  if (!contact) {
    await sendTelegramMessage(chatId, `Não encontrei cliente para "${query}".`)
    return
  }

  const services = enrichServices(await listServices(contact.id))
  const { recommendations } = await getContactRecommendations(contact.id)
  const { brief } = await resolveBriefCache(contact, services, recommendations, () =>
    generateBrief(contact, services, recommendations)
  )
  await sendTelegramMessage(chatId, `📋 ${contact.name ?? 'Cliente'}\n\n${brief}`)
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return ok({ ignored: true }, undefined, 200)
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null
  const chatId = update?.message?.chat.id
  const text = update?.message?.text?.trim()

  if (!chatId || !text) return ok({ ignored: true })

  if (!isStaffChat(chatId)) {
    await sendTelegramMessage(chatId, STAFF_ONLY_MESSAGE).catch(() => {})
    return ok({ replied: true, mode: 'staff_only' })
  }

  try {
    if (/^\/start\b/i.test(text)) {
      await sendTelegramMessage(chatId, WELCOME_MESSAGE)
      return ok({ replied: true, mode: 'start' })
    }

    const clienteMatch = text.match(/^\/cliente\s+(.+)/i)
    if (clienteMatch) {
      await handleClienteCommand(chatId, clienteMatch[1].trim())
      return ok({ replied: true, mode: 'cliente' })
    }

    const salonCtx = await buildSalonContext()
    const context = salonContextForAI(salonCtx)
    const reply = await askAI(SECRETARIA_PROMPT, `Pergunta: ${text}\n\nDados: ${context}`)

    await sendTelegramMessage(chatId, reply || 'Não consegui puxar essa informação agora.')
    return ok({ replied: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido'
    await sendTelegramMessage(chatId, 'Tive um problema pra consultar os dados agora, já registrei o erro.').catch(
      () => {}
    )
    return ok({ replied: false, error: message })
  }
}
