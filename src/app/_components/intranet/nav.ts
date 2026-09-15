export const INTRANET_NAV = [
  { href: '/', label: 'Início' },
  { href: '/pessoas', label: 'Pessoas' },
  { href: '/empresa', label: 'Empresa' },
  { href: '/rh', label: 'RH' },
  { href: '/flow', label: 'Rom Flow' },
  { href: '/financeiro', label: 'Financeiro', roles: ['admin', 'financeiro'] as const },
  { href: '/hoje', label: 'Operação' },
  { href: '/treinamentos', label: 'Treinamentos' },
  { href: '/ajuda', label: 'Ajuda' },
] as const
