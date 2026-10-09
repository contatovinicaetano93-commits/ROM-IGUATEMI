import type { FlowPerson, User } from '@/lib/flow/types'
import { canManageUsers } from '@/lib/flow/workflow'

/** Directory entry for name/email lookup without ACL fields. */
export function toFlowPerson(person: Pick<User, 'id' | 'name' | 'email'>): FlowPerson {
  return { id: person.id, name: person.name, email: person.email }
}

/**
 * Full Flow user list is master-only (Gestão de usuários / auditoria).
 * Everyone else gets id/name/email so solicitante names still resolve in filas.
 */
export function flowDirectoryForViewer(
  viewer: User,
  employeesAsUsers: User[],
): { people: FlowPerson[]; users: User[] } {
  const pool = [...employeesAsUsers]
  if (!pool.some((item) => item.id === viewer.id)) {
    pool.unshift(viewer)
  }
  const people = pool.map(toFlowPerson)
  if (canManageUsers(viewer.role)) {
    return { people, users: pool }
  }
  return {
    people,
    users: people.map((person) =>
      person.id === viewer.id
        ? viewer
        : {
            id: person.id,
            name: person.name,
            email: person.email,
            role: 'solicitante',
            status: 'active',
            companyIds: [],
            areaIds: [],
            created: '',
          },
    ),
  }
}
