'use client'

import { useEffect, useState } from 'react'

/**
 * Boolean persisted in localStorage.
 * SSR-safe: starts at `defaultValue`, then hydrates from storage.
 */
export function usePersistedBool(key: string, defaultValue = false) {
  const [value, setValue] = useState(defaultValue)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw === '1') setValue(true)
      else if (raw === '0') setValue(false)
    } catch {
      // private mode / blocked storage — keep default
    }
    setHydrated(true)
  }, [key])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(key, value ? '1' : '0')
    } catch {
      // ignore
    }
  }, [key, value, hydrated])

  return [value, setValue] as const
}
