import { describe, expect, it } from 'vitest'
import {
  AVEC_TOKEN_EXPIRED_MESSAGE,
  classifyAvecSyncOutcome,
  deriveAvecSyncUi,
  formatAvecErrorList,
  formatAvecUserMessage,
  isAvecTokenExpiredError,
} from '@/lib/avec/messages'

describe('isAvecTokenExpiredError', () => {
  it('detecta HTTP 401', () => {
    expect(isAvecTokenExpiredError('Avec 0004 HTTP 401: {"message":"Unauthorized"}')).toBe(true)
  })

  it('detecta mensagem já formatada', () => {
    expect(isAvecTokenExpiredError(AVEC_TOKEN_EXPIRED_MESSAGE)).toBe(true)
  })

  it('ignora outros erros', () => {
    expect(isAvecTokenExpiredError('Avec 0004 HTTP 500: timeout')).toBe(false)
    expect(isAvecTokenExpiredError(null)).toBe(false)
  })
})

describe('formatAvecUserMessage', () => {
  it('mapeia 401 + JSON cru para cópia PT', () => {
    expect(formatAvecUserMessage('Avec 0149 HTTP 401: {"message":"Unauthorized"}')).toBe(
      AVEC_TOKEN_EXPIRED_MESSAGE,
    )
  })

  it('resume HTTP com JSON sem ser 401', () => {
    const msg = formatAvecUserMessage('Avec 0004 HTTP 403: {"error":"forbidden","code":403}')
    expect(msg).toContain('HTTP 403')
    expect(msg).not.toContain('{')
  })

  it('preserva mensagens já legíveis', () => {
    expect(formatAvecUserMessage('Timeout na sincronização')).toBe('Timeout na sincronização')
  })
})

describe('formatAvecErrorList', () => {
  it('mapeia lista com 401', () => {
    expect(formatAvecErrorList(['Avec 0046 HTTP 401: {}', 'outro'])).toEqual([
      AVEC_TOKEN_EXPIRED_MESSAGE,
      'outro',
    ])
  })
})

describe('deriveAvecSyncUi', () => {
  const now = Date.parse('2026-07-25T12:00:00.000Z')

  it('marca off quando não configurado', () => {
    const ui = deriveAvecSyncUi({ configured: false, last: null, now })
    expect(ui.status).toBe('off')
  })

  it('marca error + token quando last.error é 401', () => {
    const ui = deriveAvecSyncUi({
      configured: true,
      now,
      last: {
        status: 'error',
        created_at: '2026-07-25T11:55:00.000Z',
        error: 'Avec 0004 HTTP 401: {"message":"Unauthorized"}',
      },
    })
    expect(ui.status).toBe('error')
    expect(ui.label).toBe('Token Avec expirado')
    expect(ui.detail).toBe(AVEC_TOKEN_EXPIRED_MESSAGE)
    expect(ui.tone).toBe('danger')
  })

  it('marca stale quando ok antigo', () => {
    const ui = deriveAvecSyncUi({
      configured: true,
      now,
      last: {
        status: 'ok',
        created_at: '2026-07-25T08:00:00.000Z',
        error: null,
      },
    })
    expect(ui.status).toBe('stale')
    expect(ui.tone).toBe('gold')
  })

  it('expõe warnings de truncamento', () => {
    const ui = deriveAvecSyncUi({
      configured: true,
      now,
      last: {
        status: 'partial',
        created_at: '2026-07-25T11:50:00.000Z',
        error: null,
        stats: {
          warnings: ['Relatório alertas de estoque (0046) atingiu o limite de 200 páginas'],
        },
      },
    })
    expect(ui.status).toBe('partial')
    expect(ui.warnings).toHaveLength(1)
    expect(ui.warnings[0]).toContain('0046')
  })
})

describe('classifyAvecSyncOutcome', () => {
  it('marca ok quando core KPI veio e só há ruído de telefone', () => {
    const out = classifyAvecSyncOutcome({
      errors: [
        'agendamento: duplicate key value violates unique constraint "contacts_phone_idx"',
      ],
      warnings: ['AVEC_UNIT_ID vazio — sync sem filtro de site'],
      revenue_rows: 1,
      cancellation_rows: 10,
      appointments_synced: 0,
    })
    expect(out.status).toBe('ok')
    expect(out.errors).toHaveLength(0)
    expect(out.warnings.some((w) => /conflito de contato/i.test(w))).toBe(true)
  })

  it('marca error quando não há dado core', () => {
    const out = classifyAvecSyncOutcome({
      errors: ['Avec 0051 HTTP 403'],
      warnings: [],
      revenue_rows: 0,
      appointments_synced: 0,
    })
    expect(out.status).toBe('error')
  })

  it('marca partial com erro hard mas core OK', () => {
    const out = classifyAvecSyncOutcome({
      errors: ['Avec 0223 HTTP 500'],
      warnings: [],
      revenue_rows: 1,
    })
    expect(out.status).toBe('partial')
  })
})
