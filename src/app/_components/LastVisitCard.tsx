import { Calendar, Scissors, UserRound } from 'lucide-react'
import { formatCurrency, formatVisitDate } from '@/lib/salon/format'

export interface LastVisitData {
  service_name: string
  last_done_at: string
  professional_name: string | null
  last_price: number | null
}

export function LastVisitCard({
  visit,
  showPrice = false,
}: {
  visit: LastVisitData | null | undefined
  showPrice?: boolean
}) {
  if (!visit) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <p className="text-[0.65rem] uppercase tracking-wide text-muted">Última visita</p>
        <p className="mt-1 text-sm text-muted">Ainda sem atendimento registrado.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gold/30 bg-gold/5 px-4 py-3">
      <p className="text-[0.65rem] uppercase tracking-wide text-gold">Última visita</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{visit.service_name}</p>
      <div className="mt-2 flex flex-col gap-1.5 text-xs text-foreground/80">
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={12} className="text-muted" />
          {formatVisitDate(visit.last_done_at)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <UserRound size={12} className="text-muted" />
          {visit.professional_name ?? 'Profissional não informado'}
        </span>
        {showPrice && (
          <span className="inline-flex items-center gap-1.5">
            <Scissors size={12} className="text-muted" />
            Valor: {formatCurrency(visit.last_price)}
          </span>
        )}
      </div>
    </div>
  )
}
