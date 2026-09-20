import { describe, expect, it } from 'vitest'
import {
  selectCreateUserAuditRecipients,
  type CreateUserAuditPerson,
} from '@/lib/intranet/employee-created'

function person(partial: Partial<CreateUserAuditPerson> & Pick<CreateUserAuditPerson, 'id' | 'email'>): CreateUserAuditPerson {
  return {
    name: partial.name ?? partial.email,
    panel_role: partial.panel_role ?? 'staff',
    flow_role: partial.flow_role ?? 'solicitante',
    status: partial.status ?? 'active',
    areaIds: partial.areaIds ?? [],
    ...partial,
  }
}

describe('selectCreateUserAuditRecipients', () => {
  const created = person({
    id: 'new-1',
    email: 'novo@rom.local',
    name: 'Novo',
    areaIds: ['compras', 'rh'],
  })

  it('inclui quem tem área em comum', () => {
    const overlap = person({ id: 'a1', email: 'compras@rom.local', areaIds: ['compras'] })
    const other = person({ id: 'a2', email: 'fin@rom.local', areaIds: ['financeiro'] })
    expect(selectCreateUserAuditRecipients(created, [overlap, other]).map((p) => p.id)).toEqual(['a1'])
  })

  it('inclui panel_role admin mesmo sem área em comum', () => {
    const admin = person({
      id: 'adm',
      email: 'admin@rom.local',
      panel_role: 'admin',
      areaIds: ['financeiro'],
    })
    expect(selectCreateUserAuditRecipients(created, [admin]).map((p) => p.id)).toEqual(['adm'])
  })

  it('inclui flow_role master mesmo sem área em comum', () => {
    const master = person({
      id: 'm1',
      email: 'master@rom.local',
      flow_role: 'master',
      areaIds: [],
    })
    expect(selectCreateUserAuditRecipients(created, [master]).map((p) => p.id)).toEqual(['m1'])
  })

  it('exclui o próprio colaborador criado', () => {
    const self = person({ ...created })
    const other = person({ id: 'a1', email: 'compras@rom.local', areaIds: ['compras'] })
    expect(selectCreateUserAuditRecipients(created, [self, other]).map((p) => p.id)).toEqual(['a1'])
  })

  it('exclui inativos mesmo com área em comum ou admin/master', () => {
    const inactiveOverlap = person({
      id: 'i1',
      email: 'old@rom.local',
      status: 'inactive',
      areaIds: ['rh'],
    })
    const inactiveAdmin = person({
      id: 'i2',
      email: 'old-admin@rom.local',
      status: 'inactive',
      panel_role: 'admin',
    })
    const inactiveMaster = person({
      id: 'i3',
      email: 'old-master@rom.local',
      status: 'inactive',
      flow_role: 'master',
    })
    const active = person({ id: 'a1', email: 'ok@rom.local', areaIds: ['compras'] })
    expect(
      selectCreateUserAuditRecipients(created, [
        inactiveOverlap,
        inactiveAdmin,
        inactiveMaster,
        active,
      ]).map((p) => p.id),
    ).toEqual(['a1'])
  })
})
