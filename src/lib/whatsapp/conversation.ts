import { askAI } from '@/lib/ai/client'
import type { ContactRow } from '@/lib/contacts'
import { listEvents, logEvent, updateContact, upsertContact } from '@/lib/contacts'
import { listServices } from '@/lib/services'
import { enrichServices } from '@/lib/recommendations'
import { getContactRecommendations } from '@/lib/salon/recommendations'
import { buildContactContext, contactContextForAI } from '@/lib/salon/context-builder'
import { formatCatalogForPrompt } from '@/lib/whatsapp/catalog'
import { detectIntent } from '@/lib/whatsapp/intents'
import { notifyStaffHandoff } from '@/lib/whatsapp/staff-alert'
import { unitPromptLabel } from '@/lib/salon/unit'

const HANDOFF_REPLY =
  'Perfeito! Já avisei nossa equipe e em breve uma atendente continua com você aqui no WhatsApp. 🙏'

const AWAITING_HUMAN_REPLY =
  'Nossa equipe já foi avisada e em breve te atende por aqui. Se for urgente, pode mandar mais uma mensagem. 💬'

function buildSystemPrompt(intent: ReturnType<typeof detectIntent>, isReturning: boolean) {
  const base = `Você é a recepcionista virtual do ${unitPromptLabel()} (salão de beleza).
Seja calorosa, direta e breve (máx. 3 frases por resposta).
${formatCatalogForPrompt()}
Nunca invente preços. Para valores, diga que varia conforme o serviço e ofereça ajuda para agendar ou falar com atendente.
Se não souber responder com segurança, ofereça passar para uma atendente humana.`

  const intentHints: Record<typeof intent, string> = {
    saudacao: 'Cliente cumprimentou. Dê boas-vindas e pergunte como pode ajudar (agendar, dúvida sobre serviço, etc.).',
    agendar:
      'Cliente quer agendar. Pergunte qual serviço e preferência de dia/horário. Diga que a equipe confirma a disponibilidade.',
    remarcar:
      'Cliente quer remarcar. Peça o serviço e a nova preferência de horário. Diga que a equipe confirma.',
    preco:
      'Cliente perguntou preço. Explique que valores dependem do serviço e ofereça agendar avaliação ou falar com atendente.',
    humano: 'Cliente pediu humano. Confirme que a equipe vai assumir em instantes.',
    duvida: 'Responda a dúvida com base no catálogo. Se fugir do escopo do salão, ofereça atendente humana.',
  }

  const returning = isReturning
    ? 'Este cliente já tem histórico no salão — use o nome dele se souber e seja mais personalizada.'
    : 'Primeiro contato deste número — seja acolhedora e descubra o que a pessoa precisa.'

  return `${base}\n\n${intentHints[intent]}\n${returning}`
}

async function isAwaitingHuman(contactId: string): Promise<boolean> {
  const events = await listEvents(contactId, 30)
  for (const e of events) {
    if (e.payload?.handoff_resolved === true) return false
    if (e.payload?.needs_human === true) return true
  }
  return false
}

function formatHistory(events: Awaited<ReturnType<typeof listEvents>>) {
  return events
    .filter((e) => typeof e.payload?.text === 'string')
    .slice(0, 12)
    .reverse()
    .map((e) => {
      const who = e.direction === 'in' ? 'Cliente' : e.handled_by === 'human' ? 'Atendente' : 'ROM'
      return `${who}: ${String(e.payload.text)}`
    })
    .join('\n')
}

async function buildClientContext(contact: ContactRow) {
  const services = enrichServices(await listServices(contact.id))
  const { recommendations } = await getContactRecommendations(contact.id)
  return JSON.parse(contactContextForAI(buildContactContext(contact, services, recommendations)))
}

async function triggerHandoff(contact: ContactRow, reason: string, lastMessage: string) {
  await updateContact(contact.id, { status: 'em_atendimento' })
  await logEvent({
    contactId: contact.id,
    channel: 'whatsapp',
    direction: 'in',
    handledBy: 'system',
    payload: { needs_human: true, reason, last_client_message: lastMessage },
  })
  await notifyStaffHandoff(contact, reason, lastMessage)
  return HANDOFF_REPLY
}

export interface WhatsAppConversationResult {
  contactId: string
  reply: string
  intent: ReturnType<typeof detectIntent>
  handoff: boolean
}

export async function handleWhatsAppMessage(from: string, text: string): Promise<WhatsAppConversationResult> {
  const contact = await upsertContact({
    phone: from,
    channel: 'whatsapp',
    source: 'whatsapp_bot',
  })

  await logEvent({
    contactId: contact.id,
    channel: 'whatsapp',
    direction: 'in',
    handledBy: 'ai',
    payload: { text },
  })

  if (await isAwaitingHuman(contact.id)) {
    return {
      contactId: contact.id,
      reply: AWAITING_HUMAN_REPLY,
      intent: 'humano',
      handoff: true,
    }
  }

  const intent = detectIntent(text)
  const isReturning = contact.status !== 'novo' || Boolean(contact.name)

  if (intent === 'humano') {
    const reply = await triggerHandoff(contact, 'Cliente pediu atendente', text)
    return { contactId: contact.id, reply, intent, handoff: true }
  }

  const [historyEvents, clientCtx] = await Promise.all([
    listEvents(contact.id, 12),
    buildClientContext(contact),
  ])

  const history = formatHistory(historyEvents)
  const systemPrompt = buildSystemPrompt(intent, isReturning)

  const userMessage = [
    `Mensagem atual: ${text}`,
    `Intenção detectada: ${intent}`,
    `Dados do cliente: ${JSON.stringify(clientCtx)}`,
    history ? `Histórico recente:\n${history}` : 'Histórico: primeiro contato.',
  ].join('\n\n')

  let reply: string
  try {
    reply = (await askAI(systemPrompt, userMessage)) || ''
  } catch {
    reply = ''
  }

  if (!reply.trim()) {
    reply =
      intent === 'agendar' || intent === 'remarcar'
        ? 'Claro! Qual serviço você gostaria e qual dia/horário prefere? Nossa equipe confirma a disponibilidade. 😊'
        : `Oi! Sou a recepcionista virtual do ${unitPromptLabel()}. Posso ajudar com agendamento ou dúvidas sobre nossos serviços. Como posso te ajudar?`
  }

  const inboundCount = historyEvents.filter((e) => e.direction === 'in').length
  if (inboundCount >= 4 && (intent === 'agendar' || intent === 'remarcar' || intent === 'duvida')) {
    const handoffReply = await triggerHandoff(contact, 'Conversa longa sem resolução', text)
    return { contactId: contact.id, reply: handoffReply, intent, handoff: true }
  }

  if (contact.status === 'novo') {
    await updateContact(contact.id, { status: 'em_atendimento' })
  }

  return { contactId: contact.id, reply: reply.trim(), intent, handoff: false }
}
