'use client'

import { useState, useTransition } from 'react'
import { PanelButton, SectionCard } from '../ui'
import type { IntranetPostKind } from '@/lib/cms-kinds'

type AssistantMode = 'titulo' | 'lead' | 'materia' | 'seo'

type AssistantResult = {
  mode: AssistantMode
  output: string
  tips: string[]
  source: 'ai' | 'rules'
}

const MODE_LABELS: Record<AssistantMode, string> = {
  titulo: 'Títulos',
  lead: 'Lead',
  materia: 'Matéria',
  seo: 'SEO interno',
}

export function RomNewsStudio({
  defaultKind = 'news',
  onApply,
}: {
  defaultKind?: IntranetPostKind
  onApply?: (payload: { mode: AssistantMode; output: string }) => void
}) {
  const [mode, setMode] = useState<AssistantMode>('titulo')
  const [kind, setKind] = useState<IntranetPostKind>(defaultKind)
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<AssistantResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/cms/assistente', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode, kind, topic, notes }),
        })
        const json = await res.json()
        if (!res.ok) {
          setResult(null)
          setError(json.error ?? 'Não foi possível gerar a sugestão.')
          return
        }
        setResult(json.data as AssistantResult)
      } catch {
        setResult(null)
        setError('Falha de rede no assistente.')
      }
    })
  }

  return (
    <SectionCard
      title="Estúdio IA · assistente de edição"
      badge={
        <span className="text-xs text-muted">
          {result?.source === 'ai' ? 'Claude' : result ? 'Regras' : 'MKT'}
        </span>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="grid gap-3">
          <p className="text-sm text-muted">
            Cole as notas do bastidor. A IA sugere título, lead, matéria ou checklist de SEO no
            tom do ROM News — você revisa e publica.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as AssistantMode)}
              className="rounded-xl border border-border bg-background px-3 py-2"
            >
              {(Object.keys(MODE_LABELS) as AssistantMode[]).map((item) => (
                <option key={item} value={item}>
                  {MODE_LABELS[item]}
                </option>
              ))}
            </select>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as IntranetPostKind)}
              className="rounded-xl border border-border bg-background px-3 py-2"
            >
              <option value="news">Notícia</option>
              <option value="event">Evento</option>
              <option value="banner">Banner</option>
              <option value="policy">Política</option>
            </select>
          </div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
            placeholder="Assunto — ex.: workshop de colorimetria na unidade"
            className="rounded-xl border border-border bg-background px-3 py-2"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required
            rows={5}
            placeholder="Notas: quem falou, o que aconteceu, marcas, frases que valem citação…"
            className="rounded-xl border border-border bg-background px-3 py-2"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div>
            <PanelButton type="submit" disabled={isPending}>
              {isPending ? 'Gerando…' : 'Pedir sugestão à IA'}
            </PanelButton>
          </div>
        </form>

        <div className="rounded-2xl border border-border bg-[color-mix(in_oklab,var(--background),var(--gold)_4%)] p-4">
          {!result && !isPending ? (
            <p className="text-sm text-muted">
              A sugestão aparece aqui. Use “Aplicar no formulário” para preencher título, lead ou
              texto da publicação.
            </p>
          ) : null}
          {isPending ? <p className="animate-pulse text-sm text-muted">Editando com a IA…</p> : null}
          {result && !isPending ? (
            <div className="space-y-3">
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-gold">
                {MODE_LABELS[result.mode]}
              </p>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{result.output}</pre>
              {result.tips.length > 0 ? (
                <ul className="space-y-1 border-t border-border pt-3 text-sm text-muted">
                  {result.tips.map((tip) => (
                    <li key={tip}>· {tip}</li>
                  ))}
                </ul>
              ) : null}
              {onApply ? (
                <PanelButton
                  type="button"
                  onClick={() => onApply({ mode: result.mode, output: result.output })}
                >
                  Aplicar no formulário
                </PanelButton>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  )
}
