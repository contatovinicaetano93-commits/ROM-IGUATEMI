import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  serverExternalPackages: ['postgres'],
  // Garante que o overlay secrets/database-url.txt entre no bundle serverless.
  outputFileTracingIncludes: {
    '/*': ['./secrets/**/*'],
    '/api/*': ['./secrets/**/*'],
    '/api/**/*': ['./secrets/**/*'],
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
