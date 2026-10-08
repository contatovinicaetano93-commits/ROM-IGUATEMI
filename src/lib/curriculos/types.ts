export const CURRICULO_STATUSES = ['novo', 'em_analise', 'aprovado', 'arquivado'] as const

export type CurriculoStatus = (typeof CURRICULO_STATUSES)[number]

export type Curriculo = {
  id: string
  candidate_name: string
  email: string | null
  phone: string | null
  desired_role: string | null
  status: CurriculoStatus
  file_url: string
  file_name: string | null
  file_content_type: string | null
  extracted_text: string | null
  briefing: string | null
  keywords: string[]
  notes: string | null
  created_by_email: string | null
  created_at: string
  updated_at: string
}

export function isCurriculoStatus(value: unknown): value is CurriculoStatus {
  return typeof value === 'string' && (CURRICULO_STATUSES as readonly string[]).includes(value)
}

export function curriculoStatusLabel(status: CurriculoStatus): string {
  switch (status) {
    case 'novo':
      return 'Novo'
    case 'em_analise':
      return 'Em análise'
    case 'aprovado':
      return 'Aprovado'
    case 'arquivado':
      return 'Arquivado'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}
