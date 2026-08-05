'use client'

import { useEffect, useRef } from 'react'

type ClientLoader = () => void | Promise<void>

/**
 * Run a client data loader on mount and when `deps` change.
 *
 * Loaders should not call setState synchronously on entry — keep `loading` true
 * initially and only flip it in `finally` after await, or pass `{ reset: true }`
 * from event handlers. That keeps set-state-in-effect happy while still fetching
 * on mount.
 */
export function useClientLoader(loader: ClientLoader, deps: readonly unknown[]): void {
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    void loaderRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller owns dep list
  }, deps)
}
