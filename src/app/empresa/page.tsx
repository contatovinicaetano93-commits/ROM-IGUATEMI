'use client'

import { useEffect, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { PanelButton, SectionCard } from '../_components/ui'
import { useClientSession } from '../_components/SessionProvider'
import type { IntranetPostKind } from '@/lib/cms-kinds'

type Post = {
  id: string
  kind: IntranetPostKind
  title: string
  excerpt: string
  body: string
  location: string | null
  starts_at: string | null
  published_at: string | null
}

function kindLabel(kind: IntranetPostKind): string {
  switch (kind) {
    case 'news':
      return 'Notícia'
    case 'event':
      return 'Evento'
    case 'banner':
      return 'Banner'
    case 'policy':
      return 'Política'
    default: {
      const _never: never = kind
      return _never
    }
  }
}

export default function EmpresaPage() {
  const { session } = useClientSession()
  const [posts, setPosts] = useState<Post[]>([])
  const [error, setError] = useState<string | null>(null)
  const canPublish =
    session != null &&
    (!session.auth_enabled || Boolean(session.canPublish) || session.role === 'admin' || session.role === 'mkt')

  useEffect(() => {
    fetch('/api/cms', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => setPosts(json.data?.posts ?? []))
      .catch(() => setPosts([]))
  }, [])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = new FormData(e.currentTarget)
    const res = await fetch('/api/cms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        kind: form.get('kind'),
        title: form.get('title'),
        excerpt: form.get('excerpt'),
        body: form.get('body'),
        location: form.get('location'),
        starts_at: form.get('starts_at') || null,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Falha ao publicar')
      return
    }
    setPosts((prev) => [json.data.post, ...prev])
    e.currentTarget.reset()
  }

  const news = posts.filter((post) => post.kind === 'news')
  const events = posts.filter((post) => post.kind === 'event')
  const policies = posts.filter((post) => post.kind === 'policy')

  return (
    <IntranetPage
      kicker="Cultura"
      title="Notícias e eventos"
      subtitle="Notícias e eventos da unidade, mais o manual de políticas ROM Concept. Publicação pelo marketing."
    >
      <section id="noticias" className="scroll-mt-24">
        <SectionCard title="Notícias" badge={<span className="text-xs text-muted">{news.length}</span>}>
          <ul className="space-y-3">
            {news.length === 0 && <li className="text-sm text-muted">O marketing ainda não publicou notícias.</li>}
            {news.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </ul>
        </SectionCard>
      </section>

      <section id="politicas" className="scroll-mt-24">
        <SectionCard title="Manual de políticas ROM Concept">
          <p className="mb-3 text-sm text-muted">O marketing publica aqui as políticas da casa.</p>
          <ul className="space-y-3">
            {policies.length === 0 && <li className="text-sm text-muted">O manual ainda não foi publicado.</li>}
            {policies.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </ul>
        </SectionCard>
      </section>

      <section id="eventos" className="scroll-mt-24">
        <SectionCard title="Eventos" badge={<span className="text-xs text-muted">{events.length}</span>}>
          <p className="mb-3 text-sm text-muted">Agenda do que a ROM vai realizar.</p>
          <ul className="space-y-3">
            {events.length === 0 && <li className="text-sm text-muted">Nenhum evento publicado ainda.</li>}
            {events.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </ul>
        </SectionCard>
      </section>

      {canPublish && (
        <SectionCard title="Publicar (MKT)">
          <form onSubmit={onSubmit} className="grid gap-3">
            <select name="kind" className="rounded-xl border border-border bg-background px-3 py-2" defaultValue="news">
              <option value="news">Notícia</option>
              <option value="event">Evento</option>
              <option value="banner">Banner</option>
              <option value="policy">Política</option>
            </select>
            <input name="title" required placeholder="Título" className="rounded-xl border border-border bg-background px-3 py-2" />
            <input name="excerpt" placeholder="Linha de apoio" className="rounded-xl border border-border bg-background px-3 py-2" />
            <textarea name="body" rows={4} placeholder="Texto" className="rounded-xl border border-border bg-background px-3 py-2" />
            <input name="location" placeholder="Local (eventos)" className="rounded-xl border border-border bg-background px-3 py-2" />
            <input name="starts_at" type="datetime-local" className="rounded-xl border border-border bg-background px-3 py-2" />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div>
              <PanelButton type="submit">Publicar</PanelButton>
            </div>
          </form>
        </SectionCard>
      )}
    </IntranetPage>
  )
}

function PostCard({ post }: { post: Post }) {
  return (
    <li className="rounded-xl border border-border bg-background px-4 py-3">
      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-gold">{kindLabel(post.kind)}</p>
      <p className="mt-1 text-sm font-medium">{post.title}</p>
      <p className="text-sm text-muted">{post.excerpt || post.body.slice(0, 160)}</p>
    </li>
  )
}
