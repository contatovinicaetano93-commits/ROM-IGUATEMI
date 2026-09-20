'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { IntranetPage } from '../../_components/intranet/IntranetPage'
import { PanelButton, SectionCard } from '../../_components/ui'
import { apiFetch } from '@/lib/api-client'

type RomLocation = {
  id: string
  name: string
  rom_code: string
  rom_kind: 'almox' | 'piso'
}

type BoardRow = {
  product_id: string
  product_name: string
  sku: string | null
  avec_qty: number
  point_qty: number
  rom_sum: number
  drift: number
}

async function readOk<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error ?? 'Falha na requisição')
  return json.data as T
}

export default function EstoquePontosPage() {
  const [locations, setLocations] = useState<RomLocation[]>([])
  const [locationId, setLocationId] = useState<string>('')
  const [board, setBoard] = useState<BoardRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [productId, setProductId] = useState('')
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [qty, setQty] = useState('1')

  const load = useCallback(async () => {
    setError(null)
    try {
      const locs = await readOk<{ locations: RomLocation[] }>(
        await apiFetch('/api/estoque/pontos', { cache: 'no-store', clientCache: false }),
      )
      setLocations(locs.locations)
      const almoxId = locs.locations.find((l) => l.rom_code === 'almox')?.id ?? ''
      const piso1 = locs.locations.find((l) => l.rom_code === 'piso_1')?.id ?? ''
      setLocationId((prev) => prev || almoxId || locs.locations[0]?.id || '')
      setFromId((prev) => prev || almoxId)
      setToId((prev) => prev || piso1)
      const loc = locationId || almoxId || locs.locations[0]?.id
      const q = loc ? `?locationId=${encodeURIComponent(loc)}` : ''
      const data = await readOk<{ board: BoardRow[] }>(
        await apiFetch(`/api/estoque/pontos/saldos${q}`, { cache: 'no-store', clientCache: false }),
      )
      setBoard(data.board)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar pontos')
    }
  }, [locationId])

  useEffect(() => {
    void load()
  }, [load])

  async function onTransfer(e: React.FormEvent) {
    e.preventDefault()
    if (!productId || !fromId || !toId) return
    setBusy(true)
    setError(null)
    try {
      await readOk(
        await apiFetch('/api/estoque/pontos/transferir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            fromLocationId: fromId,
            toLocationId: toId,
            quantity: Number(qty),
          }),
        }),
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na transferência')
    } finally {
      setBusy(false)
    }
  }

  async function onAllocateAlmox() {
    if (!confirm('Zerar pisos e colocar todo o saldo Avec no Almoxarifado?')) return
    setBusy(true)
    setError(null)
    try {
      await readOk(await apiFetch('/api/estoque/pontos/alocar-almox', { method: 'POST' }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alocar no Almox')
    } finally {
      setBusy(false)
    }
  }

  const almox = locations.find((l) => l.rom_code === 'almox')

  return (
    <IntranetPage
      kicker="Estoque"
      title="Pontos de distribuição"
      subtitle="Almoxarifado (= espelho Avec) distribui para Piso 1, 2 e 3. Sem inventário novo, a soma pode mostrar drift."
    >
      <p className="text-sm text-muted">
        <Link href="/estoque" className="text-gold-strong hover:underline">
          ← Voltar ao estoque Avec
        </Link>
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}

      <SectionCard title="Local">
        <div className="flex flex-wrap gap-2">
          {locations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => setLocationId(loc.id)}
              className={
                loc.id === locationId
                  ? 'rounded-xl border border-foreground bg-foreground px-3 py-1.5 text-sm text-background'
                  : 'rounded-xl border border-border bg-background px-3 py-1.5 text-sm'
              }
            >
              {loc.name}
              {loc.rom_kind === 'almox' ? ' · retirada' : ''}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <PanelButton type="button" variant="outline" disabled={busy} onClick={() => void onAllocateAlmox()}>
            Inventário: tudo no Almox
          </PanelButton>
          <p className="mt-1 text-xs text-muted">
            Use depois do inventário físico / sync Avec. Pisos zeram; Almox = qty Avec.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Transferir">
        <form onSubmit={onTransfer} className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="text-xs text-muted">Produto</span>
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            >
              <option value="">Selecione…</option>
              {board.map((row) => (
                <option key={row.product_id} value={row.product_id}>
                  {row.product_name}
                  {row.sku ? ` · ${row.sku}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">De</span>
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">Para</span>
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">Quantidade</span>
            <input
              type="number"
              min="0.001"
              step="any"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
          </label>
          <div className="flex items-end">
            <PanelButton type="submit" disabled={busy}>
              {busy ? '…' : 'Transferir'}
            </PanelButton>
          </div>
        </form>
        <p className="mt-2 text-xs text-muted">
          Fase 1: Almox → piso (ou retorno piso → Almox). {almox ? `Retirada = ${almox.name}.` : ''}
        </p>
      </SectionCard>

      <SectionCard
        title={locations.find((l) => l.id === locationId)?.name ?? 'Saldos'}
        badge={<span className="text-xs text-muted">{board.length}</span>}
      >
        <ul className="divide-y divide-border">
          {board.length === 0 && (
            <li className="py-3 text-sm text-muted">Nenhum produto neste ponto (ou sync Avec ainda vazio).</li>
          )}
          {board.map((row) => (
            <li key={row.product_id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm font-medium">{row.product_name}</p>
                <p className="text-xs text-muted">
                  Neste ponto: {row.point_qty}
                  {' · '}
                  Avec: {row.avec_qty}
                  {' · '}
                  Soma ROM: {row.rom_sum}
                  {row.drift !== 0 ? <span className="text-danger"> · drift {row.drift}</span> : null}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-gold-strong"
                onClick={() => setProductId(row.product_id)}
              >
                Transferir
              </button>
            </li>
          ))}
        </ul>
      </SectionCard>
    </IntranetPage>
  )
}
