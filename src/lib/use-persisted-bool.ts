'use client'

import { useCallback, useSyncExternalStore } from 'react'

const listenersByKey = new Map<string, Set<() => void>>()

function readPersistedBool(key: string, defaultValue: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    // private mode / blocked storage — keep default
  }
  return defaultValue
}

function subscribeKey(key: string, onChange: () => void): () => void {
  let set = listenersByKey.get(key)
  if (!set) {
    set = new Set()
    listenersByKey.set(key, set)
  }
  set.add(onChange)

  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) onChange()
  }
  window.addEventListener('storage', onStorage)

  return () => {
    set!.delete(onChange)
    if (set!.size === 0) listenersByKey.delete(key)
    window.removeEventListener('storage', onStorage)
  }
}

function emitKey(key: string) {
  listenersByKey.get(key)?.forEach((listener) => listener())
}

/**
 * Boolean persisted in localStorage.
 * SSR-safe via useSyncExternalStore (server snapshot = default; no setState-in-effect).
 */
export function usePersistedBool(key: string, defaultValue = false) {
  const subscribe = useCallback((onChange: () => void) => subscribeKey(key, onChange), [key])
  const getSnapshot = useCallback(() => readPersistedBool(key, defaultValue), [key, defaultValue])
  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue])

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setValue = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const prev = readPersistedBool(key, defaultValue)
      const resolved = typeof next === 'function' ? next(prev) : next
      try {
        window.localStorage.setItem(key, resolved ? '1' : '0')
      } catch {
        // ignore
      }
      emitKey(key)
    },
    [key, defaultValue],
  )

  return [value, setValue] as const
}
