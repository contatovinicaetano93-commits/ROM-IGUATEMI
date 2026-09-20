'use client'

import { HeartHandshake, Plus, ShoppingCart, Wrench, X, type LucideIcon } from 'lucide-react'
import type { RequestArea, Screen, User } from '@/lib/flow/types'
import { canAccessArea, REQUEST_AREAS, screenForNewArea } from '@/lib/flow/workflow'

const AREA_META: Record<
  RequestArea,
  { label: string; hint: string; icon: LucideIcon }
> = {
  financeiro: {
    label: 'Financeiro',
    hint: 'Pagamentos, reembolsos e fornecedores',
    icon: Plus,
  },
  manutencao: {
    label: 'Manutenção',
    hint: 'Chamados da unidade',
    icon: Wrench,
  },
  compras: {
    label: 'Compras',
    hint: 'Pedidos de compra',
    icon: ShoppingCart,
  },
  rh: {
    label: 'RH',
    hint: 'Férias, admissão e benefícios',
    icon: HeartHandshake,
  },
}

export function newRequestOptions(user: User): { area: RequestArea; screen: Screen }[] {
  return REQUEST_AREAS.filter((area) => canAccessArea(user, area)).map((area) => ({
    area,
    screen: screenForNewArea(area),
  }))
}

/** Se só há uma área, navega direto; senão abre o picker. */
export function resolveNewRequestAction(
  user: User,
  onNavigate: (screen: Screen) => void,
  openPicker: () => void,
) {
  const options = newRequestOptions(user)
  if (options.length === 0) return
  if (options.length === 1) {
    onNavigate(options[0].screen)
    return
  }
  openPicker()
}

export function NewRequestPicker({
  user,
  open,
  onClose,
  onSelect,
}: {
  user: User
  open: boolean
  onClose: () => void
  onSelect: (screen: Screen) => void
}) {
  if (!open) return null
  const options = newRequestOptions(user)

  return (
    <div className="flow-modal-layer" role="dialog" aria-modal="true" aria-label="Tipo de solicitação">
      <button type="button" className="modal-overlay" aria-label="Fechar" onClick={onClose} />
      <div className="action-modal new-request-picker">
        <header>
          <div className="modal-icon emerald">
            <Plus size={20} />
          </div>
          <div>
            <h3>Nova solicitação</h3>
            <p className="modal-lead">Escolha a fila / tipo de pedido</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className="new-request-picker-grid">
          {options.map(({ area, screen }) => {
            const meta = AREA_META[area]
            const Icon = meta.icon
            return (
              <button
                key={area}
                type="button"
                className="new-request-picker-card"
                onClick={() => {
                  onSelect(screen)
                  onClose()
                }}
              >
                <span className="new-request-picker-icon">
                  <Icon size={18} />
                </span>
                <span>
                  <strong>{meta.label}</strong>
                  <small>{meta.hint}</small>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
