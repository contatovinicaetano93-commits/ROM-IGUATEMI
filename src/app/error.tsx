'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-lg font-semibold">Algo deu errado nesta página</h2>
      <p className="text-sm text-muted">A equipe foi notificada. Você pode tentar novamente.</p>
      <button
        onClick={reset}
        className="rounded-2xl bg-foreground px-5 py-3 text-sm font-semibold text-background transition-transform active:scale-[0.99]"
      >
        Tentar novamente
      </button>
    </div>
  )
}
