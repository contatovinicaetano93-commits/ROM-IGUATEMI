export interface SyncStatus {
  last_sync_at: string | null
  status: 'fresh' | 'stale' | 'failed' | 'never'
  age_seconds: number | null
  error: string | null
}

export function calculateSyncStatus(
  last_sync_at: string | null,
  error: string | null,
  fresh_threshold_seconds: number = 300,
  stale_threshold_seconds: number = 3600,
): SyncStatus {
  if (!last_sync_at) {
    return {
      last_sync_at: null,
      status: 'never',
      age_seconds: null,
      error,
    }
  }

  const age = Math.floor((Date.now() - new Date(last_sync_at).getTime()) / 1000)

  if (error) {
    return {
      last_sync_at,
      status: 'failed',
      age_seconds: age,
      error,
    }
  }

  if (age < fresh_threshold_seconds) {
    return {
      last_sync_at,
      status: 'fresh',
      age_seconds: age,
      error: null,
    }
  }

  if (age < stale_threshold_seconds) {
    return {
      last_sync_at,
      status: 'stale',
      age_seconds: age,
      error: null,
    }
  }

  return {
    last_sync_at,
    status: 'failed',
    age_seconds: age,
    error: 'Sync hasn\'t run in over 1 hour',
  }
}

export function formatSyncAge(age_seconds: number | null): string {
  if (age_seconds === null) return 'never'
  if (age_seconds < 60) return `${age_seconds}s ago`
  if (age_seconds < 3600) return `${Math.floor(age_seconds / 60)}m ago`
  if (age_seconds < 86400) return `${Math.floor(age_seconds / 3600)}h ago`
  return `${Math.floor(age_seconds / 86400)}d ago`
}
