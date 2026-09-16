export const INTRANET_NAV = [
  { href: '/', label: 'Início' },
  { href: '/pessoas', label: 'Pessoas' },
  { href: '/empresa', label: 'MKT Notícias' },
  { href: '/flow', label: 'Rom Flow' },
  { href: '/financeiro', label: 'Financeiro', roles: ['admin', 'financeiro'] as const },
  { href: '/estoque', label: 'Estoque', roles: ['admin', 'financeiro', 'estoque'] as const },
  { href: '/hoje', label: 'Operação' },
  { href: '/pipeline', label: 'Pipeline', roles: ['admin', 'staff', 'mkt'] as const },
  { href: '/contatos', label: 'Contatos', roles: ['admin', 'staff', 'mkt'] as const },
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/ajuda', label: 'Ajuda' },
] as const
