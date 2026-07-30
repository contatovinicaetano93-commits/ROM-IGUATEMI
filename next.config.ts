import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  serverExternalPackages: ['postgres'],
  // secrets/ overlay + db/*.sql + migrations.json no bundle serverless (Vercel).
  outputFileTracingIncludes: {
    '/*': ['./secrets/**/*', './db/**/*'],
    '/api/*': ['./secrets/**/*', './db/**/*'],
    '/api/**/*': ['./secrets/**/*', './db/**/*'],
  },
}

export default withSentryConfig(nextConfig, {
  org: 'imobi-hl',
  project: 'rom-iguatemi',
  silent: !process.env.CI,
  // Source maps só com SENTRY_AUTH_TOKEN na Vercel/CI
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
})
