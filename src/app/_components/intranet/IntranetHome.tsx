'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpen, GraduationCap, Headphones, LayoutGrid } from 'lucide-react'
import { useClientSession } from '../SessionProvider'
import { HomeHeroCarousel } from './HomeHeroCarousel'
import { HOME_QUOTE, HOME_TAGLINE, homeHeadline } from '@/lib/intranet/greeting'
import { resolveHomeCarouselSlides } from '@/lib/intranet/home-carousel'
import { HOME_SHORTCUTS } from '@/lib/intranet/systems'

type HomePayload = {
  greetingName: string
  posts: Array<{
    id: string
    kind: 'news' | 'event' | 'banner' | 'policy'
    title: string
    excerpt: string
    body: string
    image_url?: string | null
    location: string | null
    starts_at: string | null
    href: string | null
  }>
  tasks: Array<{ id: string; title: string; area: string; status: string; href: string }>
}

const SHORTCUT_ICONS = {
  '/sistemas': LayoutGrid,
  '/empresa#politicas': BookOpen,
  '/onboarding': GraduationCap,
  '/ajuda': Headphones,
} as const

function formatEventWhen(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '')
}

export function IntranetHome() {
  const { session } = useClientSession()
  const [data, setData] = useState<HomePayload | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/intranet', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json.data as HomePayload)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const name = data?.greetingName || session?.displayName || session?.user || ''
  const posts = data?.posts ?? []
  const news = posts.filter((p) => p.kind === 'news').slice(0, 3)
  const events = posts.filter((p) => p.kind === 'event').slice(0, 3)
  const banners = posts.filter((p) => p.kind === 'banner')
  const wellness = banners[0]
  const people = banners[1]
  const tasks = data?.tasks ?? []
  const carouselSlides = useMemo(() => resolveHomeCarouselSlides(banners), [posts])

  return (
    <main>
      <HomeHeroCarousel
        slides={carouselSlides}
        headline={homeHeadline(name)}
        tagline={HOME_TAGLINE}
        quote={HOME_QUOTE}
      />

      <section className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {HOME_SHORTCUTS.map((item) => {
            const Icon = SHORTCUT_ICONS[item.href]
            return (
              <Link
                key={item.href}
                href={item.href}
                className="intranet-shortcut flex flex-col items-start gap-3 rounded-2xl border border-border bg-card px-4 py-4"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4efe7] text-gold-strong">
                  <Icon size={18} />
                </span>
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </Link>
            )
          })}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-12">
          <article className="animate-rise rounded-2xl border border-border bg-card p-5 lg:col-span-4">
            <h2 className="mb-3 text-sm font-semibold">Minhas tarefas</h2>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma aprovação pendente.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.slice(0, 4).map((task) => (
                  <li key={task.id}>
                    <Link href={task.href} className="flex items-center justify-between gap-3 rounded-xl px-1 py-1.5 hover:bg-background">
                      <span className="truncate text-sm">{task.title}</span>
                      <span className="shrink-0 rounded-full bg-[#f4efe7] px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-gold-strong">
                        {task.area}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="animate-rise rounded-2xl border border-border bg-card p-5 lg:col-span-5" style={{ animationDelay: '80ms' }}>
            <h2 className="mb-3 text-sm font-semibold">Notícias em destaque</h2>
            {news.length === 0 ? (
              <p className="text-sm text-muted">O marketing ainda não publicou notícias.</p>
            ) : (
              <ul className="space-y-3">
                {news.map((item) => (
                  <li key={item.id} className="text-sm">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-muted">{item.excerpt || item.body.slice(0, 120)}</p>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="animate-rise rounded-2xl border border-border bg-card p-5 lg:col-span-3" style={{ animationDelay: '120ms' }}>
            <h2 className="mb-3 text-sm font-semibold">Eventos</h2>
            {events.length === 0 ? (
              <p className="text-sm text-muted">O marketing publica aqui os próximos eventos da ROM.</p>
            ) : (
              <ul className="space-y-3">
                {events.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <span className="w-10 text-center font-serif text-lg leading-none text-gold-strong">
                      {formatEventWhen(item.starts_at) || '—'}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted">{item.location || item.excerpt}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <BannerPromoCard
            className="lg:col-span-6"
            tone="warm"
            title={wellness?.title || 'Sua saúde, mais bem-estar'}
            body={wellness?.excerpt || wellness?.body || 'O marketing publica os banners da casa por aqui.'}
            href={wellness?.href}
            imageUrl={wellness?.image_url || '/intranet/carousel/rom-concept-tray-wide.jpg'}
          />

          <BannerPromoCard
            className="lg:col-span-6"
            tone="dark"
            title={people?.title || 'Pessoas que transformam'}
            body={people?.excerpt || people?.body || 'Histórias da equipe, quando o marketing publicar.'}
            href={people?.href}
            imageUrl={people?.image_url || '/intranet/carousel/rom-concept-tray.jpg'}
          />
        </div>
      </section>
    </main>
  )
}

function BannerPromoCard({
  title,
  body,
  href,
  imageUrl,
  tone,
  className,
}: {
  title: string
  body: string
  href?: string | null
  imageUrl: string
  tone: 'warm' | 'dark'
  className?: string
}) {
  const base = tone === 'warm' ? 'bg-[#5b3d3a]' : 'bg-[#1c1916]'
  const textMuted = tone === 'warm' ? 'text-white/80' : 'text-white/60'
  const titleColor = tone === 'warm' ? 'text-white' : 'text-[#e8d7b8]'
  return (
    <article className={`relative isolate overflow-hidden rounded-2xl ${base} ${className ?? ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-35"
        style={{ objectPosition: 'center' }}
      />
      <div className={`relative p-5 ${titleColor}`}>
        <p className="font-serif text-2xl leading-tight">{title}</p>
        <p className={`mt-2 text-sm ${textMuted}`}>{body}</p>
        {href ? (
          <Link href={href} className="mt-4 inline-block text-sm underline">
            Continuar
          </Link>
        ) : null}
      </div>
    </article>
  )
}
