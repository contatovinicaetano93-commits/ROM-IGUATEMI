import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

describe('onboarding', () => {
  beforeEach(() => {
    sqlMock.mockReset()
  })

  describe('createPillar', () => {
    it('rejeita nome vazio', async () => {
      const { createPillar } = await import('@/lib/onboarding')
      await expect(createPillar('   ')).rejects.toThrow('Nome do pilar é obrigatório')
      expect(sqlMock).not.toHaveBeenCalled()
    })

    it('reaproveita pilar existente (case-insensitive) em vez de duplicar', async () => {
      const existing = { id: 'p1', name: 'Cultura & Padrão ROM', description: null, order_index: 0, active: true, created_at: 'now' }
      sqlMock.mockResolvedValueOnce([existing])

      const { createPillar } = await import('@/lib/onboarding')
      const result = await createPillar('cultura & padrão rom')

      expect(result).toBe(existing)
      expect(sqlMock).toHaveBeenCalledTimes(1)
    })

    it('cria pilar novo quando não existe', async () => {
      const created = { id: 'p2', name: 'Nova Trilha', description: null, order_index: 1, active: true, created_at: 'now' }
      sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([created])

      const { createPillar } = await import('@/lib/onboarding')
      const result = await createPillar('Nova Trilha')

      expect(result).toEqual(created)
      expect(sqlMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('createVideo', () => {
    it('rejeita título vazio', async () => {
      const { createVideo } = await import('@/lib/onboarding')
      await expect(
        createVideo({ pillarId: null, title: '  ', videoUrl: 'https://x.com/v.mp4' })
      ).rejects.toThrow('Título é obrigatório')
      expect(sqlMock).not.toHaveBeenCalled()
    })

    it('rejeita videoUrl vazia', async () => {
      const { createVideo } = await import('@/lib/onboarding')
      await expect(
        createVideo({ pillarId: null, title: 'Boas-vindas', videoUrl: '   ' })
      ).rejects.toThrow('URL do vídeo é obrigatória')
      expect(sqlMock).not.toHaveBeenCalled()
    })

    it('insere vídeo com campos opcionais nulos por padrão', async () => {
      const created = {
        id: 'v1',
        pillar_id: 'p1',
        title: 'Boas-vindas',
        description: null,
        video_url: 'https://x.com/v.mp4',
        thumbnail_url: null,
        duration_seconds: null,
        order_index: 0,
        active: true,
        created_at: 'now',
      }
      sqlMock.mockResolvedValueOnce([created])

      const { createVideo } = await import('@/lib/onboarding')
      const result = await createVideo({ pillarId: 'p1', title: '  Boas-vindas  ', videoUrl: '  https://x.com/v.mp4  ' })

      expect(result).toEqual(created)
    })
  })

  describe('deactivateVideo', () => {
    it('executa update sem lançar', async () => {
      sqlMock.mockResolvedValueOnce([])
      const { deactivateVideo } = await import('@/lib/onboarding')
      await expect(deactivateVideo('v1')).resolves.toBeUndefined()
      expect(sqlMock).toHaveBeenCalledTimes(1)
    })
  })
})
