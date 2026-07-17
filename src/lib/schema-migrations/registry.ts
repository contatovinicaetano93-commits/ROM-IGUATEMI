import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { RomPanelId } from '@/lib/brand'
import { getRomPanelId } from '@/lib/brand'

export interface SchemaMigrationDef {
  id: string
  file: string
  panels: RomPanelId[]
}

interface MigrationsManifest {
  migrations: SchemaMigrationDef[]
}

export function loadMigrationsManifest(cwd = process.cwd()): MigrationsManifest {
  const path = join(cwd, 'db', 'migrations.json')
  const raw = readFileSync(path, 'utf8')
  const parsed = JSON.parse(raw) as MigrationsManifest
  if (!parsed?.migrations || !Array.isArray(parsed.migrations)) {
    throw new Error('db/migrations.json inválido: falta array migrations')
  }
  return parsed
}

/** Migrations aplicáveis ao painel atual (ou ao informado), com arquivo presente. */
export function listMigrationsForPanel(
  panel: RomPanelId = getRomPanelId(),
  cwd = process.cwd(),
): SchemaMigrationDef[] {
  const { migrations } = loadMigrationsManifest(cwd)
  return migrations.filter((m) => {
    if (!m.panels.includes(panel)) return false
    return existsSync(join(cwd, 'db', m.file))
  })
}
