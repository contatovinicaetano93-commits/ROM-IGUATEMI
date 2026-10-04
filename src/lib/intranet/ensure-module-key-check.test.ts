import { describe, expect, it } from 'vitest'
import { grantableModuleKeyCheckSql } from '@/lib/intranet/ensure-module-key-check'

describe('ensureGrantableModuleKeyCheck', () => {
  it('inclui ativacoes, folha, dashboard e checks_diario no CHECK', () => {
    const sql = grantableModuleKeyCheckSql()
    expect(sql).toContain("'ativacoes'")
    expect(sql).toContain("'folha'")
    expect(sql).toContain("'dashboard'")
    expect(sql).toContain("'pipeline'")
    expect(sql).toContain("'checks_diario'")
    expect(sql.startsWith('check (module_key in')).toBe(true)
  })
})
