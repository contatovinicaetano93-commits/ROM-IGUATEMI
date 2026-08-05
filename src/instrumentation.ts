import * as Sentry from '@sentry/nextjs'
import { scheduleBootMigrations, shouldRunBootMigrations } from './lib/boot-migrations'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')

    // Pipeline de schema — fire-and-forget no boot local; skip no Vercel (cron hot path).
    // Admin: POST /api/admin/migrations · deploy: npm run db:migrate
    if (shouldRunBootMigrations()) {
      scheduleBootMigrations()
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
