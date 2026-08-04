'use client'

import { useEffect, useState } from 'react'

function readPersistedBool(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    // private mode / blocked storage — keep default
  }
  return defaultValue
}

/**
 * Boolean persisted in localStorage.
 * SSR-safe: lazy-reads storage when state initializes; writes on change only.
 */
export function usePersistedBool(key: string, defaultValue = false) {
  const [value, setValue] = useState(() => readPersistedBool(key, defaultValue))

  useEffect(() => {
    try {
      window.localStorage.setItem(key, value ? '1' : '0')
    } catch {
      // ignore
    }
  }, [key, value])

  return [value, setValue] as const
}
