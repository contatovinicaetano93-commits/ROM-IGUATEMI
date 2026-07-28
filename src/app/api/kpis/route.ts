import { ok, handleError } from '@/lib/api-response'
import { fetchContactKpis } from '@/lib/salon/kpis'

export const maxDuration = 20

export async function GET() {
  try {
    const data = await fetchContactKpis(30)
    return ok(data)
  } catch (e) {
    return handleError(e)
  }
}
