import type { ContactRow } from '@/lib/contacts'
import type { EnrichedService, Recommendation } from '@/lib/recommendations'
import { askAI, isAiConfigured } from '@/lib/ai/client'
import { buildContactContext, contactContextForAI } from '@/lib/salon/context-builder'
import { getBrand } from '@/lib/brand'
import { pickLastVisit } from '@/lib/services'
import { SALON_TIMEZONE } from '@/lib/salon/format'

function briefPrompt() {
  const brand = getBrand()
  return `Você é a inteligência de atendimento do ${brand.aiPersonaName} (salão de beleza de alto padrão).
Gere um briefing curto e direto para o backstaff/executor, em português, no máximo 5 linhas.
Objetivo: facilitar o front no cross-sell e up-sell. Use SOMENTE os dados fornecidos.
Formato: 1 linha de contexto do cliente (inclua manicure/cabeleireiro preferidos e última visita se houver) + bullets de ações recomendadas (o que oferecer e por quê).
Seja prático e caloroso, sem inventar informação que não está nos dados. Não cite preços nem valores em R$.`
}

export function buildRuleBrief(
  contact: ContactRow,
  services: EnrichedService[],
  recs: Recommendation[]
): string {
  const nome = contact.name ?? 'Cliente'
  const last = pickLastVisit(services)
  const linhas: string[] = []
  const prefs = [
    contact.preferred_manicurist ? `Manicure preferida: ${contact.preferred_manicurist}` : null,
    contact.preferred_hairstylist
      ? `Cabeleireiro preferido: ${contact.preferred_hairstylist}`
      : null,
  ]
    .filter(Boolean)
    .join('. ')
  const prefsSuffix = prefs ? ` ${prefs}.` : ''
  if (last) {
    const when = new Date(last.last_done_at).toLocaleDateString('pt-BR', {
      timeZone: SALON_TIMEZONE,
    })
    const pro = last.professional_name ? ` com ${last.professional_name}` : ''
    linhas.push(`${nome} — última visita ${when}: ${last.service_name}${pro}.${prefsSuffix}`)
  } else {
    linhas.push(`${nome} — ${services.length} serviço(s) no perfil.${prefsSuffix}`)
  }
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

  if (isAiConfigured()) {
    try {
      const ai = await askAI(briefPrompt(), `Dados do cliente: ${context}`)
      if (ai && ai.trim().length > 0) return { brief: ai.trim(), source: 'ai' }
    } catch {
      // IA indisponível — fallback por regras.
    }
  }
  return { brief: rule, source: 'rules' }
}
