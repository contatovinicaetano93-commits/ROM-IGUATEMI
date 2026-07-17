import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { splitSqlStatements } from './sql'
import { listMigrationsForPanel, loadMigrationsManifest } from './registry'

describe('splitSqlStatements', () => {
  it('remove comentários e parte por ponto-e-vírgula', () => {
    const sql = `
-- cabeçalho
create table if not exists foo (id int);
-- outro
create index if not exists foo_idx on foo (id);
`
    expect(splitSqlStatements(sql)).toEqual([
      'create table if not exists foo (id int)',
      'create index if not exists foo_idx on foo (id)',
    ])
  })

  it('não corta -- dentro de string', () => {
    const sql = `insert into t (n) values ('a--b');`
    expect(splitSqlStatements(sql)).toEqual([`insert into t (n) values ('a--b')`])
  })
})

describe('migrations registry', () => {
  it('carrega manifest e ids únicos', () => {
    const { migrations } = loadMigrationsManifest()
    const ids = migrations.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(migrations[0]?.id).toBe('001_base_schema')
  })

  it('só lista migrations com arquivo presente no painel', () => {
    for (const panel of ['brasil', 'iguatemi'] as const) {
      const list = listMigrationsForPanel(panel)
      expect(list.length).toBeGreaterThan(0)
      for (const m of list) {
        expect(existsSync(join(process.cwd(), 'db', m.file))).toBe(true)
        expect(m.panels).toContain(panel)
      }
    }
  })

  it('site-specific: telegram (brasil) vs parity (iguatemi)', () => {
    const telegram = join(process.cwd(), 'db', 'delta-telegram-staff-links.sql')
    const parity = join(process.cwd(), 'db', 'delta-parity-brasil.sql')

    const brasilIds = listMigrationsForPanel('brasil').map((m) => m.id)
    const iguatemiIds = listMigrationsForPanel('iguatemi').map((m) => m.id)

    if (existsSync(telegram)) {
      expect(brasilIds).toContain('017_telegram_staff_links')
    }
    if (existsSync(parity)) {
      expect(iguatemiIds).toContain('017_parity_brasil')
    }

    expect(brasilIds).not.toContain('017_parity_brasil')
    expect(iguatemiIds).not.toContain('017_telegram_staff_links')
  })
})
