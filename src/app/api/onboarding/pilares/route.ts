import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession, requireAdmin } from '@/lib/auth'
import { listPillars, createPillar } from '@/lib/onboarding'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const pillars = await listPillars()
    return ok(pillars)
  } catch (e) {
    return handleError(e)
  }
}

const createSchema = z.object({ name: z.string().min(1), description: z.string().nullable().optional() })

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const body = createSchema.parse(await req.json())
    const pillar = await createPillar(body.name, body.description)
    return ok(pillar, undefined, 201)
  } catch (e) {
    return handleError(e)
  }
}
