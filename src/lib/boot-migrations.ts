import { Logger } from './logger'

const logger = new Logger('Boot')

/**
 * Boot migrations on Vercel serverless cold starts compete with cron handlers
 * for the single postgres.js connection (max: 1) and can surface statement_timeout
 * as Unhandled Rejection noise (director-visits, avec sync). On Vercel, run schema
 * via POST /api/admin/migrations or `npm run db:migrate` on deploy instead.
 */
export function shouldRunBootMigrations(): boolean {
  if (!process.env.DATABASE_URL) return false
  if (process.env.ROM_SKIP_BOOT_MIGRATIONS === '1') return false
  if (process.env.VERCEL === '1') return false
  return true
}

/** Fire-and-forget; never throws or leaves an unhandled rejection. */
export function scheduleBootMigrations(): void {
  void (async () => {
    try {
      const { runPendingMigrations } = await import('./migrations')
      const summary = await runPendingMigrations()
      if (summary.lockBusy) {
        logger.info('Boot migrations skipped — lock busy', { failed: summary.failed })
      } else if (summary.failed) {
        logger.error('Boot migrations failed', { failed: summary.failed })
      } else if (summary.applied.length > 0) {
        logger.info('Boot migrations applied', { applied: summary.applied })
      }
    } catch (e) {
      logger.error('Boot migrations error', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  })().catch(() => {
    // Last-resort swallow — cron cold start must not crash on migration timeout.
  })
}
