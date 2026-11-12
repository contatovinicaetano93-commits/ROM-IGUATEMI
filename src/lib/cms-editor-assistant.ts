import { askAI, isAiConfigured } from '@/lib/ai/client'
import { getBrand } from '@/lib/brand'
import { parseIntranetPostKind, type IntranetPostKind } from '@/lib/cms-kinds'

export type CmsAssistantMode = 'titulo' | 'lead' | 'materia' | 'seo'

export type CmsAssistantRequest = {
  mode: CmsAssistantMode
  kind: IntranetPostKind
  topic: string
  notes: string
}

export type CmsAssistantResponse = {
  mode: CmsAssistantMode
  kind: IntranetPostKind
  output: string
  tips: string[]
  source: 'ai' | 'rules'
}

const MODE_LABELS: Record<CmsAssistantMode, string> = {
  titulo: 'títulos',
  lead: 'lead',
  materia: 'matéria',
  seo: 'SEO interno',
}

const KIND_LABELS: Record<IntranetPostKind, string> = {
  news: 'notícia',
  event: 'evento',
  banner: 'banner',
  policy: 'política',
}

export function isCmsAssistantMode(value: unknown): value is CmsAssistantMode {
  return value === 'titulo' || value === 'lead' || value === 'materia' || value === 'seo'
}

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function firstSentence(notes: string): string {
  const cleaned = cleanText(notes)
  const match = cleaned.match(/[^.!?]+[.!?]?/)
  return match?.[0]?.trim() || cleaned
}

function tipList(kind: IntranetPostKind): string[] {
  const base = [
    'Cite profissional, marca ou unidade no primeiro parágrafo quando fizer sentido.',
    'Inclua uma imagem horizontal de boa qualidade antes de publicar.',
    'Revise nomes próprios e créditos antes de soltar no feed.',
  ]
  switch (kind) {
    case 'event':
      return [...base, 'Deixe data, horário e local explícitos no lead.']
    case 'banner':
      return [...base, 'O título do banner precisa caber em uma linha no carrossel.']
    case 'policy':
      return [...base, 'Política deve ter linguagem clara e um próximo passo (quem lê / o que muda).']
    case 'news':
      return [...base, 'Feche com um convite de compartilhamento no WhatsApp da equipe.']
    default: {
      const _never: never = kind
      return _never
    }
  }
}

export function buildRuleCmsAssistantResponse(
  request: CmsAssistantRequest,
): CmsAssistantResponse {
  const brand = getBrand()
  const topic = cleanText(request.topic)
  const notes = cleanText(request.notes)
  const kindLabel = KIND_LABELS[request.kind]
  const leadSeed = firstSentence(notes)
  const tips = tipList(request.kind)

  switch (request.mode) {
    case 'titulo':
      return {
        mode: request.mode,
        kind: request.kind,
        source: 'rules',
        tips,
        output: [
          `1. ${topic}: o que a equipe ${brand.shortMonogram} precisa saber agora`,
          `2. Bastidores de ${topic} · ${kindLabel}`,
          `3. ${topic} em destaque no ROM News`,
          `4. Do salão para o feed: ${topic}`,
          `5. ${kindLabel[0]!.toUpperCase()}${kindLabel.slice(1)} · ${topic}`,
        ].join('\n'),
      }
    case 'lead':
      return {
        mode: request.mode,
        kind: request.kind,
        source: 'rules',
        tips,
        output: `${leadSeed} No ROM News da ${brand.displayName}, a ${kindLabel} sobre ${topic.toLowerCase()} sai em tempo real — pronta para a equipe compartilhar no mesmo dia.`,
      }
    case 'materia':
      return {
        mode: request.mode,
        kind: request.kind,
        source: 'rules',
        tips,
        output: [
          leadSeed,
          '',
          `A pauta de ${kindLabel} gira em torno de ${topic}. Segundo as notas da redação, ${notes}`,
          '',
          `Para a comunicação da ${brand.displayName}, o valor está em transformar o que antes ficava preso em PDF/WhatsApp em uma narrativa visual, rápida e fácil de achar na intranet.`,
          '',
          'A recomendação editorial é publicar ainda quente, com crédito aos envolvidos e um convite claro para compartilhar com a equipe.',
        ].join('\n'),
      }
    case 'seo':
      return {
        mode: request.mode,
        kind: request.kind,
        source: 'rules',
        tips,
        output: [
          `Title interno: ${topic} | ROM News · ${brand.displayName}`,
          `Resumo (excerpt): ${leadSeed.slice(0, 140)}${leadSeed.length > 140 ? '…' : ''}`,
          `Tipo: ${kindLabel}`,
          `Palavras-chave: ROM News, ${brand.displayName}, ${topic}, ${kindLabel}`,
          'H1: usar o título editorial completo',
          'Imagem: alt descritivo com contexto (serviço, local, pessoa)',
          'Compartilhamento: link direto da matéria (/empresa/[id]) no WhatsApp interno',
        ].join('\n'),
      }
    default: {
      const _never: never = request.mode
      return _never
    }
  }
}

function assistantSystemPrompt(mode: CmsAssistantMode, kind: IntranetPostKind): string {
  const brand = getBrand()
  return `Você é a assistente de edição do ROM News (jornal digital interno da ${brand.displayName}).
Escreva em português do Brasil, tom editorial de salão de beleza de alto padrão, claro e compartilhável.
Tipo de publicação: ${KIND_LABELS[kind]}.
Tarefa: gerar ${MODE_LABELS[mode]}.
Regras: não invente fatos que não estejam nas notas; não use markdown com #; seja prático para publicação imediata na intranet.`
}

export async function generateCmsAssistantResponse(
  input: {
    mode: unknown
    kind: unknown
    topic: unknown
    notes: unknown
  },
): Promise<CmsAssistantResponse | { error: string }> {
  if (!isCmsAssistantMode(input.mode)) {
    return { error: 'Modo inválido. Use titulo, lead, materia ou seo.' }
  }
  const kind = parseIntranetPostKind(input.kind)
  if (input.kind !== kind) {
    return { error: 'Tipo inválido. Use news, event, banner ou policy.' }
  }
  const topic = typeof input.topic === 'string' ? cleanText(input.topic) : ''
  const notes = typeof input.notes === 'string' ? cleanText(input.notes) : ''
  if (!topic || !notes) {
    return { error: 'Assunto e notas são obrigatórios.' }
  }

  const request: CmsAssistantRequest = { mode: input.mode, kind, topic, notes }
  const fallback = buildRuleCmsAssistantResponse(request)

  if (!isAiConfigured()) return fallback

  try {
    const ai = await askAI(
      assistantSystemPrompt(request.mode, request.kind),
      `Assunto: ${request.topic}\nNotas do jornalista:\n${request.notes}`,
    )
    if (!ai.trim()) return fallback
    return {
      mode: request.mode,
      kind: request.kind,
      output: ai.trim(),
      tips: tipList(request.kind),
      source: 'ai',
    }
  } catch {
    return fallback
  }
}
