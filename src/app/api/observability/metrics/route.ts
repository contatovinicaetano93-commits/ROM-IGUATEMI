import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { getSql } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const sql = getSql()

    const metrics = {
      timestamp: new Date().toISOString(),
      uptime_ms: process.uptime() * 1000,
      memory: process.memoryUsage(),
      database: {
        connected: true,
        query_time_ms: 0,
      },
    }

    const start = performance.now()
    try {
      await sql`select 1 as ok`
      metrics.database.query_time_ms = performance.now() - start
    } catch {
      metrics.database.connected = false
    }

    return ok(metrics)
  } catch (e) {
    return handleError(e)
  }
}
