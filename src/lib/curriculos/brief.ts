import { askAI, isAiConfigured } from '@/lib/ai/client'
import { hintKeywordsFromText, normalizeKeywords } from '@/lib/curriculos/search'

function compactText(text: string, max = 3500): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Briefing por regras quando a IA não está disponível. */
export function buildRuleBriefing(input: {
  candidateName: string
  desiredRole?: string | null
  extractedText?: string | null
  keywords?: readonly string[]
}): string {
  const name = input.candidateName.trim() || 'Candidato'
  const role = input.desiredRole?.trim()
  const text = compactText(input.extractedText ?? '', 1200)
  const keywords = normalizeKeywords([
    ...(input.keywords ?? []),
    ...hintKeywordsFromText(input.extractedText ?? ''),
  ])
  const lines: string[] = []
  lines.push(
    role
      ? `${name} — interesse em ${role}.`
      : `${name} — currículo anexado.`,
  )
  if (keywords.length > 0) {
    lines.push(`• Tags: ${keywords.slice(0, 12).join(', ')}.`)
  }
  if (text) {
    const snippet = text.slice(0, 280)
    lines.push(`• Trecho: ${snippet}${text.length > 280 ? '…' : ''}`)
  } else {
    lines.push('• Sem texto extraído do arquivo (PDF imagem ou falha de leitura).')
  }
  return lines.join('\n')
}

export async function generateCurriculoBriefing(input: {
  candidateName: string
  desiredRole?: string | null
  extractedText?: string | null
  keywords?: readonly string[]
}): Promise<{ briefing: string; keywords: string[]; source: 'ai' | 'rules' }> {
  const keywords = normalizeKeywords([
    ...(input.keywords ?? []),
    ...hintKeywordsFromText(input.extractedText ?? ''),
  ])
  const rules = buildRuleBriefing({ ...input, keywords })

  if (!isAiConfigured()) {
    return { briefing: rules, keywords, source: 'rules' }
  }

  const text = compactText(input.extractedText ?? '', 4000)
  if (!text) {
    return { briefing: rules, keywords, source: 'rules' }
  }

  try {
    const ai = await askAI(
      `Você analisa currículos para o salão ROM Concept.
Responda em português, no máximo 6 linhas, só com o que estiver no texto.
Formato:
1) Uma linha: nome + cargo(s) prováveis + anos de experiência se houver.
2) Bullets com skills, unidades/salões citados e disponibilidade se houver.
Não invente. Se faltar dado, diga "não informado".`,
      `Candidato: ${input.candidateName}
Cargo desejado (se informado): ${input.desiredRole?.trim() || 'não informado'}
Tags manuais: ${keywords.join(', ') || 'nenhuma'}
Texto do currículo:
${text}`,
    )
    if (ai.trim()) {
      return { briefing: ai.trim(), keywords, source: 'ai' }
    }
  } catch {
    // fallback regras
  }
  return { briefing: rules, keywords, source: 'rules' }
}
