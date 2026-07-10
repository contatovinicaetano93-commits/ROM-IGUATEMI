import type { ContactRow } from '@/lib/contacts'
import type { EnrichedService, Recommendation } from '@/lib/recommendations'
import { askAI } from '@/lib/ai/client'
import { buildContactContext, contactContextForAI } from '@/lib/salon/context-builder'
import { unitPromptLabel } from '@/lib/salon/unit'

function briefPrompt() {
  return `Você é a inteligência de atendimento do ${unitPromptLabel()} (salão de beleza de alto padrão).
Gere um briefing curto e direto para o backstaff/executor, em português, no máximo 5 linhas.
Objetivo: facilitar o front no cross-sell e up-sell. Use SOMENTE os dados fornecidos.
Formato: 1 linha de contexto do cliente + bullets de ações recomendadas (o que oferecer e por quê).
Seja prático e caloroso, sem inventar informação que não está nos dados.`
}

export function buildRuleBrief(
  contact: ContactRow,
  services: EnrichedService[],
  recs: Recommendation[]
): string {
  const nome = contact.name ?? 'Cliente'
  const linhas: string[] = []
  linhas.push(`${nome} — ${services.length} serviço(s) no perfil.`)
  if (recs.length === 0) {
    linhas.push('• Sem ações urgentes agora. Mantenha o relacionamento e confirme preferências.')
  } else {
    for (const r of recs) linhas.push(`• ${r.title}: ${r.detail}`)
  }
  return linhas.join('\n')
}

export async function generateBrief(
  contact: ContactRow,
  services: EnrichedService[],
  recs: Recommendation[]
): Promise<{ brief: string; source: 'ai' | 'rules' }> {
  const rule = buildRuleBrief(contact, services, recs)
  const context = contactContextForAI(buildContactContext(contact, services, recs))

  try {
    const ai = await askAI(briefPrompt(), `Dados do cliente: ${context}`)
    if (ai && ai.trim().length > 0) return { brief: ai.trim(), source: 'ai' }
  } catch {
    // IA indisponível — fallback por regras.
  }
  return { brief: rule, source: 'rules' }
}
