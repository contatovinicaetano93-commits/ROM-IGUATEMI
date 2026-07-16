import { getSql } from '@/lib/db'

export interface AuditLog {
  id: string
  user: string
  role: string
  action: string
  resource: string
  changes: Record<string, any>
  ip_address: string
  status: 'success' | 'error'
  error_message?: string
  created_at: string
}

export class AuditLogger {
  static async log(
    user: string,
    role: string,
    action: string,
    resource: string,
    changes?: Record<string, any>,
    ipAddress?: string,
    status: 'success' | 'error' = 'success',
    errorMessage?: string,
  ): Promise<void> {
    const sql = getSql()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    try {
      await sql`
        insert into audit_logs (id, user, role, action, resource, changes, ip_address, status, error_message, created_at)
        values (${id}, ${user}, ${role}, ${action}, ${resource}, ${JSON.stringify(changes || {})}, ${ipAddress || 'unknown'}, ${status}, ${errorMessage || null}, ${now})
      `
    } catch (e) {
      // Graceful degradation — log locally if table doesn't exist
      console.error(`[AUDIT] ${user} (${role}) ${action} ${resource}:`, changes)
    }
  }

  static async getByUser(user: string, limit: number = 100): Promise<AuditLog[]> {
    const sql = getSql()

    try {
      return await sql`select * from audit_logs where user = ${user} order by created_at desc limit ${limit}`
    } catch {
      return []
    }
  }

  static async getByAction(action: string, limit: number = 100): Promise<AuditLog[]> {
    const sql = getSql()

    try {
      return await sql`select * from audit_logs where action = ${action} order by created_at desc limit ${limit}`
    } catch {
      return []
    }
  }

  static async getSuspicious(hoursBack: number = 24): Promise<AuditLog[]> {
    const sql = getSql()
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()

    try {
      return await sql`
        select * from audit_logs
        where status = 'error' and created_at > ${since}
        order by created_at desc
      `
    } catch {
      return []
    }
  }
}

export function extractIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return req.headers.get('x-real-ip') || 'unknown'
}
