/**
 * Nomes genéricos que a Avec/sync usam como fallback — não são procedimento
 * real com ciclo de retorno. Não devem gerar atraso/vencendo.
 * Manter a lista SQL (contact-summary / recommendations / hoje-leads) alinhada.
 */
export const CADENCE_PLACEHOLDER_SERVICE_NAMES = [
  'atendimento',
  'servico',
  'serviço',
  'visita',
  'service',
] as const

export function isCadencePlaceholderServiceName(name: string): boolean {
  const n = name.trim().toLowerCase()
  return (CADENCE_PLACEHOLDER_SERVICE_NAMES as readonly string[]).includes(n)
}
