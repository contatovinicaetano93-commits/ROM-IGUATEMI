import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

function queryTextOf(call: unknown[]): string {
  const strings = call[0] as TemplateStringsArray | undefined
  return Array.isArray(strings) ? strings.join('?') : String(strings ?? '')
}

describe('new contacts not in Avec', () => {
  beforeEach(() => {
    sqlMock.mockReset()
  })

  it('countNewContactsNotInAvec lê o count do dia', async () => {
    sqlMock.mockResolvedValueOnce([{ n: 3 }])
    const { countNewContactsNotInAvec } = await import('@/lib/contact-summary')
    await expect(countNewContactsNotInAvec({ day: '2026-08-01' })).resolves.toBe(3)
    expect(sqlMock).toHaveBeenCalledTimes(1)
  })

  it('countNewContactsNotInAvec trata ausência como zero', async () => {
    sqlMock.mockResolvedValueOnce([])
    const { countNewContactsNotInAvec } = await import('@/lib/contact-summary')
    await expect(countNewContactsNotInAvec({ day: '2026-08-01' })).resolves.toBe(0)
  })

  it('a janela é de NOVOS_WINDOW_DAYS dias, não de um dia só', async () => {
    sqlMock.mockResolvedValueOnce([{ n: 0 }])
    const { countNewContactsNotInAvec } = await import('@/lib/contact-summary')
    const { NOVOS_WINDOW_DAYS } = await import('@/lib/salon/constants')
    await countNewContactsNotInAvec({ day: '2026-08-01' })

    // O recuo é interpolado como valor: dia informado menos (janela - 1).
    // ::int no parâmetro é obrigatório: sem cast, Postgres resolve date - $n
    // como date - date → integer, e integer::timestamp quebra em runtime
    // ("cannot cast type integer to timestamp without time zone").
    const values = sqlMock.mock.calls[0]!.slice(1)
    const texto = (sqlMock.mock.calls[0]![0] as string[]).join('?')
    expect(values).toContain(NOVOS_WINDOW_DAYS - 1)
    expect(texto).toMatch(/\?::int/)
  })

  it('exclui quem já entrou no funil de cadência (não conta em Novos e Vencendo ao mesmo tempo)', async () => {
    sqlMock.mockResolvedValueOnce([{ n: 0 }])
    const { countNewContactsNotInAvec } = await import('@/lib/contact-summary')
    await countNewContactsNotInAvec({ day: '2026-08-01' })

    const texto = (sqlMock.mock.calls[0]![0] as string[]).join(' ')
    expect(texto).toContain('not exists')
    expect(texto).toContain('client_services')
    // Mesma condição que faz next_due existir em countUrgencyQueues.
    expect(texto).toContain('last_done_at is not null')
    expect(texto).toContain('cadence_days is not null')
  })

  it('listNewContactsNotInAvec usa um SELECT com count(*) over e zera urgência', async () => {
    sqlMock.mockResolvedValueOnce([
      {
        id: 'c1',
        name: 'Ana',
        phone: '+5511999999999',
        email: null,
        channel: 'whatsapp',
        source: 'atendente',
        status: 'novo',
        avec_client_id: null,
        notes: null,
        preferred_manicurist: null,
        preferred_hairstylist: null,
        first_contact_at: '2026-08-01T10:00:00Z',
        last_contact_at: '2026-08-01T10:00:00Z',
        created_at: '2026-08-01T10:00:00Z',
        anonymized_at: null,
        total: 2,
      },
    ])
    const { listNewContactsNotInAvec } = await import('@/lib/contact-summary')
    const result = await listNewContactsNotInAvec({ day: '2026-08-01', limit: 50 })
    expect(sqlMock).toHaveBeenCalledTimes(1)
    const sqlText = queryTextOf(sqlMock.mock.calls[0] as unknown[])
    expect(sqlText).toMatch(/count\(\*\)\s+over\(\)/i)
    expect(sqlText).not.toMatch(/select\s+\*\s+from\s+contacts/i)
    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'c1',
      name: 'Ana',
      overdue: 0,
      max_overdue_days: 0,
      due_soon: 0,
      scheduled_soon: 0,
      pending_actions: 0,
      urgency_score: 0,
      top_action: null,
      next_scheduled_at: null,
    })
    expect(result.items[0]).not.toHaveProperty('total')
  })

  it('listNewContactsNotInAvec retorna total 0 sem rows', async () => {
    sqlMock.mockResolvedValueOnce([])
    const { listNewContactsNotInAvec } = await import('@/lib/contact-summary')
    await expect(listNewContactsNotInAvec({ day: '2026-08-01' })).resolves.toEqual({
      items: [],
      total: 0,
    })
  })
})

describe('contatos sem serviço (fora do funil)', () => {
  beforeEach(() => {
    sqlMock.mockReset()
  })

  it('pega o lado de fora da janela — complementar a Novos, sem vão nem sobreposição', async () => {
    sqlMock.mockResolvedValueOnce([{ n: 0 }])
    const { countContactsWithoutServices } = await import('@/lib/contact-summary')
    const { NOVOS_WINDOW_DAYS } = await import('@/lib/salon/constants')
    await countContactsWithoutServices({ day: '2026-08-01' })

    const parts = sqlMock.mock.calls[0]![0] as string[]
    const texto = parts.join(' ')
    const values = sqlMock.mock.calls[0]!.slice(1)
    // Novos usa `created_at >=` o mesmo limite; aqui é `<`. Junto cobre tudo.
    expect(texto).toContain('created_at <')
    expect(texto).not.toContain('created_at >=')
    expect(values).toContain(NOVOS_WINDOW_DAYS - 1)
    // Mesmo cast ::int que Novos — evita date-$n ambíguo no Postgres.
    expect(parts.join('?')).toMatch(/\?::int/)
  })

  it('recorta por ausência de next_due, não por "nunca fez serviço"', async () => {
    sqlMock.mockResolvedValueOnce([{ n: 0 }])
    const { countContactsWithoutServices } = await import('@/lib/contact-summary')
    await countContactsWithoutServices({ day: '2026-08-01' })

    // Serviço sem cadência também não é pego por Vencendo/Atrasados: se o
    // critério fosse "sem serviço", essa pessoa escaparia das duas listas.
    const texto = (sqlMock.mock.calls[0]![0] as string[]).join(' ')
    expect(texto).toContain('last_done_at is not null')
    expect(texto).toContain('cadence_days is not null')
  })

  it('não lista quem já saiu do ciclo (perdido) nem carga em massa (importado)', async () => {
    sqlMock.mockResolvedValueOnce([{ n: 0 }])
    const { countContactsWithoutServices } = await import('@/lib/contact-summary')
    await countContactsWithoutServices({ day: '2026-08-01' })

    const texto = (sqlMock.mock.calls[0]![0] as string[]).join(' ')
    expect(texto).toContain("status <> 'perdido'")
    expect(texto).toContain("status <> 'importado'")
  })
})
