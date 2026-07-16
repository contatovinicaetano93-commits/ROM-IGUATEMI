'use client'

import { useEffect, useState } from 'react'

interface Metrics {
  timestamp: string
  uptime_ms: number
  memory: NodeJS.MemoryUsage
  database: { connected: boolean; query_time_ms: number }
}

export default function ObservabilityDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/observability/metrics')
        if (!res.ok) throw new Error('Failed to fetch metrics')
        const data = await res.json()
        setMetrics(data.data)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, 5000) // Refresh every 5 seconds

    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>
  if (!metrics) return <div className="p-8">No metrics available</div>

  const formatBytes = (bytes: number) => {
    const mb = (bytes / 1024 / 1024).toFixed(2)
    return `${mb} MB`
  }

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ${hours % 24}h`
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Observability Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Uptime Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Uptime</h2>
            <p className="text-3xl font-bold text-green-600">{formatUptime(metrics.uptime_ms)}</p>
            <p className="text-sm text-gray-500 mt-2">Server running time</p>
          </div>

          {/* Database Status Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Database</h2>
            <div className="space-y-2">
              <p>
                Status:{' '}
                <span className={metrics.database.connected ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                  {metrics.database.connected ? '✓ Connected' : '✗ Offline'}
                </span>
              </p>
              <p className="text-sm text-gray-600">Query time: {metrics.database.query_time_ms.toFixed(2)}ms</p>
            </div>
          </div>

          {/* Memory Usage Card */}
          <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
            <h2 className="text-lg font-semibold mb-4">Memory Usage</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">RSS</p>
                <p className="text-lg font-bold">{formatBytes(metrics.memory.rss)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Heap Used</p>
                <p className="text-lg font-bold">{formatBytes(metrics.memory.heapUsed)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">External</p>
                <p className="text-lg font-bold">{formatBytes(metrics.memory.external)}</p>
              </div>
            </div>
          </div>

          {/* Last Update Card */}
          <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
            <h2 className="text-lg font-semibold mb-4">Last Updated</h2>
            <p className="text-sm text-gray-600">{new Date(metrics.timestamp).toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-2">Auto-refreshing every 5 seconds</p>
          </div>
        </div>
      </div>
    </div>
  )
}
