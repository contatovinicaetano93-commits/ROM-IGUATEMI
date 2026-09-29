import { describe, expect, it } from 'vitest'
import { grantableModuleKeyCheckSql } from '@/lib/intranet/ensure-module-key-check'

describe('ensureGrantableModuleKeyCheck', () => {
  it('inclui ativacoes e dashboard no CHECK', () => {
    const sql = grantableModuleKeyCheckSql()
    expect(sql).toContain("'ativacoes'")
    expect(sql).toContain("'dashboard'")
    expect(sql).toContain("'pipeline'")
  })
})
