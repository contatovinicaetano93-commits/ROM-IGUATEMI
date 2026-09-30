import { describe, expect, it } from 'vitest'
import {
  createWelcomeEmailContent,
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

  it('não inclui quem só tem área em comum (ex.: MKT/compras)', () => {
    const overlap = person({ id: 'overlap-mkt', areaIds: ['compras', 'rh'] })
    const other = person({ id: 'other', areaIds: ['rh'] })
    const selected = selectCreateUserAuditRecipients(created, [created, overlap, other])
    expect(selected).toEqual([])
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

  it('exclui o próprio colaborador recém-criado mesmo se for admin', () => {
    const selfAdmin = person({
      id: 'new',
      panel_role: 'admin',
      flow_role: 'master',
      areaIds: ['financeiro'],
    })
    const otherMaster = person({ id: 'henrique', flow_role: 'master' })
    const selected = selectCreateUserAuditRecipients(selfAdmin, [selfAdmin, otherMaster])
    expect(selected.map((p) => p.id)).toEqual(['henrique'])
  })

  it('exclui inativos mesmo admin/master', () => {
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

describe('createWelcomeEmailContent', () => {
  it('inclui login, e-mail e senha inicial', () => {
    const content = createWelcomeEmailContent({
      employee: {
        id: 'e1',
        email: 'pro@rom.test',
        name: 'Romeu',
        panel_role: 'staff',
        flow_role: 'solicitante',
        status: 'active',
        can_publish: false,
        professional_name: 'Romeu Felipe',
        avec_pro_id: null,
        companyIds: [],
        areaIds: [],
        modules: [],
        created_at: '',
      },
      initialPassword: 'senha-teste-12',
      loginUrl: 'https://rom-club.vercel.app/login',
    })
    expect(content.subject).toMatch(/intranet/i)
    expect(content.text).toContain('pro@rom.test')
    expect(content.text).toContain('senha-teste-12')
    expect(content.text).toContain('https://rom-club.vercel.app/login')
    expect(content.html).toContain('senha-teste-12')
  })
})
