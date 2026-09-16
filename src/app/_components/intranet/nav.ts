export const INTRANET_NAV = [
  { href: '/', label: 'Início' },
  { href: '/pessoas', label: 'Pessoas' },
  { href: '/empresa', label: 'MKT Notícias' },
  { href: '/flow', label: 'Rom Flow' },
  { href: '/financeiro', label: 'Financeiro', roles: ['admin', 'financeiro'] as const },
  { href: '/hoje', label: 'Operação' },
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/ajuda', label: 'Ajuda' },
] as const
