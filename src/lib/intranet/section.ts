/** rótulo da seção atual no top bar da intranet */

const EXACT: Record<string, string> = {
  '/': 'Home',
  '/pessoas': 'Gestão de usuário',
  '/empresa': 'Notícias e eventos',
  '/rh': 'RH',
  '/treinamentos': 'Treinamentos',
  '/ajuda': 'Suporte',
  '/financeiro': 'Financeiro',
  '/estoque': 'Estoque',
  '/hoje': 'Operação do dia',
  '/pipeline': 'Agenda do dia',
  '/dashboard': 'Visão analítica',
  '/relatorios': 'Visão analítica',
  '/adm': 'Visão analítica',
  '/contatos': 'Contatos',
  '/onboarding': 'Onboarding',
  '/sistemas': 'Meus sistemas',
  '/auditoria': 'Auditoria',
  '/meu-faturamento': 'Meu faturamento',
}

const PREFIXES: Array<{ prefix: string; label: string }> = [
  { prefix: '/flow', label: 'Rom Flow' },
  { prefix: '/pessoas', label: 'Gestão de usuário' },
  { prefix: '/empresa', label: 'Notícias e eventos' },
  { prefix: '/rh', label: 'RH' },
  { prefix: '/treinamentos', label: 'Treinamentos' },
  { prefix: '/ajuda', label: 'Suporte' },
  { prefix: '/financeiro', label: 'Financeiro' },
  { prefix: '/estoque', label: 'Estoque' },
  { prefix: '/hoje', label: 'Operação do dia' },
  { prefix: '/operacao', label: 'Operação do dia' },
  { prefix: '/pipeline', label: 'Agenda do dia' },
  { prefix: '/dashboard', label: 'Visão analítica' },
  { prefix: '/relatorios', label: 'Visão analítica' },
  { prefix: '/adm', label: 'Visão analítica' },
  { prefix: '/contatos', label: 'Contatos' },
  { prefix: '/onboarding', label: 'Onboarding' },
  { prefix: '/sistemas', label: 'Meus sistemas' },
  { prefix: '/auditoria', label: 'Auditoria' },
  { prefix: '/meu-faturamento', label: 'Meu faturamento' },
]

export function intranetSectionLabel(pathname: string): string {
  const path = pathname.split('?')[0] || '/'
  if (EXACT[path]) return EXACT[path]
  const match = PREFIXES.find((item) => path === item.prefix || path.startsWith(`${item.prefix}/`))
  return match?.label ?? 'Intranet'
}
