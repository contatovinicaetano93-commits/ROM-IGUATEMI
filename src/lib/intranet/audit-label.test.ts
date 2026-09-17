import { describe, expect, it } from 'vitest'
import { intranetAuditHref, intranetAuditLabel } from '@/lib/intranet/audit-label'

describe('intranetAuditLabel', () => {
  it('reusa o rótulo do Flow e trata publicação', () => {
    expect(intranetAuditLabel('CREATE_EXPENSE', 'flow:abc')).toBe('Criou solicitação')
    expect(intranetAuditLabel('PUBLISH', 'cms:1')).toBe('Publicou na intranet')
    expect(intranetAuditLabel('UPDATE_USER', 'flow:user:x')).toBe('Atualizou acesso de usuário')
  })
})

describe('intranetAuditHref', () => {
  it('aponta para o sistema certo', () => {
    expect(intranetAuditHref('flow:exp-1')).toBe('/flow/exp-1')
    expect(intranetAuditHref('flow:user:u1')).toBe('/pessoas')
    expect(intranetAuditHref('cms:p1')).toBe('/empresa')
    expect(intranetAuditHref('other')).toBeNull()
  })
})
