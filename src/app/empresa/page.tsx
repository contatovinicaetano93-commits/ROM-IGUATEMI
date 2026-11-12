'use client'

import { useEffect, useRef, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { RomNewsFeed, type RomNewsPost } from '../_components/intranet/RomNewsFeed'
import { RomNewsStudio } from '../_components/intranet/RomNewsStudio'
import { PanelButton, SectionCard } from '../_components/ui'
import { useClientSession } from '../_components/SessionProvider'

type Post = RomNewsPost & {
  image_url?: string | null
  href?: string | null
}

export default function EmpresaPage() {
  const { session } = useClientSession()
  const [posts, setPosts] = useState<Post[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const formRef = useRef<HTMLFormElement>(null)
  const canPublish =
    session != null &&
    (!session.auth_enabled || Boolean(session.canPublish) || session.role === 'admin' || session.role === 'mkt')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/cms', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setPosts(json.data?.posts ?? [])
      })
      .catch(() => {
        if (!cancelled) setPosts([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
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
        image_url: form.get('image_url') || null,
        href: form.get('href') || null,
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

  function applyAssistant(payload: { mode: 'titulo' | 'lead' | 'materia' | 'seo'; output: string }) {
    const form = formRef.current
    if (!form) return
    const title = form.elements.namedItem('title') as HTMLInputElement | null
    const excerpt = form.elements.namedItem('excerpt') as HTMLInputElement | null
    const body = form.elements.namedItem('body') as HTMLTextAreaElement | null
    if (payload.mode === 'titulo') {
      const firstLine = payload.output.split('\n').map((line) => line.replace(/^\d+\.\s*/, '').trim()).find(Boolean)
      if (title && firstLine) title.value = firstLine
      return
    }
    if (payload.mode === 'lead' && excerpt) {
      excerpt.value = payload.output
      return
    }
    if (payload.mode === 'materia' && body) {
      body.value = payload.output
      return
    }
    if (payload.mode === 'seo' && excerpt) {
      const match = payload.output.match(/Resumo \(excerpt\):\s*(.+)/i)
      if (match?.[1]) excerpt.value = match[1].trim()
    }
  }

  const news = posts.filter((post) => post.kind === 'news')
  const events = posts.filter((post) => post.kind === 'event')
  const policies = posts.filter((post) => post.kind === 'policy')

  return (
    <IntranetPage
      kicker="ROM News"
      title="Notícias e eventos"
      subtitle="Jornal digital da unidade — no lugar do PDF. Publicação em tempo real pelo marketing, com assistente de edição por IA."
    >
      <section id="noticias" className="scroll-mt-24">
        <SectionCard title="Notícias" badge={<span className="text-xs text-muted">{news.length}</span>}>
          {loading ? (
            <p className="text-sm text-muted">Carregando o feed…</p>
          ) : (
            <RomNewsFeed posts={news} emptyLabel="O marketing ainda não publicou notícias." />
          )}
        </SectionCard>
      </section>

      <section id="politicas" className="scroll-mt-24">
        <SectionCard title="Manual de políticas ROM Concept">
          <p className="mb-3 text-sm text-muted">O marketing publica aqui as políticas da casa.</p>
          <RomNewsFeed posts={policies} emptyLabel="O manual ainda não foi publicado." />
        </SectionCard>
      </section>

      <section id="eventos" className="scroll-mt-24">
        <SectionCard title="Eventos" badge={<span className="text-xs text-muted">{events.length}</span>}>
          <p className="mb-3 text-sm text-muted">Agenda do que a ROM vai realizar.</p>
          <RomNewsFeed posts={events} emptyLabel="Nenhum evento publicado ainda." />
        </SectionCard>
      </section>

      {canPublish && (
        <>
          <RomNewsStudio onApply={applyAssistant} />
          <SectionCard title="Publicar (MKT)">
            <form ref={formRef} onSubmit={onSubmit} className="grid gap-3">
              <select name="kind" className="rounded-xl border border-border bg-background px-3 py-2" defaultValue="news">
                <option value="news">Notícia</option>
                <option value="event">Evento</option>
                <option value="banner">Banner</option>
                <option value="policy">Política</option>
              </select>
              <input name="title" required placeholder="Título" className="rounded-xl border border-border bg-background px-3 py-2" />
              <input name="excerpt" placeholder="Linha de apoio / lead" className="rounded-xl border border-border bg-background px-3 py-2" />
              <textarea name="body" rows={6} placeholder="Texto da matéria" className="rounded-xl border border-border bg-background px-3 py-2" />
              <input
                name="image_url"
                placeholder="URL da imagem — ex. /intranet/carousel/rom-concept-tray-wide.jpg"
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
              <input name="href" placeholder="Link do banner (opcional)" className="rounded-xl border border-border bg-background px-3 py-2" />
              <input name="location" placeholder="Local (eventos)" className="rounded-xl border border-border bg-background px-3 py-2" />
              <input name="starts_at" type="datetime-local" className="rounded-xl border border-border bg-background px-3 py-2" />
              {error && <p className="text-sm text-danger">{error}</p>}
              <div>
                <PanelButton type="submit">Publicar no ROM News</PanelButton>
              </div>
            </form>
          </SectionCard>
        </>
      )}
    </IntranetPage>
  )
}
