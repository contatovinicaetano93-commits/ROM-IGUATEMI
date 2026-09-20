import { describe, expect, it } from 'vitest'
import {
  selectCreateUserAuditRecipients,
  type CreateUserAuditPerson,
} from '@/lib/intranet/employee-created'

function person(
  partial: Partial<CreateUserAuditPerson> & Pick<CreateUserAuditPerson, 'id'>,
): CreateUserAuditPerson {
  return {
    email: `${partial.id}@rom.test`,
    name: partial.id,
    status: 'active',
    panel_role: 'staff',
    flow_role: 'solicitante',
    areaIds: [],
    ...partial,
  }
}

describe('selectCreateUserAuditRecipients', () => {
  const created = person({
    id: 'new',
    email: 'novo@rom.test',
    name: 'Novo',
    areaIds: ['financeiro', 'compras'],
  })

  it('inclui quem tem sobreposição de áreas', () => {
    const overlap = person({ id: 'overlap', areaIds: ['compras', 'rh'] })
    const other = person({ id: 'other', areaIds: ['rh'] })
    const selected = selectCreateUserAuditRecipients(created, [created, overlap, other])
    expect(selected.map((p) => p.id)).toEqual(['overlap'])
  })

  it('inclui panel_role admin mesmo sem área em comum', () => {
    const admin = person({
      id: 'admin',
      panel_role: 'admin',
      areaIds: ['rh'],
    })
    const selected = selectCreateUserAuditRecipients(created, [created, admin])
    expect(selected.map((p) => p.id)).toEqual(['admin'])
  })

  it('inclui flow_role master mesmo sem área em comum', () => {
    const master = person({
      id: 'master',
      flow_role: 'master',
      areaIds: [],
    })
    const selected = selectCreateUserAuditRecipients(created, [created, master])
    expect(selected.map((p) => p.id)).toEqual(['master'])
  })

  it('exclui o próprio colaborador recém-criado', () => {
    const selected = selectCreateUserAuditRecipients(created, [
      created,
      person({ id: 'same-email-diff-id', email: created.email, areaIds: ['financeiro'] }),
    ])
    expect(selected.map((p) => p.id)).toEqual(['same-email-diff-id'])
    expect(selected.some((p) => p.id === created.id)).toBe(false)
  })

  it('exclui inativos mesmo com área em comum ou admin', () => {
    const inactiveOverlap = person({
      id: 'inactive-overlap',
      status: 'inactive',
      areaIds: ['financeiro'],
    })
    const inactiveAdmin = person({
      id: 'inactive-admin',
      status: 'inactive',
      panel_role: 'admin',
      areaIds: [],
    })
    const inactiveMaster = person({
      id: 'inactive-master',
      status: 'inactive',
      flow_role: 'master',
      areaIds: [],
    })
    const selected = selectCreateUserAuditRecipients(created, [
      created,
      inactiveOverlap,
      inactiveAdmin,
      inactiveMaster,
    ])
    expect(selected).toEqual([])
  })
})
