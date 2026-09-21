import type { AuthRole } from '@/lib/auth'
import {
  modulesForCargo,
  type CargoPackage,
} from '@/lib/intranet/cargo-packages'
import { GRANTABLE_MODULES, type GrantableModuleKey } from '@/lib/intranet/modules'
import { systemsForAccess } from '@/lib/intranet/systems'

/** Sistemas de operação/gestão que não são grantable (liberam por path/nav). */
export const INCLUDED_SHELL_SYSTEMS = [
  { href: '/hoje', label: 'Operação do dia' },
  { href: '/recepcao', label: 'Recepção' },
  { href: '/pos-venda', label: 'Pós-venda' },
  { href: '/meu-faturamento', label: 'Meu faturamento' },
] as const

const PREVIEW_ORDER = [
  '/pipeline',
  '/contatos',
  '/recepcao',
  '/pos-venda',
  '/hoje',
  '/meu-faturamento',
  '/financeiro',
  '/estoque',
  '/dashboard',
  '/relatorios',
] as const

/**
 * Rótulos honestos do que o cargo vê em operação/gestão (Meus Sistemas),
 * não só os módulos grantable — evita o buraco do “Meu faturamento” etc.
 */
export function cargoAccessPreviewLabels(pack: CargoPackage): string[] {
  const extras = pack.extras
  const granted = new Set(modulesForCargo(pack))
  const byHref = new Map(
    systemsForAccess(pack.panel_role, extras)
      .filter((item) => item.group === 'operacao' || item.group === 'gestao')
      .map((item) => [item.href, item.label] as const),
  )

  const labels: string[] = []
  for (const href of PREVIEW_ORDER) {
    const label = byHref.get(href)
    if (label) labels.push(label)
  }
  // Garante grantables que por algum motivo não entraram na ordem.
  for (const key of granted) {
    const mod = GRANTABLE_MODULES.find((item) => item.key === key)
    if (mod && !labels.includes(mod.label)) labels.push(mod.label)
  }
  return labels
}

/** Shell incluso (não grantable) que este papel realmente vê. */
export function includedShellLabelsForRole(
  role: AuthRole,
  extras: readonly GrantableModuleKey[] = [],
): string[] {
  const hrefs = new Set(systemsForAccess(role, extras).map((item) => item.href))
  return INCLUDED_SHELL_SYSTEMS.filter((item) => hrefs.has(item.href)).map((item) => item.label)
}
