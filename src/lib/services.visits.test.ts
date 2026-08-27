import { describe, expect, it } from 'vitest'
import { SERVICE_VISIT_PAGE_SIZE } from '@/lib/services'

describe('service visit history', () => {
  it('página padrão do histórico é 30', () => {
    expect(SERVICE_VISIT_PAGE_SIZE).toBe(30)
  })
})
