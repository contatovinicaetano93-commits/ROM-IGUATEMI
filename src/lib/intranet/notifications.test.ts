import { describe, expect, it } from 'vitest'
import { flowAudienceKey, notificationAudienceKeys } from '@/lib/intranet/notifications'

describe('notificationAudienceKeys', () => {
  it('master e admin do painel veem as quatro áreas do Flow', () => {
    const keys = notificationAudienceKeys({
      readerKey: 'env:admin:ADMIN-BRASIL',
      panelRole: 'admin',
      flowRole: 'master',
      areaIds: [],
    })
    expect(keys).toEqual(
      expect.arrayContaining([
        'env:admin:ADMIN-BRASIL',
        'role:admin',
        'flow:financeiro',
        'flow:manutencao',
        'flow:compras',
        'flow:rh',
      ]),
    )
  })

  it('admin financeiro só vê a área dele', () => {
    const keys = notificationAudienceKeys({
      readerKey: 'u1',
      panelRole: 'financeiro',
      flowRole: 'admin_financeiro',
      areaIds: ['financeiro'],
    })
    expect(keys).toContain('flow:financeiro')
    expect(keys).not.toContain('flow:rh')
    expect(keys).not.toContain('role:admin')
  })

  it('solicitante não recebe o sino das solicitações da área', () => {
    const keys = notificationAudienceKeys({
      readerKey: 'staff-1',
      panelRole: 'staff',
      flowRole: 'solicitante',
      areaIds: ['financeiro', 'rh', 'compras', 'manutencao'],
    })
    expect(keys).toEqual(['staff-1'])
  })
})

describe('flowAudienceKey', () => {
  it('prefixa a área', () => {
    expect(flowAudienceKey('compras')).toBe('flow:compras')
  })
})
