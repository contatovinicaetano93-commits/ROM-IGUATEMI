import Anthropic from '@anthropic-ai/sdk'
import { unitPromptLabel } from '@/lib/salon/unit'

function fallbackReply() {
  return `Olá! Sou a recepcionista virtual do ${unitPromptLabel()}. Posso ajudar com agendamento, valores ou tirar dúvidas sobre nossos serviços. O que você precisa?`
}

let client: Anthropic | null = null

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada')
    client = new Anthropic({ apiKey })
  }
  return client
}

export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

export function getAiModel() {
  return process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
}

export async function askAI(systemPrompt: string, userMessage: string): Promise<string> {
  if (!isAiConfigured()) {
    return fallbackReply()
  }

  const res = await getClient().messages.create({
    model: getAiModel(),
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = res.content.find((c) => c.type === 'text')
  return block?.type === 'text' ? block.text.trim() : ''
}
