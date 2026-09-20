import { describe, expect, it } from 'vitest'
import { intranetAuditHref, intranetAuditLabel } from '@/lib/intranet/audit-label'

describe('intranetAuditLabel', () => {
  it('reusa o rótulo do Flow e trata publicação', () => {
    expect(intranetAuditLabel('CREATE_EXPENSE', 'flow:abc')).toBe('Criou solicitação')
    expect(intranetAuditLabel('PUBLISH', 'cms:1')).toBe('Publicou na intranet')
    expect(intranetAuditLabel('UPDATE_USER', 'flow:user:x')).toBe('Atualizou acesso de usuário')
    expect(intranetAuditLabel('CREATE_USER', 'flow:user:x')).toBe('Criou acesso de usuário')
  })

  it('traduz aliases que o Flow grava com action.toUpperCase()', () => {
    expect(intranetAuditLabel('APPROVE', 'flow:abc')).toBe('Aprovou solicitação')
    expect(intranetAuditLabel('REJECT', 'flow:abc')).toBe('Recusou solicitação')
    expect(intranetAuditLabel('DOCS', 'flow:abc')).toBe('Devolveu para ajustes')
    expect(intranetAuditLabel('PROGRESS', 'flow:abc')).toBe('Colocou em andamento')
    expect(intranetAuditLabel('COMPLETE', 'flow:abc')).toBe('Finalizou solicitação')
    expect(intranetAuditLabel('CANCEL', 'flow:abc')).toBe('Cancelou solicitação')
    expect(intranetAuditLabel('RESUBMIT', 'flow:abc')).toBe('Atualizou solicitação')
    expect(intranetAuditLabel('ATTACH_PROOF', 'flow:abc')).toBe('Anexou recibo de pagamento')
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
