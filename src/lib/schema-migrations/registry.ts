import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { RomPanelId } from '@/lib/brand'
import { getRomPanelId } from '@/lib/brand'
import { assertSafeDbFileName } from '@/lib/schema-migrations/sql'

export interface SchemaMigrationDef {
  id: string
  file: string
  panels: RomPanelId[]
}

interface MigrationsManifest {
  migrations: SchemaMigrationDef[]
}

export class MissingMigrationFileError extends Error {
  readonly files: string[]

  constructor(files: string[]) {
    super(`Migrations sem arquivo em db/: ${files.join(', ')}`)
    this.name = 'MissingMigrationFileError'
    this.files = files
  }
}

export function loadMigrationsManifest(cwd = process.cwd()): MigrationsManifest {
  const path = join(cwd, 'db', 'migrations.json')
  const raw = readFileSync(path, 'utf8')
  const parsed = JSON.parse(raw) as MigrationsManifest
  if (!parsed?.migrations || !Array.isArray(parsed.migrations)) {
    throw new Error('db/migrations.json inválido: falta array migrations')
  }

  const ids = new Set<string>()
  for (const m of parsed.migrations) {
    if (!m?.id || !m?.file || !Array.isArray(m.panels)) {
      throw new Error('db/migrations.json inválido: item sem id/file/panels')
    }
    assertSafeDbFileName(m.file)
    if (ids.has(m.id)) {
      throw new Error(`db/migrations.json: id duplicado ${m.id}`)
    }
    ids.add(m.id)
  }

  return parsed
}

/**
 * Migrations do painel. Falha se algum arquivo registrado estiver ausente
 * (não engole gap de deploy/bundle).
 */
export function listMigrationsForPanel(
  panel: RomPanelId = getRomPanelId(),
  cwd = process.cwd(),
): SchemaMigrationDef[] {
  const { migrations } = loadMigrationsManifest(cwd)
  const forPanel = migrations.filter((m) => m.panels.includes(panel))
  const missing = forPanel
    .map((m) => assertSafeDbFileName(m.file))
    .filter((file) => !existsSync(join(cwd, 'db', file)))

  if (missing.length > 0) {
    throw new MissingMigrationFileError(missing)
  }

  return forPanel.map((m) => ({ ...m, file: assertSafeDbFileName(m.file) }))
}
