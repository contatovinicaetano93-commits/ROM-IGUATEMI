'use client'

import { AlertTriangle, Calendar, Clock } from 'lucide-react'

/** Legenda discreta dos badges de urgência (vermelho / laranja / azul). */
export function UrgencyBadgeLegend({
  showScheduled = true,
  className = '',
}: {
  showScheduled?: boolean
  className?: string
}) {
  return (
    <p
      role="note"
      aria-label="Legenda dos alertas de serviço"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] leading-tight text-muted/70 ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex items-center justify-center rounded-full bg-danger/15 px-1 py-0.5 text-danger">
          <AlertTriangle size={9} aria-hidden />
        </span>
        atrasado / sem retorno
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex items-center justify-center rounded-full bg-warning/15 px-1 py-0.5 text-warning">
          <Clock size={9} aria-hidden />
        </span>
        vencendo ≤7 dias
      </span>
      {showScheduled && (
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex items-center justify-center rounded-full bg-sky-500/15 px-1 py-0.5 text-sky-300">
            <Calendar size={9} aria-hidden />
          </span>
          agendado ≤7 dias
        </span>
      )}
    </p>
  )
}
