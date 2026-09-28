'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { PanelButton, SectionCard } from '../_components/ui'
import {
  conditionLabel,
  unitLabel,
  type AtivacaoCondition,
  type BrandActivation,
} from '@/lib/ativacoes/types'

function currentMonthKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7)
}

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function firstWeekdayMon0(month: string): number {
  const [y, m] = month.split('-').map(Number)
  const sun0 = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  return (sun0 + 6) % 7
}

function formatMonthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  )
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function timeWindow(item: BrandActivation): string {
  if (item.end_time && item.end_time !== item.start_time) {
    return `${item.start_time}–${item.end_time}`
  }
  return item.start_time
}

export default function AtivacoesPage() {
  const [month, setMonth] = useState(currentMonthKey)
  const [items, setItems] = useState<BrandActivation[]>([])
  const [peerOffline, setPeerOffline] = useState(false)
  const [peerUnconfigured, setPeerUnconfigured] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(todayIso)
  const [brand, setBrand] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('12:00')
  const [condition, setCondition] = useState<AtivacaoCondition>('comercial')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (m: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ativacoes?month=${encodeURIComponent(m)}`, {
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Falha ao carregar ativações')
        setItems([])
        return
      }
      setItems(json.data?.activations ?? [])
      setPeerOffline(Boolean(json.data?.peer?.offline))
      setPeerUnconfigured(Boolean(json.data?.peer?.unconfigured))
    } catch {
      setError('Falha ao carregar ativações')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(month)
  }, [load, month])

  const confirmedByDay = useMemo(() => {
    const map = new Map<string, BrandActivation[]>()
    for (const item of items) {
      if (item.status !== 'confirmed') continue
      const list = map.get(item.day) ?? []
      list.push(item)
      map.set(item.day, list)
    }
    return map
  }, [items])

  const dayItems = useMemo(() => {
    if (!selectedDay) return []
    return items.filter((item) => item.day === selectedDay)
  }, [items, selectedDay])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedDay) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/ativacoes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          day: selectedDay,
          start_time: startTime,
          end_time: endTime,
          brand,
          condition,
          notes: notes.trim() || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Não foi possível criar')
        await load(month)
        return
      }
      setBrand('')
      setNotes('')
      await load(month)
    } catch {
      setError('Não foi possível criar')
    } finally {
      setSaving(false)
    }
  }

  async function onCancel(id: string) {
    if (!window.confirm('Cancelar esta ativação nesta unidade?')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/ativacoes/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Falha ao cancelar')
        return
      }
      await load(month)
    } catch {
      setError('Falha ao cancelar')
    } finally {
      setSaving(false)
    }
  }

  const totalDays = daysInMonth(month)
  const pad = firstWeekdayMon0(month)
  const cells: Array<{ day: number | null; iso: string | null }> = []
  for (let i = 0; i < pad; i++) cells.push({ day: null, iso: null })
  for (let d = 1; d <= totalDays; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, iso })
  }

  return (
    <IntranetPage
      kicker="Unidade"
      title="Ativações"
      subtitle="Calendário compartilhado Brasil + Iguatemi · reserva só na unidade logada · avisos por e-mail."
    >
      <SectionCard title="Calendário">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PanelButton type="button" variant="outline" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              ←
            </PanelButton>
            <p className="min-w-[10rem] text-center text-sm font-semibold">{formatMonthTitle(month)}</p>
            <PanelButton type="button" variant="outline" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              →
            </PanelButton>
          </div>
          <PanelButton
            type="button"
            variant="outline"
            onClick={() => {
              const now = currentMonthKey()
              setMonth(now)
              setSelectedDay(todayIso())
            }}
          >
            Hoje
          </PanelButton>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] uppercase tracking-wide text-muted">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell, idx) => {
            if (!cell.iso || cell.day == null) {
              return <div key={`e-${idx}`} className="min-h-14 rounded-lg bg-transparent" />
            }
            const booked = confirmedByDay.get(cell.iso) ?? []
            const selected = selectedDay === cell.iso
            const label =
              booked.length === 0
                ? null
                : booked.length === 1
                  ? booked[0]!.brand
                  : `${booked.length} ativações`
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => setSelectedDay(cell.iso)}
                className={`min-h-14 rounded-lg border px-1 py-1.5 text-left transition ${
                  selected
                    ? 'border-foreground bg-foreground text-background'
                    : booked.length > 0
                      ? 'border-gold/50 bg-gold/10 text-foreground'
                      : 'border-border bg-background/60 text-foreground hover:border-foreground/30'
                }`}
              >
                <span className="text-xs font-semibold tabular-nums">{cell.day}</span>
                {label ? (
                  <span
                    className={`mt-1 block truncate text-[0.65rem] leading-tight ${
                      selected ? 'text-background/80' : 'text-muted'
                    }`}
                  >
                    {label}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        {loading ? <p className="mt-3 text-sm text-muted">Carregando…</p> : null}
        {peerOffline ? (
          <p className="mt-3 text-sm text-danger">
            Calendário da outra unidade indisponível no momento — mostrando só esta unidade.
          </p>
        ) : null}
        {peerUnconfigured && !peerOffline ? (
          <p className="mt-3 text-sm text-muted">
            Visão da outra unidade ainda não configurada neste ambiente.
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </SectionCard>

      <SectionCard title={selectedDay ? `Dia ${selectedDay}` : 'Selecione um dia'}>
        {selectedDay ? (
          <div className="space-y-4">
            {dayItems.length > 0 ? (
              <ul className="divide-y divide-border/60">
                {dayItems.map((item) => (
                  <li key={`${item.unit}-${item.id}`} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {item.brand}
                        <span className="ml-2 text-xs font-normal text-muted">
                          · {unitLabel(item.unit)}
                          {item.status === 'cancelled' ? ' · cancelada' : null}
                          {!item.writable && item.status === 'confirmed' ? ' · só leitura' : null}
                        </span>
                      </p>
                      <p className="text-sm text-muted">
                        {timeWindow(item)} · {conditionLabel(item.condition)} · {item.created_by_name}
                      </p>
                      {item.notes ? <p className="mt-1 text-sm text-muted">{item.notes}</p> : null}
                    </div>
                    {item.status === 'confirmed' && item.writable ? (
                      <PanelButton
                        type="button"
                        variant="outline"
                        disabled={saving}
                        onClick={() => void onCancel(item.id)}
                      >
                        Cancelar
                      </PanelButton>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nenhuma ativação neste dia.</p>
            )}

            <form onSubmit={(e) => void onCreate(e)} className="space-y-3 rounded-xl border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Nova ativação nesta unidade</p>
              <label className="block text-sm">
                <span className="text-muted">Marca</span>
                <input
                  required
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                  placeholder="Ex.: L’Oréal"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="text-muted">Início</span>
                  <input
                    required
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted">Fim</span>
                  <input
                    required
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted">Condição</span>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as AtivacaoCondition)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <option value="comercial">Condição comercial</option>
                    <option value="servicos">Condição de serviços</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-muted">Observação (opcional)</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                />
              </label>
              <PanelButton type="submit" disabled={saving || !brand.trim()}>
                {saving ? 'Salvando…' : 'Reservar'}
              </PanelButton>
            </form>
          </div>
        ) : (
          <p className="text-sm text-muted">Toque em um dia no calendário.</p>
        )}
      </SectionCard>
    </IntranetPage>
  )
}
