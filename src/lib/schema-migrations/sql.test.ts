import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import type { RomPanelId } from '@/lib/brand'
import { assertSafeDbFileName, splitSqlStatements } from './sql'
import {
  listMigrationsForPanel,
  loadMigrationsManifest,
  MissingMigrationFileError,
} from './registry'

function panelOfThisRepo(): RomPanelId {
  const db = join(process.cwd(), 'db')
  if (existsSync(join(db, 'delta-telegram-staff-links.sql'))) return 'brasil'
  if (existsSync(join(db, 'delta-parity-brasil.sql'))) return 'iguatemi'
  return 'brasil'
}

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

describe('assertSafeDbFileName', () => {
  it('aceita nome simples .sql', () => {
    expect(assertSafeDbFileName('delta-finance.sql')).toBe('delta-finance.sql')
  })

  it('rejeita path traversal', () => {
    expect(() => assertSafeDbFileName('../schema.sql')).toThrow(/inválido/)
    expect(() => assertSafeDbFileName('db/schema.sql')).toThrow(/inválido/)
    expect(() => assertSafeDbFileName('schema.txt')).toThrow(/inválido/)
  })
})

describe('migrations registry', () => {
  it('carrega manifest e ids únicos', () => {
    const { migrations } = loadMigrationsManifest()
    const ids = migrations.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(migrations[0]?.id).toBe('001_base_schema')
  })

  it('painel deste repo tem todos os arquivos presentes', () => {
    const panel = panelOfThisRepo()
    const list = listMigrationsForPanel(panel)
    expect(list.length).toBeGreaterThan(0)
    for (const m of list) {
      expect(existsSync(join(process.cwd(), 'db', m.file))).toBe(true)
      expect(m.panels).toContain(panel)
    }
  })

  it('falha se arquivo do outro painel estiver ausente neste repo', () => {
    const panel = panelOfThisRepo()
    const other: RomPanelId = panel === 'brasil' ? 'iguatemi' : 'brasil'
    const otherFile =
      other === 'iguatemi' ? 'delta-parity-brasil.sql' : 'delta-telegram-staff-links.sql'
    if (existsSync(join(process.cwd(), 'db', otherFile))) return
    expect(() => listMigrationsForPanel(other)).toThrow(MissingMigrationFileError)
  })
})
