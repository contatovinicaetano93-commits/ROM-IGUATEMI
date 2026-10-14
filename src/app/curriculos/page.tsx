'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Search, Upload } from 'lucide-react'
import { uploadPiiBlob } from '@/lib/blob/upload-pii'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { IntranetPageSkeleton } from '../_components/intranet/IntranetPageSkeleton'
import { PanelButton, SectionCard } from '../_components/ui'
import {
  CURRICULO_ACCEPT,
  CURRICULO_BATCH_MAX,
  CURRICULO_SERVER_UPLOAD_MAX_BYTES,
  candidateNameFromFileName,
  curriculoBlobPathname,
  guessCurriculoContentType,
  pickCurriculoBatchFiles,
  safeCurriculoFileName,
} from '@/lib/curriculos/file'
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function CurriculosPage() {
  const [items, setItems] = useState<Curriculo[]>([])
  const [booted, setBooted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const formActionRef = useRef<HTMLDivElement>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [desiredRole, setDesiredRole] = useState('')
  const [keywords, setKeywords] = useState('')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])

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
      setBooted(true)
    }
  }, [debouncedQ, status])

  useEffect(() => {
    void load()
  }, [load])

  function onPickFiles(list: FileList | null) {
    setError(null)
    setNotice(null)
    const picked = pickCurriculoBatchFiles(list)
    if (!picked.ok) {
      setFiles([])
      setError(picked.error)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setFiles(picked.files)
    // Um arquivo: sugere nome no campo se estiver vazio. Lote: nome por arquivo no envio.
    if (picked.files.length === 1 && !name.trim()) {
      setName(candidateNameFromFileName(picked.files[0]!.name))
    }
  }

  function resolveCandidateName(file: File, batch: boolean): string {
    if (!batch && name.trim()) return name.trim()
    return candidateNameFromFileName(file.name)
  }

  async function uploadViaServer(
    formFile: File,
    candidateName: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const fd = new FormData()
    fd.set('candidate_name', candidateName)
    fd.set('email', email.trim())
    fd.set('phone', phone.trim())
    fd.set('desired_role', desiredRole.trim())
    fd.set('keywords', keywords)
    fd.set('notes', notes.trim())
    fd.set('file', formFile, safeCurriculoFileName(formFile.name))

    const res = await fetch('/api/curriculos', {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: json.error ?? `Falha em ${formFile.name}` }
    }
    return { ok: true }
  }

  async function uploadViaBlob(formFile: File): Promise<{
    url: string
    name: string
    contentType: string
  }> {
    const fileName = safeCurriculoFileName(formFile.name)
    const contentType = guessCurriculoContentType(fileName, formFile.type)
    const blob = await uploadPiiBlob(curriculoBlobPathname(fileName), formFile, {
      handleUploadUrl: '/api/curriculos/upload',
      contentType,
      multipart: formFile.size > 2 * 1024 * 1024,
    })
    return { url: blob.url, name: fileName, contentType }
  }

  async function uploadOne(
    formFile: File,
    candidateName: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (formFile.size <= CURRICULO_SERVER_UPLOAD_MAX_BYTES) {
      return uploadViaServer(formFile, candidateName)
    }
    try {
      const blob = await uploadViaBlob(formFile)
      const res = await fetch('/api/curriculos', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_name: candidateName,
          email: email.trim() || null,
          phone: phone.trim() || null,
          desired_role: desiredRole.trim() || null,
          keywords,
          notes: notes.trim() || null,
          file_url: blob.url,
          file_name: blob.name,
          file_content_type: blob.contentType,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false, error: json.error ?? `Falha em ${formFile.name}` }
      }
      return { ok: true }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Falha no upload'
      const message =
        raw.includes('Failed to  retrieve the client token') ||
        raw.includes('Failed to retrieve the client token')
          ? 'Falha ao autorizar o upload. Recarregue e tente de novo.'
          : raw
      return { ok: false, error: `${formFile.name}: ${message}` }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (files.length === 0) {
      setError('Escolha até 20 PDFs/fotos e clique em Anexar.')
      formActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const batch = files.length > 1
    if (!batch && !name.trim()) {
      setError('Preencha o Nome do candidato (ou deixe o sugerido pelo arquivo) e clique em Anexar.')
      nameInputRef.current?.focus()
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)
    setProgress({ done: 0, total: files.length })

    let okCount = 0
    const failures: string[] = []

    try {
      // Fila sequencial: mesmo createCurriculo (extrai texto + briefing) por arquivo.
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!
        const candidateName = resolveCandidateName(file, batch)
        const result = await uploadOne(file, candidateName)
        if (result.ok) okCount += 1
        else failures.push(result.error)
        setProgress({ done: i + 1, total: files.length })
      }

      if (okCount > 0) {
        setNotice(
          okCount === files.length
            ? files.length === 1
              ? 'Currículo anexado e indexado para busca.'
              : `${okCount} currículos anexados e indexados para busca.`
            : `${okCount} de ${files.length} anexados. ${failures.length} falharam.`,
        )
        if (okCount === files.length) {
          setName('')
          setEmail('')
          setPhone('')
          setDesiredRole('')
          setKeywords('')
          setNotes('')
          setFiles([])
          if (fileInputRef.current) fileInputRef.current.value = ''
        } else {
          // Mantém arquivos para retry manual; limpa só se quiser — deixa lista.
          setFiles([])
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
        await load()
      }
      if (failures.length > 0) {
        setError(failures.slice(0, 5).join(' · ') + (failures.length > 5 ? '…' : ''))
        formActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        formActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    } finally {
      setSaving(false)
      setProgress(null)
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

  if (!booted) {
    return (
      <IntranetPage title="Currículos" subtitle="Banco de currículos do RH">
        <IntranetPageSkeleton />
      </IntranetPage>
    )
  }

  const batch = files.length > 1

  return (
    <IntranetPage
      title="Currículos"
      subtitle="Anexe CVs (até 20 de uma vez), leia o briefing e filtre por palavras-chave da vaga."
    >
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-3 text-sm text-emerald-800">{notice}</p> : null}

      <SectionCard title="Novo currículo" className="mb-4" badge={<Upload className="h-4 w-4" />}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              Nome {batch ? '(opcional no lote)' : '*'}
              <input
                ref={nameInputRef}
                className="mt-1 w-full rounded border px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  batch
                    ? 'No lote, cada arquivo usa o nome do PDF'
                    : 'ex.: Camila Souza Ribeiro'
                }
                required={!batch}
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
          <div className="block text-sm">
            <span className="font-medium">
              Arquivos (PDF ou foto, até 10 MB cada · máx. {CURRICULO_BATCH_MAX}) *
            </span>
            <div className="mt-1 flex flex-col gap-2 rounded border border-dashed border-border bg-card/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                {files.length === 0 ? (
                  <p className="text-sm text-muted">
                    Escolha um ou vários PDFs/fotos — o motor lê cada um e adiciona na lista.
                  </p>
                ) : files.length === 1 ? (
                  <p className="truncate text-sm text-foreground">
                    {files[0]!.name}{' '}
                    <span className="text-muted">({formatBytes(files[0]!.size)})</span>
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-foreground">
                      {files.length} arquivos selecionados
                    </p>
                    <ul className="max-h-28 overflow-y-auto text-xs text-muted">
                      {files.map((f) => (
                        <li key={`${f.name}-${f.size}-${f.lastModified}`} className="truncate">
                          {f.name} ({formatBytes(f.size)}) → {candidateNameFromFileName(f.name)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-card">
                {files.length ? 'Trocar arquivos' : 'Escolher arquivos'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={CURRICULO_ACCEPT}
                  multiple
                  className="sr-only"
                  onChange={(e) => onPickFiles(e.target.files)}
                />
              </label>
            </div>
          </div>
          <div ref={formActionRef} className="space-y-2">
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
            {progress ? (
              <p className="text-xs text-muted">
                Processando {progress.done}/{progress.total}…
              </p>
            ) : files.length === 0 ? (
              <p className="text-xs text-muted">
                Selecione até {CURRICULO_BATCH_MAX} arquivos e clique em Anexar — o motor lê cada
                PDF e gera o briefing.
              </p>
            ) : batch ? (
              <p className="text-xs text-muted">
                Lote: cada arquivo vira um currículo (nome do PDF). Cargo/tags/obs. valem para
                todos. Envio em fila, um a um.
              </p>
            ) : (
              <p className="text-xs text-muted">
                Pronto: ao clicar, o motor lê o arquivo, gera o briefing e lista abaixo.
              </p>
            )}
            <PanelButton type="submit" disabled={saving}>
              {saving
                ? progress
                  ? `Lendo ${progress.done}/${progress.total}…`
                  : 'Lendo e salvando…'
                : batch
                  ? `Anexar ${files.length} currículos`
                  : 'Anexar currículo'}
            </PanelButton>
          </div>
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
              <option value="all">Todos</option>
              {CURRICULO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {curriculoStatusLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="py-4 text-sm text-muted">Atualizando lista…</p>
        ) : null}

        {!loading && items.length === 0 ? (
          <p className="py-6 text-sm text-muted">
            Nenhum currículo neste filtro. Anexe o primeiro acima.
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
                      href={`/api/curriculos/${item.id}/file`}
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
