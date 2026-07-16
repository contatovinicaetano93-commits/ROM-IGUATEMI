import { getHealthStatus, getPublicHealthStatus } from '@/lib/health'
import { AlertManager } from '@/lib/alerts'
import { calculateSyncStatus } from '@/lib/health-utils'

export interface HealthMetrics {
  ok: boolean
  issues: string[]
  timestamp: string
}

export class HealthMonitor {
  private static lastAlertId: Map<string, string> = new Map()

  static async checkHealth(): Promise<HealthMetrics> {
    const timestamp = new Date().toISOString()
    const issues: string[] = []

    try {
      const health = await getHealthStatus()

      if (!health.ok) {
        issues.push('Overall health check failed')
      }

      if (!health.database.connected) {
        issues.push(`Database connection failed: ${health.database.error}`)
        await this.alertIfNew('db_offline', 'error', 'Database Offline', health.database.error || 'Unknown error')
      }

      // Check sync status
      if (health.avec?.last_fast) {
        const status = calculateSyncStatus(health.avec.last_fast.created_at, health.avec.last_fast.error)
        if (status.status === 'failed') {
          issues.push(`Avec fast sync failed: ${status.error}`)
          await this.alertIfNew('avec_sync_fast_failed', 'error', 'Avec Fast Sync Failed', status.error || 'Unknown error')
        } else if (status.status === 'stale' && (status.age_seconds ?? 0) > 7200) {
          issues.push(`Avec fast sync is stale (${status.age_seconds}s old)`)
          await this.alertIfNew('avec_sync_stale', 'warning', 'Avec Sync is Stale', `Last sync was ${status.age_seconds}s ago`)
        }
      }

      if (health.stock?.last_fast) {
        const status = calculateSyncStatus(health.stock.last_fast.created_at, health.stock.last_fast.error)
        if (status.status === 'failed') {
          issues.push(`Stock sync failed: ${status.error}`)
          await this.alertIfNew('stock_sync_failed', 'error', 'Stock Sync Failed', status.error || 'Unknown error')
        }
      }
    } catch (e) {
      issues.push(`Health check error: ${e instanceof Error ? e.message : String(e)}`)
    }

    return {
      ok: issues.length === 0,
      issues,
      timestamp,
    }
  }

  static async startContinuousMonitoring(intervalSeconds: number = 300): Promise<void> {
    // Check immediately
    await this.checkHealth()

    // Then check periodically
    setInterval(() => this.checkHealth().catch(console.error), intervalSeconds * 1000)
  }

  private static async alertIfNew(
    key: string,
    severity: 'warning' | 'error' | 'critical',
    title: string,
    message: string,
  ): Promise<void> {
    const lastId = this.lastAlertId.get(key)

    // Only alert if not recently alerted (debounce)
    if (lastId) {
      return
    }

    const alert = await AlertManager.createAlert(`sync_failed`, severity, title, message, { key })
    this.lastAlertId.set(key, alert.id)

    // Clear debounce after 1 hour
    setTimeout(() => this.lastAlertId.delete(key), 60 * 60 * 1000)

    // Send notifications
    await AlertManager.sendAlert(alert, {
      telegram: severity === 'critical' || severity === 'error',
      email: severity === 'critical',
    })
  }
}
