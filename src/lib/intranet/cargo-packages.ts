import type { AuthRole } from '@/lib/auth'
import type { FlowRole, RequestArea } from '@/lib/flow/types'
import { REQUEST_AREAS } from '@/lib/flow/workflow'
import {
  extrasBeyondRole,
  effectiveModules,
  type GrantableModuleKey,
} from '@/lib/intranet/modules'

/**
 * Pacotes de cargo (= alias vazios prontos para cadastrar pessoas).
 * Persistência continua sendo panel_role + extras + flow_role + areas —
 * o pacote só guia o cadastro em Gestão de usuário.
 */
export type CargoPackageId =
  | 'master'
  | 'ops_financeiro'
  | 'solicitante_amplo'
  | 'gestor_unidade'
  | 'gestor_baru'
  | 'dono'
  | 'rh'
  | 'mkt'
  | 'recepcao'
  | 'estoque_ops'
  | 'almoxarifado'
  | 'profissional'

export type CargoPackage = {
  id: CargoPackageId
  label: string
  alias: string
  summary: string
  examples: string
  panel_role: AuthRole
  flow_role: FlowRole
  can_publish: boolean
  /** Extras além do pacote do panel_role. */
  extras: readonly GrantableModuleKey[]
  /** Áreas do Rom Flow que a pessoa pode usar. */
  areaIds: readonly RequestArea[]
}

export const CARGO_PACKAGES: readonly CargoPackage[] = [
  {
    id: 'master',
    label: 'Admin master',
    alias: 'Master',
    summary: 'Visão e admin de tudo na unidade, inclusive Gestão de usuário.',
    examples: 'Você · Waltter',
    panel_role: 'admin',
    flow_role: 'master',
    can_publish: true,
    extras: [],
    areaIds: [...REQUEST_AREAS],
  },
  {
    id: 'ops_financeiro',
    label: 'Ops financeiro',
    alias: 'Ops Fin',
    summary: 'Admina Flow, Financeiro, Estoque, Agenda, Operação e Visão nas duas unidades.',
    examples: 'Rodrigo',
    panel_role: 'financeiro',
    flow_role: 'master',
    can_publish: false,
    extras: ['pipeline', 'contatos', 'dashboard'],
    areaIds: [...REQUEST_AREAS],
  },
  {
    id: 'solicitante_amplo',
    label: 'Solicitante amplo',
    alias: 'Solicitante',
    summary: 'Pede no Rom Flow em todos os setores; sem admin de painel.',
    examples: 'Sidney',
    panel_role: 'staff',
    flow_role: 'solicitante',
    can_publish: false,
    extras: [],
    areaIds: [...REQUEST_AREAS],
  },
  {
    id: 'gestor_unidade',
    label: 'Gestor(a) de unidade',
    alias: 'Gestor unidade',
    summary: 'Opera o dia, agenda, contatos e visão da própria unidade.',
    examples: 'Gestoras BR · Gestora IG',
    panel_role: 'staff',
    flow_role: 'solicitante',
    can_publish: false,
    extras: ['dashboard'],
    areaIds: [...REQUEST_AREAS],
  },
  {
    id: 'gestor_baru',
    label: 'Gestor(a) Baru',
    alias: 'Gestor Baru',
    summary: 'Operação Baru + solicitações de financeiro e compras no Rom Flow.',
    examples: 'Gestora Baru BR · Gestora Baru IG',
    panel_role: 'staff',
    flow_role: 'solicitante',
    can_publish: false,
    extras: ['dashboard'],
    areaIds: ['financeiro', 'compras'],
  },
  {
    id: 'dono',
    label: 'Dono',
    alias: 'Dono',
    summary: 'Leitura de Visão e Relatórios; sem operar o dia a dia.',
    examples: 'Henrique · Romeu',
    panel_role: 'financeiro',
    flow_role: 'solicitante',
    can_publish: false,
    extras: ['dashboard'],
    areaIds: [],
  },
  {
    id: 'rh',
    label: 'RH',
    alias: 'RH',
    summary: 'Diretório e pedidos de RH no Rom Flow; cultura e onboarding.',
    examples: 'RH por unidade',
    panel_role: 'staff',
    flow_role: 'admin_rh',
    can_publish: false,
    extras: [],
    areaIds: ['rh'],
  },
  {
    id: 'mkt',
    label: 'Marketing',
    alias: 'MKT',
    summary: 'Publica notícias e eventos; vê agenda e contatos.',
    examples: 'Equipe MKT',
    panel_role: 'mkt',
    flow_role: 'solicitante',
    can_publish: true,
    extras: [],
    areaIds: [...REQUEST_AREAS],
  },
  {
    id: 'recepcao',
    label: 'Recepção',
    alias: 'Recepção',
    summary: 'Balcão: agenda de hoje, playbook de contato e busca de cliente.',
    examples: 'Equipe recepção',
    panel_role: 'staff',
    flow_role: 'solicitante',
    can_publish: false,
    extras: [],
    areaIds: ['manutencao'],
  },
  {
    id: 'estoque_ops',
    label: 'Estoque operacional',
    alias: 'Estoque ops',
    summary: 'Cadastro de produto, movimentos, KPIs de baixa e pontos de distribuição.',
    examples: 'Equipe estoque sob Rodrigo',
    panel_role: 'estoque',
    flow_role: 'solicitante',
    can_publish: false,
    extras: [],
    areaIds: ['compras'],
  },
  {
    id: 'almoxarifado',
    label: 'Almoxarifado',
    alias: 'Almoxarifado',
    summary: 'Base mestre do estoque e reposição dos 3 pontos do salão.',
    examples: 'Lead almoxarifado',
    panel_role: 'estoque',
    flow_role: 'admin_compras',
    can_publish: false,
    extras: [],
    areaIds: ['compras'],
  },
  {
    id: 'profissional',
    label: 'Profissional / cabeleireiro',
    alias: 'Profissional',
    summary: 'Home, cultura, agenda do dia; meu faturamento entra na próxima fase.',
    examples: 'Cabeleireiros da unidade',
    panel_role: 'staff',
    flow_role: 'solicitante',
    can_publish: false,
    extras: [],
    areaIds: ['compras'],
  },
] as const

