import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requirePublisher } from '@/lib/auth'
import { generateCmsAssistantResponse } from '@/lib/cms-editor-assistant'

export async function POST(req: NextRequest) {
  const auth = await requirePublisher(req)
  if (!auth.ok) return err(auth.message, auth.status)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)

  const result = await generateCmsAssistantResponse({
    mode: (body as { mode?: unknown }).mode,
    kind: (body as { kind?: unknown }).kind,
    topic: (body as { topic?: unknown }).topic,
    notes: (body as { notes?: unknown }).notes,
  })

  if ('error' in result) return err(result.error, 400)
  return ok(result)
}
