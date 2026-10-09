import { describe, expect, it } from 'vitest'
import { flowDirectoryForViewer, toFlowPerson } from '@/lib/flow/directory'
import type { User } from '@/lib/flow/types'

function user(partial: Partial<User> & Pick<User, 'id' | 'name' | 'email' | 'role'>): User {
  return {
    status: 'active',
    companyIds: ['c1'],
    areaIds: ['financeiro'],
    created: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('toFlowPerson', () => {
  it('keeps only id, name and email', () => {
    expect(
      toFlowPerson(
        user({
          id: 'u1',
          name: 'Ana',
          email: 'ana@rom.com',
          role: 'admin_financeiro',
        }),
      ),
    ).toEqual({ id: 'u1', name: 'Ana', email: 'ana@rom.com' })
  })
})

describe('flowDirectoryForViewer', () => {
  const ana = user({
    id: 'u1',
    name: 'Ana',
    email: 'ana@rom.com',
    role: 'admin_financeiro',
    companyIds: ['br'],
    areaIds: ['financeiro', 'compras'],
  })
  const bob = user({
    id: 'u2',
    name: 'Bob',
    email: 'bob@rom.com',
    role: 'solicitante',
    companyIds: ['br'],
    areaIds: ['rh'],
  })
  const master = user({
    id: 'u3',
    name: 'Master',
    email: 'master@rom.com',
    role: 'master',
    companyIds: ['br', 'ig'],
    areaIds: ['financeiro', 'manutencao', 'compras', 'rh'],
  })

  it('returns full users for flow master', () => {
    const { people, users } = flowDirectoryForViewer(master, [ana, bob, master])
    expect(people).toHaveLength(3)
    expect(users).toEqual([ana, bob, master])
    expect(users.find((item) => item.id === 'u1')?.areaIds).toEqual(['financeiro', 'compras'])
  })

  it('redacts ACL fields for non-master while keeping names for filas', () => {
    const { people, users } = flowDirectoryForViewer(bob, [ana, bob, master])
    expect(people.map((p) => p.id).sort()).toEqual(['u1', 'u2', 'u3'])
    expect(users.find((item) => item.id === 'u2')).toEqual(bob)
    const redactedAna = users.find((item) => item.id === 'u1')
    expect(redactedAna).toMatchObject({
      id: 'u1',
      name: 'Ana',
      email: 'ana@rom.com',
      role: 'solicitante',
      status: 'active',
      companyIds: [],
      areaIds: [],
      created: '',
    })
    const redactedMaster = users.find((item) => item.id === 'u3')
    expect(redactedMaster?.companyIds).toEqual([])
    expect(redactedMaster?.areaIds).toEqual([])
    expect(redactedMaster?.role).toBe('solicitante')
  })

  it('prepends viewer when missing from employee list', () => {
    const { users } = flowDirectoryForViewer(bob, [ana])
    expect(users[0]?.id).toBe('u2')
    expect(users.map((item) => item.id)).toEqual(['u2', 'u1'])
  })
})
