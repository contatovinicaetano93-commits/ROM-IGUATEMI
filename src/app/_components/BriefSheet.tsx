'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Sparkles, Copy, Check, ChevronRight, Hand, Scissors } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { LastVisitCard, type LastVisitData } from './LastVisitCard'
import { contactHref } from '@/lib/auth-redirect'

interface BriefSheetProps {
  contactId: string
  contactName: string | null
  onClose: () => void
  /** Path de origem para o botão voltar no detalhe do contato (ex.: /hoje). */
  returnTo?: string
}

export function BriefSheet({ contactId, contactName, onClose, returnTo }: BriefSheetProps) {
  const [brief, setBrief] = useState<{ text: string; source: string } | null>(null)
  const [lastVisit, setLastVisit] = useState<LastVisitData | null>(null)
  const [manicurist, setManicurist] = useState<string | null>(null)
  const [hairstylist, setHairstylist] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadBrief = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [briefRes, profileRes] = await Promise.all([
        apiFetch(`/api/contacts/${contactId}/brief`, { cache: 'no-store' }),
        apiFetch(`/api/contacts/${contactId}`, { cache: 'no-store' }),
      ])
      const json = await briefRes.json()
      const profile = await profileRes.json()
      if (!briefRes.ok || json.error) {
        setError(json.error ?? 'Não foi possível gerar o briefing')
        setBrief(null)
        return
      }
      setLastVisit(json.data?.last_visit ?? null)
      setManicurist(profile.data?.contact?.preferred_manicurist ?? null)
      setHairstylist(profile.data?.contact?.preferred_hairstylist ?? null)
      if (json.data?.brief) {
        setBrief({ text: json.data.brief, source: json.data.source })
      } else {
        setError('Resposta vazia do servidor')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [contactId])

  useEffect(() => {
    void loadBrief()
  }, [loadBrief])

  async function copyBrief() {
    if (!brief?.text) return
    try {
      await navigator.clipboard.writeText(brief.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Não foi possível copiar o briefing.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6" onClick={onClose}>
      <div className="animate-fade-in absolute inset-0 bg-black/60" />
      <div
        className="animate-slide-up relative flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl border-t border-border bg-card-elevated lg:animate-rise lg:max-h-[80vh] lg:max-w-lg lg:rounded-2xl lg:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border lg:hidden" />
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[0.65rem] uppercase tracking-wide text-muted">Briefing</p>
            <h2 className="truncate text-base font-semibold">{contactName ?? 'Cliente'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted active:text-foreground">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="space-y-2">
              <div className="h-16 w-full animate-pulse rounded-2xl bg-border" />
              <div className="h-4 w-full animate-pulse rounded bg-border" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-border" />
              <div className="h-4 w-4/6 animate-pulse rounded bg-border" />
            </div>
          )}

          {!loading && (
            <div className="mb-4 space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card px-4 py-3">
                  <p className="text-[0.65rem] uppercase tracking-wide text-muted">Manicure preferida</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                    <Hand size={14} className="text-gold" />
                    {manicurist?.trim() || 'Ainda não informada'}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card px-4 py-3">
                  <p className="text-[0.65rem] uppercase tracking-wide text-muted">Cabeleireiro preferido</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                    <Scissors size={14} className="text-gold" />
                    {hairstylist?.trim() || 'Ainda não informado'}
                  </p>
                </div>
              </div>
              <LastVisitCard visit={lastVisit} />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          {!loading && brief && (
            <div className="flex flex-col gap-3">
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{brief.text}</p>
              <span className="text-[0.65rem] uppercase tracking-wide text-muted">
                {brief.source === 'ai' ? 'Gerado por Claude' : 'Gerado por regras (Claude não configurado)'}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-4">
          {brief && (
            <button
              type="button"
              onClick={copyBrief}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-foreground"
            >
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              {copied ? 'Copiado!' : 'Copiar briefing'}
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void loadBrief()}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 py-3 text-sm font-semibold text-gold disabled:opacity-60"
            >
              <Sparkles size={16} />
              {loading ? 'Gerando…' : 'Atualizar'}
            </button>
            <Link
              href={contactHref(contactId, returnTo)}
              onClick={onClose}
              className="flex items-center justify-center gap-1 rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground"
            >
              Abrir contato
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