export function cargoPackageById(id: string | null | undefined): CargoPackage | null {
  if (!id) return null
  return CARGO_PACKAGES.find((item) => item.id === id) ?? null
}

export function modulesForCargo(pack: CargoPackage): GrantableModuleKey[] {
  return effectiveModules(pack.panel_role, pack.extras)
}

/** Melhor pacote que bate com o que está gravado (para rótulo na lista). */
export function matchCargoPackage(input: {
  panel_role: AuthRole
  flow_role: string
  modules?: readonly GrantableModuleKey[] | null
  areaIds?: readonly RequestArea[] | null
}): CargoPackage | null {
  const extras = extrasBeyondRole(input.panel_role, input.modules ?? [])
  const areas = [...(input.areaIds ?? [])].sort()
  let best: CargoPackage | null = null
  let bestScore = -1
  for (const pack of CARGO_PACKAGES) {
    if (pack.panel_role !== input.panel_role) continue
    if (pack.flow_role !== input.flow_role) continue
    const packExtras = [...pack.extras].sort().join(',')
    const personExtras = [...extras].sort().join(',')
    let score = 0
    if (packExtras === personExtras) score += 3
    else if (pack.extras.every((key) => extras.includes(key))) score += 1
    const packAreas = [...pack.areaIds].sort().join(',')
    const personAreas = areas.join(',')
    if (packAreas === personAreas) score += 2
    else if (pack.areaIds.length === 0 && areas.length === 0) score += 2
    if (score > bestScore) {
      bestScore = score
      best = pack
    }
  }
  return bestScore >= 3 ? best : bestScore >= 1 ? best : null
}
