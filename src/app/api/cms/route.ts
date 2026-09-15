import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requirePublisher, requireSession } from '@/lib/auth'
import { createPost, listAllPosts, listPublishedPosts } from '@/lib/cms'

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const url = new URL(req.url)
  const kind = url.searchParams.get('kind')
  const all = url.searchParams.get('all') === '1'
  const parsedKind = kind === 'news' || kind === 'event' || kind === 'banner' ? kind : undefined
  try {
    if (all && (auth.session.role === 'admin' || auth.session.role === 'mkt' || auth.session.canPublish)) {
      return ok({ posts: await listAllPosts() })
    }
    return ok({ posts: await listPublishedPosts(parsedKind) })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao ler publicações', 500)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePublisher(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)
  const kind = body.kind === 'event' || body.kind === 'banner' || body.kind === 'news' ? body.kind : null
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!kind || !title) return err('Tipo e título são obrigatórios', 400)
  try {
    const post = await createPost({
      kind,
      title,
      body: typeof body.body === 'string' ? body.body : '',
      excerpt: typeof body.excerpt === 'string' ? body.excerpt : '',
      image_url: typeof body.image_url === 'string' ? body.image_url : null,
      href: typeof body.href === 'string' ? body.href : null,
      location: typeof body.location === 'string' ? body.location : null,
      starts_at: typeof body.starts_at === 'string' ? body.starts_at : null,
      ends_at: typeof body.ends_at === 'string' ? body.ends_at : null,
      publish: body.publish !== false,
      author_name: auth.session.displayName,
      author_id: auth.session.employeeId,
    })
    return ok({ post }, undefined, 201)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao publicar', 400)
  }
}
