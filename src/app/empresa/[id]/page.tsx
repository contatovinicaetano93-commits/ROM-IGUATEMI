'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { IntranetPage } from '../../_components/intranet/IntranetPage'
import { PanelButton } from '../../_components/ui'
import type { IntranetPostKind } from '@/lib/cms-kinds'

type Post = {
  id: string
  kind: IntranetPostKind
  title: string
  excerpt: string
  body: string
  image_url: string | null
  location: string | null
  starts_at: string | null
  published_at: string | null
  author_name: string
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

function formatWhen(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(date)
}

export default function EmpresaPostPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [post, setPost] = useState<Post | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/cms?id=${encodeURIComponent(id)}`, { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Matéria não encontrada')
        return json.data.post as Post
      })
      .then((next) => {
        if (!cancelled) {
          setPost(next)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPost(null)
          setError(err instanceof Error ? err.message : 'Falha ao carregar')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <IntranetPage
      kicker="ROM News"
      title={post?.title ?? (loading ? 'Carregando…' : 'Matéria')}
      subtitle={
        post
          ? `${kindLabel(post.kind)}${post.published_at ? ` · ${formatWhen(post.published_at)}` : ''}${
              post.author_name ? ` · ${post.author_name}` : ''
            }`
          : 'Leitura da publicação interna'
      }
      actions={
        <Link href="/empresa">
          <PanelButton type="button" variant="outline">
            Voltar ao feed
          </PanelButton>
        </Link>
      }
    >
      {loading ? <p className="text-sm text-muted">Abrindo a matéria…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {post ? (
        <article className="overflow-hidden rounded-2xl border border-border bg-background">
          <div className="relative min-h-56 bg-[linear-gradient(135deg,#1c1614_0%,#4a3530_55%,#c48c88_100%)] sm:min-h-72">
            {post.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          </div>
          <div className="space-y-4 p-5 sm:p-8">
            {post.excerpt ? <p className="text-base leading-relaxed text-muted">{post.excerpt}</p> : null}
            {(post.location || post.starts_at) && (
              <p className="text-sm text-muted">
                {post.starts_at ? formatWhen(post.starts_at) : null}
                {post.location ? `${post.starts_at ? ' · ' : ''}${post.location}` : null}
              </p>
            )}
            <div className="whitespace-pre-wrap text-sm leading-7 text-foreground/90 sm:text-base">
              {post.body || 'Sem texto completo nesta publicação.'}
            </div>
          </div>
        </article>
      ) : null}
    </IntranetPage>
  )
}
