import { describe, expect, it } from 'vitest'
import {
  checksTeamFromCargoPackage,
  isChecksDono,
  resolveChecksAccess,
} from '@/lib/checks-diario/access'
import type { AuthSession } from '@/lib/auth'
import type { EmployeeRecord } from '@/lib/employees'

function session(
  partial: Partial<AuthSession> & { role: AuthSession['role'] },
): AuthSession {
  return {
    user: 'test',
    displayName: 'Test',
    employeeId: 'e1',
    modules: [],
    canPublish: false,
    can_view_revenue: false,
    professionalName: null,
    ...partial,
  }
}

describe('checksTeamFromCargoPackage', () => {
  it('mapeia leads e membros das três equipes', () => {
    expect(checksTeamFromCargoPackage('ops_financeiro')).toEqual({
      team: 'ops_fin',
      is_lead: true,
    })
    expect(checksTeamFromCargoPackage('func_financeiro')).toEqual({
      team: 'ops_fin',
      is_lead: false,
    })
    expect(checksTeamFromCargoPackage('gestor_unidade')).toEqual({
      team: 'gestor_unidade',
      is_lead: true,
    })
    expect(checksTeamFromCargoPackage('limpeza')).toEqual({
      team: 'gestor_unidade',
      is_lead: false,
    })
    expect(checksTeamFromCargoPackage('recepcao')).toEqual({
      team: 'gestor_unidade',
      is_lead: false,
    })
    expect(checksTeamFromCargoPackage('rh')).toEqual({ team: 'rh', is_lead: true })
    expect(checksTeamFromCargoPackage('equipe_rh')).toEqual({
      team: 'rh',
      is_lead: false,
    })
    expect(checksTeamFromCargoPackage('profissional')).toBeNull()
  })
})

describe('resolveChecksAccess', () => {
  it('admin edita tudo; lead edita a equipe; membro só lê', () => {
    expect(
      resolveChecksAccess({
        session: session({ role: 'admin' }),
        employee: null,
        membership: null,
      }),
    ).toMatchObject({ canEdit: true, scopedTeam: null, isAdminMaster: true })

    expect(
      resolveChecksAccess({
        session: session({ role: 'staff' }),
        employee: null,
        membership: { team: 'gestor_unidade', is_lead: true },
      }),
    ).toMatchObject({
      canEdit: true,
      scopedTeam: 'gestor_unidade',
      isAdminMaster: false,
    })

    expect(
      resolveChecksAccess({
        session: session({ role: 'staff' }),
        employee: null,
        membership: { team: 'gestor_unidade', is_lead: false },
      }),
    ).toMatchObject({ canEdit: false, scopedTeam: 'gestor_unidade' })
  })

  it('reconhece dono como leitura', () => {
    const donoEmp = {
      id: 'd1',
      panel_role: 'financeiro',
      flow_role: 'solicitante',
      modules: ['dashboard', 'checks_diario'],
      areaIds: [],
    } as unknown as EmployeeRecord

    expect(isChecksDono(session({ role: 'financeiro' }), donoEmp)).toBe(true)
    expect(
      resolveChecksAccess({
        session: session({ role: 'financeiro' }),
        employee: donoEmp,
        membership: null,
      }),
    ).toMatchObject({ canEdit: false, isDono: true, scopedTeam: null })
  })
})
