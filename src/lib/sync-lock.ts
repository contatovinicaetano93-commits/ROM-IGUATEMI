import { randomUUID } from 'crypto'
import { getSql } from '@/lib/db'

/** Chaves estáveis — fast e full compartilham o mesmo lock do domínio. */
export const SYNC_LOCK_KEYS = {
  avec: 'avec_sync',
  stock: 'stock_sync',
} as const

export type SyncLockKey = (typeof SYNC_LOCK_KEYS)[keyof typeof SYNC_LOCK_KEYS]

export class SyncLockBusyError extends Error {
  readonly key: string
  readonly holder: string | null
  readonly expiresAt: string | null

  constructor(key: string, holder: string | null, expiresAt: string | null) {
    super(`Sync "${key}" já em execução${holder ? ` (owner=${holder})` : ''}`)
    this.name = 'SyncLockBusyError'
    this.key = key
    this.holder = holder
    this.expiresAt = expiresAt
  }
}

export function isSyncLockBusyError(e: unknown): e is SyncLockBusyError {
  return e instanceof SyncLockBusyError || (e instanceof Error && e.name === 'SyncLockBusyError')
}

let ensurePromise: Promise<void> | null = null

async function ensureSyncLocksTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const sql = getSql()
      await sql`
        create table if not exists sync_locks (
          key text primary key,
          owner text not null,
          locked_at timestamptz not null default now(),
          expires_at timestamptz not null
        )
      `
      await sql`create index if not exists sync_locks_expires_at_idx on sync_locks (expires_at)`
    })().catch((e) => {
      ensurePromise = null
      throw e
    })
  }
  return ensurePromise
}

async function tryAcquire(key: string, owner: string, ttlMs: number): Promise<boolean> {
  const sql = getSql()
  const ttlSeconds = Math.max(30, Math.ceil(ttlMs / 1000))
  const rows = (await sql`
    insert into sync_locks (key, owner, locked_at, expires_at)
    values (${key}, ${owner}, now(), now() + (${ttlSeconds} * interval '1 second'))
    on conflict (key) do update set
      owner = excluded.owner,
      locked_at = now(),
      expires_at = excluded.expires_at
    where sync_locks.expires_at < now()
    returning key
  `) as { key: string }[]
  return rows.length > 0
}

async function getHolder(key: string): Promise<{ owner: string; expires_at: string } | null> {
  const sql = getSql()
  const rows = (await sql`
    select owner, expires_at
    from sync_locks
    where key = ${key} and expires_at >= now()
    limit 1
  `) as { owner: string; expires_at: string }[]
  return rows[0] ?? null
}

async function release(key: string, owner: string): Promise<void> {
  const sql = getSql()
  await sql`delete from sync_locks where key = ${key} and owner = ${owner}`
}

/**
 * Lease distribuído via Postgres — funciona com Neon serverless (HTTP).
 * TTL cobre maxDuration do sync; release no finally mesmo se falhar.
 */
export async function withSyncLock<T>(
  key: SyncLockKey | string,
  fn: () => Promise<T>,
  opts?: { ttlMs?: number; owner?: string },
): Promise<T> {
  await ensureSyncLocksTable()

  const ttlMs = opts?.ttlMs ?? 6 * 60 * 1000
  const owner = opts?.owner ?? `run-${randomUUID().slice(0, 8)}`

  const acquired = await tryAcquire(key, owner, ttlMs)
  if (!acquired) {
    const holder = await getHolder(key)
    throw new SyncLockBusyError(key, holder?.owner ?? null, holder?.expires_at ?? null)
  }

  try {
    return await fn()
  } finally {
    await release(key, owner).catch((e) => {
      console.error('[sync-lock] release failed', key, owner, e instanceof Error ? e.message : e)
    })
  }
}
