'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { PanelButton, SectionCard } from '../_components/ui'
import { MEETING_ROOM_LABEL, type MeetingRoomReservation } from '@/lib/sala-reuniao/types'

type ReservationRow = MeetingRoomReservation & { can_cancel: boolean }

const CALENDAR_PREVIEW_LINES = 3

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

function timeWindow(item: MeetingRoomReservation): string {
  return `${item.start_time}–${item.end_time}`
}

export default function SalaReuniaoPage() {
  const [month, setMonth] = useState(currentMonthKey)
  const [items, setItems] = useState<ReservationRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(todayIso)
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('11:00')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (m: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/sala-reuniao?month=${encodeURIComponent(m)}`, {
        credentials: 'include',
        signal: AbortSignal.timeout(20_000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Falha ao carregar reservas')
        setItems([])
        return
      }
      setItems(json.data?.reservations ?? [])
    } catch (err) {
      const timedOut =
        (err instanceof DOMException && err.name === 'TimeoutError') ||
        (err instanceof Error && /aborted|timeout/i.test(err.name + err.message))
      setError(timedOut ? 'Calendário demorou demais — tente de novo' : 'Falha ao carregar reservas')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(month)
  }, [load, month])

  const confirmedByDay = useMemo(() => {
    const map = new Map<string, ReservationRow[]>()
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
      const res = await fetch('/api/sala-reuniao', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          day: selectedDay,
          start_time: startTime,
          end_time: endTime,
          title: title.trim() || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Não foi possível reservar')
        await load(month)
        return
      }
      setTitle('')
      await load(month)
    } catch {
      setError('Não foi possível reservar')
    } finally {
      setSaving(false)
    }
  }

  async function onCancel(id: string) {
    if (!window.confirm('Cancelar esta reserva?')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/sala-reuniao/${id}`, {
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
      title={MEETING_ROOM_LABEL}
      subtitle="Reserve horários da sala · todos veem o calendário · só quem reservou (ou admin) cancela."
    >
      <SectionCard title="Calendário">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PanelButton type="button" variant="outline" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              ←
            </PanelButton>
            <p className="min-w-[10rem] text-center font-serif text-base font-semibold tracking-tight">
              {formatMonthTitle(month)}
            </p>
            <PanelButton type="button" variant="outline" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              →
            </PanelButton>
          </div>
          <PanelButton
            type="button"
            variant="outline"
            onClick={() => {
              setMonth(currentMonthKey())
              setSelectedDay(todayIso())
            }}
          >
            Hoje
          </PanelButton>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[0.7rem] font-semibold uppercase tracking-wide text-muted">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell, idx) => {
            if (!cell.iso || cell.day == null) {
              return <div key={`e-${idx}`} className="min-h-[4.5rem] rounded-lg bg-transparent" />
            }
            const booked = confirmedByDay.get(cell.iso) ?? []
            const selected = selectedDay === cell.iso
            const preview = booked.slice(0, CALENDAR_PREVIEW_LINES)
            const extra = booked.length - preview.length
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => setSelectedDay(cell.iso)}
                className={`min-h-[4.5rem] rounded-lg border px-1.5 py-1.5 text-left transition ${
                  selected
                    ? 'border-foreground bg-foreground text-background shadow-sm'
                    : booked.length > 0
                      ? 'border-border bg-card hover:border-foreground/40'
                      : 'border-border/60 bg-background hover:border-foreground/30'
                }`}
              >
                <span
                  className={`block text-sm font-bold tabular-nums leading-none ${
                    selected ? 'text-background' : 'text-foreground'
                  }`}
                >
                  {cell.day}
                </span>
                {preview.length > 0 ? (
                  <span className="mt-1.5 flex flex-col gap-0.5">
                    {preview.map((item) => (
                      <span
                        key={item.id}
                        className={`block truncate text-[0.68rem] leading-tight ${
                          selected ? 'text-background/90' : 'text-foreground'
                        }`}
                      >
                        {item.start_time} {item.title || item.created_by_name}
                      </span>
                    ))}
                    {extra > 0 ? (
                      <span
                        className={`text-[0.62rem] font-semibold ${
                          selected ? 'text-background/70' : 'text-muted'
                        }`}
                      >
                        +{extra}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        {loading ? <p className="mt-3 text-sm text-muted">Carregando…</p> : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </SectionCard>

      <SectionCard title={selectedDay ? `Dia ${selectedDay}` : 'Selecione um dia'}>
        {selectedDay ? (
          <div className="space-y-4">
            {dayItems.length > 0 ? (
              <ul className="divide-y divide-border/60">
                {dayItems.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-medium">{timeWindow(item)}</span>
                        {item.title ? <span className="text-base">{item.title}</span> : null}
                        {item.status === 'cancelled' ? (
                          <span className="text-xs text-muted">cancelada</span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm text-muted">{item.created_by_name}</p>
                    </div>
                    {item.can_cancel ? (
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
              <p className="text-sm text-muted">Nenhuma reserva neste dia.</p>
            )}

            <form onSubmit={(e) => void onCreate(e)} className="space-y-3 rounded-xl border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Nova reserva</p>
              <label className="block text-sm">
                <span className="text-muted">Assunto (opcional)</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                  placeholder="Ex.: Alinhamento RH"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
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
              </div>
              <PanelButton type="submit" disabled={saving}>
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
