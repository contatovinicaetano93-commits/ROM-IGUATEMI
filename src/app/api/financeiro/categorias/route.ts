import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { listCategories, createCategory } from '@/lib/finance'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const categories = await listCategories()
    return ok(categories)
  } catch (e) {
    return handleError(e)
  }
}

const createSchema = z.object({ name: z.string().min(1) })

export async function POST(req: NextRequest) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const body = createSchema.parse(await req.json())
    const category = await createCategory(body.name)
    return ok(category, undefined, 201)
  } catch (e) {
    return handleError(e)
  }
}
