import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession, requireAdmin } from '@/lib/auth'
import { listVideos, createVideo } from '@/lib/onboarding'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const videos = await listVideos()
    return ok(videos)
  } catch (e) {
    return handleError(e)
  }
}

const createSchema = z.object({
  pillarId: z.string().uuid().nullable(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  videoUrl: z.string().min(1),
  thumbnailUrl: z.string().nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const body = createSchema.parse(await req.json())
    const video = await createVideo(body)
    return ok(video, undefined, 201)
  } catch (e) {
    return handleError(e)
  }
}
