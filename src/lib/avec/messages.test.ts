import { describe, expect, it } from 'vitest'
import {
  AVEC_TOKEN_EXPIRED_MESSAGE,
  deriveAvecSyncUi,
  formatAvecErrorList,
  formatAvecUserMessage,
  hardAvecSyncWarnings,
  isAvecTokenExpiredError,
  isSoftAvecPeripheralError,
  isSoftAvecSyncWarning,
  isSoftOnlyPartialAvecRun,
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

  it('não marca incompleto quando partial só por P1 0107 timeout', () => {
    const ui = deriveAvecSyncUi({
      configured: true,
      now,
      last: {
        status: 'partial',
        created_at: '2026-07-25T11:50:00.000Z',
        error: 'abandoned_partial_timeout',
        stats: {
          errors: ['P1 0107: The operation was aborted due to timeout'],
          warnings: ['Catálogo 0004 adiado — já sincronizado nas últimas 20h'],
        },
      },
    })
    expect(ui.status).toBe('ok')
    expect(ui.tone).toBe('success')
  })
})

describe('isSoftAvecSyncWarning', () => {
  it('trata truncamento de catálogo/saldo/alertas como soft; core e movimentos como hard', () => {
    expect(
      isSoftAvecSyncWarning(
        'Relatório 0223 (0223) atingiu o limite de 400 páginas (100000 linhas, 250/página). Pode haver dados não sincronizados — aumente AVEC_SYNC_MAX_PAGES na Vercel.',
      ),
    ).toBe(true)
    expect(
      isSoftAvecSyncWarning(
        'Relatório movimentos de estoque (0044) atingiu o limite de 40 páginas (10000 linhas, 250/página).',
      ),
    ).toBe(false)
    expect(
      isSoftAvecSyncWarning(
        'Relatório atendimentos (0002) atingiu o limite de 80 páginas (20000 linhas, 250/página). Pode haver dados não sincronizados — aumente AVEC_SYNC_MAX_PAGES na Vercel.',
      ),
    ).toBe(false)
    expect(
      isSoftAvecSyncWarning(
        'Relatório agendamentos (0051) atingiu o limite de 80 páginas (20000 linhas, 250/página).',
      ),
    ).toBe(false)
    expect(isSoftAvecSyncWarning('AVEC_UNIT_ID vazio — sync sem filtro')).toBe(true)
    expect(isSoftAvecSyncWarning('agenda: 3 agendamento(s) órfão(s) removido(s) do dia')).toBe(true)
    expect(isSoftAvecSyncWarning('Catálogo 0004 adiado — já sincronizado nas últimas 20h')).toBe(true)
    expect(isSoftAvecSyncWarning('P1 0107 truncado: 5000 linhas (teto de paginação) — UI deve mostrar 5000+')).toBe(true)
    expect(
      isSoftAvecSyncWarning(
        'P1 0107: timeout/abort — reativação 90d adiada (The operation was aborted due to timeout)',
      ),
    ).toBe(true)
    expect(isSoftAvecSyncWarning('TM 0223: nenhum tempo cadastrado')).toBe(true)
    expect(isSoftAvecSyncWarning('heal importado: timeout no update')).toBe(true)
    expect(isSoftAvecSyncWarning('snapshot 0004: disk full')).toBe(true)
    expect(isSoftAvecSyncWarning('Falha ao gravar snapshot')).toBe(false)
    expect(
      isSoftAvecPeripheralError('P1 0107: The operation was aborted due to timeout'),
    ).toBe(true)
    expect(
      isSoftOnlyPartialAvecRun({
        status: 'partial',
        created_at: '2026-07-30T22:36:33.000Z',
        error: 'abandoned_partial_timeout',
        stats: {
          errors: ['P1 0107: The operation was aborted due to timeout'],
          warnings: ['Catálogo 0004 adiado — já sincronizado nas últimas 20h'],
        },
      }),
    ).toBe(true)
    expect(
      hardAvecSyncWarnings([
        'AVEC_UNIT_ID vazio — sync sem filtro',
        'heal importado: falha',
        'snapshot 0051: erro',
        'Falha ao gravar snapshot',
        'Relatório movimentos de estoque (0044) atingiu o limite de 40 páginas',
        'Relatório atendimentos (0002) atingiu o limite de 80 páginas',
      ]),
    ).toEqual([
      'Falha ao gravar snapshot',
      'Relatório movimentos de estoque (0044) atingiu o limite de 40 páginas',
      'Relatório atendimentos (0002) atingiu o limite de 80 páginas',
    ])
  })
})
