'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { FileText, Search, Upload } from 'lucide-react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { IntranetPageSkeleton } from '../_components/intranet/IntranetPageSkeleton'
import { PanelButton, SectionCard } from '../_components/ui'
import {
  CURRICULO_STATUSES,
  curriculoStatusLabel,
  type Curriculo,
  type CurriculoStatus,
} from '@/lib/curriculos/types'

type StatusFilter = CurriculoStatus | 'all'

function formatWhen(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export default function CurriculosPage() {
  const [items, setItems] = useState<Curriculo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [desiredRole, setDesiredRole] = useState('')
  const [keywords, setKeywords] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (debouncedQ) params.set('q', debouncedQ)
      if (status !== 'all') params.set('status', status)
      const res = await fetch(`/api/curriculos?${params}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Falha ao carregar currículos')
        setItems([])
        return
      }
      setItems(json.data?.curriculos ?? [])
    } catch {
      setError('Falha ao carregar currículos')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [debouncedQ, status])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const map: Record<StatusFilter, number> = {
      all: items.length,
      novo: 0,
      em_analise: 0,
      aprovado: 0,
      arquivado: 0,
    }
    for (const item of items) map[item.status] += 1
    return map
  }, [items])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Anexe o PDF ou imagem do currículo')
      return
    }
    if (!name.trim()) {
      setError('Informe o nome do candidato')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/curriculos/upload',
      })
      const res = await fetch('/api/curriculos', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          desired_role: desiredRole.trim() || null,
          keywords,
          notes: notes.trim() || null,
          file_url: blob.url,
          file_name: file.name,
          file_content_type: file.type || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Não foi possível salvar o currículo')
        return
      }
      setNotice('Currículo anexado e indexado para busca.')
      setName('')
      setEmail('')
      setPhone('')
      setDesiredRole('')
      setKeywords('')
      setNotes('')
      setFile(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no upload')
    } finally {
      setSaving(false)
    }
  }

  async function setItemStatus(id: string, next: CurriculoStatus) {
    setError(null)
    const res = await fetch(`/api/curriculos/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error ?? 'Falha ao atualizar status')
      return
    }
    const updated = json.data?.curriculo as Curriculo | undefined
    if (!updated) return
    setItems((prev) => prev.map((item) => (item.id === id ? updated : item)))
  }

  if (loading && items.length === 0) {
    return (
      <IntranetPage title="Currículos" subtitle="Banco de currículos do RH">
        <IntranetPageSkeleton />
      </IntranetPage>
    )
  }

  return (
    <IntranetPage
      title="Currículos"
      subtitle="Anexe CVs, leia o briefing e filtre por palavras-chave da vaga."
    >
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-3 text-sm text-emerald-800">{notice}</p> : null}

      <SectionCard title="Novo currículo" className="mb-4" badge={<Upload className="h-4 w-4" />}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              Nome *
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              Cargo desejado
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={desiredRole}
                onChange={(e) => setDesiredRole(e.target.value)}
                placeholder="ex.: manicure, recepção"
              />
            </label>
            <label className="block text-sm">
              E-mail
              <input
                type="email"
                className="mt-1 w-full rounded border px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Telefone
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm">
            Palavras-chave (vírgula)
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="manicure, spa, sábado, CLT"
            />
          </label>
          <label className="block text-sm">
            Observações
            <textarea
              className="mt-1 w-full rounded border px-3 py-2"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Arquivo (PDF ou imagem, até 10 MB) *
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="mt-1 block w-full text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <PanelButton type="submit" disabled={saving}>
            {saving ? 'Lendo e salvando…' : 'Anexar currículo'}
          </PanelButton>
        </form>
      </SectionCard>

      <SectionCard title="Banco de currículos" badge={<Search className="h-4 w-4" />}>
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <label className="block flex-1 text-sm">
            Buscar por requisitos / palavras-chave
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ex.: manicure spa experiência"
            />
          </label>
          <label className="block text-sm md:w-48">
            Status
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              <option value="all">Todos ({counts.all})</option>
              {CURRICULO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {curriculoStatusLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {items.length === 0 ? (
          <p className="py-6 text-sm text-muted">
            Nenhum currículo nesta filtro. Anexe o primeiro acima.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id} className="py-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0" />
                      <h3 className="font-medium">{item.candidate_name}</h3>
                      <span className="rounded bg-black/5 px-2 py-0.5 text-xs">
                        {curriculoStatusLabel(item.status)}
                      </span>
                      {item.desired_role ? (
                        <span className="text-xs text-muted">{item.desired_role}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {formatWhen(item.created_at)}
                      {item.email ? ` · ${item.email}` : ''}
                      {item.phone ? ` · ${item.phone}` : ''}
                    </p>
                    {item.keywords.length > 0 ? (
                      <p className="mt-1 text-xs text-muted">
                        Tags: {item.keywords.join(', ')}
                      </p>
                    ) : null}
                    {item.briefing ? (
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
                        {item.briefing}
                      </pre>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 md:items-end">
                    <a
                      href={item.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline"
                    >
                      Abrir arquivo
                    </a>
                    <select
                      className="rounded border px-2 py-1 text-sm"
                      value={item.status}
                      onChange={(e) =>
                        void setItemStatus(item.id, e.target.value as CurriculoStatus)
                      }
                    >
                      {CURRICULO_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {curriculoStatusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </IntranetPage>
  )
}
