import { describe, expect, it } from 'vitest'
import { APP_NAV, BOTTOM_NAV, groupNavByZone, NAV_ZONE_LABEL } from './nav'

describe('nav zones', () => {
  it('ordena Operar → Entender → Administrar e não perde rotas', () => {
    const hrefs = APP_NAV.map((i) => i.href)
    expect(hrefs).toEqual([
      '/hoje',
      '/pipeline',
      '/contatos',
      '/onboarding',
      '/dashboard',
      '/relatorios',
      '/admin/relatorio-diretoria',
    ])
    expect(APP_NAV.map((i) => i.zone)).toEqual([
      'operar',
      'operar',
      'operar',
      'operar',
      'entender',
      'entender',
      'administrar',
    ])
  })

  it('bottom nav é só Operar (staff)', () => {
    expect(BOTTOM_NAV.every((i) => i.zone === 'operar')).toBe(true)
    expect(BOTTOM_NAV.map((i) => i.href)).toEqual([
      '/hoje',
      '/pipeline',
      '/contatos',
      '/onboarding',
    ])
  })

  it('groupNavByZone pula zonas vazias e usa rótulos', () => {
    const staff = groupNavByZone(APP_NAV.filter((i) => !i.adminOnly))
    expect(staff.map((g) => g.zone)).toEqual(['operar'])
    expect(NAV_ZONE_LABEL.operar).toBe('Operar')

    const admin = groupNavByZone([...APP_NAV])
    expect(admin.map((g) => g.zone)).toEqual(['operar', 'entender', 'administrar'])
    expect(admin.flatMap((g) => g.items).map((i) => i.href)).toEqual(APP_NAV.map((i) => i.href))
  })

  it('Visão e Relatórios são adminOnly', () => {
    const dash = APP_NAV.find((i) => i.href === '/dashboard')
    const rel = APP_NAV.find((i) => i.href === '/relatorios')
    expect(dash?.adminOnly).toBe(true)
    expect(rel?.adminOnly).toBe(true)
  })
})
