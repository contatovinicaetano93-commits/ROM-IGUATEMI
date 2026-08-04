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
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/array/:path*',
        destination: 'https://us-assets.i.posthog.com/array/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ]
  },
  skipTrailingSlashRedirect: true,
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
