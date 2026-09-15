'use client'

import { useEffect, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { useClientSession } from '../_components/SessionProvider'

type Post = { id: string; kind: string; title: string; excerpt: string; published_at: string | null }

export default function EmpresaPage() {
  const { session } = useClientSession()
  const [posts, setPosts] = useState<Post[]>([])
  const [error, setError] = useState<string | null>(null)
  const canPublish = session?.canPublish || session?.role === 'admin' || session?.role === 'mkt' || !session?.auth_enabled

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
      headers: { 'Content-Type': 'application/json' },
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

  return (
    <IntranetPage kicker="Cultura" title="Empresa">
      <p className="text-sm text-muted" id="documentos">
        Políticas, notícias e eventos da unidade. Publicação pelo marketing.
      </p>
      <ul className="mt-4 space-y-3">
        {posts.length === 0 && <li className="text-sm text-muted">Nada publicado ainda.</li>}
        {posts.map((post) => (
          <li key={post.id} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[0.65rem] uppercase tracking-wide text-muted">{post.kind}</p>
            <p className="font-medium">{post.title}</p>
            <p className="text-sm text-muted">{post.excerpt}</p>
          </li>
        ))}
      </ul>

      {canPublish && (
        <form onSubmit={onSubmit} className="mt-8 grid gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-serif text-xl">Publicar (MKT)</h2>
          <select name="kind" className="rounded-xl border border-border bg-background px-3 py-2" defaultValue="news">
            <option value="news">Notícia</option>
            <option value="event">Evento</option>
            <option value="banner">Banner</option>
          </select>
          <input name="title" required placeholder="Título" className="rounded-xl border border-border bg-background px-3 py-2" />
          <input name="excerpt" placeholder="Linha de apoio" className="rounded-xl border border-border bg-background px-3 py-2" />
          <textarea name="body" rows={4} placeholder="Texto" className="rounded-xl border border-border bg-background px-3 py-2" />
          <input name="location" placeholder="Local (eventos)" className="rounded-xl border border-border bg-background px-3 py-2" />
          <input name="starts_at" type="datetime-local" className="rounded-xl border border-border bg-background px-3 py-2" />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="rounded-full bg-[#1c1916] px-4 py-2 text-sm text-white">Publicar</button>
        </form>
      )}
    </IntranetPage>
  )
}
