import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()
const listTodayScheduleForProfessionalMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

vi.mock('@/lib/services', () => ({
  listTodayScheduleForProfessional: listTodayScheduleForProfessionalMock,
}))

describe('telegram staff-schedule', () => {
  beforeEach(() => {
    sqlMock.mockReset()
    listTodayScheduleForProfessionalMock.mockReset()
  })

  describe('getLinkedProfessional', () => {
    it('retorna o nome do profissional vinculado ao chat_id', async () => {
      sqlMock.mockResolvedValueOnce([{ professional_name: 'VC' }])
      const { getLinkedProfessional } = await import('@/lib/telegram/staff-schedule')
      expect(await getLinkedProfessional('5508181160')).toBe('VC')
    })

    it('retorna null quando o chat_id não está vinculado', async () => {
      sqlMock.mockResolvedValueOnce([])
      const { getLinkedProfessional } = await import('@/lib/telegram/staff-schedule')
      expect(await getLinkedProfessional('0000')).toBeNull()
    })
  })

  describe('formatTodayAgenda', () => {
    it('avisa quando não há atendimentos hoje', async () => {
      listTodayScheduleForProfessionalMock.mockResolvedValueOnce([])
      const { formatTodayAgenda } = await import('@/lib/telegram/staff-schedule')
      const text = await formatTodayAgenda('VC')
      expect(text).toContain('Sem atendimentos agendados para hoje')
    })

    it('lista os atendimentos do dia com horário e cliente', async () => {
      listTodayScheduleForProfessionalMock.mockResolvedValueOnce([
        {
          id: 's1',
          contact_name: 'Maria Silva',
          name: 'Corte',
          category: 'corte',
          scheduled_at: '2026-07-13T13:00:00.000Z',
        },
      ])
      const { formatTodayAgenda } = await import('@/lib/telegram/staff-schedule')
      const text = await formatTodayAgenda('VC')
      expect(text).toContain('Agenda de hoje — VC')
      expect(text).toContain('Maria Silva')
      expect(text).toContain('Corte')
    })
  })
})
