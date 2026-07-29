'use client'

import { useEffect, useRef } from 'react'

/**
 * Revalida painéis abertos: ao voltar o foco / aba visível, e em intervalo
 * enquanto a aba está ativa. Não dispara com documento oculto.
 */
export function useLiveRefresh(refresh: () => void, intervalMs = 60_000) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    const run = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      refreshRef.current()
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }

    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVisible)
    const id = window.setInterval(run, intervalMs)
    return () => {
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(id)
    }
  }, [intervalMs])
}
