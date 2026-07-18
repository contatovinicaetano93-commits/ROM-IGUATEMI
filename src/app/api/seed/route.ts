import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin, isAuthEnabled } from '@/lib/auth'
import { runSeed, resolveSeedPresetFromBody } from '@/lib/seed'

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production' && !isAuthEnabled()) {
      return err('Configure ROM_ADMIN_PASSWORD para usar seed em produção', 503)
    }

    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    let preset: ReturnType<typeof resolveSeedPresetFromBody>
    try {
      const body = await req.json()
      preset = resolveSeedPresetFromBody(body?.preset)
    } catch {
      preset = undefined
    }

    const result = await runSeed(preset ? { preset } : undefined)
    return ok(result)
  } catch (e) {
    return handleError(e)
  }
}
