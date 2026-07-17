import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')

    // Pipeline de schema — aplica deltas pendentes no boot (idempotente).
    // Falha não derruba o processo; admin pode reexecutar em POST /api/admin/migrations.
    if (process.env.DATABASE_URL && process.env.ROM_SKIP_BOOT_MIGRATIONS !== '1') {
      try {
        const { runPendingMigrations } = await import('./lib/migrations')
        const summary = await runPendingMigrations()
        if (summary.failed) {
          console.error('[migrations] boot falhou:', summary.failed)
        } else if (summary.applied.length > 0) {
          console.log('[migrations] boot aplicou:', summary.applied.join(', '))
        }
      } catch (e) {
        console.error('[migrations] boot erro:', e instanceof Error ? e.message : e)
      }
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
