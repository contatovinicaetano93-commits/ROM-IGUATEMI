import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')

    // Pipeline de schema — fire-and-forget no boot local; skip no Vercel (cron hot path).
    // Admin: POST /api/admin/migrations · deploy: npm run db:migrate
    // Dynamic import keeps migrations/db/fs out of Edge instrumentation + middleware bundle.
    const { scheduleBootMigrations, shouldRunBootMigrations } = await import('./lib/boot-migrations')
    if (shouldRunBootMigrations()) {
      scheduleBootMigrations()
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
