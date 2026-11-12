'use client'

import Link from 'next/link'
import type { IntranetPostKind } from '@/lib/cms-kinds'

export type RomNewsPost = {
  id: string
  kind: IntranetPostKind
  title: string
  excerpt: string
  body: string
  image_url?: string | null
  location: string | null
  starts_at: string | null
  published_at: string | null
  author_name?: string
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
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
    .format(date)
    .replace('.', '')
}

export function RomNewsFeed({
  posts,
  emptyLabel,
}: {
  posts: RomNewsPost[]
  emptyLabel: string
}) {
  if (posts.length === 0) {
    return <p className="text-sm text-muted">{emptyLabel}</p>
  }

  const [featured, ...rest] = posts

  return (
    <div className="space-y-5">
      {featured ? <FeaturedCard post={featured} /> : null}
      {rest.length > 0 ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rest.map((post) => (
            <li key={post.id}>
              <ArticleCard post={post} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function FeaturedCard({ post }: { post: RomNewsPost }) {
  return (
    <Link
      href={`/empresa/${post.id}`}
      className="group grid overflow-hidden rounded-2xl border border-border bg-background transition hover:border-gold/50 lg:grid-cols-[1.35fr_1fr]"
    >
      <div className="relative min-h-56 bg-[linear-gradient(135deg,#1c1614_0%,#4a3530_55%,#c48c88_100%)] lg:min-h-72">
        {post.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
      </div>
      <div className="flex flex-col justify-end gap-3 p-5 lg:p-7">
        <p className="text-[0.65rem] uppercase tracking-[0.22em] text-gold">
          {kindLabel(post.kind)}
          {post.published_at ? ` · ${formatWhen(post.published_at)}` : ''}
        </p>
        <h3 className="text-xl font-semibold leading-tight lg:text-2xl">{post.title}</h3>
        <p className="text-sm text-muted">
          {post.excerpt || post.body.slice(0, 180)}
        </p>
        <span className="text-sm font-medium text-gold">Ler matéria →</span>
      </div>
    </Link>
  )
}

function ArticleCard({ post }: { post: RomNewsPost }) {
  return (
    <Link
      href={`/empresa/${post.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-background transition hover:border-gold/40"
    >
      <div className="relative aspect-[5/3] bg-[linear-gradient(135deg,#2a221f_0%,#8b6b63_100%)]">
        {post.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-gold">
          {kindLabel(post.kind)}
          {post.starts_at ? ` · ${formatWhen(post.starts_at)}` : ''}
          {post.location ? ` · ${post.location}` : ''}
        </p>
        <h3 className="text-base font-semibold leading-snug">{post.title}</h3>
        <p className="text-sm text-muted line-clamp-3">
          {post.excerpt || post.body.slice(0, 140)}
        </p>
      </div>
    </Link>
  )
}
