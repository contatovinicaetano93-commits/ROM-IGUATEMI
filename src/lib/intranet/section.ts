/** rótulo da seção atual no top bar da intranet */

const EXACT: Record<string, string> = {
  '/': 'Início',
  '/pessoas': 'Pessoas',
  '/empresa': 'Empresa',
  '/rh': 'RH',
  '/treinamentos': 'Treinamentos',
  '/ajuda': 'Ajuda',
  '/financeiro': 'Financeiro',
  '/hoje': 'Operação',
}

const PREFIXES: Array<{ prefix: string; label: string }> = [
  { prefix: '/flow', label: 'Rom Flow' },
  { prefix: '/pessoas', label: 'Pessoas' },
  { prefix: '/empresa', label: 'Empresa' },
  { prefix: '/rh', label: 'RH' },
  { prefix: '/treinamentos', label: 'Treinamentos' },
  { prefix: '/ajuda', label: 'Ajuda' },
  { prefix: '/financeiro', label: 'Financeiro' },
  { prefix: '/hoje', label: 'Operação' },
  { prefix: '/operacao', label: 'Operação' },
]

export function intranetSectionLabel(pathname: string): string {
  const path = pathname.split('?')[0] || '/'
  if (EXACT[path]) return EXACT[path]
  const match = PREFIXES.find((item) => path === item.prefix || path.startsWith(`${item.prefix}/`))
  return match?.label ?? 'Intranet'
}
