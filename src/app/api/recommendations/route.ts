import { ok, handleError } from '@/lib/api-response'
import { listActionItems } from '@/lib/salon/recommendations'

export async function GET() {
  try {
    const items = await listActionItems({ limit: 80 })
    return ok(items)
  } catch (e) {
    return handleError(e)
  }
}
