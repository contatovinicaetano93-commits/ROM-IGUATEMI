import { ok, handleError } from '@/lib/api-response'
import { fetchTmComparison } from '@/lib/salon/tm-metrics'

export async function GET() {
  try {
    const data = await fetchTmComparison()
    return ok(data)
  } catch (e) {
    return handleError(e)
  }
}
