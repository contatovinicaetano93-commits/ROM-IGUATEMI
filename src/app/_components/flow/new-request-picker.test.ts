import { describe, expect, it, vi } from 'vitest'
import { newRequestOptions, resolveNewRequestAction } from '@/app/_components/flow/new-request-picker'
import type { User } from '@/lib/flow/types'

function user(partial: Partial<User> & Pick<User, 'role' | 'areaIds'>): User {
  return {
    id: 'u1',
    name: 'Teste',
    email: 't@rom.test',
    role: partial.role,
    companyIds: ['c1'],
    areaIds: partial.areaIds,
    active: true,
    ...partial,
  }
}

describe('newRequestOptions / resolveNewRequestAction', () => {
  it('lista só as áreas liberadas', () => {
    const options = newRequestOptions(user({ role: 'solicitante', areaIds: ['compras', 'rh'] }))
    expect(options.map((item) => item.area)).toEqual(['compras', 'rh'])
    expect(options.map((item) => item.screen)).toEqual(['new-compras', 'new-rh'])
  })

  it('navega direto quando há uma única área', () => {
    const onNavigate = vi.fn()
    const openPicker = vi.fn()
    resolveNewRequestAction(user({ role: 'solicitante', areaIds: ['manutencao'] }), onNavigate, openPicker)
    expect(onNavigate).toHaveBeenCalledWith('new-manutencao')
    expect(openPicker).not.toHaveBeenCalled()
  })

  it('abre picker quando há várias filas', () => {
    const onNavigate = vi.fn()
    const openPicker = vi.fn()
    resolveNewRequestAction(
      user({ role: 'master', areaIds: ['financeiro', 'manutencao', 'compras', 'rh'] }),
      onNavigate,
      openPicker,
    )
    expect(openPicker).toHaveBeenCalledOnce()
    expect(onNavigate).not.toHaveBeenCalled()
  })
})
