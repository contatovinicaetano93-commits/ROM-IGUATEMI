import * as Sentry from '@sentry/nextjs'
import { Logger } from './lib/logger'

const logger = new Logger('Boot')

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
          logger.error('Boot migrations failed', { failed: summary.failed })
        } else if (summary.applied.length > 0) {
          logger.info('Boot migrations applied', { applied: summary.applied })
        }
      } catch (e) {
        logger.error('Boot migrations error', { error: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
