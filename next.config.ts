import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  // Next 16.4 defaults experimental.useTypeScriptCli=true (full tsc).
  // Keep the previous API checker so *.test.ts noise does not fail CI builds.
  experimental: {
    useTypeScriptCli: false,
  },
  serverExternalPackages: ['postgres', 'imapflow', 'mailparser', 'pdf-parse'],
  // Garante db/*.sql + migrations.json no bundle serverless (Vercel).
  // Nunca incluir ./secrets/** — connection strings ficam só em env Vercel.
  outputFileTracingIncludes: {
    '/*': ['./db/**/*'],
    '/api/**/*': ['./db/**/*'],
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
