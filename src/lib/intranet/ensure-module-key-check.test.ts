import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { grantableModuleKeyCheckSql } from '@/lib/intranet/ensure-module-key-check'
import { GRANTABLE_MODULES } from '@/lib/intranet/modules'

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

  it('delta-intranet-modules.sql aceita todos os GRANTABLE_MODULES', () => {
    const delta = readFileSync(join(process.cwd(), 'db/delta-intranet-modules.sql'), 'utf8')
    for (const mod of GRANTABLE_MODULES) {
      expect(delta).toContain(`'${mod.key}'`)
    }
  })
})
