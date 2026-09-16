import type { AuthRole } from '@/lib/auth'
import type { RequestArea } from '@/lib/flow/types'
import { hasPanelModule, moduleKeyFromHref, type GrantableModuleKey } from '@/lib/intranet/modules'

export type IntranetSystemGroup = 'intranet' | 'operacao' | 'gestao' | 'flow'

export type IntranetSystem = {
  href: string
  label: string
  description: string
  group: IntranetSystemGroup
}

export const HOME_SHORTCUTS = [
  { href: '/sistemas', label: 'Meus Sistemas' },
  { href: '/empresa#politicas', label: 'Documentos e Políticas' },
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/ajuda', label: 'Suporte' },
] as const

const INTRANET: IntranetSystem[] = [
  { href: '/flow', label: 'Rom Flow', description: 'Solicitações, aprovações e pagamentos.', group: 'intranet' },
  { href: '/pessoas', label: 'Pessoas', description: 'Diretório da unidade.', group: 'intranet' },
  { href: '/empresa', label: 'MKT Notícias', description: 'Notícias, eventos e políticas.', group: 'intranet' },
  { href: '/onboarding', label: 'Onboarding', description: 'Vídeos e treinamento da casa.', group: 'intranet' },
  { href: '/ajuda', label: 'Ajuda', description: 'Suporte da equipe.', group: 'intranet' },
]

const OPERACAO: IntranetSystem[] = [
  { href: '/hoje', label: 'Operação', description: 'Frente de caixa do dia.', group: 'operacao' },
  { href: '/pipeline', label: 'Pipeline', description: 'Funil do salão.', group: 'operacao' },
  { href: '/contatos', label: 'Contatos', description: 'Base de clientes.', group: 'operacao' },
]

const GESTAO: IntranetSystem[] = [
  { href: '/financeiro', label: 'Financeiro', description: 'Despesas e Omie.', group: 'gestao' },
  { href: '/estoque', label: 'Estoque', description: 'Produtos e alertas.', group: 'gestao' },
  { href: '/relatorios', label: 'Relatórios', description: 'Visão de período.', group: 'gestao' },
  { href: '/dashboard', label: 'Rom Adm', description: 'Visão analítica.', group: 'gestao' },
]

const FLOW_AREAS: Record<RequestArea, { label: string; description: string }> = {
  financeiro: { label: 'Solicitação financeiro', description: 'Pagamentos, reembolsos e fornecedores.' },
  manutencao: { label: 'Solicitação manutenção', description: 'Chamados de manutenção da unidade.' },
  compras: { label: 'Solicitação compras', description: 'Pedidos de compra.' },
  rh: { label: 'Solicitação RH', description: 'Férias, admissão e benefícios.' },
}

function pick(items: IntranetSystem[], hrefs: readonly string[]): IntranetSystem[] {
  return items.filter((item) => hrefs.includes(item.href))
}

export function systemsForRole(role: AuthRole): IntranetSystem[] {
  switch (role) {
    case 'admin':
      return [...INTRANET, ...OPERACAO, ...GESTAO]
    case 'staff':
    case 'mkt':
      return [...INTRANET, ...OPERACAO]
    case 'financeiro':
      return [...INTRANET, ...pick(OPERACAO, ['/hoje']), ...pick(GESTAO, ['/financeiro', '/estoque', '/relatorios'])]
    case 'estoque':
      return [...INTRANET, ...pick(OPERACAO, ['/hoje']), ...pick(GESTAO, ['/estoque'])]
    default: {
      const _never: never = role
      return _never
    }
  }
}

export function systemsForAccess(
  role: AuthRole,
  extras: readonly GrantableModuleKey[] = [],
): IntranetSystem[] {
  return [...INTRANET, ...OPERACAO, ...GESTAO].filter((item) => {
    const key = moduleKeyFromHref(item.href)
    if (!key) return true
    return hasPanelModule(role, extras, key)
  })
}

export function flowAreaSystems(areaIds: RequestArea[]): IntranetSystem[] {
  return areaIds.map((area) => ({
    href: '/flow',
    label: FLOW_AREAS[area].label,
    description: FLOW_AREAS[area].description,
    group: 'flow',
  }))
}

export function systemGroupLabel(group: IntranetSystemGroup): string {
  switch (group) {
    case 'intranet':
      return 'Intranet'
    case 'operacao':
      return 'Operação'
    case 'gestao':
      return 'Gestão'
    case 'flow':
      return 'Rom Flow'
    default: {
      const _never: never = group
      return _never
    }
  }
}
