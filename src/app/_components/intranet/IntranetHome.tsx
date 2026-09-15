'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  Briefcase,
  GraduationCap,
  Headphones,
  LayoutGrid,
  Wallet,
} from 'lucide-react'
import { useClientSession } from '../SessionProvider'
import { HOME_QUOTE, HOME_TAGLINE, homeHeadline } from '@/lib/intranet/greeting'
import { formatKpiCount, formatKpiMoney, formatKpiPercent } from '@/lib/intranet/week-kpis'

type HomePayload = {
  greetingName: string
  can_view_revenue: boolean
  canPublish: boolean
  kpis: { revenue: number | null; attended: number | null; occupancy: number | null; nps: null }
  posts: Array<{
    id: string
    kind: 'news' | 'event' | 'banner'
    title: string
    excerpt: string
    body: string
    location: string | null
    starts_at: string | null
    href: string | null
  }>
  tasks: Array<{ id: string; title: string; area: string; status: string; href: string }>
}

const SHORTCUTS = [
  { href: '/flow', label: 'Meus Sistemas', icon: LayoutGrid },
  { href: '/empresa', label: 'Documentos e Políticas', icon: BookOpen },
  { href: '/rh', label: 'RH e Benefícios', icon: Briefcase },
  { href: '/treinamentos', label: 'Treinamentos', icon: GraduationCap },
  { href: '/financeiro', label: 'Financeiro', icon: Wallet, roles: ['admin', 'financeiro'] },
  { href: '/ajuda', label: 'Suporte', icon: Headphones },
]

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
  const role = session?.role
  const shortcuts = SHORTCUTS.filter((item) => {
    if (!item.roles) return true
    if (!session) return false
    if (!session.auth_enabled) return true
    return role != null && item.roles.includes(role)
  })
  const news = (data?.posts ?? []).filter((p) => p.kind === 'news').slice(0, 3)
  const events = (data?.posts ?? []).filter((p) => p.kind === 'event').slice(0, 3)
  const banners = (data?.posts ?? []).filter((p) => p.kind === 'banner')
  const wellness = banners[0]
  const people = banners[1]
  const kpis = data?.kpis
  const tasks = data?.tasks ?? []

  return (
    <main>
      <section className="relative isolate min-h-[280px] overflow-hidden lg:min-h-[360px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/intranet/hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/45 to-black/25" />
        <div
          className="relative mx-auto flex min-h-[280px] max-w-[1400px] flex-col justify-end px-5 py-8 lg:min-h-[360px] lg:px-8 lg:py-12"
          style={{ animation: 'rom-hero-in 0.7s ease-out both' }}
        >
          <div className="max-w-xl text-white">
            <h1 className="font-serif text-3xl leading-tight lg:text-5xl">{homeHeadline(name)}</h1>
            <p className="mt-2 text-sm text-white/80 lg:text-base">{HOME_TAGLINE}</p>
            <Link
              href="/empresa"
              className="mt-5 inline-flex rounded-full border border-white/40 px-4 py-2 text-sm text-white hover:bg-white/10"
            >
              Ver novidades
            </Link>
          </div>
          <p className="absolute bottom-8 right-8 hidden max-w-xs text-right font-serif text-lg text-white/80 lg:block">
            “{HOME_QUOTE}”
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {shortcuts.map((item) => {
            const Icon = item.icon
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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Minhas tarefas</h2>
              <Link href="/flow" className="text-xs text-muted hover:text-foreground">
                Ver todas
              </Link>
            </div>
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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Notícias em destaque</h2>
              <Link href="/empresa" className="text-xs text-muted hover:text-foreground">
                Ver todas
              </Link>
            </div>
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
              <p className="text-sm text-muted">Nenhum evento publicado.</p>
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

          {wellness ? (
            <article className="overflow-hidden rounded-2xl bg-[#5b3d3a] p-5 text-white lg:col-span-4">
              <p className="font-serif text-2xl leading-tight">{wellness.title}</p>
              <p className="mt-2 text-sm text-white/80">{wellness.excerpt || wellness.body}</p>
              {wellness.href && (
                <Link href={wellness.href} className="mt-4 inline-block text-sm underline">
                  Continuar
                </Link>
              )}
            </article>
          ) : (
            <article className="rounded-2xl bg-[#5b3d3a] p-5 text-white lg:col-span-4">
              <p className="font-serif text-2xl leading-tight">Sua saúde, mais bem-estar</p>
              <p className="mt-2 text-sm text-white/80">O marketing publica os banners da casa por aqui.</p>
            </article>
          )}

          <article className="animate-rise rounded-2xl border border-border bg-card p-5 lg:col-span-5" style={{ animationDelay: '160ms' }}>
            <h2 className="mb-4 text-sm font-semibold">Indicadores da semana</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Kpi label="Receita" value={data?.can_view_revenue ? formatKpiMoney(kpis?.revenue ?? null) : '—'} />
              <Kpi label="Atendimentos" value={formatKpiCount(kpis?.attended ?? null)} />
              <Kpi label="Ocupação" value={formatKpiPercent(kpis?.occupancy ?? null)} />
              <Kpi label="NPS" value="—" />
            </div>
          </article>

          <article className="flex items-end rounded-2xl bg-[#1c1916] p-5 text-[#e8d7b8] lg:col-span-3">
            <div>
              <p className="font-serif text-2xl leading-tight">{people?.title || 'Pessoas que transformam'}</p>
              <p className="mt-2 text-sm text-white/60">{people?.excerpt || 'Histórias da equipe, quando o marketing publicar.'}</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.7rem] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}
