import type { Company } from '@/lib/flow/types'
import type { RomPanelId } from '@/lib/brand'

const HENRIQUE_E_ROMEO: Company = {
  id: 'cmp_henrique_romeo',
  name: 'Henrique e Romeo',
  legal_name: 'Henrique e Romeo',
  slug: 'henrique-e-romeo',
  initials: 'HR',
  color: '#B08B57',
  is_active: true,
}

const BRASIL_COMPANIES: Company[] = [
  {
    id: 'cmp_baru_brasil',
    name: 'Baru Bistro Brasil',
    legal_name: 'Baru Bistro Brasil Ltda.',
    slug: 'baru-bistro-brasil',
    initials: 'BBB',
    color: '#C4A574',
    is_active: true,
  },
  {
    id: 'cmp_concept_brasil',
    name: 'Rom Concept Brasil',
    legal_name: 'Rom Concept Brasil Ltda.',
    slug: 'rom-concept-brasil',
    initials: 'RCB',
    color: '#8C6B4A',
    is_active: true,
  },
  HENRIQUE_E_ROMEO,
]

const IGUATEMI_COMPANIES: Company[] = [
  {
    id: 'cmp_baru_iguatemi',
    name: 'Baru Bistro Iguatemi',
    legal_name: 'Baru Bistro Iguatemi Ltda.',
    slug: 'baru-bistro-iguatemi',
    initials: 'BBI',
    color: '#C4A574',
    is_active: true,
  },
  {
    id: 'cmp_concept_iguatemi',
    name: 'Rom Concept Iguatemi',
    legal_name: 'Rom Concept Iguatemi Ltda.',
    slug: 'rom-concept-iguatemi',
    initials: 'RCI',
    color: '#8C6B4A',
    is_active: true,
  },
  HENRIQUE_E_ROMEO,
]

export const FLOW_CATEGORIES = [
  { id: 'cat_viagem', name: 'Viagem', color: '#8C6B4A', is_active: true },
  { id: 'cat_alim', name: 'Alimentação', color: '#C4A574', is_active: true },
  { id: 'cat_esc', name: 'Escritório', color: '#6B5A48', is_active: true },
  { id: 'cat_soft', name: 'Software', color: '#9A7B52', is_active: true },
  { id: 'cat_outros', name: 'Outros', color: '#7A7268', is_active: true },
] as const

/** Empresas do RomFlow visíveis nesta intranet — nunca as da outra unidade. */
export function companiesForPanel(panel: RomPanelId): Company[] {
  return panel === 'iguatemi' ? IGUATEMI_COMPANIES : BRASIL_COMPANIES
}

export function isCompanyAllowedOnPanel(panel: RomPanelId, companyId: string): boolean {
  return companiesForPanel(panel).some((company) => company.id === companyId)
}
