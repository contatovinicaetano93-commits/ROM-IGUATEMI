import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { listRomLocations } from '@/lib/stock-points-db'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)
    return ok({ locations: await listRomLocations() })
  } catch (e) {
    return handleError(e)
  }
}
