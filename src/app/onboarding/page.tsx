'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { GraduationCap, Play, Plus, X } from 'lucide-react'
import { PrimaryButton } from '../_components/ui'
import { apiFetch } from '@/lib/api-client'

interface OnboardingPillar {
  id: string
  name: string
  description: string | null
  order_index: number
}

interface OnboardingVideo {
  id: string
  pillar_id: string | null
  title: string
  description: string | null
  video_url: string
  thumbnail_url: string | null
  duration_seconds: number | null
}

function isEmbedUrl(url: string) {
  return /youtube\.com|youtu\.be|vimeo\.com/.test(url)
}

function toEmbedUrl(url: string) {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([\w-]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return url
}

function fmtDuration(seconds: number | null) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function OnboardingPage() {
  const [pillars, setPillars] = useState<OnboardingPillar[]>([])
  const [videos, setVideos] = useState<OnboardingVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [playing, setPlaying] = useState<OnboardingVideo | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pRes, vRes] = await Promise.all([
        apiFetch('/api/onboarding/pilares', { cache: 'no-store' }),
        apiFetch('/api/onboarding/videos', { cache: 'no-store' }),
      ])
      const [pJson, vJson] = await Promise.all([pRes.json(), vRes.json()])
      if (pJson.error) throw new Error(pJson.error)
      setPillars(pJson.data ?? [])
      setVideos(vJson.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setIsAdmin(Boolean(json.data?.can_view_revenue)))
      .catch(() => setIsAdmin(false))
  }, [load])

  const videosByPillar = useMemo(() => {
    const map = new Map<string, OnboardingVideo[]>()
    for (const v of videos) {
      const key = v.pillar_id ?? '_sem_pilar'
      const arr = map.get(key) ?? []
      arr.push(v)
      map.set(key, arr)
    }
    return map
  }, [videos])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Central de treinamento</p>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold lg:text-2xl">
          <GraduationCap size={22} className="text-gold" />
          Onboarding
        </h1>
        <p className="mt-2 text-sm text-muted">Vídeos curtos organizados por pilar, pra consultar quando precisar.</p>
      </div>

      {error && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted">
          Não foi possível carregar ({error}). Confirme se o banco está configurado.
        </div>
      )}

      {isAdmin && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex w-fit items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold"
        >
          <Plus size={14} /> Adicionar vídeo
        </button>
      )}

      {loading &&
        Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />)}

      {!loading && pillars.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted">
          Nenhum pilar cadastrado ainda.
        </div>
      )}

      {!loading &&
        pillars.map((pillar) => {
          const pillarVideos = videosByPillar.get(pillar.id) ?? []
          return (
            <section key={pillar.id} className="flex flex-col gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground/90">{pillar.name}</h2>
                {pillar.description && <p className="mt-0.5 text-xs text-muted">{pillar.description}</p>}
              </div>

              {pillarVideos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted">
                  Nenhum vídeo ainda neste pilar.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {pillarVideos.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setPlaying(v)}
                      className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-border bg-card text-left"
                    >
                      {v.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.thumbnail_url} alt={v.title} className="absolute inset-0 size-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-surface to-card" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                      <span className="absolute flex size-11 items-center justify-center rounded-full border border-gold/50 bg-background/70 text-gold backdrop-blur-sm transition group-hover:scale-105">
                        <Play size={18} className="fill-current pl-0.5" />
                      </span>
                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <p className="truncate text-sm font-medium text-foreground">{v.title}</p>
                        {fmtDuration(v.duration_seconds) && (
                          <p className="text-xs text-muted">{fmtDuration(v.duration_seconds)}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )
        })}

      {playing && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={playing.title}
          onClick={() => setPlaying(null)}
        >
          <button
            type="button"
            onClick={() => setPlaying(null)}
            className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground"
            aria-label="Fechar vídeo"
          >
            <X size={18} />
          </button>
          <div
            className="aspect-video w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {isEmbedUrl(playing.video_url) ? (
              <iframe
                src={toEmbedUrl(playing.video_url)}
                className="size-full"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video src={playing.video_url} controls autoPlay className="size-full object-contain" />
            )}
          </div>
        </div>
      )}

      {showAdd && (
        <AddVideoSheet
          pillars={pillars}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function AddVideoSheet({
  pillars,
  onClose,
  onAdded,
}: {
  pillars: OnboardingPillar[]
  onClose: () => void
  onAdded: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [pillarId, setPillarId] = useState(pillars[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    try {
      const res = await apiFetch('/api/onboarding/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pillarId: pillarId || null,
          title,
          description: description || null,
          videoUrl,
          thumbnailUrl: thumbnailUrl || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Erro ao salvar')
      onAdded()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6" onClick={onClose}>
      <div className="animate-fade-in absolute inset-0 bg-black/60" />
      <div
        className="animate-slide-up relative w-full max-w-md rounded-t-2xl border-t border-border bg-card-elevated p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:animate-rise lg:max-w-lg lg:rounded-2xl lg:border lg:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Novo vídeo</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted active:text-foreground">
            <X size={22} />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Título</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              placeholder="Ex.: Como marcar um atendimento no Cérebro"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Pilar</span>
            <select
              value={pillarId}
              onChange={(e) => setPillarId(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            >
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">URL do vídeo</span>
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              required
              placeholder="Link direto (.mp4) ou YouTube/Vimeo"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Thumbnail (opcional)</span>
            <input
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="URL da imagem de capa"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Descrição (opcional)</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          {err && <p className="text-sm text-danger">{err}</p>}
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar vídeo'}
          </PrimaryButton>
        </form>
      </div>
    </div>
  )
}
